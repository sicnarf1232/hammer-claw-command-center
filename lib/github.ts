import { Octokit } from "@octokit/rest";
import { unstable_cache, revalidateTag } from "next/cache";

// Single GitHub client for all vault access (CLAUDE.md convention).
// Reads via the Git Trees + Contents API, writes via commits. No filesystem.
//
// Caching (rate-limit safety): the vault is Jordan's whole Obsidian repo
// (~1000 markdown files), and getAllTasks scans nearly all of them. Without
// caching, one /today or /tasks render was ~980 GitHub calls, exhausting the
// 5,000/hour authenticated limit in ~5 page loads. Two caches fix this:
//   - getBlob is keyed by blob SHA, which is content-addressed and immutable,
//     so it caches indefinitely. A file that changes gets a new SHA and is
//     fetched fresh under the new key; the old entry simply goes unused.
//   - the markdown tree (branch + recursive tree = 2 calls) caches for 60s
//     under VAULT_TREE_TAG, which write-backs bust so commits show at once.
// After warm-up a full-vault render costs ~2 calls (the tree), not ~980.

const VAULT_TREE_TAG = "vault-tree";
const VAULT_BLOB_TAG = "vault-blob";

export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
  root: string; // optional subfolder prefix inside the repo ("" if at root)
}

export function isVaultConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN && process.env.VAULT_REPO);
}

export function getRepoRef(): RepoRef {
  const repoFull = process.env.VAULT_REPO ?? "";
  const [owner, repo] = repoFull.split("/");
  if (!owner || !repo) {
    throw new Error(
      "VAULT_REPO is not set or malformed. Expected 'owner/repo' (e.g. sicnarf1232/hammer-claw-vault).",
    );
  }
  const root = (process.env.VAULT_ROOT ?? "").replace(/^\/+|\/+$/g, "");
  return {
    owner,
    repo,
    branch: process.env.VAULT_BRANCH ?? "main",
    root,
  };
}

let _octokit: Octokit | null = null;

export function getOctokit(): Octokit {
  if (_octokit) return _octokit;
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "GITHUB_TOKEN is not set. Add the fine-grained PAT to the environment.",
    );
  }
  _octokit = new Octokit({ auth: token });
  return _octokit;
}

export interface TreeEntry {
  path: string; // full path within the repo
  sha: string;
  size?: number;
}

// The full markdown tree (every .md blob with its SHA), behind one branch +
// recursive-tree call. Cached 60s and busted by write-backs (VAULT_TREE_TAG).
// Returns full repo paths; callers strip the root prefix.
const getMarkdownTreeCached = unstable_cache(
  async (owner: string, repo: string, branch: string): Promise<TreeEntry[]> => {
    const octokit = getOctokit();
    const br = await octokit.repos.getBranch({ owner, repo, branch });
    const treeSha = br.data.commit.commit.tree.sha;
    const tree = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: treeSha,
      recursive: "1",
    });
    return (tree.data.tree ?? [])
      .filter(
        (e) =>
          e.type === "blob" &&
          typeof e.path === "string" &&
          (e.path as string).endsWith(".md"),
      )
      .map((e) => ({
        path: e.path as string,
        sha: e.sha as string,
        size: e.size,
      }));
  },
  ["vault-md-tree"],
  { revalidate: 60, tags: [VAULT_TREE_TAG] },
);

// List every markdown file in the repo (optionally under a prefix). Served
// from the cached tree; filters by prefix and strips the root in memory.
export async function listMarkdownFiles(prefix = ""): Promise<TreeEntry[]> {
  const ref = getRepoRef();
  const all = await getMarkdownTreeCached(ref.owner, ref.repo, ref.branch);
  const fullPrefix = joinPath(ref.root, prefix);
  return all
    .filter((e) => fullPrefix === "" || e.path.startsWith(fullPrefix))
    .map((e) => ({
      // Return vault-relative paths (root stripped). lib/github owns the root
      // prefix; everything above this layer speaks in vault-relative paths.
      path: stripRoot(e.path, ref.root),
      sha: e.sha,
      size: e.size,
    }));
}

// Fetch and decode a blob by SHA. SHA is content-addressed and immutable, so
// this caches indefinitely (revalidate: false); changed files arrive under a
// new SHA and miss the cache naturally. This is the main rate-limit win.
const getBlobCached = unstable_cache(
  async (sha: string, owner: string, repo: string): Promise<string> => {
    const octokit = getOctokit();
    const blob = await octokit.git.getBlob({
      owner,
      repo,
      file_sha: sha,
    });
    return decodeContent(blob.data.content, blob.data.encoding);
  },
  ["vault-blob"],
  { revalidate: false, tags: [VAULT_BLOB_TAG] },
);

export async function getBlob(sha: string): Promise<string> {
  const ref = getRepoRef();
  return getBlobCached(sha, ref.owner, ref.repo);
}

export interface FileContent {
  path: string;
  content: string;
  sha: string;
}

// Read a single file by path via the Contents API. Returns content + the
// current blob SHA (needed for safe write-back). Returns null if not found.
export async function getFile(path: string): Promise<FileContent | null> {
  const ref = getRepoRef();
  const octokit = getOctokit();
  const fullPath = joinPath(ref.root, path);
  try {
    const res = await octokit.repos.getContent({
      owner: ref.owner,
      repo: ref.repo,
      path: fullPath,
      ref: ref.branch,
    });
    const data = res.data;
    if (Array.isArray(data) || data.type !== "file") return null;
    return {
      path, // vault-relative, as requested
      content: decodeContent(data.content, data.encoding),
      sha: data.sha,
    };
  } catch (err: unknown) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

// Read many blobs concurrently (bounded) given tree entries.
export async function readFiles(
  entries: TreeEntry[],
  concurrency = 12,
): Promise<FileContent[]> {
  const out: FileContent[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < entries.length) {
      const idx = cursor++;
      const e = entries[idx];
      const content = await getBlob(e.sha);
      out[idx] = { path: e.path, content, sha: e.sha };
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, entries.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return out.filter(Boolean);
}

// Create or update a file as a commit. Always reads the latest SHA first to
// avoid clobbering a concurrent write (Obsidian/Cowork). Never force-pushes.
export async function writeFile(args: {
  path: string; // repo-relative (root is applied automatically)
  content: string;
  message: string;
}): Promise<{ commitSha: string; path: string }> {
  const ref = getRepoRef();
  const octokit = getOctokit();
  const fullPath = joinPath(ref.root, args.path);

  // Look up current SHA (if the file exists) so we update rather than fail.
  let sha: string | undefined;
  const existing = await getFile(args.path);
  if (existing) sha = existing.sha;

  const res = await octokit.repos.createOrUpdateFileContents({
    owner: ref.owner,
    repo: ref.repo,
    path: fullPath,
    branch: ref.branch,
    message: args.message,
    content: Buffer.from(args.content, "utf8").toString("base64"),
    sha,
  });

  // The commit changed the tree (and gave the file a new blob SHA). Bust the
  // tree cache so the next read sees the new SHAs immediately. (The old blob
  // stays cached under its old SHA, harmlessly unused.) Guard for non-request
  // contexts where revalidateTag is a no-op or unavailable.
  try {
    revalidateTag(VAULT_TREE_TAG);
  } catch {
    // outside a request/render scope (e.g. a script); cache TTL handles it
  }

  return {
    commitSha: res.data.commit.sha ?? "",
    path: fullPath,
  };
}

// Delete a file via a commit. No-op (returns "") when the file is absent, so a
// move (writeFile new + deleteFile old) is safe to retry.
export async function deleteFile(args: {
  path: string;
  message: string;
}): Promise<{ commitSha: string }> {
  const ref = getRepoRef();
  const octokit = getOctokit();
  const fullPath = joinPath(ref.root, args.path);

  const existing = await getFile(args.path);
  if (!existing) return { commitSha: "" };

  const res = await octokit.repos.deleteFile({
    owner: ref.owner,
    repo: ref.repo,
    path: fullPath,
    branch: ref.branch,
    message: args.message,
    sha: existing.sha,
  });
  try {
    revalidateTag(VAULT_TREE_TAG);
  } catch {
    // outside a request scope; cache TTL handles it
  }
  return { commitSha: res.data.commit.sha ?? "" };
}

// ---- helpers ----

function stripRoot(fullPath: string, root: string): string {
  if (!root) return fullPath;
  const prefix = root.replace(/\/+$/g, "") + "/";
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
}

function joinPath(a: string, b: string): string {
  const left = a.replace(/\/+$/g, "");
  const right = b.replace(/^\/+/g, "");
  if (!left) return right;
  if (!right) return left;
  return `${left}/${right}`;
}

function decodeContent(content: string, encoding: string): string {
  if (encoding === "base64") {
    return Buffer.from(content, "base64").toString("utf8");
  }
  return content;
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status?: number }).status === 404
  );
}
