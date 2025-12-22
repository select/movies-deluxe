---
description: Create a new component
---

Use the beads cli to find tasks that are ready to work on (no blocking dependencies).

Call the `ready` tool to get a list of unblocked issues. If there is a good task that can be done start it now. I you have problmes or conflicst and can not find a task ask the user in a clear format showing:

- Issue ID
- Title
- Priority
- Issue type

Once you coose a task or the user chooses one, use the `update` tool to set its status to `in_progress`.

If there are no ready tasks, suggest checking `blocked` issues or creating a new issue with the `create` tool.
