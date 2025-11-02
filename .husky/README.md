# Git Hooks with Husky

This directory contains Git hooks managed by [Husky](https://typicode.github.io/husky/).

## What are Git Hooks?

Git hooks are scripts that run automatically when certain Git events occur (e.g., before commit, before push). They help maintain code quality by enforcing standards before code reaches the repository.

## Installed Hooks

### pre-commit

Runs before each commit to check:

- ✅ No sensitive files (`.env`, `.sqlite`, `.log`)
- ✅ No debugger statements in code
- ✅ File sizes (warns about files > 1MB)
- ℹ️  TODO/FIXME comments (informational)

**To bypass** (use sparingly):
```bash
git commit --no-verify -m "message"
```

### commit-msg

Validates commit messages:

- ✅ Minimum 10 characters
- ✅ No WIP commits on main/develop
- ℹ️  Suggests conventional commit format

## Setup

Hooks are automatically installed when you run:

```bash
npm install
```

This triggers the `prepare` script in `package.json`.

## Manual Installation

If hooks aren't working:

```bash
# Install Husky
npm install --save-dev husky

# Initialize Husky
npx husky install

# Make hooks executable (Unix/Mac)
chmod +x .husky/*
```

## Troubleshooting

### Hooks Not Running

**Problem:** Commits go through without running checks

**Solution 1 - Verify Husky is installed:**
```bash
ls -la .husky
# Should show: pre-commit, commit-msg files
```

**Solution 2 - Reinstall hooks:**
```bash
rm -rf .husky
npm run prepare
```

**Solution 3 - Check Git config:**
```bash
git config core.hooksPath
# Should output: .husky
```

### Permission Denied (Unix/Mac)

**Problem:** Permission denied when committing

**Solution:**
```bash
chmod +x .husky/pre-commit
chmod +x .husky/commit-msg
```

### Hooks Not Found (Windows)

**Problem:** Hooks don't run on Windows

**Solution:**
- Ensure Git Bash or WSL is being used
- Run `npm run prepare` in Git Bash
- Check that hooks have Unix line endings (LF, not CRLF)

### False Positives

**Problem:** Hook blocks valid commit

**Solution:**
- Review the error message
- Fix the issue if legitimate
- Use `--no-verify` if absolutely necessary (discouraged)

```bash
# Emergency bypass (use with caution!)
git commit --no-verify -m "urgent fix"
```

## Customizing Hooks

### Modifying Checks

Edit the hook files directly:

```bash
# Edit pre-commit hook
nano .husky/pre-commit

# Edit commit-msg hook
nano .husky/commit-msg
```

### Adding New Hooks

```bash
# Create a new hook (e.g., pre-push)
npx husky add .husky/pre-push "npm test"
chmod +x .husky/pre-push
```

### Disabling a Hook

```bash
# Temporarily disable by renaming
mv .husky/pre-commit .husky/pre-commit.disabled

# Re-enable
mv .husky/pre-commit.disabled .husky/pre-commit
```

## Best Practices

### ✅ Do

- Keep hooks fast (< 5 seconds)
- Provide clear error messages
- Make hooks idempotent
- Test hooks locally before pushing
- Document custom checks

### ❌ Don't

- Don't use `--no-verify` regularly
- Don't make hooks too strict (balance quality vs. velocity)
- Don't run long-running tasks (use CI instead)
- Don't block commits for warnings (only errors)

## Hook Performance

Current hook execution times (approximate):

- **pre-commit:** ~1-2 seconds
- **commit-msg:** < 1 second

If hooks become too slow, consider:

- Moving checks to CI
- Caching results
- Only checking staged files
- Parallelizing checks

## CI Integration

Hooks complement CI, not replace it:

- **Hooks:** Fast, local checks for common issues
- **CI:** Comprehensive checks, tests, builds

Even if hooks pass, CI may fail - this is expected and ensures quality.

## Related Documentation

- [Husky Documentation](https://typicode.github.io/husky/)
- [Git Hooks Documentation](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Contributing Guide](../CONTRIBUTING.md)

## Getting Help

If hooks are causing issues:

1. Check this README
2. Review error messages carefully
3. Check [CONTRIBUTING.md](../CONTRIBUTING.md)
4. Ask the team
5. As a last resort, use `--no-verify`

---

**Remember:** Hooks are here to help, not hinder. If they're causing friction, let's improve them together!
