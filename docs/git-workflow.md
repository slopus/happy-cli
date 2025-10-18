# Git Workflow Guide

## Repository Structure

- **Upstream**: `slopus/happy-cli` (original project)
- **Fork**: `GobbyAI/happy-cli` (your fork)
- **Branches**:
  - `main` - stable, production-ready code
  - `dev` - active development

## Daily Development Workflow

### 1. Working on Features

```bash
# Ensure you're on dev branch
git checkout dev

# Make changes, commit with conventional commits
git add .
git commit -m "feat: add new feature"

# Push to your fork
git push origin dev
```

### 2. Creating PRs (IMPORTANT!)

**For your own fork (most common):**
```bash
# Always specify --repo to avoid accidents!
gh pr create --repo GobbyAI/happy-cli --base main --head dev --title "feat: ..." --body "..."
```

**For contributing upstream (rare):**
```bash
# Only when you want to contribute back to slopus/happy-cli
gh pr create --repo slopus/happy-cli --base main --head GobbyAI:dev --title "feat: ..." --body "..."
```

### 3. Merging to Your Main

When `dev` is ready for "release":

**Option A: Via GitHub PR**
1. Use PR #1 or create new PR in GobbyAI/happy-cli
2. Review and merge on GitHub
3. Pull latest main locally:
```bash
git checkout main
git pull origin main
```

**Option B: Locally**
```bash
git checkout main
git merge dev
git push origin main
```

### 4. Staying Synced with Upstream

```bash
# Fetch latest from slopus/happy-cli
git fetch upstream

# Update your main with upstream changes
git checkout main
git merge upstream/main
git push origin main

# Merge main back into dev
git checkout dev
git merge main
git push origin dev
```

## Safety Checklist

Before running `gh pr create`:
- [ ] Verify `--repo` flag is set correctly
- [ ] Check base branch (`--base`)
- [ ] Confirm you want to create PR in that repository

## Aliases (Optional)

Add to `~/.gitconfig`:

```ini
[alias]
    # Create PR in your fork (safe default)
    pr = !gh pr create --repo GobbyAI/happy-cli

    # Explicitly create PR upstream
    pr-upstream = !gh pr create --repo slopus/happy-cli

    # Sync with upstream
    sync = !git fetch upstream && git checkout main && git merge upstream/main && git push origin main
```

Usage:
```bash
git pr --base main --head dev --title "feat: ..."
git pr-upstream --base main --head GobbyAI:dev --title "feat: ..."
git sync
```

## Common Scenarios

### Scenario 1: Feature Development
```bash
git checkout dev
# ... work on feature ...
git commit -m "feat: implement feature"
git push origin dev

# Create PR in your fork
gh pr create --repo GobbyAI/happy-cli --base main --head dev
```

### Scenario 2: Hot Fix on Main
```bash
git checkout main
git checkout -b hotfix/critical-bug
# ... fix bug ...
git commit -m "fix: critical bug"
git push origin hotfix/critical-bug

# Create PR to your main
gh pr create --repo GobbyAI/happy-cli --base main --head hotfix/critical-bug
```

### Scenario 3: Contributing Upstream
```bash
# Ensure your main is up to date
git checkout main
git fetch upstream
git merge upstream/main

# Create feature branch from main
git checkout -b feature/upstream-contribution
# ... implement feature ...
git commit -m "feat: contribution to upstream"
git push origin feature/upstream-contribution

# Create PR to upstream
gh pr create --repo slopus/happy-cli --base main --head GobbyAI:feature/upstream-contribution
```

## Remotes Configuration

Verify your remotes:
```bash
$ git remote -v
origin    https://github.com/GobbyAI/happy-cli (fetch)
origin    https://github.com/GobbyAI/happy-cli (push)
upstream  https://github.com/slopus/happy-cli.git (fetch)
upstream  https://github.com/slopus/happy-cli.git (push)
```

## Default Repository

To set default repository for `gh` commands in this project:

```bash
# This file tells gh which repo to use by default
echo "GobbyAI/happy-cli" > .github/gh-repo-default.txt
```

Or configure globally:
```bash
gh config set default_repo GobbyAI/happy-cli
```

## Troubleshooting

### "I accidentally created a PR to upstream!"
1. Close the PR on GitHub or:
   ```bash
   gh pr close <PR_NUMBER> --repo slopus/happy-cli
   ```
2. Create PR in correct repo:
   ```bash
   gh pr create --repo GobbyAI/happy-cli --base main --head dev
   ```

### "My dev is behind main"
```bash
git checkout dev
git merge main
git push origin dev
```

### "I want to update from upstream"
```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
git checkout dev
git merge main
git push origin dev
```
