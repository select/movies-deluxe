export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Type: Must be one of the conventional commit types
    "type-enum": [
      2,
      "always",
      [
        "feat", // New feature
        "fix", // Bug fix
        "docs", // Documentation only changes
        "style", // Code style changes (formatting, missing semi-colons, etc)
        "refactor", // Code change that neither fixes a bug nor adds a feature
        "perf", // Performance improvements
        "test", // Adding or updating tests
        "build", // Changes to build system or dependencies
        "ci", // Changes to CI configuration files and scripts
        "chore", // Other changes that don't modify src or test files
        "revert", // Reverts a previous commit
      ],
    ],

    // Scope: Optional, can be anything
    "scope-case": [2, "always", "lower-case"],
    "scope-empty": [0], // Allow commits without scope

    // Subject: The commit message itself
    "subject-case": [2, "always", "lower-case"],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],

    // Header: type(scope): subject
    "header-max-length": [2, "always", 120],

    // Body: Optional detailed description
    "body-leading-blank": [2, "always"],
    "body-max-line-length": [2, "always", 120],

    // Footer: Optional metadata (BREAKING CHANGE, issue references)
    "footer-leading-blank": [2, "always"],
  },
};
