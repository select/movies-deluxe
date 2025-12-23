---
description: Check for type and lint errors and fix them
---

Create a beads issue to check for type and lint errors and fix them

## Commands

```bash
pnpm typecheck        # Check TypeScript types
pnpm lint             # Run oxlint + eslint
pnpm lint:fix         # Auto-fix lint errors
pnpm format           # Format with Prettier
```

## Workflow

1. Run `pnpm typecheck` - fix type errors manually
2. Run `pnpm lint:fix` - auto-fix lint errors
3. Run `pnpm lint` - check remaining errors
4. Verify: `pnpm typecheck && pnpm lint`

## Common Fixes

**@typescript-eslint/no-unused-vars**: Delete unused variable, or prefix with `_` if intentionally unused

```typescript
// Option 1: Delete it
// (removed)

// Option 2: Prefix with underscore
const _unused = 'test'

// Option 3: Just underscore for function params
function foo(_param: string) {}
```

**Missing null check**: Use optional chaining

```typescript
const year = movie.year?.toString() ?? 'Unknown'
```

**Console.log in app/**: Remove or disable

```typescript
// eslint-disable-next-line no-console
console.log('debug')
```

**Auto-import not found**: Regenerate types

```bash
pnpm nuxt prepare
```

## Rules

- **app/**: No console.log, strict types, auto-imports available
- **scripts/**: Console.log allowed, manual imports required
- **server/**: Console.log allowed, auto-imports available
