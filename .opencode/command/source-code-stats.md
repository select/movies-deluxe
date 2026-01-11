---
description: Show source code statistics
---

Generate source code statistics for the project, excluding JSON files and dependencies.

Run the following commands to count lines of code by file type:

```bash
# Vue files
find . -name "*.vue" -not -path "./node_modules/*" -not -path "./.nuxt/*" -not -path "./dist/*" -not -path "./.output/*" -not -path "./.opencode/*" -not -path "./public/*" | xargs wc -l 2>/dev/null | tail -1

# TypeScript files
find . -name "*.ts" -not -path "./node_modules/*" -not -path "./.nuxt/*" -not -path "./dist/*" -not -path "./.output/*" -not -path "./.opencode/*" -not -path "./public/*" | xargs wc -l 2>/dev/null | tail -1

# JavaScript files
find . -name "*.js" -not -path "./node_modules/*" -not -path "./.nuxt/*" -not -path "./dist/*" -not -path "./.output/*" -not -path "./.opencode/*" -not -path "./public/*" | xargs wc -l 2>/dev/null | tail -1

# CSS files
find . -name "*.css" -not -path "./node_modules/*" -not -path "./.nuxt/*" -not -path "./dist/*" -not -path "./.output/*" -not -path "./.opencode/*" -not -path "./public/*" | xargs wc -l 2>/dev/null | tail -1

# Markdown files
find . -name "*.md" -not -path "./node_modules/*" -not -path "./.nuxt/*" -not -path "./dist/*" -not -path "./.output/*" -not -path "./.opencode/*" -not -path "./public/*" | xargs wc -l 2>/dev/null | tail -1
```

Present the results in a clean summary format showing:

- Lines per file type (Vue, TypeScript, JavaScript, CSS, Markdown)
- Total lines of code
- Note about excluded directories
