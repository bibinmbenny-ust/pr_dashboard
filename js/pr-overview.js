// PR Overview / Analytics — aggregates across ALL PRs for a project.
const PROJECT_CONFIG = {
    'FXOS': {
        name: 'FXOS',
        repo: 'cisco-sbg-emu/netsec-fxos',
        displayName: 'Firepower eXtensible Operating System (FXOS)'
    },
    'ASA': {
        name: 'ASA',
        repo: 'cisco-sbg-emu/netsec-asa',
        displayName: 'Adaptive Security Appliance (ASA)'
    },
    'IMS': {
        name: 'IMS',
        repo: 'cisco-sbg-emu/netsec-ims',
        displayName: 'Identity Management System (IMS)'
    }
};

let currentProject = null;
const charts = {};

// All analysed PRs (unfiltered) + metadata, used by the filter controls.
let allPRs = [];
let prListTimestamp = null;

function setupOverviewExportButton() {
    const button = document.getElementById('download-overview-pdf');
    if (!button) return;

    button.addEventListener('click', () => {
        const originalTitle = document.title;
        const projectName = currentProject ? currentProject.name : 'NetSec';
        const restoreTitle = () => {
            document.title = originalTitle;
        };

        document.title = `${projectName}-PR-Overview`;
        window.addEventListener('afterprint', restoreTitle, { once: true });
        window.print();
    });
}

function setOverviewExportReady(isReady) {
    const button = document.getElementById('download-overview-pdf');
    if (!button) return;

    button.disabled = !isReady;
    button.title = isReady
        ? 'Save this PR overview as a PDF'
        : 'PR overview is still loading';
}

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
function computeHealth(d, hasBuildData = true) {
    const rs = d.review_stats || {};

    // When Jenkins has not produced dashboard data yet, score only review/PR
    // readiness signals so the overview can still represent every live PR.
    const buildKeys = Object.keys(d).filter(k => k.endsWith(': Build Status') && !k.startsWith('Unit Tests'));
    let buildPts = hasBuildData ? 40 : null;
    let buildsPassing = hasBuildData ? true : null;
    if (hasBuildData && buildKeys.length) {
        const passing = buildKeys.filter(k => String(d[k]).toUpperCase() === 'SUCCESS').length;
        buildsPassing = passing === buildKeys.length;
        buildPts = buildsPassing ? 40 : 25 * (passing / buildKeys.length);
    }

    // Unit tests (20 pts) — full credit only when green with zero failures
    const utStatus = d['Unit Tests: Build Status'];
    const utPassed = parseInt(d['Unit Tests: Unit Tests Passed']) || 0;
    const utFailed = parseInt(d['Unit Tests: Unit Tests Failed']) || 0;
    let utPts = hasBuildData ? 20 : null;
    if (hasBuildData && utStatus != null) {
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

    const score = hasBuildData
        ? Math.round(buildPts + utPts + threadPts + approvalPts + changePts)
        : Math.round((threadPts / 15) * 40 + (approvalPts / 15) * 40 + (changePts / 10) * 20);
    return {
        score,
        buildsPassing,
        hasBuildData,
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
    const readyToMerge = prs.filter(p => p.health.band === 'healthy' && p.health.buildsPassing !== false && p.health.approvals > 0).length;
    const needsAttention = prs.filter(p => p.health.band === 'critical').length;
    const buildsFailing = prs.filter(p => p.health.buildsPassing === false).length;
    const buildMissing = prs.filter(p => !p.health.hasBuildData).length;
    const avgScore = total ? Math.round(prs.reduce((s, p) => s + p.health.score, 0) / total) : null;
    const openThreads = prs.reduce((s, p) => s + (p.health.unresolved || 0), 0);

    const tiles = [
        { label: 'Total PRs',        value: total,          color: 'var(--cisco-blue)', icon: '📋' },
        { label: 'Ready to Merge',   value: readyToMerge,   color: '#10b981', icon: '✅' },
        { label: 'Needs Attention',  value: needsAttention, color: '#ef4444', icon: '⚠️' },
        { label: 'Builds Failing',   value: buildsFailing,  color: '#f59e0b', icon: '🏗️' },
        { label: 'Build Data Missing', value: buildMissing, color: '#64748b', icon: 'ℹ️' },
        { label: 'Avg PR Health', value: avgScore == null ? 'N/A' : avgScore, color: avgScore == null ? '#64748b' : scoreColor(avgScore), icon: '🩺', suffix: avgScore == null ? '' : '/100' },
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
    const passing = prs.filter(p => p.health.buildsPassing === true).length;
    const failing = prs.filter(p => p.health.buildsPassing === false).length;
    const missing = prs.filter(p => p.health.buildsPassing == null).length;
    doughnut('buildChart',
        ['Builds Passing', 'Builds Failing', 'Build Data Missing'],
        [passing, failing, missing],
        ['#10b981', '#ef4444', '#64748b']);
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
        if (p.health.buildsPassing === false) issues.push('Build failing');
        if (!p.health.hasBuildData) issues.push('Build data unavailable');
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
    if (!prList || !Array.isArray(prList.pull_requests)) {
        document.getElementById('loading-message').innerHTML =
            `<span style="color:var(--failure);">❌ No PR data found for ${currentProject.name}.</span>`;
        return;
    }

    // Fetch each PR's dashboard file (latest revision) when available. PRs
    // without Jenkins dashboard data still appear in the overview.
    const results = await Promise.all(prList.pull_requests.map(async (pr) => {
        const arr = await fetchJSON(`pr-reports/${currentProject.name}/dashboard_${pr.number}.json`);
        const latest = Array.isArray(arr) && arr.length ? arr[0] : null;
        const hasBuildData = !!latest;
        const source = latest || pr;
        return {
            number: pr.number,
            title: source.title || pr.title,
            author: source.author || pr.author,
            pr_status: pr.pr_status || source.pr_status || 'open',
            updated_at: pr.updated_at || source.updated_at,
            created_at: pr.created_at || source.created_at,
            raw: latest || {},
            review_stats: source.review_stats || pr.review_stats,
            hasBuildData,
            health: computeHealth({ ...pr, ...source, review_stats: source.review_stats || pr.review_stats }, hasBuildData),
        };
    }));

    const prs = results.filter(Boolean);
    document.getElementById('loading-message').style.display = 'none';
    document.getElementById('overview-content').style.display = 'block';

    allPRs = prs;
    prListTimestamp = prList.timestamp;
    populateAuthorFilter(prs);
    setupFilters();
    applyFilters();
    setOverviewExportReady(true);
}

// ── Filtering (by author / date period) ─────────────────────────────────
function getPRDate(p) {
    return p.created_at || p.updated_at || null;
}

function populateAuthorFilter(prs) {
    const sel = document.getElementById('filter-author');
    if (!sel) return;
    const authors = [...new Set(prs.map(p => p.author).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
    sel.innerHTML = '<option value="">All authors</option>' +
        authors.map(a => `<option value="${a}">@${a}</option>`).join('');
}

function setupFilters() {
    ['filter-author', 'filter-period', 'filter-from', 'filter-to'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', applyFilters);
    });
    const reset = document.getElementById('filter-reset');
    if (reset) reset.addEventListener('click', () => {
        document.getElementById('filter-author').value = '';
        document.getElementById('filter-period').value = '0';
        document.getElementById('filter-from').value = '';
        document.getElementById('filter-to').value = '';
        applyFilters();
    });
}

function applyFilters() {
    const author = document.getElementById('filter-author')?.value || '';
    const period = parseInt(document.getElementById('filter-period')?.value) || 0;
    const fromStr = document.getElementById('filter-from')?.value || '';
    const toStr = document.getElementById('filter-to')?.value || '';

    const now = Date.now();
    const periodTs = period > 0 ? now - period * 86400000 : null;
    const fromTs = fromStr ? Date.parse(`${fromStr}T00:00:00`) : null;
    const toTs = toStr ? Date.parse(`${toStr}T23:59:59`) : null;

    const filtered = allPRs.filter(p => {
        if (author && p.author !== author) return false;
        if (periodTs != null || fromTs != null || toTs != null) {
            const ds = getPRDate(p);
            const t = ds ? Date.parse(ds) : NaN;
            if (isNaN(t)) return false;
            if (periodTs != null && t < periodTs) return false;
            if (fromTs != null && t < fromTs) return false;
            if (toTs != null && t > toTs) return false;
        }
        return true;
    });

    renderAll(filtered);
}

function renderAll(prs) {
    renderKPIs(prs);
    renderStatusChart(prs);
    renderHealthChart(prs);
    renderBuildChart(prs);
    renderContributors(prs);
    renderLowestTable(prs);
    renderStale(prs);
    renderAggregate(prs);

    const countEl = document.getElementById('filter-count');
    if (countEl) {
        countEl.textContent = prs.length === allPRs.length
            ? `Showing all ${allPRs.length} PRs`
            : `Showing ${prs.length} of ${allPRs.length} PRs`;
    }
    document.getElementById('ov-timestamp').textContent =
        `Analyzed ${prs.length} PRs · Data as of ${formatDate(prListTimestamp)}`;
}

window.onload = () => {
    setupOverviewExportButton();
    setOverviewExportReady(false);
    init();
};
