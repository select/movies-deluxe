---
description: Create a new component
---

Use the beads cli to find tasks that are ready to work on (no blocking dependencies).

Call the `ready` tool to get a list of unblocked issues. Choose the first task with the hightest priority an start working on it. If there are multiple with hightest priority, decide yourself which to start with.

Once you coose a task or the user chooses one, use the `update` tool to set its status to `in_progress`.

If there are no ready tasks, suggest checking `blocked` issues or creating a new issue with the `create` tool.
