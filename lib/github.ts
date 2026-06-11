import { Octokit } from "@octokit/rest";

// Single GitHub client for all vault access (CLAUDE.md convention).
// Reads via the Git Trees + Contents API, writes via commits. No filesystem.

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

// List every markdown file in the repo (optionally under a prefix), using one
// recursive tree call. Returns repo-relative paths and blob SHAs.
export async function listMarkdownFiles(prefix = ""): Promise<TreeEntry[]> {
  const ref = getRepoRef();
  const octokit = getOctokit();

  const branch = await octokit.repos.getBranch({
    owner: ref.owner,
    repo: ref.repo,
    branch: ref.branch,
  });
  const treeSha = branch.data.commit.commit.tree.sha;

  const tree = await octokit.git.getTree({
    owner: ref.owner,
    repo: ref.repo,
    tree_sha: treeSha,
    recursive: "1",
  });

  const fullPrefix = joinPath(ref.root, prefix);
  return (tree.data.tree ?? [])
    .filter(
      (e) =>
        e.type === "blob" &&
        typeof e.path === "string" &&
        e.path.endsWith(".md") &&
        (fullPrefix === "" || e.path.startsWith(fullPrefix)),
    )
    .map((e) => ({
      // Return vault-relative paths (root stripped). lib/github owns the root
      // prefix; everything above this layer speaks in vault-relative paths.
      path: stripRoot(e.path as string, ref.root),
      sha: e.sha as string,
      size: e.size,
    }));
}

// Fetch and decode a blob by SHA (efficient for tree-driven reads).
export async function getBlob(sha: string): Promise<string> {
  const ref = getRepoRef();
  const octokit = getOctokit();
  const blob = await octokit.git.getBlob({
    owner: ref.owner,
    repo: ref.repo,
    file_sha: sha,
  });
  return decodeContent(blob.data.content, blob.data.encoding);
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
  return {
    commitSha: res.data.commit.sha ?? "",
    path: fullPath,
  };
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
