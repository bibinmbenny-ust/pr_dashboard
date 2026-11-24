// OneView AI engine: forecasts, risk scoring, cross-tool signals, recommendations and anomalies.
// Pure functions (no DOM) over JIRA, PR and repo data, so the same logic runs in the browser and
// in the workflow that writes the AI briefing. Needs js/repo-common.js and js/jira-common.js.
const AI_COMPONENT_REPOS = {
    FXOS: { 'Platform': 'orion-platform-core', 'Dataplane': 'orion-platform-core', 'Management UI': 'orion-mgmt-ui',
        'Telemetry': 'orion-telemetry-agent', 'Build & Release': 'orion-build-tools' },
    IMS: { 'Identity': 'luna-identity-service', 'Policy Engine': 'luna-policy-engine', 'Admin Portal': 'luna-admin-portal',
        'Connectors': 'luna-connectors' },
    USM: { 'Manager API': 'harbor-manager-api', 'Web Console': 'harbor-web-console', 'Device Sync': 'harbor-device-sync',
        'Reports': 'harbor-report-service' },
    ASA: { 'Dataplane': 'quasar-dataplane', 'Control Plane': 'quasar-control-plane', 'CLI': 'quasar-cli',
        'CI Pipelines': 'quasar-ci-pipelines', 'Performance': 'quasar-perf-lab' }
};

const AIEngine = (() => {
    const DAY = 86400000;

    // Small seeded PRNG so a forecast is stable between page loads.
    function rng(seedText) {
        let a = [...seedText].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 2166136261);
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

    // Monte Carlo: blend the current sprint pace with historical velocity, simulate the days left.
    function sprintForecast(A, runs = 2000) {
        const sp = A.sprint;
        const lengthDays = (new Date(sp.end) - new Date(sp.start)) / DAY;
        const elapsedDays = Math.max(0.5, (A.ref - new Date(sp.start)) / DAY);
        const daysLeft = Math.max(0, (new Date(sp.end) - A.ref) / DAY);
        const history = (A.summary.velocity || []).map(v => v.completed / lengthDays).filter(v => v > 0);
        const currentRate = sp.completed_points / elapsedDays;
        const rand = rng(`${sp.name}-forecast`);
        const outcomes = [];
        for (let i = 0; i < runs; i++) {
            const hist = history.length ? history[Math.floor(rand() * history.length)] : currentRate;
            const rate = (0.5 * hist + 0.5 * currentRate) * (0.75 + rand() * 0.5);
            outcomes.push(Math.min(sp.scope, sp.completed_points + rate * daysLeft));
        }
        outcomes.sort((a, b) => a - b);
        const finish = outcomes.filter(o => o >= sp.scope - 0.01).length / runs;
        const p50 = percentile(outcomes, 0.5);
        const expected = sp.scope ? (p50 / sp.scope) * 100 : 0;
        // Likely = finishes everything; Close = most of it; At risk / Unlikely = a real shortfall.
        const label = finish >= 0.7 ? 'Likely' : expected >= 85 ? 'Close' : expected >= 60 ? 'At risk' : 'Unlikely';
        return {
            probability: finish,
            p10: Math.round(percentile(outcomes, 0.1)),
            p50: Math.round(p50),
            p90: Math.round(percentile(outcomes, 0.9)),
            scope: sp.scope,
            expected_pct: expected,
            current_rate: currentRate,
            needed_rate: daysLeft ? (sp.scope - sp.completed_points) / daysLeft : 0,
            historical_rate: history.length ? history.reduce((a, b) => a + b, 0) / history.length : null,
            days_left: daysLeft,
            label,
            tone: { Likely: 'good', Close: 'good', 'At risk': 'medium', Unlikely: 'high' }[label]
        };
    }

    // Release confidence from recent throughput, assuming release work is done first.
    function releaseConfidence(A) {
        const perDay = A.kpis.done_30d / 30;
        return A.releases.filter(r => !r.released).map(r => {
            const daysNeeded = perDay > 0 ? r.open / perDay : Infinity;
            const predicted = new Date(A.ref.getTime() + daysNeeded * DAY);
            const slack = (new Date(r.release_date) - predicted) / DAY;
            const level = r.overdue ? 'Low' : slack >= 3 ? 'High' : slack >= -3 ? 'Medium' : 'Low';
            return {
                ...r, throughput_per_day: perDay, days_needed: daysNeeded,
                predicted_date: Number.isFinite(daysNeeded) ? predicted.toISOString().slice(0, 10) : null,
                slack_days: Number.isFinite(slack) ? Math.round(slack) : null, confidence: level
            };
        });
    }

    // Explainable 0-100 risk score for each open ticket.
    function riskScores(A) {
        const refDay = A.summary.timestamp.slice(0, 10);
        const avgCycle = A.kpis.avg_cycle_days || 3;
        const sprintName = A.sprint.name;
        return A.open.filter(i => i.type !== 'Sub-task').map(i => {
            const f = [];
            const add = (pts, why) => f.push({ pts, why });
            const daysSince = iso => (A.ref - new Date(iso)) / DAY;
            if (i.status === 'Blocked') add(30, 'Blocked');
            if (i.flagged && i.status !== 'Blocked') add(10, 'Flagged as impediment');
            if (i.due_date && i.due_date < refDay) add(20, 'Past due date');
            else if (i.due_date && (new Date(i.due_date) - A.ref) / DAY <= 3) add(10, 'Due within 3 days');
            if (i.priority === 'Highest') add(15, 'Highest priority');
            else if (i.priority === 'High') add(10, 'High priority');
            if (i.status_category === 'In Progress' && daysSince(i.updated) > 7) add(15, `No update for ${Math.floor(daysSince(i.updated))} days`);
            if ((i.sprint_history || []).length > 1) add(10, 'Carried over from last sprint');
            const t = i.time_tracking || {};
            if (t.original_estimate_seconds && t.time_spent_seconds > t.original_estimate_seconds) add(10, 'Time logged exceeds estimate');
            const started = (i.history || []).find(h => h.to === 'In Progress');
            if (started && i.status_category === 'In Progress' && daysSince(started.at) > avgCycle * 2) {
                add(10, `In progress ${Math.floor(daysSince(started.at))} days (team average ${avgCycle.toFixed(1)})`);
            }
            if (!i.assignee && i.sprint === sprintName) add(10, 'Unassigned in active sprint');
            const blocks = (i.links || []).filter(l => l.type === 'blocks').length;
            if (blocks) add(10, `Blocks ${blocks} other ticket${blocks > 1 ? 's' : ''}`);
            const score = Math.min(100, f.reduce((a, x) => a + x.pts, 0));
            return { issue: i, score, factors: f.sort((a, b) => b.pts - a.pts),
                level: score >= 50 ? 'High' : score >= 25 ? 'Medium' : 'Low' };
        }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
    }

    // JIRA <-> PR <-> repo checks: only possible because OneView has all three.
    function crossSignals(projectKey, A, prs, repoList) {
        const out = [];
        const prMap = new Map((prs || []).map(p => [p.number, p]));
        const repos = new Map(((repoList && repoList.repositories) || []).map(r => [r.name, r]));
        const repoFor = i => (i.components || []).map(c => (AI_COMPONENT_REPOS[projectKey] || {})[c]).find(Boolean);
        const daysSince = iso => (A.ref - new Date(iso)) / DAY;

        A.work.forEach(i => {
            (i.linked_prs || []).forEach(link => {
                const live = prMap.get(link.number);
                const merged = live ? live.merged : link.state === 'merged';
                const status = live ? live.pr_status : link.status;
                const pr = { number: link.number, status, has_dashboard: link.has_dashboard, html_url: link.html_url, project: link.project };
                if (i.status === 'Done' && !merged && (live ? live.state === 'open' : link.state === 'open')) {
                    out.push({ kind: 'done_pr_open', severity: 'High', issue: i, pr,
                        title: `Done in JIRA, but PR #${link.number} is not merged`,
                        detail: `The ticket was resolved ${RepoCommon.timeAgo(i.resolved)}, but its PR is still "${(status || 'open').replace(/_/g, ' ')}". The work may not have shipped.` });
                }
                if (merged && i.status_category !== 'Done') {
                    out.push({ kind: 'pr_merged_ticket_open', severity: 'Medium', issue: i, pr,
                        title: `PR #${link.number} is merged, but the ticket is still ${i.status}`,
                        detail: 'The code has landed; the ticket probably needs to be closed.' });
                }
                if (status === 'approved' && !merged && i.status_category === 'In Progress') {
                    out.push({ kind: 'pr_approved_ticket_open', severity: 'Low', issue: i, pr,
                        title: `PR #${link.number} is approved; ${i.key} can move forward`,
                        detail: `The PR has approval but the ticket is still "${i.status}". Merging would let it close.` });
                }
                if (live && !merged && i.status === 'In Review' && daysSince(live.updated_at) > 7) {
                    out.push({ kind: 'review_stalled', severity: 'Medium', issue: i, pr,
                        title: `${i.key} is In Review, but PR #${link.number} has had no activity for ${Math.floor(daysSince(live.updated_at))} days`,
                        detail: 'The review looks stalled. A reviewer may need a nudge.' });
                }
            });
            const started = (i.history || []).find(h => h.to === 'In Progress');
            if (['Story', 'Bug', 'Task'].includes(i.type) && i.status_category === 'In Progress' && !(i.linked_prs || []).length
                && started && daysSince(started.at) > 3) {
                out.push({ kind: 'in_progress_no_pr', severity: 'Low', issue: i,
                    title: `${i.key} has been in progress ${Math.floor(daysSince(started.at))} days with no PR`,
                    detail: 'No pull request is linked yet. The work may be stuck or tracked elsewhere.' });
            }
        });

        // Sprint work that depends on a repo whose CI is failing.
        const byRepo = {};
        A.sprint.issues.filter(i => i.status_category !== 'Done').forEach(i => {
            const name = repoFor(i);
            const repo = name && repos.get(name);
            if (repo && repo.ci_status === 'failure') (byRepo[name] = byRepo[name] || { repo, issues: [] }).issues.push(i);
        });
        Object.values(byRepo).forEach(({ repo, issues }) => out.push({
            kind: 'sprint_on_failing_ci', severity: 'High', repo, issues,
            title: `${issues.length} open sprint ticket${issues.length > 1 ? 's' : ''} depend on ${repo.name}, whose CI is failing`,
            detail: `Fix the build first, or these tickets cannot be verified: ${issues.slice(0, 4).map(i => i.key).join(', ')}${issues.length > 4 ? ` and ${issues.length - 4} more` : ''}.`
        }));

        // High-priority bugs in repos with many open security alerts.
        A.open.filter(i => i.type === 'Bug' && (i.priority === 'Highest' || i.priority === 'High')).forEach(i => {
            const repo = repos.get(repoFor(i));
            if (repo && repo.security_alerts >= 15) out.push({ kind: 'bug_on_vulnerable_repo', severity: 'Medium', issue: i, repo,
                title: `${i.key} is a ${i.priority.toLowerCase()}-priority bug in ${repo.name}, which has ${repo.security_alerts} open security alerts`,
                detail: 'Consider reviewing the alerts while fixing the bug, in case they are related.' });
        });

        const rank = { High: 0, Medium: 1, Low: 2 };
        return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
    }

    // Concrete next steps with the reason for each.
    function recommendations(A, risks, releases) {
        const recs = [];
        const sprint = A.sprint.name;
        const spare = A.workload.filter(w => w.user && w.capacity)
            .map(w => ({ ...w, free: w.capacity - w.sprint_points })).sort((a, b) => b.free - a.free);

        // Rebalance overloaded people.
        A.workload.filter(w => w.overloaded).forEach(w => {
            const candidate = A.open.filter(i => i.assignee === w.user && i.sprint === sprint && i.status === 'To Do' && i.story_points)
                .sort((a, b) => a.story_points - b.story_points)[0];
            const to = spare.find(s => s.user !== w.user && s.free >= (candidate ? candidate.story_points : 1));
            if (candidate && to) recs.push({ kind: 'rebalance', impact: 'High', issue: candidate,
                title: `Move ${candidate.key} (${candidate.story_points} pts) from @${w.user} to @${to.user}`,
                why: `@${w.user} has ${w.sprint_points}/${w.capacity} pts this sprint; @${to.user} has ${to.sprint_points}/${to.capacity} pts.` });
        });

        // Unblock: chase whatever blocks a ticket.
        A.work.filter(i => i.status === 'Blocked').forEach(i => {
            const link = (i.links || []).find(l => l.type === 'is blocked by');
            const blocker = link && A.issues.find(x => x.key === link.key);
            recs.push({ kind: 'unblock', impact: 'High', issue: blocker || i,
                title: blocker ? `Prioritise ${blocker.key} — it blocks ${i.key}` : `Resolve the impediment on ${i.key}`,
                why: blocker ? `${blocker.key} is "${blocker.status}" and owned by ${blocker.assignee ? '@' + blocker.assignee : 'nobody'}. ${i.key} cannot move until it is done.`
                    : `${i.key} is flagged as blocked with no linked blocker. Ask @${i.assignee || 'the team'} what is needed.` });
        });

        // Assign unowned sprint work.
        A.open.filter(i => !i.assignee && i.sprint === sprint && i.type !== 'Sub-task').forEach(i => {
            const to = spare.find(s => s.free >= (i.story_points || 1));
            if (to) recs.push({ kind: 'assign', impact: 'Medium', issue: i,
                title: `Assign ${i.key} to @${to.user}`,
                why: `It is in the active sprint with no owner; @${to.user} has ${to.free} pts of spare capacity.` });
        });

        // Split long-running large items.
        risks.filter(r => r.issue.story_points >= 8 && r.issue.status_category === 'In Progress').forEach(r => recs.push({
            kind: 'split', impact: 'Medium', issue: r.issue,
            title: `Split ${r.issue.key} into smaller pieces`,
            why: `It is ${r.issue.story_points} pts and still in progress; large items are the usual cause of sprint spill-over.` }));

        // Cut release scope when the date is at risk.
        releases.filter(r => r.confidence === 'Low' && r.open > 0).forEach(r => {
            const cut = A.open.filter(i => (i.fix_versions || []).includes(r.name) && (i.priority === 'Low' || i.priority === 'Lowest'));
            recs.push({ kind: 'release', impact: 'High',
                title: cut.length ? `Move ${cut.length} low-priority ticket${cut.length > 1 ? 's' : ''} out of ${r.name}` : `Re-plan the ${r.name} date`,
                why: r.overdue ? `${r.name} was due ${RepoCommon.formatDate(r.release_date)} and still has ${r.open} open tickets.`
                    : `At the current pace it would finish around ${RepoCommon.formatDate(r.predicted_date)}, after the planned ${RepoCommon.formatDate(r.release_date)}.` });
        });

        const rank = { High: 0, Medium: 1, Low: 2 };
        return recs.sort((a, b) => rank[a.impact] - rank[b.impact]);
    }

    function anomalies(A) {
        const out = [];
        const vel = (A.summary.velocity || []).map(v => v.completed);
        if (vel.length >= 3) {
            const last = vel[vel.length - 1];
            const prevAvg = vel.slice(0, -1).reduce((a, b) => a + b, 0) / (vel.length - 1);
            if (last < prevAvg * 0.7) out.push({ kind: 'velocity_drop', title: `Velocity dropped ${Math.round((1 - last / prevAvg) * 100)}% last sprint`,
                detail: `${last} pts completed vs an average of ${prevAvg.toFixed(1)} over the previous sprints.` });
        }
        const recent = A.trend.slice(-4);
        const created = recent.reduce((a, t) => a + t.created, 0), resolved = recent.reduce((a, t) => a + t.resolved, 0);
        if (created > resolved * 1.5 && created - resolved >= 4) out.push({ kind: 'intake', title: 'New work is arriving faster than it is finished',
            detail: `${created} tickets created vs ${resolved} resolved in the last 4 weeks; the backlog is growing.` });
        const sp = A.sprint;
        if (sp.committed_points && sp.added_points / sp.committed_points > 0.1) out.push({ kind: 'scope_creep',
            title: `Scope grew ${Math.round((sp.added_points / sp.committed_points) * 100)}% during the sprint`,
            detail: `${sp.added_points} pts were added after the sprint started (committed ${sp.committed_points}).` });
        if (A.kpis.critical_bugs >= 5) out.push({ kind: 'bug_load', title: `${A.kpis.critical_bugs} high-priority bugs are open`,
            detail: 'That is a heavy bug load for one sprint team; consider a bug-focused sprint goal.' });
        return out;
    }

    function analyze(ctx) {
        const A = ctx.jira;
        const forecast = sprintForecast(A);
        const releases = releaseConfidence(A);
        const risks = riskScores(A);
        const signals = crossSignals(ctx.key, A, ctx.prs, ctx.repos);
        const actions = recommendations(A, risks, releases);
        return { ...ctx, forecast, releases, risks, signals, actions, anomalies: anomalies(A) };
    }

    // Browser loader: JIRA analysis plus the PR and repo lists for one project.
    async function load(key) {
        const [jira, prList, repoList] = await Promise.all([
            Jira.load(key),
            RepoCommon.fetchJSON(`pr-reports/${key}/pr-list.json`),
            RepoCommon.fetchJSON(`repo-reports/${key}/repo-list.json`)
        ]);
        if (!jira) return null;
        return analyze({ key, displayName: REPO_PROJECTS[key].displayName, jira,
            prs: prList ? prList.pull_requests || [] : [], repos: repoList || null });
    }

    return { analyze, load, sprintForecast, releaseConfidence, riskScores, crossSignals, recommendations, anomalies };
})();
