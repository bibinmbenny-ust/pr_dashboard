Agent Usage Policy
===================

Purpose
-------
This repository requires that any automated agent (including Copilot Chat agents, CI bots, or other assistants) follow a "plan-first" workflow before performing any edits or actions.

Policy
------
1. The agent must produce a detailed implementation plan describing the exact changes it proposes. The plan should be a numbered list of actionable steps (file edits, new files, commands to run, tests to execute).
2. The agent must pause and present the plan to a human for review. The agent must not modify files or run commands until it receives explicit approval.
3. Approval is granted only when a human replies with the exact token:

   /plan-approve

4. If the human requests changes, the agent must update the plan and repeat step 2.
5. After receiving `/plan-approve`, the agent may proceed to execute the plan and must report back with a concise summary of the actions taken.

6. Agents must never perform `git commit` or `git push` automatically. Instead, after implementing a plan (making local file edits or producing patches), the agent must:
   - Present the exact `git` commands a human should run to stage, commit, and push the changes.
   - Present a concise diff or patch file that the human can review.
   - Wait for the human to run the `git` commands themselves. The human's execution of these commands is the required act that finalizes changes.

7. Any exception to allow automation of commits/pushes must be explicitly documented and approved by repository maintainers in writing; by default, automation of `git commit`/`git push` is disallowed.

Notes for maintainers
---------------------
- Store this policy in the repository so that contributors and agents can discover it.
- If you want different approval semantics, update this file and communicate the change to collaborators.
