(# Planner agent instructions)

This repository enforces a "plan-first" workflow for any automated agent actions.

Rules for agent usage in this project:

- Always produce a detailed, step-by-step implementation plan first. The plan must include the exact file edits, commands to run, and any prompts that will be used.
- Do not make any code edits, file creations, or repository changes until the plan has been explicitly approved.
- Approval mechanism: the human must reply with the exact token `/plan-approve` to authorize the agent to proceed. Without this token, the agent must stop after presenting the plan and wait.
- If the user replies with any other input, treat it as feedback and update the plan accordingly, then present the revised plan for another approval.

Agent responsibilities when asked to perform coding tasks:

1. Produce a clear, concise plan (short numbered steps). Ask for confirmation.
3. Wait for the exact approval token `/plan-approve`.
4. After approval, the agent may implement the planned edits locally (for review) but must NOT run `git commit` or `git push`.
	- The agent must present the exact `git` commands a human should run to stage, commit, and push the changes.
	- The agent must provide a patch or diff and a concise explanation of the changes.
	- The human must run the `git` commands to finalize and publish the changes.
5. If the human requests a commit/push to be automated, the human must first update this planner policy file to explicitly allow that behavior and provide an exact approval token; otherwise agents must never automate commits/pushes.
3. After approval, implement the planned edits locally (if applicable), provide the patch and git commands, and wait for the human to run the git commands.
Agents must not bypass this policy. Human maintainers can update this file to change the workflow.

