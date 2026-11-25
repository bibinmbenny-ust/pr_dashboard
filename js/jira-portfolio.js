// JIRA Portfolio: every project side by side, for managers and leads.
(() => {
    const { esc, num } = RepoCommon;

    function projectCard(p) {
        const a = p.data;
        const sp = a.sprint;
        const k = a.kpis;
        const href = `jira-project.html?project=${p.key}`;
        const velocity = a.summary.velocity || [];
        return `
            <section class="card jr-pf-card">
                <div class="jr-pf-head">
                    <div>
                        <h2><a href="${href}">${esc(p.displayName)}</a> <span class="rd-dim">${esc(a.summary.jira_project.key)}</span></h2>
                        <p class="rd-note">Lead ${Jira.userName(a.summary.jira_project.lead)}</p>
                    </div>
                    ${Jira.healthBadge(a.health)}
                </div>
                <ul class="jr-reasons">${a.health.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>

                <div class="jr-pf-sprint">
                    <div class="jr-pf-sprint-row">
                        <strong>${esc(sp.name)}</strong>
                        <span class="rd-dim">${sp.days_left} day${sp.days_left === 1 ? '' : 's'} left</span>
                    </div>
                    ${Jira.sprintBar(sp.done_pct, sp.elapsed_pct)}
                    <div class="jr-pf-sprint-row rd-note">
                        <span>${num(sp.completed_points)} / ${num(sp.scope)} pts done (${Math.round(sp.done_pct)}%)</span>
                        <span>${Math.round(sp.elapsed_pct)}% of time used</span>
                    </div>
                </div>

                <div class="jr-mini-kpis">
                    <div><strong>${num(k.open)}</strong><span>Open</span></div>
                    <div class="${k.blockers ? 'jr-txt-bad' : ''}"><strong>${num(k.blockers)}</strong><span>Blockers</span></div>
                    <div class="${k.overdue ? 'jr-txt-warn' : ''}"><strong>${num(k.overdue)}</strong><span>Overdue</span></div>
                    <div><strong>${num(k.critical_bugs)}</strong><span>High-pri bugs</span></div>
                    <div><strong>${Jira.days(k.avg_cycle_days)}</strong><span>Avg cycle</span></div>
                </div>

                <h3 class="jr-sub">Velocity, last ${velocity.length} sprints <span class="rd-dim">(story points completed)</span></h3>
                ${JiraCharts.bars({
                    labels: velocity.map(v => v.sprint.replace(/^.* Sprint /, '#')),
                    series: [{ name: 'Completed', color: JIRA_COLORS.single, values: velocity.map(v => v.completed) }],
                    height: 130, ariaLabel: `${p.displayName} velocity`, unit: ' pts'
                })}
                <a class="btn jr-pf-open" href="${href}">Open project →</a>
            </section>`;
    }

    function priorityTable(projects) {
        const rows = projects.map(p => {
            const counts = PRIORITIES.map(pr => p.data.byPriority[pr] || 0);
            return `<tr>
                <th scope="row"><a href="jira-project.html?project=${p.key}">${esc(p.displayName)}</a></th>
                <td class="jr-stack-cell">${JiraCharts.stacked(PRIORITIES.map((pr, i) => ({ label: pr, value: counts[i], color: JIRA_COLORS.priority[pr] })), { showLegend: false, ariaLabel: `${p.displayName} open issues by priority` })}</td>
                ${counts.map(c => `<td class="jr-num">${num(c)}</td>`).join('')}
                <td class="jr-num"><strong>${num(counts.reduce((a, b) => a + b, 0))}</strong></td>
            </tr>`;
        }).join('');
        return `
            <section class="card rd-section">
                <h2 class="rd-section-title">Open Issues by Priority</h2>
                <div class="rd-table-wrap"><table class="rd-table jr-priority-table">
                    <thead><tr><th>Project</th><th>Mix</th>${PRIORITIES.map(p => `<th class="jr-num">${Jira.priorityBadge(p)}</th>`).join('')}<th class="jr-num">Total</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table></div>
                <ul class="rd-legend">${PRIORITIES.map(p => `<li><i class="rd-lang-dot" style="background:${JIRA_COLORS.priority[p]}"></i>${p}</li>`).join('')}</ul>
            </section>`;
    }

    function attention(projects) {
        const items = projects.flatMap(p => p.data.attention.map(a => ({ ...a, p })))
            .sort((a, b) => a.weight - b.weight || PRIORITIES.indexOf(a.issue.priority) - PRIORITIES.indexOf(b.issue.priority));
        const rows = items.slice(0, 15).map(({ issue, reason, p }) => `
            <tr>
                <td><a href="${Jira.issueHref(p.key, issue.key)}"><strong>${esc(issue.key)}</strong></a></td>
                <td>${esc(p.displayName)}</td>
                <td class="jr-summary-cell">${Jira.typeIcon(issue.type)} ${esc(issue.summary)}</td>
                <td>${Jira.priorityBadge(issue.priority)}</td>
                <td>${Jira.statusBadge(issue.status)}</td>
                <td>${Jira.userName(issue.assignee)}</td>
                <td><span class="jr-reason">${esc(reason)}</span></td>
            </tr>`).join('');
        return `
            <section class="card rd-section">
                <h2 class="rd-section-title">Needs Attention <span class="rd-dim">· ${num(items.length)} items across all projects${items.length > 15 ? ', top 15 shown' : ''}</span></h2>
                ${items.length ? `<div class="rd-table-wrap"><table class="rd-table">
                    <thead><tr><th>Key</th><th>Project</th><th>Summary</th><th>Priority</th><th>Status</th><th>Assignee</th><th>Why</th></tr></thead>
                    <tbody>${rows}</tbody></table></div>` : '<p class="rd-empty">Nothing needs attention right now.</p>'}
            </section>`;
    }

    function releases(projects) {
        const upcoming = projects.map(p => ({ p, r: p.data.releases.filter(r => !r.released).sort((a, b) => a.release_date.localeCompare(b.release_date))[0] }))
            .filter(x => x.r);
        return `
            <section class="card rd-section">
                <h2 class="rd-section-title">Next Releases</h2>
                <div class="jr-release-list">${upcoming.map(({ p, r }) => `
                    <div class="jr-release-row">
                        <div class="jr-release-name">
                            <strong>${esc(r.name)}</strong>
                            <span class="rd-dim">${RepoCommon.formatDate(r.release_date)} · ${r.overdue
                                ? `<span class="jr-txt-bad">⚠ ${Math.abs(r.days_to_release)} days overdue</span>`
                                : `in ${r.days_to_release} days`}</span>
                        </div>
                        ${Jira.progressBar(r.pct, r.overdue ? 'bad' : 'good', `${Math.round(r.pct)}% of issues done`)}
                        <span class="jr-release-pct">${Math.round(r.pct)}% <span class="rd-dim">(${num(r.done)}/${num(r.total)})</span></span>
                    </div>`).join('')}
                </div>
            </section>`;
    }

    function totals(projects) {
        const sum = f => projects.reduce((a, p) => a + f(p.data), 0);
        const tiles = [
            ['Open issues', sum(d => d.kpis.open), ''],
            ['In progress', sum(d => d.kpis.in_progress), ''],
            ['Done (30 days)', sum(d => d.kpis.done_30d), 'rd-kpi-good'],
            ['Blockers', sum(d => d.kpis.blockers), sum(d => d.kpis.blockers) ? 'rd-kpi-bad' : 'rd-kpi-good'],
            ['Overdue', sum(d => d.kpis.overdue), sum(d => d.kpis.overdue) ? 'rd-kpi-warn' : 'rd-kpi-good']
        ];
        const offTrack = projects.filter(p => p.data.health.tone !== 'good').length;
        return `
            <div class="rd-kpi-grid">${tiles.map(([label, value, tone]) => `
                <div class="rd-kpi ${tone}"><div class="rd-kpi-value">${num(value)}</div><div class="rd-kpi-label">${label}</div></div>`).join('')}
            </div>
            <p class="jr-headline">${offTrack
                ? `<strong>${offTrack} of ${projects.length} projects</strong> are at risk or off track this sprint.`
                : `All <strong>${projects.length} projects</strong> are on track this sprint.`}</p>`;
    }

    function aiStrip(ins) {
        if (!ins || !ins.briefing) return '';
        return `
            <section class="card ai-panel">
                <div class="ai-panel-row">
                    <div>
                        <div class="ai-section-head"><h2 class="rd-section-title">✨ AI Briefing</h2>
                            <span class="ai-tag ai-tag-ai">✨ AI-written${ins.sample ? ' · sample' : ''}</span></div>
                        <p class="ai-headline">${esc(ins.briefing.headline)}</p>
                        <p class="ai-narrative">${esc(ins.briefing.summary)}</p>
                        <p class="ai-meta">${esc(ins.model)} via ${esc(ins.provider)} · ${RepoCommon.formatDate(ins.generated_at)}</p>
                    </div>
                    <a class="btn" href="ai-insights.html">Open AI Insights →</a>
                </div>
            </section>`;
    }

    async function init() {
        const loading = document.getElementById('loading-message');
        const insightsPromise = RepoCommon.fetchJSON('ai-reports/insights.json');
        const loaded = await Promise.all(JIRA_PROJECT_KEYS.map(async key => {
            const p = Jira.project(key);
            return { ...p, data: await Jira.load(key) };
        }));
        const insights = await insightsPromise;
        const projects = loaded.filter(p => p.data);
        if (!projects.length) {
            Jira.showError(loading, 'Could not load JIRA data', 'projects.html?dashboard=jira');
            return;
        }
        const root = document.getElementById('jr-portfolio');
        root.innerHTML = `
            ${aiStrip(insights)}
            ${totals(projects)}
            <div class="jr-pf-grid">${projects.map(projectCard).join('')}</div>
            ${attention(projects)}
            <div class="jr-stack-sections jr-gap-top">
                ${priorityTable(projects)}
                ${releases(projects)}
            </div>
            <p class="rd-note rd-source">Data collected ${RepoCommon.formatDate(projects[0].data.summary.timestamp)} from the JIRA REST and Agile APIs by a scheduled workflow.
            ${loaded.length > projects.length ? `${loaded.length - projects.length} project(s) could not be loaded.` : ''}</p>`;
        loading.style.display = 'none';
        root.style.display = '';
        JiraCharts.initTooltip(root);
    }

    window.addEventListener('load', () => window.OneViewAccessControl.runWhenAuthorized(init));
})();
