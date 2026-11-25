// Repo Dashboard - list of repositories in one project.
// Reads repo-reports/<PROJECT>/repo-list.json
(() => {
    const { esc, num } = RepoCommon;
    let project = null;
    let allRepos = [];

    function renderKpis(data) {
        const s = data.summary || {};
        const tiles = [
            ['Repositories', num(s.total_repos), ''],
            ['Open PRs', num(s.open_prs), ''],
            ['Open Issues', num(s.open_issues), ''],
            ['Failing CI', num(s.failing_ci), s.failing_ci > 0 ? 'rd-kpi-bad' : 'rd-kpi-good'],
            ['Security Alerts', num(s.security_alerts), s.security_alerts > 0 ? 'rd-kpi-warn' : 'rd-kpi-good']
        ];
        const el = document.getElementById('rd-kpis');
        el.innerHTML = tiles.map(([label, value, tone]) => `
            <div class="rd-kpi ${tone}">
                <div class="rd-kpi-value">${value}</div>
                <div class="rd-kpi-label">${label}</div>
            </div>`).join('');
        el.style.display = '';
    }

    function renderRepo(repo) {
        const href = `repo-details.html?project=${project.key}&repo=${encodeURIComponent(repo.name)}`;
        const topics = (repo.topics || []).slice(0, 4)
            .map(t => `<span class="pr-label">${esc(t)}</span>`).join('');
        const alerts = repo.security_alerts > 0
            ? `<span class="rd-meta-alert" title="Open security alerts">🛡️ ${num(repo.security_alerts)} alerts</span>`
            : `<span class="rd-meta-ok" title="No open security alerts">🛡️ No alerts</span>`;
        return `
            <a class="pr-list-item rd-repo-item" href="${href}">
                <div class="rd-repo-head">
                    <div class="rd-repo-name">
                        <h3>${esc(repo.name)}</h3>
                        ${RepoCommon.visibilityBadge(repo.visibility)}
                        ${repo.archived ? '<span class="rd-visibility rd-archived">archived</span>' : ''}
                    </div>
                    ${RepoCommon.ciBadge(repo.ci_status)}
                </div>
                <p class="rd-repo-desc">${esc(repo.description || 'No description')}</p>
                <div class="rd-repo-meta">
                    <span><i class="rd-lang-dot" style="background:${RepoCommon.languageColor(repo.language)}"></i>${esc(repo.language || 'Unknown')}</span>
                    <span title="Stars">★ ${num(repo.stars)}</span>
                    <span title="Forks">⑂ ${num(repo.forks)}</span>
                    <span title="Open pull requests">⇅ ${num(repo.open_prs)} PRs</span>
                    <span title="Open issues">◎ ${num(repo.open_issues)} issues</span>
                    ${alerts}
                    <span title="${esc(RepoCommon.formatDate(repo.pushed_at))}">Pushed ${RepoCommon.timeAgo(repo.pushed_at)}</span>
                </div>
                ${topics ? `<div class="pr-labels">${topics}</div>` : ''}
            </a>`;
    }

    function applyFilters() {
        const q = document.getElementById('rd-search').value.trim().toLowerCase();
        const lang = document.getElementById('rd-language').value;
        const vis = document.getElementById('rd-visibility').value;
        const sort = document.getElementById('rd-sort').value;

        let repos = allRepos.filter(r => {
            if (q) {
                const hay = [r.name, r.description, ...(r.topics || [])].join(' ').toLowerCase();
                if (!hay.includes(q)) return false;
            }
            if (lang !== 'all' && r.language !== lang) return false;
            if (vis === 'archived') return r.archived;
            if (vis !== 'all' && r.visibility !== vis) return false;
            return true;
        });

        const sorters = {
            pushed: (a, b) => (b.pushed_at || '').localeCompare(a.pushed_at || ''),
            name: (a, b) => a.name.localeCompare(b.name),
            stars: (a, b) => b.stars - a.stars,
            alerts: (a, b) => b.security_alerts - a.security_alerts
        };
        repos = repos.slice().sort(sorters[sort]);

        const info = document.getElementById('rd-results-info');
        info.innerHTML = `Showing <strong>${repos.length}</strong> of <strong>${allRepos.length}</strong> repositories`;
        info.style.display = '';

        document.getElementById('rd-list').innerHTML = repos.length
            ? repos.map(renderRepo).join('')
            : '<div class="rd-empty">No repositories match these filters.</div>';
    }

    function initToolbar() {
        const langSelect = document.getElementById('rd-language');
        [...new Set(allRepos.map(r => r.language).filter(Boolean))].sort().forEach(lang => {
            const opt = document.createElement('option');
            opt.value = lang;
            opt.textContent = lang;
            langSelect.appendChild(opt);
        });
        ['rd-search', 'rd-language', 'rd-visibility', 'rd-sort'].forEach(id => {
            const el = document.getElementById(id);
            el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', applyFilters);
        });
        document.getElementById('rd-clear').addEventListener('click', () => {
            document.getElementById('rd-search').value = '';
            document.getElementById('rd-language').value = 'all';
            document.getElementById('rd-visibility').value = 'all';
            document.getElementById('rd-sort').value = 'pushed';
            applyFilters();
        });
        document.getElementById('rd-toolbar').style.display = '';
    }

    async function init() {
        const loading = document.getElementById('loading-message');
        project = RepoCommon.getProject();
        if (!project) {
            RepoCommon.showError(loading, 'Unknown project', 'projects.html?dashboard=repo');
            return;
        }

        document.title = `${project.displayName} Repositories - OneView Dashboard`;
        document.getElementById('project-title').textContent = `${project.displayName} Repositories`;

        const path = `repo-reports/${project.key}/repo-list.json`;
        const data = await RepoCommon.fetchJSON(path);
        if (!data) {
            RepoCommon.showError(loading, `Could not load <code>${esc(path)}</code>`, 'projects.html?dashboard=repo');
            return;
        }

        loading.style.display = 'none';
        allRepos = data.repositories || [];
        document.getElementById('rd-list-heading').textContent = `Repositories in ${data.organization || project.displayName}`;
        if (data.timestamp) {
            document.getElementById('rd-updated').textContent = `Last updated: ${RepoCommon.formatDate(data.timestamp)}`;
        }
        renderKpis(data);
        initToolbar();
        applyFilters();
    }

    window.addEventListener('load', () => window.OneViewAccessControl.runWhenAuthorized(init));
})();
