// Shared logic for the JIRA Dashboard pages. Needs js/repo-common.js (generic helpers) loaded first.
// Data comes from static JSON in jira-reports/<PROJECT>/ produced by a scheduled workflow;
// these pages never call the JIRA API themselves.
const JIRA_PROJECT_KEYS = ['FXOS', 'IMS', 'USM', 'ASA'];

// Validated on the dark card surface (#111a2d) with the dataviz palette checker.
const JIRA_COLORS = {
    category: { 'To Do': '#3987e5', 'In Progress': '#d95926', 'Done': '#199e70' },
    // Ordinal ramp, one hue: most urgent = most prominent (lightest on dark).
    priority: { Highest: '#e1ecfa', High: '#b0cff3', Medium: '#80b2ec', Low: '#5596e4', Lowest: '#3a7fd6' },
    seriesA: '#3987e5',
    seriesB: '#d95926',
    single: '#3d8bfd',
    reference: '#7d8ba3'
};
const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
const STATUS_ORDER = ['To Do', 'In Progress', 'In Review', 'Blocked', 'Done'];
const DAY_MS = 86400000;

const Jira = {
    project(key) {
        const k = (key || new URLSearchParams(window.location.search).get('project') || '').toUpperCase();
        return JIRA_PROJECT_KEYS.includes(k) ? { key: k, displayName: REPO_PROJECTS[k].displayName } : null;
    },

    async load(projectKey) {
        const [summary, issues] = await Promise.all([
            RepoCommon.fetchJSON(`jira-reports/${projectKey}/summary.json`),
            RepoCommon.fetchJSON(`jira-reports/${projectKey}/issues.json`)
        ]);
        if (!summary || !issues) return null;
        return Jira.analyze(summary, issues.issues || []);
    },

    // Every number on the JIRA pages is derived here, so portfolio and project views always agree.
    analyze(summary, allIssues) {
        const ref = new Date(summary.timestamp);
        const refDay = summary.timestamp.slice(0, 10);
        const daysSince = iso => (ref - new Date(iso)) / DAY_MS;
        const work = allIssues.filter(i => i.type !== 'Epic');
        const open = work.filter(i => i.status_category !== 'Done');
        const isOverdue = i => i.due_date && i.due_date < refDay && i.status_category !== 'Done';
        const isBlocker = i => (i.status === 'Blocked' || i.flagged) && i.status_category !== 'Done';
        const cycleDays = i => {
            const start = (i.history || []).find(h => h.to === 'In Progress');
            return start && i.resolved ? (new Date(i.resolved) - new Date(start.at)) / DAY_MS : null;
        };

        const resolved30 = work.filter(i => i.resolved && daysSince(i.resolved) <= 30);
        const cycles = resolved30.map(cycleDays).filter(v => v != null);

        const kpis = {
            open: open.length,
            in_progress: open.filter(i => i.status_category === 'In Progress').length,
            done_30d: resolved30.length,
            overdue: work.filter(isOverdue).length,
            blockers: work.filter(isBlocker).length,
            avg_cycle_days: cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null,
            unassigned: open.filter(i => !i.assignee).length,
            critical_bugs: open.filter(i => i.type === 'Bug' && (i.priority === 'Highest' || i.priority === 'High')).length
        };

        const countBy = (arr, fn) => arr.reduce((m, i) => { const k = fn(i); m[k] = (m[k] || 0) + 1; return m; }, {});
        const byStatus = countBy(work, i => i.status);
        const byCategory = countBy(work, i => i.status_category);
        const byType = countBy(open, i => i.type);
        const byPriority = countBy(open, i => i.priority);

        const agingBuckets = [['0–7 days', 0, 7], ['8–30 days', 8, 30], ['31–90 days', 31, 90], ['90+ days', 91, Infinity]]
            .map(([label, lo, hi]) => ({ label, value: open.filter(i => { const d = Math.floor(daysSince(i.created)); return d >= lo && d <= hi; }).length }));

        // Weekly created vs resolved, 12 weeks ending at the data timestamp.
        const trend = [];
        for (let w = 11; w >= 0; w--) {
            const end = new Date(ref.getTime() - w * 7 * DAY_MS);
            const start = new Date(end.getTime() - 7 * DAY_MS);
            const inWeek = iso => iso && new Date(iso) > start && new Date(iso) <= end;
            trend.push({
                label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                created: work.filter(i => inWeek(i.created)).length,
                resolved: work.filter(i => inWeek(i.resolved)).length
            });
        }

        // Active sprint progress.
        const sp = summary.active_sprint;
        const sprintIssues = work.filter(i => i.sprint === sp.name);
        const scope = sp.committed_points + sp.added_points;
        const spStart = new Date(sp.start), spEnd = new Date(sp.end);
        const elapsedPct = Math.min(100, Math.max(0, ((ref - spStart) / (spEnd - spStart)) * 100));
        const donePct = scope ? (sp.completed_points / scope) * 100 : 0;
        const sprint = {
            ...sp, scope, done_pct: donePct, elapsed_pct: elapsedPct,
            days_left: Math.max(0, Math.ceil((spEnd - ref) / DAY_MS)),
            issues: sprintIssues,
            by_status: countBy(sprintIssues.filter(i => i.type !== 'Sub-task'), i => i.status)
        };

        // Attention list for leads.
        const attention = [];
        const add = (issue, reason, weight) => attention.push({ issue, reason, weight });
        work.filter(isBlocker).forEach(i => add(i, 'Blocked', 1));
        work.filter(i => isOverdue(i) && (i.priority === 'Highest' || i.priority === 'High')).forEach(i => add(i, `Overdue since ${RepoCommon.formatDate(i.due_date)}`, 2));
        open.filter(i => !i.assignee && i.sprint === sp.name).forEach(i => add(i, 'Unassigned in active sprint', 3));
        open.filter(i => i.status_category === 'In Progress' && daysSince(i.updated) > 14).forEach(i => add(i, `No update for ${Math.floor(daysSince(i.updated))} days`, 4));
        const seen = new Set();
        const attentionList = attention.sort((a, b) => a.weight - b.weight)
            .filter(a => !seen.has(a.issue.key) && seen.add(a.issue.key));

        // Health: compare sprint progress with time elapsed, plus blockers and overdue work.
        const reasons = [];
        const gap = elapsedPct - donePct;
        if (gap > 10) reasons.push(`Sprint ${Math.round(donePct)}% done with ${Math.round(elapsedPct)}% of time used`);
        if (kpis.blockers) reasons.push(`${kpis.blockers} blocker${kpis.blockers > 1 ? 's' : ''}`);
        if (kpis.overdue) reasons.push(`${kpis.overdue} overdue`);
        const offTrack = gap > 25 || kpis.blockers >= 3 || kpis.overdue >= 5;
        const atRisk = !offTrack && (gap > 10 || kpis.blockers >= 1 || kpis.overdue >= 3);
        const health = offTrack ? { label: 'Off track', tone: 'bad', icon: '✕' }
            : atRisk ? { label: 'At risk', tone: 'warn', icon: '!' }
            : { label: 'On track', tone: 'good', icon: '✓' };
        health.reasons = reasons.length ? reasons : ['Sprint progress matches time elapsed', 'No blockers'];

        // Team workload.
        const members = (summary.team || []).map(m => m.user);
        const workload = [...members, null].map(user => {
            const mine = open.filter(i => (i.assignee || null) === user);
            const cap = (summary.team || []).find(m => m.user === user);
            const sprintPoints = mine.filter(i => i.sprint === sp.name).reduce((a, i) => a + (i.story_points || 0), 0);
            const inProgress = mine.filter(i => i.status_category === 'In Progress').length;
            const capacity = cap ? cap.capacity_points : null;
            return {
                user, role: cap ? cap.role : null, capacity,
                open: mine.length, in_progress: inProgress, sprint_points: sprintPoints,
                overdue: mine.filter(isOverdue).length,
                done_30d: resolved30.filter(i => i.assignee === user).length,
                overloaded: user !== null && ((capacity && sprintPoints > capacity) || inProgress >= 4)
            };
        }).filter(w => w.user !== null || w.open > 0);

        // Releases (fix versions).
        const releases = (summary.versions || []).map(v => {
            const items = work.filter(i => (i.fix_versions || []).includes(v.name));
            const done = items.filter(i => i.status_category === 'Done').length;
            return {
                ...v, total: items.length, done, open: items.length - done,
                pct: items.length ? (done / items.length) * 100 : 0,
                overdue: !v.released && v.release_date < refDay,
                days_to_release: Math.ceil((new Date(v.release_date) - ref) / DAY_MS)
            };
        });

        // Epics.
        const epics = allIssues.filter(i => i.type === 'Epic').map(e => {
            const children = work.filter(i => i.epic === e.key);
            const done = children.filter(i => i.status_category === 'Done');
            const pts = arr => arr.reduce((a, i) => a + (i.story_points || 0), 0);
            return { ...e, children: children.length, done: done.length, points: pts(children), points_done: pts(done),
                pct: children.length ? (done.length / children.length) * 100 : 0 };
        });

        return { summary, issues: allIssues, work, open, ref, kpis, byStatus, byCategory, byType, byPriority,
            agingBuckets, trend, sprint, attention: attentionList, health, workload, releases, epics, cycleDays };
    },

    issueHref(projectKey, key) {
        return `jira-issue.html?project=${projectKey}&key=${encodeURIComponent(key)}`;
    },

    typeIcon(type) {
        return ({ Bug: '🐞', Story: '📗', Task: '☑️', 'Sub-task': '↳', Epic: '⚡' })[type] || '•';
    },

    // Status shown as a colored dot plus its name, so it never relies on color alone.
    statusBadge(status) {
        const cls = { 'To Do': 'jr-st-todo', 'In Progress': 'jr-st-progress', 'In Review': 'jr-st-review',
            'Blocked': 'jr-st-blocked', 'Done': 'jr-st-done' }[status] || 'jr-st-todo';
        return `<span class="jr-status ${cls}">${RepoCommon.esc(status)}</span>`;
    },

    // Sprint progress bar with a marker showing how much of the sprint time has passed.
    sprintBar(donePct, elapsedPct) {
        return `<div class="jr-sprint-bar">
            ${Jira.progressBar(donePct, 'single', `${Math.round(donePct)}% of story points done`)}
            <span class="jr-elapsed" style="left:${Math.max(0, Math.min(100, elapsedPct))}%" title="Time elapsed: ${Math.round(elapsedPct)}%"></span>
        </div>`;
    },

    priorityBadge(priority) {
        const icon = { Highest: '⇈', High: '↑', Medium: '=', Low: '↓', Lowest: '⇊' }[priority] || '';
        return `<span class="jr-priority jr-pr-${RepoCommon.esc((priority || '').toLowerCase())}">${icon} ${RepoCommon.esc(priority || '')}</span>`;
    },

    healthBadge(h) {
        return `<span class="jr-health jr-health-${h.tone}">${h.icon} ${h.label}</span>`;
    },

    avatar(user) {
        if (!user) return '<span class="jr-avatar jr-avatar-none" title="Unassigned">?</span>';
        const initials = user.replace(/_demo$/, '').slice(0, 2).toUpperCase();
        return `<span class="jr-avatar" title="${RepoCommon.esc(user)}">${RepoCommon.esc(initials)}</span>`;
    },

    userName(user) {
        return user ? `@${RepoCommon.esc(user)}` : '<span class="rd-dim">Unassigned</span>';
    },

    days(n) {
        if (n == null) return 'N/A';
        return n < 1 ? `${Math.round(n * 24)}h` : `${n.toFixed(1)}d`;
    },

    progressBar(pct, tone = 'single', label = '') {
        return `<div class="jr-progress" role="img" aria-label="${RepoCommon.esc(label || `${Math.round(pct)}% complete`)}">
            <span class="jr-progress-fill jr-fill-${tone}" style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>`;
    },

    showError(container, message, backHref) {
        container.innerHTML = `
            <div class="rd-empty">
                <p><span style="color: var(--failure);">⚠️ ${message}</span></p>
                <p>The JIRA data workflow may not have run yet, or the file doesn't exist.</p>
                <a href="${backHref}" class="btn">Go back</a>
            </div>`;
    }
};
