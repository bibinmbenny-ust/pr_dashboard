# NetSec PR Dashboard

A unified dashboard for viewing Pull Request status, CI/CD metrics, and code quality across multiple NetSec projects.

## Supported Projects

- **FXOS** - Firepower eXtensible Operating System
- **ASA** - Adaptive Security Appliance
- **IMS** - Identity Management System

## Usage


## Access Control

The hosted dashboard relies on GitHub Pages authentication for access control. The Pages URL redirects unauthenticated visitors to `github.com/pages/auth`, so users who already have repository access can use their normal GitHub login instead of entering a dashboard-specific token.

`js/access-control.js` remains loaded before the dashboard data scripts, but its browser token gate is disabled. Keep it disabled while GitHub Pages private/internal access is enabled for this repository.

Important: GitHub Pages is static hosting. Access control must be enforced by private/internal GitHub Pages or an access proxy such as Cisco SSO/VPN/Cloudflare Access. Do not rely on browser JavaScript as the only protection for a public Pages site.

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
           repo: 'cisco-netsec-sandbox/netsec-newproject-repo',
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
         repo: 'cisco-netsec-sandbox/netsec-newproject-repo'
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

- **Multi-Project Support** - Single dashboard for all NetSec projects
- **Real-time CI/CD Status** - Live updates from GitHub Actions
- **Code Metrics** - Track test coverage, static analysis, build status
- **File Changes** - View detailed file diffs and impact
- **Revision History** - Track changes across PR revisions
- **Responsive Design** - Works on desktop and mobile

## Development

### Local Testing
Simply open `index.html` in a browser to see the project selection page, or `dashboard.html?project=FXOS&pr=4` to test a specific dashboard. For JSON data, ensure you have a local web server running to avoid CORS issues.

### File Structure
- Data files follow the pattern: `pr-reports/{PROJECT}/dashboard_{PR_NUMBER}.json`
- Each project has its own directory for organization
- JSON files contain PR metadata, CI status, and metrics

## License

Cisco Internal Use
