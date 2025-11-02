# Documentation

This directory contains project documentation, architecture decisions, and developer guides.

## Documentation Index

### Core Documentation

| Document | Description | Audience |
|----------|-------------|----------|
| [architecture.md](./architecture.md) | System architecture, component design, and technical decisions | Developers, Architects |
| [structure.md](./structure.md) | Project structure, codebase organization, and conventions | All Contributors |
| [db-migration-plan.md](./db-migration-plan.md) | Database migration strategy and plan | Backend Developers |
| [manual-tests.md](./manual-tests.md) | Manual testing procedures and checklists | QA, Developers |

### Developer Tools

| Directory | Description |
|-----------|-------------|
| [dev-tools/](./dev-tools/) | Browser console debugging scripts and utilities |

---

## Documentation Categories

### 1. Architecture (`architecture.md`)

**Purpose:** High-level system design and component architecture

**Contents:**
- System overview and components
- Backend architecture (Express, SQLite, REST API)
- Frontend architecture (Vanilla JS, modular features)
- Data flow and integration points
- Technology choices and rationale

**When to read:**
- Starting work on the project
- Planning major features
- Understanding system boundaries
- Making architectural decisions

**When to update:**
- After major architectural changes
- When adding new system components
- When changing technology stack
- After significant refactoring

---

### 2. Project Structure (`structure.md`)

**Purpose:** Detailed explanation of codebase organization

**Contents:**
- Directory structure
- File naming conventions
- Module organization
- Frontend feature structure
- Backend route organization
- Shared packages

**When to read:**
- New contributors onboarding
- Looking for specific code
- Understanding module boundaries
- Planning code organization

**When to update:**
- After restructuring directories
- When adding new features
- When changing conventions
- After major refactoring

---

### 3. Database Migration Plan (`db-migration-plan.md`)

**Purpose:** Strategy for database schema evolution

**Contents:**
- Migration strategy
- Schema versioning
- Rollback procedures
- Data integrity considerations
- Migration tooling

**When to read:**
- Before changing database schema
- Planning data model changes
- Understanding migration process
- Troubleshooting migration issues

**When to update:**
- After completing migrations
- When changing migration strategy
- After encountering migration issues
- When adding new migration tools

---

### 4. Manual Testing (`manual-tests.md`)

**Purpose:** Procedures for manual QA testing

**Contents:**
- Testing checklists
- Test scenarios
- Expected behaviors
- Edge cases to verify
- Browser compatibility checks

**When to read:**
- Before releases
- During feature development
- When fixing bugs
- After major changes

**When to update:**
- After adding new features
- When finding new edge cases
- After bug fixes
- When updating test procedures

---

## Developer Tools (`dev-tools/`)

### Purpose

Browser console scripts for debugging and development without requiring a full development environment setup.

### Contents

| File | Purpose | Usage |
|------|---------|-------|
| `debug-modal.js` | Debug modal V3 component | Copy/paste into browser console |
| `debug-scroll.js` | Debug scroll orchestrator | Copy/paste into browser console |

### How to Use

1. Open browser DevTools (F12)
2. Navigate to Console tab
3. Copy contents of the desired debug script
4. Paste into console and press Enter
5. Follow script-specific instructions

### When to Use

- **debug-modal.js:**
  - Modal not opening/closing correctly
  - State management issues
  - Investigating modal behavior
  - Testing modal transitions

- **debug-scroll.js:**
  - Scroll animations not working
  - Performance issues with scroll
  - Investigating scroll orchestrator
  - Testing scroll-based features

### Adding New Debug Tools

When creating new debug scripts:

1. ✅ Make them self-contained (no external dependencies)
2. ✅ Add clear usage instructions in comments
3. ✅ Include cleanup functions
4. ✅ Add to this README
5. ✅ Test in multiple browsers

---

## Contributing to Documentation

### When to Add New Documents

Create new documentation when:

- ✅ Introducing a complex new feature
- ✅ Making significant architectural changes
- ✅ Establishing new conventions
- ✅ Documenting tribal knowledge
- ✅ Creating processes that need to be followed

### Documentation Standards

**Markdown Format:**
- Use clear headings (H1 for title, H2 for sections)
- Include a table of contents for long documents
- Use code blocks with language syntax highlighting
- Add diagrams where helpful (Mermaid, ASCII art, or images)

**Writing Style:**
- Write in clear, concise English (or German for user-facing docs)
- Use active voice
- Include examples
- Define acronyms on first use
- Keep paragraphs short (3-5 sentences)

**Structure:**
```markdown
# Document Title

Brief description of the document's purpose.

## Overview

High-level introduction.

## Section 1

Detailed content with examples.

## Section 2

More content...

## See Also

Links to related documentation.
```

### Keeping Documentation Fresh

**Regular Reviews:**
- Review quarterly for accuracy
- Update after major changes
- Remove outdated information
- Add missing details

**Update Triggers:**
- ✅ After merging major features
- ✅ When refactoring significant code
- ✅ After architectural decisions
- ✅ When conventions change
- ✅ After onboarding feedback

**Version Control:**
- Link docs to specific commits where relevant
- Note date of last update
- Document breaking changes clearly
- Keep a changelog for the docs themselves

---

## Documentation Templates

### Architecture Decision Record (ADR)

```markdown
# ADR-XXX: [Decision Title]

**Date:** YYYY-MM-DD
**Status:** [Proposed | Accepted | Deprecated | Superseded]

## Context

What is the issue that we're facing?

## Decision

What is the change that we're proposing?

## Consequences

What becomes easier or more difficult as a result?

## Alternatives Considered

What other options did we evaluate?
```

### Feature Documentation

```markdown
# Feature: [Feature Name]

## Overview

Brief description of the feature.

## User Stories

- As a [user type], I want [goal] so that [reason]

## Technical Design

### Frontend
- Components affected
- New components created
- State management changes

### Backend
- API endpoints
- Database changes
- Integration points

## Testing

- Unit tests
- Integration tests
- Manual test scenarios

## Deployment Notes

- Configuration changes
- Migration steps
- Rollback procedure
```

---

## Finding Documentation

### By Topic

- **Architecture & Design:** `architecture.md`, `structure.md`
- **Database:** `db-migration-plan.md`
- **Testing:** `manual-tests.md`
- **Development:** `dev-tools/`

### By File Type

- **Markdown (`.md`)**: Human-readable documentation
- **JavaScript (`.js`)**: Executable debug/development scripts

### External Documentation

- **Main README:** [../README.md](../README.md) - Project overview and setup
- **Backend README:** [../apps/backend/README.md](../apps/backend/README.md) - Backend-specific docs
- **Frontend:** Code comments and JSDoc in source files
- **Tools:** [../tools/README.md](../tools/README.md) - Development utilities
- **Data:** [../data/README.md](../data/README.md) - Data directory structure

---

## Documentation TODOs

Track missing or needed documentation here:

- [ ] API endpoint reference documentation
- [ ] Frontend component documentation
- [ ] Environment variable reference
- [ ] Deployment guide
- [ ] Contributing guidelines (CONTRIBUTING.md)
- [ ] Troubleshooting guide
- [ ] Performance optimization guide
- [ ] Security best practices

---

## Questions?

If you can't find what you're looking for:

1. Check the main [README](../README.md)
2. Search the codebase for relevant code comments
3. Review recent commit messages
4. Ask the team

---

## Meta

- **Last Updated:** 2025-11-01
- **Maintained By:** Project contributors
- **Feedback:** Submit issues or PRs to improve documentation
