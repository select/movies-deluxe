# Releases

This project uses `release-it` for automated versioning and changelog generation.

To create a new release:

```bash
pnpm release
```

This will:

1. Run linting and type checking
2. Bump the version based on conventional commits
3. Generate/update `CHANGELOG.md`
4. Create a git commit and tag
5. Create a GitHub release (requires `GITHUB_TOKEN`)
6. Push to remote
