// JIRA issue detail: fields, status history, time in status, links, sub-tasks, work log and linked PRs.
(() => {
    const { esc, num } = RepoCommon;
    let project, A;

    const section = (title, body, cls = '') => `<section class="card rd-section ${cls}"><h2 class="rd-section-title">${title}</h2>${body}</section>`;
    const row = (label, value) => `<div class="rd-row"><span>${label}</span><strong>${value}</strong></div>`;
    const chips = arr => (arr && arr.length) ? `<div class="pr-labels">${arr.map(x => `<span class="pr-label">${esc(x)}</span>`).join('')}</div>` : '<span class="rd-dim">None</span>';
    const link = key => {
        const target = A.issues.find(i => i.key === key);
        return `<a href="${Jira.issueHref(project.key, key)}"><strong>${esc(key)}</strong></a>${target ? ` ${esc(target.summary)}` : ''}`;
    };
    const hours = s => s ? `${(s / 3600).toFixed(1)}h` : '0h';

    function header(i) {
        const refDay = A.summary.timestamp.slice(0, 10);
        const overdue = i.due_date && i.due_date < refDay && i.status_category !== 'Done';
        return `
            <section class="card rd-hero">
                <div class="rd-hero-top">
                    <div>
                        <p class="rd-note">${Jira.typeIcon(i.type)} ${esc(i.type)} · ${esc(i.key)}${i.parent ? ` · sub-task of ${link(i.parent)}` : ''}${i.epic ? ` · epic ${link(i.epic)}` : ''}</p>
                        <h2 class="jr-issue-summary">${esc(i.summary)}</h2>
                        <div class="jr-issue-badges">
                            ${Jira.statusBadge(i.status)} ${Jira.priorityBadge(i.priority)}
                            ${i.flagged ? '<span class="jr-flag">⚑ Flagged as impediment</span>' : ''}
                            ${overdue ? `<span class="jr-health jr-health-bad">⚠ Overdue since ${RepoCommon.formatDate(i.due_date)}</span>` : ''}
                        </div>
                    </div>
                    <a class="btn" href="${esc(i.url)}" target="_blank" rel="noopener">Open in JIRA ↗</a>
                </div>
                <p class="jr-description">${esc(i.description)}</p>
            </section>`;
    }

    function details(i) {
        return section('Details', `
            ${row('Assignee', `${Jira.avatar(i.assignee)} ${Jira.userName(i.assignee)}`)}
            ${row('Reporter', Jira.userName(i.reporter))}
            ${row('Story points', i.story_points != null ? num(i.story_points) : '<span class="rd-dim">None</span>')}
            ${row('Sprint', esc(i.sprint || (i.type === 'Epic' ? '—' : 'Backlog')))}
            ${i.sprint_history.length > 1 ? row('Sprint history', esc(i.sprint_history.join(' → '))) : ''}
            ${i.added_mid_sprint ? row('Added to sprint', RepoCommon.formatDate(i.added_mid_sprint)) : ''}
            <div class="rd-row rd-row-wrap"><span>Components</span>${chips(i.components)}</div>
            <div class="rd-row rd-row-wrap"><span>Labels</span>${chips(i.labels)}</div>
            <div class="rd-row rd-row-wrap"><span>Fix versions</span>${chips(i.fix_versions)}</div>`);
    }

    function dates(i) {
        const cycle = A.cycleDays(i);
        return section('Dates', `
            ${row('Created', RepoCommon.formatDate(i.created))}
            ${row('Updated', `${RepoCommon.timeAgo(i.updated)} <span class="rd-dim">(${RepoCommon.formatDate(i.updated)})</span>`)}
            ${row('Due', i.due_date ? RepoCommon.formatDate(i.due_date) : '<span class="rd-dim">None</span>')}
            ${row('Resolved', i.resolved ? RepoCommon.formatDate(i.resolved) : '<span class="rd-dim">Not resolved</span>')}
            ${row('Cycle time', cycle != null ? Jira.days(cycle) : '<span class="rd-dim">Not finished</span>')}
            ${row('Comments', `${num(i.comments.count)}${i.comments.last_comment_at ? ` <span class="rd-dim">· last ${RepoCommon.timeAgo(i.comments.last_comment_at)}</span>` : ''}`)}`);
    }

    function history(i) {
        const steps = [{ at: i.created, to: 'Created', by: i.reporter }, ...i.history];
        const timeline = `<ol class="jr-timeline">${steps.map(s => `
            <li><span class="jr-tl-dot"></span>
                <div><strong>${s.to === 'Created' ? 'Created' : `${esc(s.from)} → ${esc(s.to)}`}</strong>
                <div class="rd-dim">${RepoCommon.formatDate(s.at)} · ${Jira.userName(s.by)}</div></div></li>`).join('')}</ol>`;
        const tis = Object.entries(i.time_in_status || {}).filter(([, s]) => s > 0)
            .sort((a, b) => STATUS_ORDER.indexOf(a[0]) - STATUS_ORDER.indexOf(b[0]))
            .map(([status, s]) => ({ label: status, value: Math.round((s / 86400) * 10) / 10 }));
        return section('Status History', `${timeline}
            ${tis.length ? `<h3 class="jr-sub">Time in each status</h3>${JiraCharts.hbars(tis, { unit: 'd' })}` : ''}`);
    }

    function related(i) {
        const subs = i.subtasks.map(k => A.issues.find(x => x.key === k)).filter(Boolean);
        const children = i.type === 'Epic' ? A.issues.filter(x => x.epic === i.key) : [];
        const list = arr => `<ul class="jr-link-list">${arr.map(x => `<li>${Jira.statusBadge(x.status)} ${link(x.key)}</li>`).join('')}</ul>`;
        return section('Related Work', `
            <h3 class="jr-sub">Linked issues</h3>
            ${i.links.length ? `<ul class="jr-link-list">${i.links.map(l => `<li><span class="jr-link-type ${l.type === 'is blocked by' ? 'jr-txt-bad' : ''}">${esc(l.type)}</span> ${link(l.key)}</li>`).join('')}</ul>` : '<p class="rd-note">None</p>'}
            ${subs.length ? `<h3 class="jr-sub">Sub-tasks</h3>${list(subs)}` : ''}
            ${children.length ? `<h3 class="jr-sub">Issues in this epic (${children.length})</h3>${list(children)}` : ''}`);
    }

    function worklog(i) {
        const t = i.time_tracking || {};
        const est = t.original_estimate_seconds || 0, spent = t.time_spent_seconds || 0;
        if (!est && !spent) return '';
        const pct = est ? (spent / est) * 100 : 0;
        return section('Time Tracking', `
            ${Jira.progressBar(Math.min(100, pct), pct > 100 ? 'bad' : 'single')}
            ${row('Original estimate', hours(est))}
            ${row('Time logged', `${hours(spent)} <span class="rd-dim">(${Math.round(pct)}% of estimate)</span>`)}
            ${pct > 100 ? row('Over estimate by', `<span class="jr-txt-bad">${hours(spent - est)}</span>`) : ''}`);
    }

    function prs(i) {
        if (!i.linked_prs.length) return section('Linked Pull Requests', '<p class="rd-note">No pull requests linked.</p>');
        return section('Linked Pull Requests', `<ul class="jr-link-list">${i.linked_prs.map(p => {
            const href = p.has_dashboard ? `dashboard.html?project=${encodeURIComponent(p.project)}&pr=${p.number}` : p.html_url;
            const ext = p.has_dashboard ? '' : ' target="_blank" rel="noopener"';
            return `<li><span class="rd-visibility">${esc((p.status || p.state || '').replace(/_/g, ' '))}</span>
                <a href="${esc(href)}"${ext}><strong>PR #${esc(p.number)}</strong></a> ${esc(p.title)}
                <span class="rd-dim">${p.has_dashboard ? '· opens in PR Dashboard' : '· opens on GitHub ↗'}</span></li>`;
        }).join('')}</ul>`);
    }

    // ✨ Risk note: live risk score with reasons, plus any cross-tool signal about this ticket.
    function aiNote(i, AI) {
        if (!AI) return '';
        const risk = AI.risks.find(r => r.issue.key === i.key);
        const signals = AI.signals.filter(s => (s.issue && s.issue.key === i.key) || (s.issues || []).some(x => x.key === i.key));
        if (!risk && !signals.length) {
            return `<section class="card ai-panel"><div class="ai-section-head"><h2 class="rd-section-title">✨ OneView AI</h2>
                <span class="ai-tag ai-tag-calc">∑ Computed live</span></div>
                <p class="rd-note">${i.status_category === 'Done' ? 'This ticket is done and nothing disagrees with its PRs or repository.' : 'No risk factors or cross-tool issues found for this ticket.'}</p></section>`;
        }
        return `<section class="card ai-panel">
            <div class="ai-section-head"><h2 class="rd-section-title">✨ OneView AI</h2><span class="ai-tag ai-tag-calc">∑ Computed live</span></div>
            ${risk ? `<ul class="ai-risks"><li>
                <div class="ai-risk-score ai-score-${risk.level.toLowerCase()}" title="Risk score ${risk.score} of 100"><strong>${risk.score}</strong><span>${risk.level}</span></div>
                <div class="ai-risk-body"><p><strong>Risk score ${risk.score} / 100</strong> because:</p>
                    <div class="pr-labels">${risk.factors.map(f => `<span class="ai-factor">+${f.pts} ${esc(f.why)}</span>`).join('')}</div></div>
            </li></ul>` : ''}
            ${signals.length ? `<h3 class="jr-sub">Cross-tool signals</h3><ul class="ai-list">${signals.map(s =>
                `<li><span class="ai-level ai-level-${s.severity.toLowerCase()}">${esc(s.severity)}</span> <strong>${esc(s.title)}</strong><div class="rd-note">${esc(s.detail)}</div></li>`).join('')}</ul>` : ''}
            <p class="ai-meta"><a href="ai-insights.html?project=${project.key}">See all AI insights for ${esc(project.displayName)} →</a></p>
        </section>`;
    }

    async function init() {
        const loading = document.getElementById('loading-message');
        project = Jira.project();
        const key = new URLSearchParams(location.search).get('key') || '';
        if (!project || !/^[A-Z][A-Z0-9]+-\d+$/.test(key)) { Jira.showError(loading, 'Unknown project or issue key', 'projects.html?dashboard=jira'); return; }
        const back = document.getElementById('jr-back');
        back.href = `jira-project.html?project=${project.key}#issues`;
        back.textContent = `← Back to ${project.displayName} Issues`;

        A = await Jira.load(project.key);
        const issue = A && A.issues.find(i => i.key === key);
        if (!issue) { Jira.showError(loading, `Issue ${esc(key)} not found`, back.href); return; }

        let AI = null;
        try {
            const [prList, repoList] = await Promise.all([
                RepoCommon.fetchJSON(`pr-reports/${project.key}/pr-list.json`),
                RepoCommon.fetchJSON(`repo-reports/${project.key}/repo-list.json`)
            ]);
            AI = AIEngine.analyze({ key: project.key, displayName: project.displayName, jira: A,
                prs: prList ? prList.pull_requests || [] : [], repos: repoList });
        } catch (err) { console.error('AI analysis failed', err); }

        document.title = `${issue.key} - OneView Dashboard`;
        document.getElementById('jr-issue-title').textContent = issue.key;
        const root = document.getElementById('jr-issue');
        root.innerHTML = `${header(issue)}${aiNote(issue, AI)}
            <div class="rd-detail-grid">${details(issue)}${dates(issue)}${history(issue)}${related(issue)}${prs(issue)}${worklog(issue)}</div>`;
        loading.style.display = 'none';
        root.style.display = '';
        JiraCharts.initTooltip(root);
    }

    window.addEventListener('load', () => window.OneViewAccessControl.runWhenAuthorized(init));
})();
