---
title: Replace If Blocks with Object Spread
description: Refactor multiple conditional assignments into a single object spread with conditional properties for better readability and maintainability
---

# Replace If Blocks with Object

Replace multiple `if` statements that conditionally assign object properties with a single object spread using conditional property syntax (`...(condition && { key: value })`).

### BAD ❌

```ts
// Multiple if statements for conditional assignments
if (!isDefaultSort) {
  filterState.sort = { ...filters.value.sort }
}
if (filters.value.sources.length > 0) {
  filterState.sources = [...filters.value.sources]
}
if (filters.value.minRating > 0) {
  filterState.minRating = filters.value.minRating
}
if (filters.value.minYear > 0) {
  filterState.minYear = filters.value.minYear
}
```

### GOOD ✅

```ts
;['sort', () => isDefaultSort]
if (!isDefaultSort) {
  filterState.sort = { ...filters.value.sort }
}
if (filters.value.sources.length > 0) {
  filterState.sources = [...filters.value.sources]
}
if (filters.value.minRating > 0) {
  filterState.minRating = filters.value.minRating
}
if (filters.value.minYear > 0) {
  filterState.minYear = filters.value.minYear
}
```

## When to Use

- Multiple conditional property assignments to the same object

## When NOT to Use

- Single conditional assignment (simple `if` is clearer)
- Complex conditions that would make the expression hard to read
- When you need to perform side effects beyond assignment
