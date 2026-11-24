# OneView Dashboard

AI-powered insights for PRs, repos, builds and tickets. A unified dashboard for Pull Request status, CI/CD metrics, and code quality across all your projects.

## Supported Projects

- **FXOS** - Phoenix Security Platform
- **ASA** - Aegis Firewall Suite
- **IMS** - Sentinel Identity System
- **USM** - Atlas Security Manager

## Usage


## Access Control

The hosted dashboard relies on GitHub Pages authentication for access control. The Pages URL redirects unauthenticated visitors to `github.com/pages/auth`, so users who already have repository access can use their normal GitHub login instead of entering a dashboard-specific token.

`js/access-control.js` remains loaded before the dashboard data scripts, but its browser token gate is disabled. Keep it disabled while GitHub Pages private/internal access is enabled for this repository.

Important: GitHub Pages is static hosting. Access control must be enforced by private/internal GitHub Pages or an access proxy such as demo SSO/VPN/Cloudflare Access. Do not rely on browser JavaScript as the only protection for a public Pages site.

### Home Page
Visit the site root (GitHub Pages will load `index.html`) to see all available projects and select one to view.

### Direct Access
Access a specific project dashboard using URL parameters:

```
dashboard.html?project=FXOS&pr=4
dashboard.html?project=ASA&pr=3
dashboard.html?project=IMS&pr=7
```

### URL Parameters

- `project` - Project name (FXOS, ASA, IMS) - **Required**
- `pr` - Pull Request number - **Required**

**Examples:**
- `dashboard.html?project=FXOS&pr=4` - View PR #4 for FXOS
- `dashboard.html?project=ASA&pr=3` - View PR #3 for ASA
- `dashboard.html?project=IMS&pr=7` - View PR #7 for IMS

## Project Structure

```
netsec-pr-dashboard/
├── index.html             # Landing page with project selection (loads by default on GitHub Pages)
├── dashboard.html         # Main dashboard (project-specific)
├── css/
│   └── dashboard.css      # Shared styles
├── js/
│   └── dashboard.js       # Dashboard logic (multi-project support)
├── pr-reports/
│   ├── FXOS/             # FXOS PR data
│   │   └── dashboard_*.json
│   ├── ASA/              # ASA PR data
│   │   └── dashboard_*.json
│   ├── IMS/              # IMS PR data
│       └── dashboard_*.json
└── .github/
    └── workflows/
   ├── collect-fxos-pr-data.yml  # FXOS PR metadata collection
   ├── collect-asa-pr-data.yml   # ASA PR metadata collection
  └── collect-ims-pr-data.yml   # IMS PR metadata collection
```

## Adding New Projects

To add support for a new project:

1. **Update JavaScript Configuration** (`js/dashboard.js`):
   ```javascript
   const PROJECT_CONFIG = {
       'FXOS': { ... },
       'ASA': { ... },
       'IMS': { ... },
       'NEW_PROJECT': {
           name: 'NEW_PROJECT',
           repo: 'demo-netsec-sandbox/netsec-newproject-repo',
           displayName: 'New Project Full Name'
       }
   };
   ```

2. **Create a GitHub Actions workflow** (`.github/workflows/collect-new-project-pr-data.yml`):
   ```yaml
   matrix:
     project:
       - name: 'FXOS'
         repo: '...'
       - name: 'NEW_PROJECT'
         repo: 'demo-netsec-sandbox/netsec-newproject-repo'
   ```

3. **Update Home Page** (`index.html`):
   ```html
   <div class="project-card" onclick="location.href='dashboard.html?project=NEW_PROJECT'">
       <h2>NEW_PROJECT</h2>
       <p>New Project Full Name</p>
       <a href="dashboard.html?project=NEW_PROJECT" class="btn">View Dashboard</a>
   </div>
   ```

4. **Create Project Directory**:
   ```bash
   mkdir -p pr-reports/NEW_PROJECT
   ```

## GitHub Actions Workflow

The workflow automatically fetches CI status from project repositories every 5 minutes:

- Retrieves all open PRs
- Fetches CI/CD status for each PR
- Enriches PR data with commit status and check runs
- Organizes data by project in separate directories

### Vault Configuration

The workflow uses HashiCorp Vault for secure token management:
- `VAULT_URL` - Vault server URL
- `VAULT_NAMESPACE` - Vault namespace
- `VAULT_ROLE_ID` - AppRole role ID
- `VAULT_SECRET_ID` - AppRole secret ID

## Features

- **Multi-Project Support** - Single dashboard for all projects
- **Repo Dashboard** - GitHub repository activity, CI, security and health per project
- **JIRA Dashboard** - Sprint health, blockers, team workload and releases, with a cross-project Portfolio view
- **OneView AI** - AI briefing, sprint forecasts, risk radar and cross-tool signals across JIRA, PRs and repositories
- **Real-time CI/CD Status** - Live updates from GitHub Actions
- **Code Metrics** - Track test coverage, static analysis, build status
- **File Changes** - View detailed file diffs and impact
- **Revision History** - Track changes across PR revisions
- **Responsive Design** - Works on desktop and mobile

## Repo Dashboard

Shows GitHub repository details for each project. It never shows repository code, only metadata a workflow can collect from the GitHub REST API.

**Pages**

| Page | Purpose |
|------|---------|
| `projects.html?dashboard=repo` | Pick a project (same projects as the PR Dashboard) |
| `repo-list.html?project=FXOS` | All repos in the project with short details, search, filters and sort |
| `repo-details.html?project=FXOS&repo=<name>` | Full details of one repository |

**Data files** (currently dummy data, to be produced by a scheduled workflow):

```
repo-reports/<PROJECT>/repo-list.json          # summary of every repo in the project
repo-reports/<PROJECT>/repos/<repo-name>.json  # full details of one repo
```

**Where each field comes from** (GitHub REST API):

| JSON field | API endpoint |
|------------|--------------|
| `repository.*` (description, visibility, topics, license, dates, size, default branch) | `GET /repos/{owner}/{repo}` |
| `stats.stars`, `forks`, `watchers`, `open_issues` | `GET /repos/{owner}/{repo}` (`stargazers_count`, `forks_count`, `subscribers_count`, `open_issues_count` minus open PRs) |
| `stats.open_prs`, `merged_prs_30d`, `closed_prs_30d` | `GET /search/issues?q=repo:{owner}/{repo}+is:pr+...` |
| `commit_activity`, `stats.commits_30d` | `GET /repos/{owner}/{repo}/stats/commit_activity` (last 12 weeks) |
| `languages` | `GET /repos/{owner}/{repo}/languages` |
| `contributors` | `GET /repos/{owner}/{repo}/contributors` |
| `branches.total`, `branches.protected` | `GET /repos/{owner}/{repo}/branches` (`protected` flag) |
| `branches.default_branch_protection` | `GET /repos/{owner}/{repo}/branches/{branch}/protection` |
| `releases.total_tags`, `releases.latest` | `GET /repos/{owner}/{repo}/tags`, `GET /repos/{owner}/{repo}/releases/latest` |
| `workflows`, `workflows[].last_run` | `GET /repos/{owner}/{repo}/actions/workflows`, `GET /repos/{owner}/{repo}/actions/workflows/{id}/runs?per_page=1` |
| `security.dependabot` | `GET /repos/{owner}/{repo}/dependabot/alerts?state=open` (grouped by severity) |
| `security.code_scanning` | `GET /repos/{owner}/{repo}/code-scanning/alerts?state=open` (grouped by severity) |
| `security.secret_scanning_open` | `GET /repos/{owner}/{repo}/secret-scanning/alerts?state=open` |
| `community.health_percentage`, `community.files` | `GET /repos/{owner}/{repo}/community/profile` (CODEOWNERS via `GET /repos/{owner}/{repo}/contents/.github/CODEOWNERS`, existence check only) |
| `settings.*` | `GET /repos/{owner}/{repo}` (`allow_*_merge`, `delete_branch_on_merge`, `has_*`) |
| `access.collaborators`, `access.teams` | `GET /repos/{owner}/{repo}/collaborators`, `GET /repos/{owner}/{repo}/teams` |

`repo-list.json` repeats a few of these per repo (`ci_status`, `security_alerts`, `health_percentage`) plus a project `summary`, so the list page loads a single file. The token used by the workflow needs read access to repository metadata, Actions, and security alerts.

## JIRA Dashboard

Built for managers and leads: sprint health, blockers, workload and releases, per project and across all projects.

**Pages**

| Page | Purpose |
|------|---------|
| `projects.html?dashboard=jira` | Pick a project (same projects as the PR Dashboard), or open the Portfolio |
| `jira-portfolio.html` | All projects side by side: health (On track / At risk / Off track with reasons), sprint progress vs time, velocity, "Needs attention" list, open issues by priority, next releases |
| `jira-project.html?project=FXOS` | One project, with tabs: Overview, Sprint, Board, Team, Issues, Releases, Epics |
| `jira-issue.html?project=FXOS&key=ORN-123` | One issue: fields, status history and time in status, links, sub-tasks, time tracking, linked PRs |

Project mapping: `FXOS` = Orion (`ORN`), `IMS` = Luna (`LUNA`), `USM` = Harbor (`HRB`), `ASA` = Quasar (`QSR`).

**Data files** (currently dummy data, to be produced by a scheduled workflow):

```
jira-reports/<PROJECT>/summary.json   # project, board, active sprint + burndown, velocity, versions, team capacity
jira-reports/<PROJECT>/issues.json    # every issue (including epics and sub-tasks) with history
```

All KPIs, health, workload, trends and attention lists are computed in the browser from these two files (`js/jira-common.js`), so the Portfolio and project pages always agree.

**Where each field comes from** (JIRA Cloud REST v3 / Agile 1.0):

| JSON field | API endpoint |
|------------|--------------|
| `summary.jira_project` (key, name, lead) | `GET /rest/api/3/project/{key}` |
| `summary.board` | `GET /rest/agile/1.0/board?projectKeyOrId={key}` |
| `summary.sprints`, `active_sprint` (dates, goal) | `GET /rest/agile/1.0/board/{boardId}/sprint` |
| `active_sprint.committed_points`, `added_points`, `completed_points`, `burndown` | `GET /rest/agile/1.0/sprint/{sprintId}/issue` + each issue's changelog (sprint field and status changes per day) |
| `summary.velocity` | Closed sprints from `/board/{boardId}/sprint?state=closed`, points summed from `/sprint/{sprintId}/issue` |
| `summary.versions` | `GET /rest/api/3/project/{key}/versions` |
| `summary.team` (capacity) | Team members from `GET /rest/api/3/user/assignable/search?project={key}`; capacity is a config value (JIRA has no capacity API) |
| `issues[]` core fields (summary, type, status, status category, priority, assignee, reporter, dates, labels, components, fix versions, parent, sub-tasks, flagged) | `GET /rest/api/3/search/jql?jql=project={key}` |
| `story_points`, `sprint`, `epic` | Custom fields on the same search (story points / sprint / epic link field IDs differ per JIRA site) |
| `history`, `time_in_status`, `added_mid_sprint`, `sprint_history` | `GET /rest/api/3/issue/{key}/changelog` |
| `links` | `issuelinks` field on the search |
| `comments` (count, last date) | `GET /rest/api/3/issue/{key}/comment` |
| `time_tracking` | `timetracking` field (`originalEstimateSeconds`, `timeSpentSeconds`) |
| `linked_prs` | Development info via `GET /rest/dev-status/1.0/issue/detail`, or matching the issue key in PR titles and branches from `pr-reports/` |

The workflow needs a JIRA base URL and an API token with read access to the projects.

## OneView AI

`ai-insights.html` is an AI-driven view across JIRA, pull requests and repositories. It is also linked from the home page and the header of every dashboard. Short AI panels also appear on the JIRA Portfolio, the JIRA project Overview tab, and each JIRA issue page.

Every section is labelled with where it comes from:

| Label | What it means | Sections |
|-------|---------------|----------|
| ✨ AI-written | Written by an LLM in a scheduled workflow and saved to `ai-reports/insights.json`. The page only displays it. | AI Briefing, per-project summaries, Bug Themes |
| ∑ Computed live | Calculated in the browser by `js/ai-engine.js` from the same JSON files the other dashboards use. Every result shows its reasons. | Sprint Forecast, Release Confidence, Risk Radar, Cross-tool Signals, Recommended Actions, Anomalies |

No AI key is used and no AI or JIRA API call is made from the browser.

**Computed live (`js/ai-engine.js`)**

- **Sprint forecast**: 2,000 Monte Carlo runs mixing the current sprint pace with the last 6 sprints' velocity. Shows expected points, a likely range, and the chance of finishing everything. Labels: Likely, Close (85%+ expected), At risk (60%+), Unlikely.
- **Release confidence**: open tickets in each release divided by the last 30 days' throughput, compared with the planned date.
- **Risk radar**: a 0–100 score per open ticket that adds up visible factors (blocked, past due, priority, stale, carried over, over estimate, long-running, unassigned, blocking others).
- **Cross-tool signals**: Done in JIRA but PR not merged; PR merged but ticket open; approved PR on an in-progress ticket; stalled review; in progress with no PR; sprint work on a repo whose CI is failing; high-priority bug in a repo with many security alerts. JIRA components map to repositories through `AI_COMPONENT_REPOS` in `js/ai-engine.js`.
- **Recommended actions**: rebalance overloaded people, unblock, assign, split large items, cut release scope.
- **Anomalies**: velocity drop, intake outpacing throughput, scope creep, high bug load.

**AI-written file (`ai-reports/insights.json`)**

Currently sample output generated from the dummy data (`"sample": true`, which shows a banner on the page). The AI workflow should:

1. Load `jira-reports/`, `pr-reports/` and `repo-reports/` and run the same analysis (it can load `js/repo-common.js`, `js/jira-common.js` and `js/ai-engine.js` in Node).
2. Send only the computed facts (counts, forecasts, top risks, signals, open bug titles) to the model; never source code.
3. Write the response to `ai-reports/insights.json` with `"sample": false`.

Model: GitHub Models `gpt-4o`, the same provider as the existing PR failure analysis (see `AI_INTEGRATION_README.md`).

Suggested system prompt:

```
You are an engineering delivery analyst writing for managers and team leads.
Use only the facts provided. Do not invent tickets, people or numbers.
Be concise and specific: name ticket keys and projects. Plain English, no jargon.
Return JSON matching the schema exactly.
```

Response schema:

```json
{
  "sample": false,
  "provider": "GitHub Models",
  "model": "gpt-4o",
  "generated_at": "ISO-8601",
  "data_timestamp": "ISO-8601 of the JIRA data",
  "sources": { "tickets": 0, "prs": 0, "repos": 0 },
  "briefing": {
    "headline": "one sentence",
    "summary": "3-4 sentences across all projects",
    "risks": [{ "project": "FXOS", "text": "...", "refs": ["ORN-123"] }],
    "wins":  [{ "project": "FXOS", "text": "..." }],
    "focus": [{ "project": "FXOS", "text": "..." }]
  },
  "projects": {
    "FXOS": { "narrative": "3-5 sentences", "outlook": "one sentence", "top_action": "one action or null" }
  },
  "bug_themes": [{
    "id": "ipv6", "theme": "IPv6-related failures", "description": "why these bugs belong together",
    "issues": [{ "project": "FXOS", "key": "ORN-123", "summary": "...", "priority": "High" }],
    "projects": ["Orion"]
  }]
}
```

## Development

### Local Testing
Simply open `index.html` in a browser to see the project selection page, or `dashboard.html?project=FXOS&pr=4` to test a specific dashboard. For JSON data, ensure you have a local web server running to avoid CORS issues.

### File Structure
- Data files follow the pattern: `pr-reports/{PROJECT}/dashboard_{PR_NUMBER}.json`
- Each project has its own directory for organization
- JSON files contain PR metadata, CI status, and metrics

## License

demo Internal Use

