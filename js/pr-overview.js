// PR Overview / Analytics — aggregates across ALL PRs for a project.
const PROJECT_CONFIG = {
    'FXOS': {
        name: 'FXOS',
        repo: 'cisco-sbg-emu/netsec-fxos',
        displayName: 'Firepower eXtensible Operating System (FXOS)'
    },
    'IMS': {
        name: 'IMS',
        repo: 'cisco-netsec-sandbox/netsec-ims-pr-dashboard',
        displayName: 'Identity Management System (IMS)'
    },
    'ASA': {
        name: 'ASA',
        repo: 'cisco-netsec-sandbox/netsec-asa-pr-dashboard',
        displayName: 'Adaptive Security Appliance (ASA)'
    }
};

let currentProject = null;
const charts = {};

// ── Fetch helpers ───────────────────────────────────────────────────────
async function fetchJSON(url) {
    try {
        const res = await fetch(`${url}?v=${Date.now()}`, { credentials: 'include', cache: 'no-store' });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

// ── Health scoring (0–100) for a PR's latest revision ───────────────────
function computeHealth(d) {
    const rs = d.review_stats || {};

    // Build health (40 pts) — all modules must pass for full credit;
    // any failure is heavily penalised (max 25 pts, scaled by pass ratio)
    const buildKeys = Object.keys(d).filter(k => k.endsWith(': Build Status') && !k.startsWith('Unit Tests'));
    let buildPts = 40, buildsPassing = true;
    if (buildKeys.length) {
        const passing = buildKeys.filter(k => String(d[k]).toUpperCase() === 'SUCCESS').length;
        buildsPassing = passing === buildKeys.length;
        buildPts = buildsPassing ? 40 : 25 * (passing / buildKeys.length);
    }

    // Unit tests (20 pts) — full credit only when green with zero failures
    const utStatus = d['Unit Tests: Build Status'];
    const utPassed = parseInt(d['Unit Tests: Unit Tests Passed']) || 0;
    const utFailed = parseInt(d['Unit Tests: Unit Tests Failed']) || 0;
    let utPts = 20;
    if (utStatus != null) {
        if (utFailed === 0 && utStatus === 'SUCCESS') utPts = 20;
        else if (utPassed + utFailed > 0) utPts = 12 * (utPassed / (utPassed + utFailed));
        else utPts = utStatus === 'SUCCESS' ? 20 : 0;
    }

    // Review threads (15 pts) — full credit only when nothing is unresolved
    const unresolved = rs.unresolved_threads;
    const totalThreads = rs.total_threads;
    let threadPts = 15;
    if (unresolved != null) {
        if (unresolved === 0) threadPts = 15;
        else if (totalThreads) threadPts = 10 * (Math.max(0, totalThreads - unresolved) / totalThreads);
        else threadPts = 0;
    }

    // Approvals (15 pts)
    const approvals = rs.reviews_approved || 0;
    const approvalPts = approvals > 0 ? 15 : 0;

    // Changes requested (10 pts)
    const changesReq = rs.reviews_changes_requested || 0;
    const changePts = changesReq === 0 ? 10 : 0;

    const score = Math.round(buildPts + utPts + threadPts + approvalPts + changePts);
    return {
        score,
        buildsPassing,
        utFailed,
        utPassed,
        unresolved: unresolved || 0,
        approvals,
        changesReq,
        band: score >= 80 ? 'healthy' : score >= 50 ? 'warning' : 'critical'
    };
}

function scoreColor(score) {
    return score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
}

function formatDate(s) {
    if (!s) return 'N/A';
    const d = new Date(s);
    if (isNaN(d)) return 'N/A';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function ageDays(s) {
    const t = Date.parse(s);
    if (isNaN(t)) return null;
    return Math.floor((Date.now() - t) / 86400000);
}

function fmtDuration(sec) {
    if (!sec || sec <= 0) return '—';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

const STATUS_META = {
    approved:          { label: 'Approved',          color: '#10b981' },
    merged:            { label: 'Merged',            color: '#a78bfa' },
    review_required:   { label: 'Review Required',   color: '#3b82f6' },
    open:              { label: 'Open',              color: '#3b82f6' },
    changes_requested: { label: 'Changes Requested', color: '#ef4444' },
    closed:            { label: 'Closed',            color: '#64748b' },
    draft:             { label: 'Draft',             color: '#f59e0b' },
};

// ── KPI tiles ───────────────────────────────────────────────────────────
function renderKPIs(prs) {
    const total = prs.length;
    const readyToMerge = prs.filter(p => p.health.band === 'healthy' && p.health.buildsPassing && p.health.approvals > 0).length;
    const needsAttention = prs.filter(p => p.health.band === 'critical').length;
    const buildsFailing = prs.filter(p => !p.health.buildsPassing).length;
    const avgScore = total ? Math.round(prs.reduce((s, p) => s + p.health.score, 0) / total) : 0;
    const openThreads = prs.reduce((s, p) => s + (p.health.unresolved || 0), 0);

    const tiles = [
        { label: 'Total PRs',        value: total,          color: 'var(--cisco-blue)', icon: '📋' },
        { label: 'Ready to Merge',   value: readyToMerge,   color: '#10b981', icon: '✅' },
        { label: 'Needs Attention',  value: needsAttention, color: '#ef4444', icon: '⚠️' },
        { label: 'Builds Failing',   value: buildsFailing,  color: '#f59e0b', icon: '🏗️' },
        { label: 'Avg Health Score', value: avgScore,       color: scoreColor(avgScore), icon: '🩺', suffix: '/100' },
        { label: 'Open Review Threads', value: openThreads, color: '#a78bfa', icon: '💬' },
    ];

    document.getElementById('kpi-grid').innerHTML = tiles.map(t => `
        <div class="ov-kpi" style="border-top:3px solid ${t.color};">
            <div class="ov-kpi-icon">${t.icon}</div>
            <div class="ov-kpi-value" style="color:${t.color};">${t.value}<span class="ov-kpi-suffix">${t.suffix || ''}</span></div>
            <div class="ov-kpi-label">${t.label}</div>
        </div>
    `).join('');
}

// ── Charts ──────────────────────────────────────────────────────────────
function doughnut(canvasId, labels, data, colors) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (charts[canvasId]) charts[canvasId].destroy();
    charts[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: '#0f172a', borderWidth: 2 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
                legend: { position: 'right', labels: { color: '#cbd5e1', font: { size: 12 }, padding: 12, boxWidth: 14 } },
                tooltip: { callbacks: { label: c => ` ${c.label}: ${c.parsed}` } }
            }
        }
    });
}

function renderStatusChart(prs) {
    const counts = {};
    prs.forEach(p => { const s = p.pr_status || 'open'; counts[s] = (counts[s] || 0) + 1; });
    const keys = Object.keys(counts);
    doughnut('statusChart',
        keys.map(k => (STATUS_META[k]?.label) || k),
        keys.map(k => counts[k]),
        keys.map(k => (STATUS_META[k]?.color) || '#64748b'));
}

function renderHealthChart(prs) {
    const bands = { healthy: 0, warning: 0, critical: 0 };
    prs.forEach(p => bands[p.health.band]++);
    doughnut('healthChart',
        ['Healthy (80–100)', 'At Risk (50–79)', 'Critical (<50)'],
        [bands.healthy, bands.warning, bands.critical],
        ['#10b981', '#f59e0b', '#ef4444']);
}

function renderBuildChart(prs) {
    const passing = prs.filter(p => p.health.buildsPassing).length;
    const failing = prs.length - passing;
    doughnut('buildChart',
        ['Builds Passing', 'Builds Failing'],
        [passing, failing],
        ['#10b981', '#ef4444']);
}

// ── Top contributors ────────────────────────────────────────────────────
function renderContributors(prs) {
    const counts = {};
    prs.forEach(p => { const a = p.author || 'unknown'; counts[a] = (counts[a] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max = sorted.length ? sorted[0][1] : 1;
    document.getElementById('contributors').innerHTML = sorted.map(([author, n]) => `
        <div class="ov-contrib-row">
            <span class="ov-contrib-name">@${author}</span>
            <div class="ov-contrib-bar-track">
                <div class="ov-contrib-bar" style="width:${(n / max) * 100}%;"></div>
            </div>
            <span class="ov-contrib-count">${n}</span>
        </div>
    `).join('') || '<p class="ov-subtle">No data</p>';
}

// ── Lowest score table ──────────────────────────────────────────────────
function renderLowestTable(prs) {
    const lowest = [...prs].sort((a, b) => a.health.score - b.health.score).slice(0, 10);
    const rows = lowest.map(p => {
        const c = scoreColor(p.health.score);
        const issues = [];
        if (!p.health.buildsPassing) issues.push('Build failing');
        if (p.health.utFailed > 0) issues.push(`${p.health.utFailed} UT failing`);
        if (p.health.unresolved > 0) issues.push(`${p.health.unresolved} open threads`);
        if (p.health.changesReq > 0) issues.push('Changes requested');
        if (p.health.approvals === 0) issues.push('No approval');
        const issuesHtml = issues.length
            ? issues.map(i => `<span class="ov-issue-tag">${i}</span>`).join('')
            : '<span class="ov-subtle">—</span>';
        return `
        <tr onclick="window.location.href='dashboard.html?project=${currentProject.name}&pr=${p.number}'">
            <td class="ov-td-num">#${p.number}</td>
            <td class="ov-td-title">${p.title || ''}<div class="ov-td-author">@${p.author}</div></td>
            <td>
                <div class="ov-score-cell">
                    <div class="ov-score-bar-track"><div class="ov-score-bar" style="width:${p.health.score}%;background:${c};"></div></div>
                    <span class="ov-score-num" style="color:${c};">${p.health.score}</span>
                </div>
            </td>
            <td class="ov-td-issues">${issuesHtml}</td>
        </tr>`;
    }).join('');

    document.getElementById('lowest-table').innerHTML = `
        <table class="ov-table">
            <thead><tr><th>PR</th><th>Title</th><th>Health Score</th><th>Blocking Issues</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
}

// ── Stale PRs ───────────────────────────────────────────────────────────
function renderStale(prs) {
    const stale = [...prs]
        .map(p => ({ ...p, age: ageDays(p.updated_at) }))
        .filter(p => p.age != null)
        .sort((a, b) => b.age - a.age)
        .slice(0, 6);
    document.getElementById('stale-list').innerHTML = stale.map(p => {
        const c = p.age > 30 ? '#ef4444' : p.age > 14 ? '#f59e0b' : '#94a3b8';
        return `
        <div class="ov-stale-row" onclick="window.location.href='dashboard.html?project=${currentProject.name}&pr=${p.number}'">
            <div class="ov-stale-main">
                <span class="ov-stale-pr">#${p.number}</span>
                <span class="ov-stale-title">${p.title || ''}</span>
            </div>
            <div class="ov-stale-meta">
                <span class="ov-stale-age" style="color:${c};">${p.age}d idle</span>
                <span class="ov-subtle">updated ${formatDate(p.updated_at)}</span>
            </div>
        </div>`;
    }).join('') || '<p class="ov-subtle">No data</p>';
}

// ── Aggregate metrics ───────────────────────────────────────────────────
function renderAggregate(prs) {
    let add = 0, del = 0, cf = 0, utP = 0, utF = 0, ciSum = 0, ciN = 0;
    prs.forEach(p => {
        add += p.raw.additions || 0;
        del += p.raw.deletions || 0;
        cf += p.raw.changed_files || 0;
        utP += parseInt(p.raw['Unit Tests: Unit Tests Passed']) || 0;
        utF += parseInt(p.raw['Unit Tests: Unit Tests Failed']) || 0;
        if (p.raw.ci_duration_seconds > 0) { ciSum += p.raw.ci_duration_seconds; ciN++; }
    });
    const avgCi = ciN ? Math.round(ciSum / ciN) : 0;
    const nf = n => n.toLocaleString('en-US');
    const tiles = [
        { label: 'Lines Added',      value: `+${nf(add)}`, color: '#10b981' },
        { label: 'Lines Removed',    value: `-${nf(del)}`, color: '#ef4444' },
        { label: 'Files Changed',    value: nf(cf),        color: 'var(--cisco-blue)' },
        { label: 'Unit Tests Passed', value: nf(utP),      color: '#10b981' },
        { label: 'Unit Tests Failed', value: nf(utF),      color: utF > 0 ? '#ef4444' : '#94a3b8' },
        { label: 'Avg CI Duration',  value: fmtDuration(avgCi), color: '#a78bfa' },
    ];
    document.getElementById('aggregate-grid').innerHTML = tiles.map(t => `
        <div class="ov-agg-tile">
            <div class="ov-agg-value" style="color:${t.color};">${t.value}</div>
            <div class="ov-agg-label">${t.label}</div>
        </div>
    `).join('');
}

// ── Init ────────────────────────────────────────────────────────────────
async function init() {
    const params = new URLSearchParams(window.location.search);
    const projectKey = (params.get('project') || 'FXOS').toUpperCase();

    if (!PROJECT_CONFIG[projectKey]) {
        document.getElementById('loading-message').innerHTML =
            `<span style="color:var(--failure);">⚠️ Unknown project: ${projectKey}</span>`;
        return;
    }
    currentProject = PROJECT_CONFIG[projectKey];
    document.title = `${currentProject.name} — PR Overview`;
    document.getElementById('project-title').innerHTML =
        `${currentProject.name} PR Overview` +
        `<div style="font-size:0.85rem;opacity:0.8;font-weight:400;margin-top:0.3rem;">${currentProject.displayName}</div>`;
    document.getElementById('back-link').href = `pr-list.html?project=${currentProject.name}`;

    const prList = await fetchJSON(`pr-reports/${currentProject.name}/pr-list.json`);
    if (!prList || !Array.isArray(prList.pull_requests) || prList.pull_requests.length === 0) {
        document.getElementById('loading-message').innerHTML =
            `<span style="color:var(--failure);">❌ No PR data found for ${currentProject.name}.</span>`;
        return;
    }

    // Fetch each PR's dashboard file (latest revision) in parallel
    const results = await Promise.all(prList.pull_requests.map(async (pr) => {
        const arr = await fetchJSON(`pr-reports/${currentProject.name}/dashboard_${pr.number}.json`);
        const latest = Array.isArray(arr) && arr.length ? arr[0] : null;
        if (!latest) return null;
        return {
            number: pr.number,
            title: latest.title || pr.title,
            author: latest.author || pr.author,
            pr_status: pr.pr_status || latest.pr_status || 'open',
            updated_at: latest.updated_at || pr.updated_at,
            created_at: latest.created_at || pr.created_at,
            raw: latest,
            review_stats: latest.review_stats,
            health: computeHealth(latest),
        };
    }));

    const prs = results.filter(Boolean);
    if (prs.length === 0) {
        document.getElementById('loading-message').innerHTML =
            `<span style="color:var(--failure);">❌ No dashboard data available to analyze.</span>`;
        return;
    }

    document.getElementById('loading-message').style.display = 'none';
    document.getElementById('overview-content').style.display = 'block';

    renderKPIs(prs);
    renderStatusChart(prs);
    renderHealthChart(prs);
    renderBuildChart(prs);
    renderContributors(prs);
    renderLowestTable(prs);
    renderStale(prs);
    renderAggregate(prs);

    document.getElementById('ov-timestamp').textContent =
        `Analyzed ${prs.length} PRs · Data as of ${formatDate(prList.timestamp)}`;
}

window.onload = init;
