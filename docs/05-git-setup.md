# 05 — Git setup (re-home the vault to sicnarf1232)

State as of this handover:
- The vault is committed. HEAD = `4351678 Snapshot before Command Center app build`.
- `origin` is already repointed to `https://github.com/sicnarf1232/hammer-claw-vault.git`.
- Two empty lock files (`.git/HEAD.lock`, `.git/index.lock`) were left behind because the Cowork sandbox cannot delete files in the vault. Remove them on your Mac before any git command (step 1).

Run these in Terminal on your Mac.

## 1. Clear the stale lock files

```bash
cd ~/Documents/"The Hammer Claw"
rm -f .git/HEAD.lock .git/index.lock
git status        # should say: On branch main, working tree clean
git log -1 --oneline   # should show 4351678
```

## 2. Create the repo under sicnarf1232 and push

The remote URL is already set. The repo just needs to exist on GitHub, empty (no README/gitignore, so the first push is clean).

Option A, GitHub CLI (simplest):
```bash
gh auth login        # log in as sicnarf1232
gh repo create sicnarf1232/hammer-claw-vault --private
git push -u origin main
```

Option B, web + git:
- On github.com (logged in as sicnarf1232), create a new private repo named `hammer-claw-vault`. Do not add any files.
- Then: `git push -u origin main`

## 3. Account-switch gotcha (credentials)

You are moving off the nextech-tied account `jordanFrancis12`. macOS likely cached its credentials in Keychain, so the push may fail with that old user. Fix:

```bash
# remove the cached github.com credential, then push again and use sicnarf1232
printf "protocol=https\nhost=github.com\n\n" | git credential-osxkeychain erase
git push -u origin main
```

When prompted, username = `sicnarf1232`, password = a Personal Access Token (not your GitHub password). The `gh auth login` path in Option A handles this for you.

## 4. Fine-grained PAT for the app (separate from your push auth)

The app reads/writes the vault with its own token. Create it now so it is ready for Phase 0:

- GitHub (as sicnarf1232) -> Settings -> Developer settings -> Personal access tokens -> Fine-grained tokens -> Generate new.
- Resource owner: sicnarf1232. Repository access: only `hammer-claw-vault`.
- Permissions: Contents -> Read and write. Metadata -> Read (auto).
- Copy the token. It becomes `GITHUB_TOKEN` in the app's Vercel env (see docs/04). Do not commit it.

## 4b. If the push is rejected for large files

GitHub hard-rejects any file over 100 MB. The vault had two export artifacts over the limit (`fact & finding/chat.db` at 117 MB, one 54 MB `.eml`). Strip every file over 50 MB from history, then push. This preserves all your markdown history, just drops the oversized binaries.

filter-repo also removes these files from your folder, so back them up first if you want to keep them:

```bash
mkdir -p ~/HammerClaw-large-backup
cp "fact & finding/chat.db" ~/HammerClaw-large-backup/
```

Install the tool (Homebrew; if you do not have brew, use `pip3 install git-filter-repo`):

```bash
brew install git-filter-repo
```

Strip blobs over 50 MB from all history:

```bash
git filter-repo --strip-blobs-bigger-than 50M --force
```

filter-repo drops the remote as a safety step, so re-add it and push:

```bash
git remote add origin https://github.com/sicnarf1232/hammer-claw-vault.git
git push -u origin main
```

Then prevent it recurring:

```bash
cat >> .gitignore <<'EOF'

# Large export artifacts — never commit
*.db
*.sqlite
*.eml
*.gz
imessage-export/
EOF
git add .gitignore
git commit -m "Ignore large export artifacts"
git push
```

## 5. App repo (when you start Phase 0)

Separate repo, same account:
```bash
gh repo create sicnarf1232/hammer-claw-command-center --private
```
Copy `CLAUDE.md` to its root and the `docs/` folder into `/docs`, then open it in Claude Code with the kickoff prompt from the handover README.
