# AGENTS.md

This file is the repository fallback instruction set for automated agents.

## Mandatory routing

All user requests must pass through an agent in this repository before any processing begins. This ensures work is reviewed, planned, and approved in the correct order.

## Required workflow

1. A request is first routed through the project agent.
2. If the task involves writing code, creating files, refactoring, running scripts, or modifying project behavior, produce a numbered implementation plan.
3. Wait for explicit approval using the exact token: `/plan-approve`.
4. Only after approval may the implementation proceed.

## Policy requirements

- Never bypass the plan-first workflow.
- Do not edit files before approval.
- Never automate `git commit` or `git push`.
- Present the relevant `git` commands to the human for manual execution if code changes are made.
- Keep changes minimal, reviewable, and aligned with the repository's purpose.

## Fallback authority

If other repository instruction files are missing, deleted, or incomplete, this file remains the default authority for agent behavior in this project.

This AGENTS.md file and the repo's `.github/agents/request-router.agent.md` file are the authoritative route guards for any automated assistant operating in this repository.
