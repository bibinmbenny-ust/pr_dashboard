// OneView AI page: AI-written briefing (from ai-reports/insights.json) plus analysis computed live
// from JIRA, PR and repo data by js/ai-engine.js. Every section says which of the two it is.
(() => {
    const { esc, num } = RepoCommon;
    let all = [], insights = null, filter = 'all';

    const tagAI = '<span class="ai-tag ai-tag-ai" title="Written by an AI model in the scheduled workflow">✨ AI-written</span>';
    const tagCalc = '<span class="ai-tag ai-tag-calc" title="Calculated in your browser from the current data">∑ Computed live</span>';
    const section = (title, tag, body, cls = '') => `
        <section class="card rd-section ${cls}">
            <div class="ai-section-head"><h2 class="rd-section-title">${title}</h2>${tag}</div>${body}
        </section>`;
    const pct = x => `${Math.round(x)}%`;
    const issueLink = (project, key) => `<a href="${Jira.issueHref(project, key)}"><strong>${esc(key)}</strong></a>`;
    const prLink = pr => pr.has_dashboard
        ? `<a href="dashboard.html?project=${encodeURIComponent(pr.project)}&pr=${pr.number}">PR #${esc(pr.number)}</a>`
        : `<a href="${esc(pr.html_url)}" target="_blank" rel="noopener">PR #${esc(pr.number)} ↗</a>`;
    const chip = (level, text) => `<span class="ai-level ai-level-${esc(level.toLowerCase())}">${esc(text || level)}</span>`;
    const scope = () => filter === 'all' ? all : all.filter(p => p.key === filter);

    function filterBar() {
        const btn = (key, label) => `<button type="button" class="ai-filter ${filter === key ? 'active' : ''}" data-filter="${key}">${esc(label)}</button>`;
        return `<div class="ai-filters" role="group" aria-label="Project filter">
            ${btn('all', 'All projects')}${all.map(p => btn(p.key, p.displayName)).join('')}</div>`;
    }

    function banner() {
        if (!insights || !insights.sample) return '';
        return `<div class="ai-banner" role="note">
            <strong>Sample AI output.</strong> The AI-written sections below are examples generated from the current dummy data.
            When the AI workflow runs, it replaces them with real ${esc(insights.model)} output. Sections marked “∑ Computed live” are already calculated from the data.
        </div>`;
    }

    function briefing() {
        if (!insights) return section('AI Briefing', tagAI, '<p class="rd-note">No AI briefing available yet. The AI workflow has not run.</p>');
        const meta = `<p class="ai-meta">✨ ${esc(insights.model)} via ${esc(insights.provider)} · ${RepoCommon.formatDate(insights.generated_at)}
            · based on ${num(insights.sources.tickets)} tickets, ${num(insights.sources.prs)} pull requests and ${num(insights.sources.repos)} repositories</p>`;
        if (filter !== 'all') {
            const p = insights.projects[filter];
            const proj = all.find(x => x.key === filter);
            if (!p) return section(`AI Briefing · ${esc(proj.displayName)}`, tagAI, '<p class="rd-note">No AI briefing for this project yet.</p>');
            return section(`AI Briefing · ${esc(proj.displayName)}`, tagAI, `
                <p class="ai-headline">${esc(p.outlook)}</p>
                <p class="ai-narrative">${esc(p.narrative)}</p>
                ${p.top_action ? `<p class="ai-next"><strong>Suggested next step:</strong> ${esc(p.top_action)}</p>` : ''}
                ${meta}`, 'ai-briefing');
        }
        const b = insights.briefing;
        const list = (title, icon, items) => `<div class="ai-col"><h3 class="jr-sub">${icon} ${title}</h3>
            <ul class="ai-list">${items.map(i => `<li>${esc(i.text)}${(i.refs || []).length ? ` ${i.refs.map(k => issueLink(i.project, k)).join(' ')}` : ''}</li>`).join('') || '<li class="rd-dim">None</li>'}</ul></div>`;
        return section('AI Briefing', tagAI, `
            <p class="ai-headline">${esc(b.headline)}</p>
            <p class="ai-narrative">${esc(b.summary)}</p>
            <div class="ai-cols">${list('Top risks', '⚠', b.risks)}${list('Wins', '✓', b.wins)}${list('Where to focus', '→', b.focus)}</div>
            ${meta}`, 'ai-briefing');
    }

    function forecasts() {
        const cards = scope().map(p => {
            const f = p.forecast;
            const pos = v => (v / Math.max(1, f.scope)) * 100;
            return `<div class="ai-forecast">
                <div class="jr-pf-sprint-row"><strong><a href="jira-project.html?project=${p.key}#sprint">${esc(p.displayName)}</a></strong>
                    ${chip(f.tone, f.label)}</div>
                <div class="ai-prob"><span>${pct(f.expected_pct)}</span> of ${num(f.scope)} pts expected · ${pct(f.probability * 100)} chance to finish all</div>
                <div class="ai-range" role="img" aria-label="Likely range ${f.p10} to ${f.p90} points, most likely ${f.p50}, of ${f.scope}">
                    <span class="ai-range-done" style="width:${pos(p.jira.sprint.completed_points)}%"></span>
                    <span class="ai-range-band" style="left:${pos(f.p10)}%;width:${Math.max(1, pos(f.p90) - pos(f.p10))}%"></span>
                    <span class="ai-range-mid" style="left:${pos(f.p50)}%"></span>
                </div>
                <div class="jr-pf-sprint-row rd-note"><span>Done now: ${num(p.jira.sprint.completed_points)}</span><span>Likely: ${num(f.p50)} (range ${num(f.p10)}–${num(f.p90)})</span></div>
                <p class="rd-note">Needs ${f.needed_rate.toFixed(1)} pts/day for the last ${Math.ceil(f.days_left)} days; the current pace is ${f.current_rate.toFixed(1)}${f.historical_rate != null ? ` and the usual pace ${f.historical_rate.toFixed(1)}` : ''}.</p>
            </div>`;
        }).join('');
        return section('Sprint Forecast', tagCalc, `<div class="ai-forecast-grid">${cards}</div>
            <p class="rd-note">2,000 simulations per sprint, mixing the current pace with the last 6 sprints' velocity. Bar: done so far (solid), likely range (band), most likely result (marker).</p>`);
    }

    function releases() {
        const rows = scope().flatMap(p => p.releases.map(r => ({ p, r })));
        if (!rows.length) return '';
        return section('Release Confidence', tagCalc, `<div class="rd-table-wrap"><table class="rd-table">
            <thead><tr><th>Release</th><th>Planned</th><th>Predicted finish</th><th class="jr-num">Open</th><th>Confidence</th><th>Why</th></tr></thead>
            <tbody>${rows.map(({ p, r }) => `<tr>
                <td><strong>${esc(r.name)}</strong></td>
                <td>${RepoCommon.formatDate(r.release_date)}</td>
                <td>${r.predicted_date ? RepoCommon.formatDate(r.predicted_date) : 'Unknown'}</td>
                <td class="jr-num">${num(r.open)}</td>
                <td>${chip(r.confidence === 'High' ? 'good' : r.confidence === 'Medium' ? 'medium' : 'high', r.confidence)}</td>
                <td class="rd-dim">${r.overdue ? `Already ${Math.abs(r.days_to_release)} days past its date`
                    : r.slack_days != null ? (r.slack_days >= 0 ? `${r.slack_days} days of slack` : `${Math.abs(r.slack_days)} days late at current pace`) : 'No recent throughput'}
                    · ${r.throughput_per_day.toFixed(1)} tickets/day</td>
            </tr>`).join('')}</tbody></table></div>
            <p class="rd-note">Predicted from the last 30 days of finished tickets, assuming release work is done first.</p>`, 'jr-span-2');
    }

    function riskRadar() {
        const risks = scope().flatMap(p => p.risks.map(r => ({ ...r, p }))).sort((a, b) => b.score - a.score).slice(0, 10);
        return section('Risk Radar <span class="rd-dim">· top 10 tickets</span>', tagCalc, risks.length ? `<ul class="ai-risks">${risks.map(r => `
            <li>
                <div class="ai-risk-score ai-score-${r.level.toLowerCase()}" title="Risk score ${r.score} of 100"><strong>${r.score}</strong><span>${r.level}</span></div>
                <div class="ai-risk-body">
                    <div>${issueLink(r.p.key, r.issue.key)} <span class="rd-dim">${esc(r.p.displayName)}</span> ${Jira.statusBadge(r.issue.status)} ${Jira.priorityBadge(r.issue.priority)}</div>
                    <p>${esc(r.issue.summary)}</p>
                    <div class="pr-labels">${r.factors.map(f => `<span class="ai-factor">+${f.pts} ${esc(f.why)}</span>`).join('')}</div>
                </div>
            </li>`).join('')}</ul>
            <p class="rd-note">The score adds up the risk factors shown on each ticket (maximum 100).</p>` : '<p class="rd-empty">No risky tickets found.</p>');
    }

    const SIGNAL_GROUPS = [
        ['done_pr_open', 'Closed in JIRA, code not merged', 'JIRA ↔ PR'],
        ['pr_merged_ticket_open', 'Code merged, ticket still open', 'PR ↔ JIRA'],
        ['sprint_on_failing_ci', 'Sprint work on a failing build', 'JIRA ↔ Repo CI'],
        ['bug_on_vulnerable_repo', 'Bugs in repos with security alerts', 'JIRA ↔ Repo security'],
        ['review_stalled', 'Reviews that have stalled', 'JIRA ↔ PR'],
        ['pr_approved_ticket_open', 'Approved PRs waiting to merge', 'PR ↔ JIRA'],
        ['in_progress_no_pr', 'Work in progress with no PR', 'JIRA ↔ PR']
    ];

    function signals() {
        const items = scope().flatMap(p => p.signals.map(s => ({ ...s, p })));
        const groups = SIGNAL_GROUPS.map(([kind, title, link]) => ({ kind, title, link, items: items.filter(s => s.kind === kind) })).filter(g => g.items.length);
        const body = groups.map((g, gi) => `
            <details class="ai-signal-group" ${gi < 2 ? 'open' : ''}>
                <summary><span class="ai-link-badge">${esc(g.link)}</span> <strong>${esc(g.title)}</strong> <span class="rd-dim">${g.items.length}</span></summary>
                <ul class="ai-signal-list">${g.items.slice(0, 8).map(s => `
                    <li>${chip(s.severity)}
                        <div><strong>${esc(s.title)}</strong>
                        <div class="rd-note">${esc(s.detail)}</div>
                        <div class="ai-signal-links">
                            ${s.issue ? issueLink(s.p.key, s.issue.key) : ''}
                            ${(s.issues || []).slice(0, 4).map(i => issueLink(s.p.key, i.key)).join(' ')}
                            ${s.pr ? prLink(s.pr) : ''}
                            ${s.repo ? `<a href="repo-details.html?project=${s.p.key}&repo=${encodeURIComponent(s.repo.name)}">📦 ${esc(s.repo.name)}</a>` : ''}
                            <span class="rd-dim">${esc(s.p.displayName)}</span>
                        </div></div>
                    </li>`).join('')}
                    ${g.items.length > 8 ? `<li class="rd-note">and ${g.items.length - 8} more</li>` : ''}
                </ul>
            </details>`).join('');
        return section(`Cross-tool Signals <span class="rd-dim">· ${num(items.length)} found</span>`, tagCalc, `
            <p class="ai-intro">Places where JIRA, pull requests and repositories disagree. OneView can spot these because it reads all three.</p>
            ${body || '<p class="rd-empty">JIRA, PRs and repositories agree. Nothing to flag.</p>'}`, 'jr-span-2');
    }

    function actions() {
        const list = scope().flatMap(p => p.actions.map(a => ({ ...a, p })));
        const rank = { High: 0, Medium: 1, Low: 2 };
        list.sort((a, b) => rank[a.impact] - rank[b.impact]);
        return section(`Recommended Actions <span class="rd-dim">· ${num(list.length)}</span>`, tagCalc, list.length ? `<ol class="ai-actions">${list.slice(0, 10).map(a => `
            <li>${chip(a.impact === 'High' ? 'high' : 'medium', `${a.impact} impact`)}
                <div><strong>${esc(a.title)}</strong> <span class="rd-dim">${esc(a.p.displayName)}</span>
                <div class="rd-note">${esc(a.why)}</div>
                ${a.issue ? `<div class="ai-signal-links">${issueLink(a.p.key, a.issue.key)}</div>` : ''}</div>
            </li>`).join('')}</ol>` : '<p class="rd-empty">No actions needed right now.</p>');
    }

    function themes() {
        const list = (insights && insights.bug_themes || []).map(t => ({ ...t, issues: t.issues.filter(i => filter === 'all' || i.project === filter) }))
            .filter(t => t.issues.length);
        return section('Bug Themes', tagAI, list.length ? `<div class="ai-themes">${list.map(t => `
            <div class="ai-theme">
                <div class="jr-pf-sprint-row"><strong>${esc(t.theme)}</strong><span class="rd-dim">${t.issues.length} bugs</span></div>
                <p class="rd-note">${esc(t.description)}</p>
                <div class="ai-signal-links">${t.issues.slice(0, 6).map(i => issueLink(i.project, i.key)).join(' ')}${t.issues.length > 6 ? ' …' : ''}</div>
            </div>`).join('')}</div>` : '<p class="rd-empty">No recurring bug themes.</p>');
    }

    function anomalies() {
        const list = scope().flatMap(p => p.anomalies.map(a => ({ ...a, p })));
        return section('Anomalies', tagCalc, list.length ? `<ul class="ai-list ai-anomalies">${list.map(a => `
            <li><strong>${esc(a.p.displayName)}: ${esc(a.title)}</strong><div class="rd-note">${esc(a.detail)}</div></li>`).join('')}</ul>`
            : '<p class="rd-empty">Nothing unusual compared with recent sprints.</p>');
    }

    function howItWorks() {
        return `<details class="card ai-how"><summary><strong>How OneView AI works</strong></summary>
            <ul class="ai-list">
                <li><span class="ai-tag ai-tag-ai">✨ AI-written</span> A scheduled workflow sends a summary of the data (counts, risks, signals; no source code) to ${esc(insights ? insights.model : 'an AI model')} and saves its answer to <code>ai-reports/insights.json</code>. The page only displays that file.</li>
                <li><span class="ai-tag ai-tag-calc">∑ Computed live</span> Forecasts, risk scores, cross-tool signals, actions and anomalies are calculated in your browser from the same JSON files the other dashboards use, so they are always current and every result shows its reasons.</li>
                <li>No AI key or API call is made from this page.</li>
            </ul></details>`;
    }

    function render() {
        const app = document.getElementById('ai-app');
        app.innerHTML = `
            ${banner()}
            ${filterBar()}
            ${briefing()}
            ${forecasts()}
            <div class="rd-detail-grid">
                ${signals()}
                ${riskRadar()}
                ${actions()}
                ${releases()}
                ${themes()}
                ${anomalies()}
            </div>
            ${howItWorks()}`;
        app.querySelectorAll('.ai-filter').forEach(b => b.addEventListener('click', () => {
            filter = b.dataset.filter;
            history.replaceState(null, '', filter === 'all' ? 'ai-insights.html' : `ai-insights.html?project=${filter}`);
            render();
        }));
    }

    async function init() {
        const loading = document.getElementById('loading-message');
        const [loaded, ai] = await Promise.all([
            Promise.all(JIRA_PROJECT_KEYS.map(k => AIEngine.load(k))),
            RepoCommon.fetchJSON('ai-reports/insights.json')
        ]);
        all = loaded.filter(Boolean);
        insights = ai;
        if (!all.length) { Jira.showError(loading, 'Could not load project data', 'index.html'); return; }
        const requested = (new URLSearchParams(location.search).get('project') || '').toUpperCase();
        if (all.some(p => p.key === requested)) filter = requested;
        render();
        loading.style.display = 'none';
        document.getElementById('ai-app').style.display = '';
    }

    window.addEventListener('load', () => window.NetSecAccessControl.runWhenAuthorized(init));
})();
