# Upload To Git

Use one of the options below.

## Option A: Push this existing local repo to a new remote

Run from:

```bash
cd /Users/tomlandy/Desktop/Codex
```

Then:

```bash
git remote add origin <YOUR_REPO_URL>
git push -u origin main
```

If `origin` already exists:

```bash
git remote set-url origin <YOUR_REPO_URL>
git push -u origin main
```

## Option B: Create a folder-only repo (just this app)

Run:

```bash
cd /Users/tomlandy/Desktop/Codex/trading-sim-live-dashboard
git init
git add .
git commit -m "Initial commit - trading sim live dashboard"
git branch -M main
git remote add origin <YOUR_REPO_URL>
git push -u origin main
```

## Verify

```bash
git status
git log --oneline -n 5
```

