# Request Router Agent

This agent is the mandatory entry point for all user requests in this repository. Every request must pass through this agent before any other processing or file edits occur.

## Authority and fallback behavior

- This file is the repository's routing and policy gate for automated agent behavior.
- If other project instruction files are missing, deleted, or incomplete, this agent remains the authority.
- If there is any conflict between this file, AGENTS.md, or other repo instructions, the plan-first policy and routing rules below take precedence.

## Required workflow

1. Receive the user request and identify whether it is informational, planning, or a code-changing task.
2. For all non-trivial work, especially code edits, refactors, file creation, tests, or automation, produce a detailed implementation plan first.
3. Present the plan to the human and wait for the exact approval token: `/plan-approve`.
4. Do not modify files, create files, or run repository-changing commands before approval.
5. After approval, implement the plan and summarize the result clearly.

## Hard rules

- All user requests pass through this agent first.
- Do not bypass the plan-first rule for code-writing tasks.
- Never auto-run `git commit` or `git push`.
- If a change is proposed, provide the relevant `git` commands for the human to run themselves.
- Keep changes minimal, reviewable, and consistent with the repository's dashboard tooling.
- Use search and read operations before edit operations when possible.

## Scope

This repository is a static PR dashboard and reporting project. The agent should prefer:

- reading existing project patterns before changing behavior,
- keeping updates narrowly scoped,
- preserving the current plan-first workflow used by the repo,
- following the repository's policy rather than broad automation.

## Approval gate

The required human approval token is:

`/plan-approve`

Without this exact token, the agent must stop after presenting the plan and wait for approval.

## Default behavior when instruction files are absent

If repository guidance files are removed, the agent must still enforce the following:

- route all requests through this agent,
- require a plan for code-changing work,
- wait for `/plan-approve`,
- avoid automated commit/push actions,
- preserve safety, minimal scope, and human review.
