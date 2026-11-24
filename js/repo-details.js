// Repo Dashboard - full details of one repository (metadata only, never source code).
// Reads repo-reports/<PROJECT>/repos/<repo>.json
(() => {
    const { esc, num } = RepoCommon;

    const section = (title, body, extraClass = '') => `
        <section class="card rd-section ${extraClass}">
            <h2 class="rd-section-title">${title}</h2>
            ${body}
        </section>`;

    const row = (label, value) => `<div class="rd-row"><span>${label}</span><strong>${value}</strong></div>`;
    const yesNo = v => v ? '<span class="rd-yes">✓ Yes</span>' : '<span class="rd-no">✕ No</span>';

    function renderHeader(d) {
        const r = d.repository;
        const topics = (r.topics || []).map(t => `<span class="pr-label">${esc(t)}</span>`).join('');
        return `
            <section class="card rd-hero">
                <div class="rd-hero-top">
                    <div>
                        <div class="rd-repo-name">
                            <h2>${esc(r.full_name)}</h2>
                            ${RepoCommon.visibilityBadge(r.visibility)}
                            ${r.archived ? '<span class="rd-visibility rd-archived">archived</span>' : ''}
                        </div>
                        <p class="rd-repo-desc">${esc(r.description || 'No description')}</p>
                        ${topics ? `<div class="pr-labels">${topics}</div>` : ''}
                    </div>
                    <a class="btn" href="${esc(r.html_url)}" target="_blank" rel="noopener">Open on GitHub ↗</a>
                </div>
                <div class="rd-facts">
                    ${row('Default branch', `<code>${esc(r.default_branch)}</code>`)}
                    ${row('Language', `<i class="rd-lang-dot" style="background:${RepoCommon.languageColor(r.language)}"></i>${esc(r.language || 'Unknown')}`)}
                    ${row('License', esc(r.license || 'None'))}
                    ${row('Created', RepoCommon.formatDate(r.created_at))}
                    ${row('Last push', `${RepoCommon.timeAgo(r.pushed_at)} <span class="rd-dim">(${RepoCommon.formatDate(r.pushed_at)})</span>`)}
                    ${row('Size', RepoCommon.formatSize(r.size_kb))}
                    ${r.homepage ? row('Homepage', `<a href="${esc(r.homepage)}" target="_blank" rel="noopener">${esc(r.homepage)}</a>`) : ''}
                </div>
            </section>`;
    }

    function renderKpis(d) {
        const s = d.stats;
        const tiles = [
            ['Stars', s.stars], ['Forks', s.forks], ['Watchers', s.watchers],
            ['Open PRs', s.open_prs], ['Open Issues', s.open_issues],
            ['Commits (30 days)', s.commits_30d], ['PRs Merged (30 days)', s.merged_prs_30d]
        ];
        return `<div class="rd-kpi-grid rd-kpi-grid-7">${tiles.map(([label, value]) => `
            <div class="rd-kpi"><div class="rd-kpi-value">${num(value)}</div><div class="rd-kpi-label">${label}</div></div>`).join('')}
        </div>`;
    }

    // Single-series bar chart: weekly commits, last 12 weeks.
    function renderCommitActivity(d) {
        const weeks = d.commit_activity || [];
        const max = Math.max(1, ...weeks.map(w => w.total));
        const W = 600, H = 180, padL = 28, padB = 24, padT = 10;
        const colW = (W - padL) / weeks.length;
        const barW = Math.min(30, colW - 6);
        const y = v => padT + (H - padT - padB) * (1 - v / max);
        const label = w => new Date(w.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        const bars = weeks.map((w, i) => {
            const x = padL + i * colW + (colW - barW) / 2;
            const top = y(w.total);
            const h = Math.max(0, H - padB - top);
            const r = Math.min(4, h / 2, barW / 2);
            const base = H - padB;
            // Bar with 4px rounded data end, square at the baseline.
            const path = h > 0
                ? `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z`
                : '';
            return `
                <g class="rd-bar-col" data-tip="Week of ${esc(label(w))}: <strong>${num(w.total)}</strong> commits">
                    <rect class="rd-hit" x="${padL + i * colW}" y="${padT}" width="${colW}" height="${H - padT - padB}" />
                    ${path ? `<path class="rd-bar" d="${path}" />` : ''}
                </g>`;
        }).join('');

        const xLabels = [0, Math.floor(weeks.length / 2), weeks.length - 1]
            .filter((v, i, a) => weeks[v] && a.indexOf(v) === i)
            .map(i => `<text class="rd-axis-text" x="${padL + i * colW + colW / 2}" y="${H - 6}" text-anchor="middle">${esc(label(weeks[i]))}</text>`)
            .join('');

        const chart = `
            <svg class="rd-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly commits for the last 12 weeks, peak ${max}">
                <line class="rd-grid" x1="${padL}" x2="${W}" y1="${y(max)}" y2="${y(max)}" />
                <text class="rd-axis-text" x="${padL - 6}" y="${y(max) + 4}" text-anchor="end">${max}</text>
                <line class="rd-axis" x1="${padL}" x2="${W}" y1="${H - padB}" y2="${H - padB}" />
                <text class="rd-axis-text" x="${padL - 6}" y="${H - padB + 4}" text-anchor="end">0</text>
                ${bars}
                ${xLabels}
            </svg>`;

        const table = `
            <details class="rd-table-toggle">
                <summary>View as table</summary>
                <table class="rd-table">
                    <thead><tr><th>Week of</th><th>Commits</th></tr></thead>
                    <tbody>${weeks.map(w => `<tr><td>${esc(label(w))}</td><td>${num(w.total)}</td></tr>`).join('')}</tbody>
                </table>
            </details>`;

        const total = weeks.reduce((a, w) => a + w.total, 0);
        if (total === 0) {
            return section('Commit Activity', '<p class="rd-empty">No commits in the last 12 weeks.</p>');
        }
        return section(`Commit Activity <span class="rd-dim">· ${num(total)} commits in 12 weeks</span>`, chart + table);
    }

    // Stacked bar of language share. Fixed color per language, 2px gaps, legend with names + %.
    function renderLanguages(d) {
        const entries = Object.entries(d.languages || {});
        const total = entries.reduce((a, [, b]) => a + b, 0) || 1;
        const named = [];
        let other = 0;
        entries.sort((a, b) => b[1] - a[1]).forEach(([lang, bytes]) => {
            if (RepoCommon.languageColor(lang) === OTHER_LANGUAGE_COLOR) other += bytes;
            else named.push([lang, bytes]);
        });
        if (other > 0) named.push(['Other', other]);

        const pct = b => (b / total) * 100;
        const segments = named.map(([lang, bytes]) => `
            <span class="rd-lang-seg" style="width:${pct(bytes)}%;background:${lang === 'Other' ? OTHER_LANGUAGE_COLOR : RepoCommon.languageColor(lang)}"
                  data-tip="${esc(lang)}: <strong>${pct(bytes).toFixed(1)}%</strong>"></span>`).join('');
        const legend = named.map(([lang, bytes]) => `
            <li><i class="rd-lang-dot" style="background:${lang === 'Other' ? OTHER_LANGUAGE_COLOR : RepoCommon.languageColor(lang)}"></i>
                ${esc(lang)} <span class="rd-dim">${pct(bytes).toFixed(1)}%</span></li>`).join('');
        const otherNames = entries.filter(([l]) => RepoCommon.languageColor(l) === OTHER_LANGUAGE_COLOR).map(([l]) => l);

        return section('Languages', `
            <div class="rd-lang-bar" role="img" aria-label="Language breakdown">${segments}</div>
            <ul class="rd-legend">${legend}</ul>
            ${otherNames.length ? `<p class="rd-note">Other: ${esc(otherNames.join(', '))}</p>` : ''}`);
    }

    function renderWorkflows(d) {
        const wfs = d.workflows || [];
        if (!wfs.length) return section('CI / GitHub Actions', '<p class="rd-note">No workflows found.</p>');
        const rows = wfs.map(w => {
            const run = w.last_run;
            return `
                <tr>
                    <td><strong>${esc(w.name)}</strong><div class="rd-dim"><code>${esc(w.path)}</code></div></td>
                    <td>${RepoCommon.runBadge(run)}</td>
                    <td>${run ? `${esc(run.event)} · ${RepoCommon.timeAgo(run.created_at)}` : '—'}</td>
                    <td>${run ? RepoCommon.formatDuration(run.duration_seconds) : ''}</td>
                </tr>`;
        }).join('');
        return section('CI / GitHub Actions', `
            <div class="rd-table-wrap"><table class="rd-table">
                <thead><tr><th>Workflow</th><th>Last run</th><th>Trigger</th><th>Duration</th></tr></thead>
                <tbody>${rows}</tbody>
            </table></div>`);
    }

    function renderSecurity(d) {
        const sec = d.security || {};
        const levels = ['critical', 'high', 'medium', 'low'];
        const block = (title, counts) => {
            if (!counts) return `<div class="rd-sec-block"><h3>${title}</h3><p class="rd-note">Not enabled</p></div>`;
            return `
                <div class="rd-sec-block"><h3>${title}</h3>
                    <div class="rd-sev-grid">${levels.map(l => `
                        <div class="rd-sev rd-sev-${l}${counts[l] ? '' : ' rd-sev-zero'}">
                            <span class="rd-sev-count">${num(counts[l])}</span>
                            <span class="rd-sev-label">${l}</span>
                        </div>`).join('')}
                    </div>
                </div>`;
        };
        const secrets = sec.secret_scanning_open || 0;
        return section('Security Alerts', `
            ${block('Dependabot', sec.dependabot)}
            ${block('Code scanning', sec.code_scanning)}
            <div class="rd-row"><span>Secret scanning (open)</span><strong>${secrets ? `<span class="rd-no">⚠ ${num(secrets)}</span>` : '<span class="rd-yes">✓ 0</span>'}</strong></div>`);
    }

    function renderContributors(d) {
        const list = (d.contributors || []).slice(0, 8);
        const max = Math.max(1, ...list.map(c => c.contributions));
        return section(`Top Contributors <span class="rd-dim">· ${num((d.contributors || []).length)} total</span>`, `
            <ul class="rd-contrib">${list.map(c => `
                <li data-tip="${esc(c.login)}: <strong>${num(c.contributions)}</strong> commits">
                    <span class="rd-contrib-name">@${esc(c.login)}</span>
                    <span class="rd-contrib-track"><span class="rd-contrib-bar" style="width:${(c.contributions / max) * 100}%"></span></span>
                    <span class="rd-contrib-count">${num(c.contributions)}</span>
                </li>`).join('')}
            </ul>`);
    }

    function renderBranches(d) {
        const b = d.branches || {};
        const p = b.default_branch_protection || {};
        const rel = d.releases || {};
        const checks = (p.required_status_checks || []).map(c => `<span class="pr-label">${esc(c)}</span>`).join('') || '<span class="rd-dim">None</span>';
        return section('Branches & Releases', `
            ${row('Branches', num(b.total))}
            ${row('Protected branches', num(b.protected))}
            ${row(`Default branch protection`, yesNo(p.enabled))}
            ${p.enabled ? `
                ${row('Required approvals', num(p.required_approving_reviews))}
                ${row('Code owner review required', yesNo(p.require_code_owner_reviews))}
                ${row('Dismiss stale reviews', yesNo(p.dismiss_stale_reviews))}
                ${row('Linear history required', yesNo(p.required_linear_history))}
                ${row('Rules apply to admins', yesNo(p.enforce_admins))}
                <div class="rd-row rd-row-wrap"><span>Required status checks</span><div class="pr-labels">${checks}</div></div>` : ''}
            ${row('Tags', num(rel.total_tags))}
            ${row('Latest release', rel.latest
                ? `<a href="${esc(rel.latest.html_url)}" target="_blank" rel="noopener">${esc(rel.latest.tag_name)}</a> <span class="rd-dim">${RepoCommon.timeAgo(rel.latest.published_at)}</span>`
                : '<span class="rd-dim">No releases</span>')}`);
    }

    function renderHealth(d) {
        const c = d.community || {};
        const f = c.files || {};
        const items = [
            ['README', f.readme], ['LICENSE', f.license], ['CONTRIBUTING', f.contributing],
            ['Code of conduct', f.code_of_conduct], ['CODEOWNERS', f.codeowners], ['Security policy', f.security_policy],
            ['Issue template', f.issue_template], ['Pull request template', f.pull_request_template]
        ];
        const health = c.health_percentage ?? 0;
        return section('Repository Health', `
            <div class="rd-health">
                <div class="rd-health-score"><span>${health}%</span><small>health score</small></div>
                <div class="rd-health-track"><span style="width:${health}%"></span></div>
            </div>
            <ul class="rd-checklist">${items.map(([label, ok]) => `<li>${ok ? '<span class="rd-yes">✓</span>' : '<span class="rd-no">✕</span>'} ${label}</li>`).join('')}</ul>`);
    }

    function renderSettings(d) {
        const s = d.settings || {};
        const a = d.access || {};
        const methods = [s.allow_merge_commit && 'Merge commit', s.allow_squash_merge && 'Squash', s.allow_rebase_merge && 'Rebase']
            .filter(Boolean).map(m => `<span class="pr-label">${m}</span>`).join('');
        const features = [s.has_issues && 'Issues', s.has_wiki && 'Wiki', s.has_projects && 'Projects', s.has_discussions && 'Discussions']
            .filter(Boolean).map(m => `<span class="pr-label">${m}</span>`).join('') || '<span class="rd-dim">None</span>';
        const teams = (a.teams || []).map(t => `<span class="pr-label">${esc(t)}</span>`).join('') || '<span class="rd-dim">None</span>';
        return section('Settings & Access', `
            <div class="rd-row rd-row-wrap"><span>Merge methods</span><div class="pr-labels">${methods}</div></div>
            ${row('Delete branch on merge', yesNo(s.delete_branch_on_merge))}
            ${row('Auto-merge allowed', yesNo(s.allow_auto_merge))}
            <div class="rd-row rd-row-wrap"><span>Enabled features</span><div class="pr-labels">${features}</div></div>
            ${row('Collaborators', num(a.collaborators))}
            <div class="rd-row rd-row-wrap"><span>Teams</span><div class="pr-labels">${teams}</div></div>`);
    }

    // One shared tooltip for every element with data-tip (bars, segments, contributor rows).
    function initTooltip(root) {
        const tip = document.getElementById('rd-tooltip');
        const show = (el, x, y) => {
            tip.innerHTML = el.getAttribute('data-tip');
            tip.hidden = false;
            const box = tip.getBoundingClientRect();
            const left = Math.min(window.innerWidth - box.width - 8, Math.max(8, x - box.width / 2));
            tip.style.left = `${left + window.scrollX}px`;
            tip.style.top = `${y + window.scrollY - box.height - 12}px`;
        };
        root.addEventListener('mousemove', e => {
            const el = e.target.closest('[data-tip]');
            if (!el) { tip.hidden = true; return; }
            root.querySelectorAll('.rd-active').forEach(n => n.classList.remove('rd-active'));
            el.classList.add('rd-active');
            show(el, e.clientX, e.clientY);
        });
        root.addEventListener('mouseleave', () => {
            tip.hidden = true;
            root.querySelectorAll('.rd-active').forEach(n => n.classList.remove('rd-active'));
        });
    }

    async function init() {
        const loading = document.getElementById('loading-message');
        const project = RepoCommon.getProject();
        const repoName = new URLSearchParams(window.location.search).get('repo') || '';
        const back = document.getElementById('rd-back-link');

        if (!project || !/^[A-Za-z0-9._-]+$/.test(repoName)) {
            RepoCommon.showError(loading, 'Unknown project or repository', 'projects.html?dashboard=repo');
            return;
        }
        back.href = `repo-list.html?project=${project.key}`;
        back.textContent = `← Back to ${project.displayName} Repositories`;

        const path = `repo-reports/${project.key}/repos/${repoName}.json`;
        const d = await RepoCommon.fetchJSON(path);
        if (!d || !d.repository) {
            RepoCommon.showError(loading, `Could not load <code>${esc(path)}</code>`, back.href);
            return;
        }

        document.title = `${d.repository.name} - OneView Dashboard`;
        document.getElementById('repo-page-title').textContent = d.repository.name;

        const detail = document.getElementById('rd-detail');
        detail.innerHTML = `
            ${renderHeader(d)}
            ${renderKpis(d)}
            <div class="rd-detail-grid">
                ${renderCommitActivity(d)}
                ${renderLanguages(d)}
                ${renderWorkflows(d)}
                ${renderSecurity(d)}
                ${renderContributors(d)}
                ${renderBranches(d)}
                ${renderHealth(d)}
                ${renderSettings(d)}
            </div>
            <p class="rd-note rd-source">Data collected ${RepoCommon.formatDate(d.timestamp)} from the GitHub API by a scheduled workflow. Repository code is never shown.</p>`;
        loading.style.display = 'none';
        detail.style.display = '';
        initTooltip(detail);
    }

    window.addEventListener('load', () => window.NetSecAccessControl.runWhenAuthorized(init));
})();
