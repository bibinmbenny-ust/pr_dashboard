// JIRA project view: tabs for Overview, Sprint, Board, Team, Issues, Releases and Epics.
(() => {
    const { esc, num } = RepoCommon;
    let project, A, AI = null, INS = null;

    // ✨ AI summary at the top of Overview: AI-written narrative + live forecast and signal counts.
    function aiPanel() {
        if (!AI) return '';
        const p = INS && INS.projects && INS.projects[project.key];
        const f = AI.forecast;
        const highRisk = AI.risks.filter(r => r.level === 'High').length;
        return `
            <section class="card ai-panel">
                <div class="ai-panel-row">
                    <div>
                        <div class="ai-section-head"><h2 class="rd-section-title">✨ AI Summary</h2>
                            <span class="ai-tag ai-tag-ai">✨ AI-written${INS && INS.sample ? ' · sample' : ''}</span></div>
                        <p class="ai-narrative">${p ? esc(p.narrative) : 'No AI summary yet. The AI workflow has not run.'}</p>
                        <div class="ai-panel-stats">
                            <span>Sprint forecast: <strong>${esc(f.label)}</strong> (${Math.round(f.expected_pct)}% of points expected)</span>
                            <span><strong>${num(AI.signals.length)}</strong> cross-tool signals</span>
                            <span><strong>${num(highRisk)}</strong> high-risk tickets</span>
                            ${AI.actions[0] ? `<span>Next step: <strong>${esc(AI.actions[0].title)}</strong></span>` : ''}
                        </div>
                    </div>
                    <a class="btn" href="ai-insights.html?project=${project.key}">Open AI Insights →</a>
                </div>
            </section>`;
    }

    const section = (title, body, cls = '') => `<section class="card rd-section ${cls}"><h2 class="rd-section-title">${title}</h2>${body}</section>`;
    const kpiTile = (label, value, tone = '') => `<div class="rd-kpi ${tone}"><div class="rd-kpi-value">${value}</div><div class="rd-kpi-label">${label}</div></div>`;
    const issueLink = i => `<a href="${Jira.issueHref(project.key, i.key)}"><strong>${esc(i.key)}</strong></a>`;

    function head() {
        const s = A.summary;
        return `
            <section class="card jr-head">
                <div>
                    <h2>${esc(s.jira_project.name)} <span class="rd-dim">${esc(s.jira_project.key)} · ${esc(s.board.name)}</span></h2>
                    <p class="rd-note">Lead ${Jira.userName(s.jira_project.lead)} · ${num(A.work.length)} issues · ${num(A.epics.length)} epics · updated ${RepoCommon.formatDate(s.timestamp)}</p>
                </div>
                <div class="jr-head-right">
                    ${Jira.healthBadge(A.health)}
                    <a class="btn" href="${esc(s.jira_project.url)}" target="_blank" rel="noopener">Open in JIRA ↗</a>
                </div>
            </section>`;
    }

    // ---------------- Overview ----------------
    function overview() {
        const k = A.kpis;
        const tiles = `<div class="rd-kpi-grid rd-kpi-grid-8">
            ${kpiTile('Open', num(k.open))}
            ${kpiTile('In progress', num(k.in_progress))}
            ${kpiTile('Done (30 days)', num(k.done_30d), 'rd-kpi-good')}
            ${kpiTile('Blockers', num(k.blockers), k.blockers ? 'rd-kpi-bad' : 'rd-kpi-good')}
            ${kpiTile('Overdue', num(k.overdue), k.overdue ? 'rd-kpi-warn' : 'rd-kpi-good')}
            ${kpiTile('High-pri bugs open', num(k.critical_bugs), k.critical_bugs ? 'rd-kpi-warn' : '')}
            ${kpiTile('Unassigned', num(k.unassigned))}
            ${kpiTile('Avg cycle time', Jira.days(k.avg_cycle_days))}
        </div>`;

        const cats = ['To Do', 'In Progress', 'Done'].map(c => ({ label: c, value: A.byCategory[c] || 0, color: JIRA_COLORS.category[c] }));
        const statusRows = STATUS_ORDER.map(s => `<div class="rd-row"><span>${Jira.statusBadge(s)}</span><strong>${num(A.byStatus[s] || 0)}</strong></div>`).join('');
        const status = section('Issues by Status', `${JiraCharts.stacked(cats, { ariaLabel: 'Issues by status category' })}<div class="jr-gap-top">${statusRows}</div>`);

        const typeItems = Object.entries(A.byType).sort((a, b) => b[1] - a[1]).map(([t, v]) => ({ label: t, value: v, icon: Jira.typeIcon(t) }));
        const prioItems = PRIORITIES.map(p => ({ label: p, value: A.byPriority[p] || 0, color: JIRA_COLORS.priority[p] }));
        const types = section('Open Issues by Type', JiraCharts.hbars(typeItems));
        const prios = section('Open Issues by Priority', `${JiraCharts.stacked(prioItems, { ariaLabel: 'Open issues by priority' })}
            <p class="rd-note">Lighter = more urgent.</p>`);

        const trend = section('Created vs Resolved <span class="rd-dim">· last 12 weeks</span>', `
            ${JiraCharts.lines({
                labels: A.trend.map(t => t.label),
                series: [
                    { name: 'Created', color: JIRA_COLORS.seriesB, values: A.trend.map(t => t.created) },
                    { name: 'Resolved', color: JIRA_COLORS.seriesA, values: A.trend.map(t => t.resolved) }
                ],
                ariaLabel: 'Issues created vs resolved per week'
            })}
            ${JiraCharts.table(['Week of', 'Created', 'Resolved'], A.trend.map(t => [t.label, t.created, t.resolved]))}`);

        const aging = section('Age of Open Issues', `${JiraCharts.hbars(A.agingBuckets)}
            <p class="rd-note">How long open issues have existed since they were created.</p>`);

        const attention = section(`Needs Attention <span class="rd-dim">· ${num(A.attention.length)}</span>`, A.attention.length
            ? `<div class="rd-table-wrap"><table class="rd-table"><thead><tr><th>Key</th><th>Summary</th><th>Priority</th><th>Assignee</th><th>Why</th></tr></thead><tbody>
                ${A.attention.map(({ issue, reason }) => `<tr><td>${issueLink(issue)}</td><td class="jr-summary-cell">${Jira.typeIcon(issue.type)} ${esc(issue.summary)}</td>
                    <td>${Jira.priorityBadge(issue.priority)}</td><td>${Jira.userName(issue.assignee)}</td><td><span class="jr-reason">${esc(reason)}</span></td></tr>`).join('')}
               </tbody></table></div>`
            : '<p class="rd-empty">Nothing needs attention right now.</p>', 'jr-span-2');

        return `${aiPanel()}${tiles}<div class="rd-detail-grid">${attention}${trend}${status}${prios}${types}${aging}</div>`;
    }

    // ---------------- Sprint ----------------
    function sprintTab() {
        const sp = A.sprint;
        const days = sp.burndown.map(b => new Date(b.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        const totalDays = Math.round((new Date(sp.end) - new Date(sp.start)) / DAY_MS);
        const allLabels = Array.from({ length: totalDays + 1 }, (_, d) =>
            new Date(new Date(sp.start).getTime() + d * DAY_MS).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        const ideal = allLabels.map((_, d) => Math.round(sp.committed_points * (1 - d / totalDays)));
        const actual = allLabels.map((_, d) => sp.burndown[d] ? sp.burndown[d].remaining : null);

        const tiles = `<div class="rd-kpi-grid rd-kpi-grid-6">
            ${kpiTile('Committed', `${num(sp.committed_points)} pts`)}
            ${kpiTile('Added mid-sprint', `${num(sp.added_points)} pts`, sp.added_points ? 'rd-kpi-warn' : '')}
            ${kpiTile('Completed', `${num(sp.completed_points)} pts`, 'rd-kpi-good')}
            ${kpiTile('Remaining', `${num(sp.scope - sp.completed_points)} pts`)}
            ${kpiTile('Carried over', `${num(sp.carried_over.length)} issues`)}
            ${kpiTile('Days left', num(sp.days_left))}
        </div>`;

        const goal = `
            <section class="card jr-sprint-goal">
                <div class="jr-pf-sprint-row"><h2>${esc(sp.name)}</h2>${Jira.healthBadge(A.health)}</div>
                <p><strong>Goal:</strong> ${esc(sp.goal || 'No sprint goal set')}</p>
                <p class="rd-note">${RepoCommon.formatDate(sp.start)} → ${RepoCommon.formatDate(sp.end)}</p>
                <div class="jr-pf-sprint">
                    ${Jira.sprintBar(sp.done_pct, sp.elapsed_pct)}
                    <div class="jr-pf-sprint-row rd-note"><span>${Math.round(sp.done_pct)}% of points done</span><span>${Math.round(sp.elapsed_pct)}% of time used (white marker)</span></div>
                </div>
            </section>`;

        const burndown = section('Burndown <span class="rd-dim">· story points remaining</span>', `
            ${JiraCharts.lines({
                labels: allLabels,
                series: [
                    { name: 'Remaining', color: JIRA_COLORS.seriesA, values: actual },
                    { name: 'Ideal', color: JIRA_COLORS.reference, values: ideal, dashed: true }
                ],
                ariaLabel: 'Sprint burndown'
            })}
            ${JiraCharts.table(['Day', 'Remaining'], sp.burndown.map((b, i) => [days[i], b.remaining]))}`);

        const vel = A.summary.velocity || [];
        const avg = vel.length ? vel.reduce((a, v) => a + v.completed, 0) / vel.length : 0;
        const velocity = section(`Velocity <span class="rd-dim">· avg ${avg.toFixed(1)} pts</span>`, `
            ${JiraCharts.bars({
                labels: vel.map(v => v.sprint.replace(/^.* Sprint /, 'Sprint ')),
                series: [
                    { name: 'Committed', color: JIRA_COLORS.seriesB, values: vel.map(v => v.committed) },
                    { name: 'Completed', color: JIRA_COLORS.seriesA, values: vel.map(v => v.completed) }
                ],
                ariaLabel: 'Committed vs completed points per sprint', unit: ' pts'
            })}
            ${JiraCharts.table(['Sprint', 'Committed', 'Completed'], vel.map(v => [v.sprint, v.committed, v.completed]))}`);

        const statusRows = STATUS_ORDER.map(s => `<div class="rd-row"><span>${Jira.statusBadge(s)}</span><strong>${num(sp.by_status[s] || 0)}</strong></div>`).join('');
        const scopeChanges = sp.issues.filter(i => i.added_mid_sprint || i.sprint_history.length > 1);
        const changes = section('Scope Changes', scopeChanges.length ? `<div class="rd-table-wrap"><table class="rd-table"><thead><tr><th>Key</th><th>Summary</th><th>Points</th><th>Change</th></tr></thead><tbody>
            ${scopeChanges.map(i => `<tr><td>${issueLink(i)}</td><td class="jr-summary-cell">${esc(i.summary)}</td><td>${num(i.story_points)}</td>
                <td>${i.added_mid_sprint ? `<span class="jr-reason">Added ${RepoCommon.formatDate(i.added_mid_sprint)}</span>` : '<span class="jr-reason">Carried over</span>'}</td></tr>`).join('')}
            </tbody></table></div>` : '<p class="rd-empty">No scope changes.</p>');

        return `${goal}${tiles}<div class="rd-detail-grid">${burndown}${velocity}${section('Sprint Issues by Status', statusRows)}${changes}</div>`;
    }

    // ---------------- Board ----------------
    function board() {
        const issues = A.sprint.issues.filter(i => i.type !== 'Sub-task');
        const card = i => `
            <a class="jr-card" href="${Jira.issueHref(project.key, i.key)}">
                <div class="jr-card-top"><span>${Jira.typeIcon(i.type)} <strong>${esc(i.key)}</strong></span>${i.flagged ? '<span class="jr-flag" title="Flagged">⚑ Flagged</span>' : ''}</div>
                <p>${esc(i.summary)}</p>
                <div class="jr-card-foot">
                    ${Jira.priorityBadge(i.priority)}
                    ${i.story_points != null ? `<span class="jr-points" title="Story points">${num(i.story_points)} pts</span>` : ''}
                    ${Jira.avatar(i.assignee)}
                </div>
            </a>`;
        return `<p class="rd-note jr-board-note">${esc(A.sprint.name)} · read-only board of the active sprint (${num(issues.length)} issues, sub-tasks hidden)</p>
            <div class="jr-board">${STATUS_ORDER.map(s => {
                const col = issues.filter(i => i.status === s);
                return `<div class="jr-column"><div class="jr-column-head">${Jira.statusBadge(s)}<span class="rd-dim">${col.length}</span></div>
                    ${col.map(card).join('') || '<p class="rd-note jr-empty-col">No issues</p>'}</div>`;
            }).join('')}</div>`;
    }

    // ---------------- Team ----------------
    function team() {
        const rows = A.workload.map(w => `
            <tr class="${w.overloaded ? 'jr-row-warn' : ''}">
                <td>${Jira.avatar(w.user)} ${Jira.userName(w.user)} ${w.role === 'Lead' ? '<span class="rd-visibility">lead</span>' : ''}</td>
                <td class="jr-num">${num(w.open)}</td>
                <td class="jr-num">${num(w.in_progress)}</td>
                <td class="jr-load-cell">${w.capacity
                    ? `${Jira.progressBar(Math.min(100, (w.sprint_points / w.capacity) * 100), w.sprint_points > w.capacity ? 'bad' : 'single')}
                       <span class="rd-dim">${num(w.sprint_points)} / ${num(w.capacity)} pts</span>`
                    : `<span class="rd-dim">${num(w.sprint_points)} pts</span>`}</td>
                <td class="jr-num ${w.overdue ? 'jr-txt-warn' : ''}">${num(w.overdue)}</td>
                <td class="jr-num">${num(w.done_30d)}</td>
                <td>${w.user === null ? '<span class="jr-reason">Needs an owner</span>' : w.overloaded ? '<span class="jr-reason">⚠ Overloaded</span>' : '<span class="rd-yes">✓ OK</span>'}</td>
            </tr>`).join('');
        const overloaded = A.workload.filter(w => w.overloaded).length;
        return `
            <div class="rd-kpi-grid">
                ${kpiTile('Team members', num((A.summary.team || []).length))}
                ${kpiTile('Overloaded', num(overloaded), overloaded ? 'rd-kpi-warn' : 'rd-kpi-good')}
                ${kpiTile('Unassigned open', num(A.kpis.unassigned), A.kpis.unassigned ? 'rd-kpi-warn' : '')}
                ${kpiTile('Sprint points assigned', num(A.workload.reduce((a, w) => a + w.sprint_points, 0)))}
                ${kpiTile('Team capacity', `${num((A.summary.team || []).reduce((a, m) => a + m.capacity_points, 0))} pts`)}
            </div>
            ${section('Workload', `<div class="rd-table-wrap"><table class="rd-table">
                <thead><tr><th>Person</th><th class="jr-num">Open</th><th class="jr-num">In progress</th><th>Sprint load vs capacity</th><th class="jr-num">Overdue</th><th class="jr-num">Done (30d)</th><th>Status</th></tr></thead>
                <tbody>${rows}</tbody></table></div>
                <p class="rd-note">Overloaded = sprint points above capacity, or 4+ issues in progress at once.</p>`)}`;
    }

    // ---------------- Issues ----------------
    function issuesTab() {
        const opts = (values, all) => `<option value="all">${all}</option>` + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
        const uniq = f => [...new Set(A.issues.flatMap(f).filter(Boolean))].sort();
        return `
            <section class="card">
                <div class="pr-toolbar jr-toolbar">
                    <div class="pr-toolbar-field pr-toolbar-search"><label for="jf-q">Search</label>
                        <div class="pr-input-wrap"><span class="pr-input-icon">🔍</span><input type="text" id="jf-q" placeholder="Key or summary" autocomplete="off" /></div></div>
                    <div class="pr-toolbar-field"><label for="jf-type">Type</label><select id="jf-type">${opts(uniq(i => [i.type]), 'All types')}</select></div>
                    <div class="pr-toolbar-field"><label for="jf-status">Status</label><select id="jf-status">${opts(STATUS_ORDER, 'All statuses')}<option value="open">All open</option></select></div>
                    <div class="pr-toolbar-field"><label for="jf-priority">Priority</label><select id="jf-priority">${opts(PRIORITIES, 'All priorities')}</select></div>
                    <div class="pr-toolbar-field"><label for="jf-assignee">Assignee</label><select id="jf-assignee">${opts(uniq(i => [i.assignee]), 'Everyone')}<option value="__none">Unassigned</option></select></div>
                    <div class="pr-toolbar-field"><label for="jf-sprint">Sprint</label><select id="jf-sprint">${opts(uniq(i => [i.sprint]).reverse(), 'All sprints')}<option value="__backlog">Backlog</option></select></div>
                    <div class="pr-toolbar-field"><label for="jf-component">Component</label><select id="jf-component">${opts(uniq(i => i.components), 'All components')}</select></div>
                    <div class="pr-toolbar-field"><label for="jf-label">Label</label><select id="jf-label">${opts(uniq(i => i.labels), 'All labels')}</select></div>
                    <div class="pr-toolbar-field"><label for="jf-sort">Sort by</label><select id="jf-sort">
                        <option value="updated">Last updated</option><option value="priority">Priority</option><option value="created">Created</option><option value="due">Due date</option><option value="key">Key</option></select></div>
                    <div class="pr-toolbar-field pr-toolbar-actions"><button type="button" id="jf-clear" class="pr-btn-clear">Clear</button></div>
                </div>
                <div id="jf-info" class="pr-results-info"></div>
                <div class="rd-table-wrap"><table class="rd-table jr-issue-table">
                    <thead><tr><th>Key</th><th>Summary</th><th>Status</th><th>Priority</th><th>Assignee</th><th class="jr-num">Pts</th><th>Sprint</th><th>Due</th><th>Updated</th></tr></thead>
                    <tbody id="jf-body"></tbody></table></div>
            </section>`;
    }

    function bindIssueFilters() {
        const ids = ['jf-q', 'jf-type', 'jf-status', 'jf-priority', 'jf-assignee', 'jf-sprint', 'jf-component', 'jf-label', 'jf-sort'];
        const val = id => document.getElementById(id).value;
        const refDay = A.summary.timestamp.slice(0, 10);
        const render = () => {
            const q = val('jf-q').trim().toLowerCase();
            let list = A.issues.filter(i =>
                (!q || i.key.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q)) &&
                (val('jf-type') === 'all' || i.type === val('jf-type')) &&
                (val('jf-status') === 'all' || (val('jf-status') === 'open' ? i.status_category !== 'Done' : i.status === val('jf-status'))) &&
                (val('jf-priority') === 'all' || i.priority === val('jf-priority')) &&
                (val('jf-assignee') === 'all' || (val('jf-assignee') === '__none' ? !i.assignee : i.assignee === val('jf-assignee'))) &&
                (val('jf-sprint') === 'all' || (val('jf-sprint') === '__backlog' ? !i.sprint && i.type !== 'Epic' : i.sprint === val('jf-sprint'))) &&
                (val('jf-component') === 'all' || i.components.includes(val('jf-component'))) &&
                (val('jf-label') === 'all' || i.labels.includes(val('jf-label'))));
            const sorters = {
                updated: (a, b) => b.updated.localeCompare(a.updated),
                created: (a, b) => b.created.localeCompare(a.created),
                priority: (a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority),
                due: (a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'),
                key: (a, b) => a.key.localeCompare(b.key, undefined, { numeric: true })
            };
            list = list.sort(sorters[val('jf-sort')]);
            document.getElementById('jf-info').innerHTML = `Showing <strong>${list.length}</strong> of <strong>${A.issues.length}</strong> issues`;
            document.getElementById('jf-body').innerHTML = list.map(i => {
                const overdue = i.due_date && i.due_date < refDay && i.status_category !== 'Done';
                return `<tr>
                    <td>${issueLink(i)}</td>
                    <td class="jr-summary-cell">${Jira.typeIcon(i.type)} ${esc(i.summary)}${i.flagged ? ' <span class="jr-flag">⚑</span>' : ''}</td>
                    <td>${Jira.statusBadge(i.status)}</td>
                    <td>${Jira.priorityBadge(i.priority)}</td>
                    <td>${Jira.userName(i.assignee)}</td>
                    <td class="jr-num">${i.story_points != null ? num(i.story_points) : ''}</td>
                    <td class="rd-dim">${esc(i.sprint ? i.sprint.replace(/^.* Sprint /, 'Sprint ') : i.type === 'Epic' ? '' : 'Backlog')}</td>
                    <td class="${overdue ? 'jr-txt-bad' : 'rd-dim'}">${i.due_date ? `${overdue ? '⚠ ' : ''}${RepoCommon.formatDate(i.due_date)}` : ''}</td>
                    <td class="rd-dim">${RepoCommon.timeAgo(i.updated)}</td>
                </tr>`;
            }).join('') || '<tr><td colspan="9" class="rd-empty">No issues match these filters.</td></tr>';
        };
        ids.forEach(id => {
            const el = document.getElementById(id);
            el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', render);
        });
        document.getElementById('jf-clear').addEventListener('click', () => {
            ids.forEach(id => { const el = document.getElementById(id); el.value = el.tagName === 'INPUT' ? '' : el.options[0].value; });
            render();
        });
        render();
    }

    // ---------------- Releases ----------------
    function releasesTab() {
        return `<div class="jr-release-cards">${A.releases.map(r => `
            <section class="card rd-section">
                <div class="jr-pf-sprint-row">
                    <h2 class="rd-section-title">${esc(r.name)}</h2>
                    ${r.released ? '<span class="jr-status jr-st-done">Released</span>'
                        : r.overdue ? `<span class="jr-health jr-health-bad">⚠ ${Math.abs(r.days_to_release)} days overdue</span>`
                        : `<span class="jr-status jr-st-progress">Due in ${r.days_to_release} days</span>`}
                </div>
                ${Jira.progressBar(r.pct, r.overdue ? 'bad' : 'good')}
                <div class="rd-row"><span>Release date</span><strong>${RepoCommon.formatDate(r.release_date)}</strong></div>
                <div class="rd-row"><span>Issues done</span><strong>${num(r.done)} / ${num(r.total)} (${Math.round(r.pct)}%)</strong></div>
                <div class="rd-row"><span>Still open</span><strong>${num(r.open)}</strong></div>
            </section>`).join('')}</div>`;
    }

    // ---------------- Epics ----------------
    function epicsTab() {
        return section('Epics', `<div class="rd-table-wrap"><table class="rd-table">
            <thead><tr><th>Key</th><th>Epic</th><th>Status</th><th>Progress</th><th class="jr-num">Issues</th><th class="jr-num">Points</th></tr></thead>
            <tbody>${A.epics.map(e => `<tr>
                <td>${issueLink(e)}</td>
                <td><strong>${esc(e.summary)}</strong><div class="rd-dim">${esc(e.components.join(', '))}</div></td>
                <td>${Jira.statusBadge(e.status)}</td>
                <td class="jr-load-cell">${Jira.progressBar(e.pct, 'good')}<span class="rd-dim">${Math.round(e.pct)}%</span></td>
                <td class="jr-num">${num(e.done)} / ${num(e.children)}</td>
                <td class="jr-num">${num(e.points_done)} / ${num(e.points)}</td>
            </tr>`).join('')}</tbody></table></div>`);
    }

    const TABS = { overview, sprint: sprintTab, board, team, issues: issuesTab, releases: releasesTab, epics: epicsTab };

    function show(tab) {
        if (!TABS[tab]) tab = 'overview';
        document.querySelectorAll('.jr-tabs button').forEach(b => {
            const on = b.dataset.tab === tab;
            b.classList.toggle('active', on);
            b.setAttribute('aria-selected', on);
        });
        document.getElementById('jr-tab-panel').innerHTML = TABS[tab]();
        if (tab === 'issues') bindIssueFilters();
        if (location.hash.slice(1) !== tab) history.replaceState(null, '', `#${tab}`);
    }

    async function init() {
        const loading = document.getElementById('loading-message');
        project = Jira.project();
        if (!project) { Jira.showError(loading, 'Unknown project', 'projects.html?dashboard=jira'); return; }
        document.title = `${project.displayName} JIRA - OneView Dashboard`;
        document.getElementById('jr-title').textContent = `${project.displayName} JIRA`;

        A = await Jira.load(project.key);
        if (!A) { Jira.showError(loading, `Could not load <code>jira-reports/${project.key}/</code>`, 'projects.html?dashboard=jira'); return; }

        // AI layer is optional: the page still works if PR, repo or AI data is missing.
        const [prList, repoList, insights] = await Promise.all([
            RepoCommon.fetchJSON(`pr-reports/${project.key}/pr-list.json`),
            RepoCommon.fetchJSON(`repo-reports/${project.key}/repo-list.json`),
            RepoCommon.fetchJSON('ai-reports/insights.json')
        ]);
        INS = insights;
        try {
            AI = AIEngine.analyze({ key: project.key, displayName: project.displayName, jira: A,
                prs: prList ? prList.pull_requests || [] : [], repos: repoList });
        } catch (err) { console.error('AI analysis failed', err); }

        document.getElementById('jr-project-head').innerHTML = head();
        document.querySelectorAll('.jr-tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
        window.addEventListener('hashchange', () => show(location.hash.slice(1)));
        loading.style.display = 'none';
        document.getElementById('jr-app').style.display = '';
        JiraCharts.initTooltip(document.getElementById('jr-tab-panel'));
        show(location.hash.slice(1) || 'overview');
    }

    window.addEventListener('load', () => window.OneViewAccessControl.runWhenAuthorized(init));
})();
