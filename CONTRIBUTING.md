# Contributing to Plex Exporter

Thank you for your interest in contributing to Plex Exporter! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Documentation](#documentation)

---

## Code of Conduct

By participating in this project, you agree to maintain a respectful and collaborative environment. We expect all contributors to:

- ✅ Be respectful and inclusive
- ✅ Provide constructive feedback
- ✅ Focus on what is best for the project
- ✅ Show empathy towards other contributors

---

## Getting Started

### Prerequisites

- **Node.js:** 18.x or 20.x
- **npm:** 9.x or higher
- **Git:** Latest version
- **Docker:** (optional) For running with Docker Compose

### Initial Setup

1. **Fork the repository:**
   ```bash
   # Click "Fork" on GitHub
   # Clone your fork
   git clone https://github.com/YOUR-USERNAME/plex-exporter.git
   cd plex-exporter
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Install Git hooks:**
   ```bash
   npm run prepare
   ```

4. **Set up environment variables:**
   ```bash
   # Backend
   cp apps/backend/.env.example apps/backend/.env
   # Edit .env with your settings

   # Frontend
   cp apps/frontend/config/frontend.json.sample apps/frontend/config/frontend.json
   # Edit frontend.json with your preferences
   ```

5. **Verify setup:**
   ```bash
   npm run build
   npm test
   ```

---

## Development Workflow

### Branch Strategy

We use a simplified Git Flow:

- **`main`** - Production-ready code
- **`develop`** - Integration branch for features
- **`feature/*`** - Feature branches
- **`fix/*`** - Bug fix branches
- **`refactor/*`** - Refactoring branches

### Creating a Feature Branch

```bash
# Update your local repository
git checkout develop
git pull origin develop

# Create a feature branch
git checkout -b feature/my-awesome-feature

# Make your changes
# ...

# Commit your changes (see Commit Guidelines)
git add .
git commit -m "feat: add awesome feature"

# Push to your fork
git push origin feature/my-awesome-feature
```

### Keeping Your Branch Updated

```bash
# Fetch latest changes
git fetch origin

# Rebase on develop
git rebase origin/develop

# If conflicts occur, resolve them and continue
git add .
git rebase --continue
```

---

## Coding Standards

### General Guidelines

- ✅ Follow existing code style
- ✅ Use meaningful variable and function names
- ✅ Keep functions small and focused
- ✅ Add comments for complex logic
- ✅ Remove dead code and unused imports
- ✅ Handle errors appropriately

### JavaScript/TypeScript

```javascript
// ✅ Good: Clear, descriptive names
function calculateTotalRuntime(episodes) {
  return episodes.reduce((sum, ep) => sum + ep.duration, 0);
}

// ❌ Bad: Unclear names
function calc(e) {
  return e.reduce((s, x) => s + x.d, 0);
}
```

### File Organization

- **Frontend:**
  - Features: `apps/frontend/src/features/[feature-name]/`
  - Utilities: `apps/frontend/src/js/`
  - Core: `apps/frontend/src/core/`
  - Styles: `apps/frontend/styles/`

- **Backend:**
  - Routes: `apps/backend/src/routes/`
  - Services: `apps/backend/src/services/`
  - Database: `apps/backend/src/db/`
  - Scripts: `apps/backend/src/scripts/`

### Naming Conventions

- **Files:** `kebab-case.js`
- **Directories:** `kebab-case/`
- **Functions:** `camelCase()`
- **Classes:** `PascalCase`
- **Constants:** `UPPER_SNAKE_CASE`
- **Components:** `PascalCase`

### EditorConfig

This project uses EditorConfig for consistent formatting. Ensure your editor respects `.editorconfig`:

- Indent: 2 spaces
- Charset: UTF-8
- End of line: LF (except Windows-specific files)
- Trim trailing whitespace: Yes
- Insert final newline: Yes

---

## Commit Guidelines

### Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat:** New feature
- **fix:** Bug fix
- **docs:** Documentation changes
- **style:** Code style changes (formatting, no logic change)
- **refactor:** Code refactoring
- **perf:** Performance improvements
- **test:** Adding or updating tests
- **chore:** Maintenance tasks (dependencies, config)
- **build:** Build system changes
- **ci:** CI/CD changes
- **revert:** Revert a previous commit

### Examples

```bash
# Feature
feat(hero): add random selection for hero pool

# Bug fix
fix(modal): prevent modal from closing on backdrop click

# Documentation
docs(readme): add installation instructions

# Refactoring
refactor(api): simplify media filtering logic

# Performance
perf(grid): optimize image loading with lazy loading

# Multiple changes
feat(backend): add IMDb ID support and improve error handling

- Add IMDb ID to media schema
- Improve error messages for missing data
- Update API documentation
```

### Git Hooks

Pre-commit hooks will automatically check:

- ✅ No sensitive files (`.env`, `.sqlite`, `.log`)
- ✅ No debugger statements
- ✅ No excessively large files
- ⚠️  TODO/FIXME comments (informational)

Commit-msg hooks will validate:

- ✅ Minimum message length (10 characters)
- ✅ No WIP commits on main/develop
- ℹ️  Suggests conventional commit format

---

## Pull Request Process

### Before Submitting

1. **Ensure all tests pass:**
   ```bash
   npm test
   ```

2. **Build successfully:**
   ```bash
   npm run build
   ```

3. **Update documentation:**
   - Update README if adding features
   - Add JSDoc comments to functions
   - Update relevant docs in `docs/`

4. **Squash commits (optional):**
   ```bash
   git rebase -i origin/develop
   ```

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] Tests added/updated for changes
- [ ] Documentation updated
- [ ] No console.log/debugger statements
- [ ] Branch is up-to-date with develop
- [ ] All CI checks pass
- [ ] Changes are backward compatible (or breaking changes documented)

### PR Title Format

Use the same format as commit messages:

```
feat(scope): add new feature
fix(scope): fix critical bug
```

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix (non-breaking change)
- [ ] New feature (non-breaking change)
- [ ] Breaking change (fix or feature causing existing functionality to change)
- [ ] Documentation update

## Testing
Describe how to test the changes

## Screenshots (if applicable)
Add screenshots for UI changes

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Commented complex code
- [ ] Documentation updated
- [ ] No new warnings
- [ ] Tests added/updated
- [ ] All tests passing
```

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests for specific workspace
npm test --workspace @plex-exporter/frontend
npm test --workspace @plex-exporter/backend

# Run tests with coverage
npm test -- --coverage
```

### Writing Tests

```javascript
// Example: Frontend test
describe('Hero feature', () => {
  it('should select random items from pool', () => {
    const pool = [1, 2, 3, 4, 5];
    const selected = selectRandomItems(pool, 3);

    expect(selected).toHaveLength(3);
    expect(pool).toContain(selected[0]);
  });
});

// Example: Backend test
describe('GET /api/v1/movies', () => {
  it('should return list of movies', async () => {
    const response = await request(app)
      .get('/api/v1/movies')
      .expect(200);

    expect(response.body).toHaveProperty('items');
    expect(Array.isArray(response.body.items)).toBe(true);
  });
});
```

### Manual Testing

Refer to [docs/manual-tests.md](docs/manual-tests.md) for manual testing procedures.

---

## Documentation

### Code Documentation

Use JSDoc for functions and complex logic:

```javascript
/**
 * Calculates the total runtime of a series
 *
 * @param {Array<Episode>} episodes - Array of episode objects
 * @param {Object} options - Optional configuration
 * @param {boolean} options.includeSpecials - Include special episodes
 * @returns {number} Total runtime in minutes
 *
 * @example
 * const runtime = calculateSeriesRuntime(episodes, { includeSpecials: false });
 */
function calculateSeriesRuntime(episodes, options = {}) {
  // Implementation
}
```

### Project Documentation

Update relevant documentation when making changes:

- **README.md** - Project overview, setup, usage
- **docs/architecture.md** - System architecture
- **docs/structure.md** - Codebase structure
- **Package READMEs** - Package-specific documentation

---

## Common Tasks

### Adding a New Feature

1. Create feature branch: `git checkout -b feature/my-feature`
2. Implement feature with tests
3. Update documentation
4. Submit PR

### Fixing a Bug

1. Create fix branch: `git checkout -b fix/bug-description`
2. Write failing test demonstrating bug
3. Fix bug and ensure test passes
4. Submit PR with test and fix

### Updating Dependencies

```bash
# Check outdated packages
npm outdated

# Update specific package
npm update package-name --workspace @plex-exporter/frontend

# Update all packages (carefully!)
npm update --workspaces
```

### Running Specific Workspace Commands

```bash
# Frontend
npm run build --workspace @plex-exporter/frontend
npm run dev --workspace @plex-exporter/frontend

# Backend
npm run start --workspace @plex-exporter/backend
npm run dev --workspace @plex-exporter/backend

# Tools
npm run analyze --workspace @plex-exporter/tools
npm run split:series --workspace @plex-exporter/tools
```

---

## Getting Help

### Resources

- **Documentation:** [docs/](docs/)
- **Architecture:** [docs/architecture.md](docs/architecture.md)
- **Project Structure:** [docs/structure.md](docs/structure.md)
- **Main README:** [README.md](README.md)

### Questions?

- Open a GitHub Discussion
- Check existing issues
- Review documentation
- Ask in PR comments

---

## Recognition

Contributors will be recognized in:

- Git commit history
- GitHub contributors page
- Release notes (for significant contributions)

---

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to Plex Exporter! 🎉
