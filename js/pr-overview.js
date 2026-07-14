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
let authorOptions = [];
let activeQuickFilter = 'all';

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

function nf(n) {
    return Number(n || 0).toLocaleString('en-US');
}

function getReviewStats(p) {
    return p.review_stats || p.raw?.review_stats || {};
}

function prSize(p) {
    const add = Number(p.raw?.additions || p.additions || 0);
    const del = Number(p.raw?.deletions || p.deletions || 0);
    const files = Number(p.raw?.changed_files || p.changed_files || 0);
    return { add, del, files, total: add + del };
}

function getRiskReasons(p) {
    const reasons = [];
    if (p.health.buildsPassing === false) reasons.push('Build failing');
    if (!p.health.hasBuildData) reasons.push('Build data unavailable');
    if (p.health.utFailed > 0) reasons.push('Unit test failures');
    if (p.health.unresolved > 0) reasons.push('Open review threads');
    if (p.health.changesReq > 0) reasons.push('Changes requested');
    if (p.health.approvals === 0) reasons.push('No approval');
    if (ageDays(p.updated_at) >= 14) reasons.push('No recent movement');
    return reasons;
}

function readinessBucket(p) {
    if (p.pr_status === 'draft') return 'Draft';
    if (p.health.changesReq > 0) return 'Changes Requested';
    if (p.health.unresolved > 0) return 'Threads Open';
    if (p.health.buildsPassing === false) return 'Build Blocked';
    if (p.health.approvals > 0 && p.health.buildsPassing !== false) return 'Ready';
    return 'Needs Review';
}

function quickFilterMatches(p) {
    if (activeQuickFilter === 'all') return true;
    if (activeQuickFilter === 'ready') return readinessBucket(p) === 'Ready';
    if (activeQuickFilter === 'attention') return p.health.band === 'critical' || getRiskReasons(p).length >= 3;
    if (activeQuickFilter === 'stale') return ageDays(p.updated_at) >= 14;
    if (activeQuickFilter === 'copilot') return (getReviewStats(p).copilot_open || 0) > 0;
    if (activeQuickFilter === 'waterfall') return p.is_waterfall;
    return true;
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
        { label: 'Total PRs',        value: total,          color: 'var(--cisco-blue)', marker: 'Total' },
        { label: 'Ready to Merge',   value: readyToMerge,   color: '#10b981', marker: 'Ready' },
        { label: 'Needs Attention',  value: needsAttention, color: '#ef4444', marker: 'Risk' },
        { label: 'Builds Failing',   value: buildsFailing,  color: '#f59e0b', marker: 'Build' },
        { label: 'Build Data Missing', value: buildMissing, color: '#64748b', marker: 'Data' },
        { label: 'Avg PR Health', value: avgScore == null ? 'N/A' : avgScore, color: avgScore == null ? '#64748b' : scoreColor(avgScore), marker: 'Score', suffix: avgScore == null ? '' : '/100' },
        { label: 'Open Review Threads', value: openThreads, color: '#a78bfa', marker: 'Review' },
    ];

    document.getElementById('kpi-grid').innerHTML = tiles.map(t => `
        <div class="ov-kpi" style="border-top:3px solid ${t.color};">
            <div class="ov-kpi-marker" style="color:${t.color};border-color:${t.color};">${t.marker}</div>
            <div class="ov-kpi-value" style="color:${t.color};">${t.value}<span class="ov-kpi-suffix">${t.suffix || ''}</span></div>
            <div class="ov-kpi-label">${t.label}</div>
        </div>
    `).join('');
}

function renderExecutiveSummary(prs) {
    const total = prs.length;
    const approved = prs.filter(p => p.pr_status === 'approved').length;
    const draft = prs.filter(p => p.pr_status === 'draft').length;
    const reviewRequired = prs.filter(p => p.pr_status === 'review_required').length;
    const changesRequested = prs.filter(p => p.pr_status === 'changes_requested').length;
    const buildMissing = prs.filter(p => !p.health.hasBuildData).length;
    const avgScore = total ? Math.round(prs.reduce((sum, p) => sum + p.health.score, 0) / total) : null;
    const avgText = avgScore == null ? 'N/A' : `${avgScore}/100`;
    const summaryEl = document.getElementById('overview-summary-copy');
    const stripEl = document.getElementById('overview-status-strip');

    document.getElementById('overview-heading').textContent = `${currentProject.name} PR Overview`;
    summaryEl.textContent = `${total} active pull requests analyzed. Average health is ${avgText}, with ${approved} approved, ${reviewRequired} awaiting review, and ${changesRequested} with requested changes.`;

    const chips = [
        { label: 'Approved', value: approved, color: '#10b981' },
        { label: 'Review Required', value: reviewRequired, color: '#3b82f6' },
        { label: 'Draft', value: draft, color: '#f59e0b' },
        { label: 'Changes Requested', value: changesRequested, color: '#ef4444' },
        { label: 'Build Data Missing', value: buildMissing, color: '#64748b' },
    ];

    stripEl.innerHTML = chips.map(chip => `
        <div class="ov-status-chip" style="--chip-color:${chip.color};">
            <span>${chip.label}</span>
            <strong>${chip.value}</strong>
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

function renderStatusTrend(prs) {
    const canvasId = 'statusTrendChart';
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (charts[canvasId]) charts[canvasId].destroy();

    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        days.push(d);
    }
    const labels = days.map(d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const keys = ['approved', 'review_required', 'draft', 'changes_requested'];
    const values = Object.fromEntries(keys.map(k => [k, Array(days.length).fill(0)]));

    prs.forEach(p => {
        const t = Date.parse(p.updated_at || p.created_at || '');
        if (isNaN(t)) return;
        const d = new Date(t);
        d.setHours(0, 0, 0, 0);
        const index = days.findIndex(day => day.getTime() === d.getTime());
        if (index < 0) return;
        const status = keys.includes(p.pr_status) ? p.pr_status : 'review_required';
        values[status][index]++;
    });

    charts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: keys.map(k => ({
                label: STATUS_META[k]?.label || k,
                data: values[k],
                backgroundColor: STATUS_META[k]?.color || '#64748b',
                borderRadius: 4,
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true, ticks: { color: '#cbd5e1', maxRotation: 0 }, grid: { color: 'rgba(148,163,184,0.12)' } },
                y: { stacked: true, beginAtZero: true, ticks: { color: '#cbd5e1', precision: 0 }, grid: { color: 'rgba(148,163,184,0.12)' } }
            },
            plugins: {
                legend: { position: 'bottom', labels: { color: '#cbd5e1', boxWidth: 12 } },
                tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y}` } }
            }
        }
    });
}

function renderQuickFilterChips(prs) {
    const box = document.getElementById('quick-filter-chips');
    if (!box) return;
    const chips = [
        { key: 'all', label: 'All PRs', count: prs.length },
        { key: 'ready', label: 'Ready', count: prs.filter(p => readinessBucket(p) === 'Ready').length },
        { key: 'attention', label: 'Needs Attention', count: prs.filter(p => p.health.band === 'critical' || getRiskReasons(p).length >= 3).length },
        { key: 'stale', label: 'Stale 14d+', count: prs.filter(p => ageDays(p.updated_at) >= 14).length },
        { key: 'copilot', label: 'Copilot Open', count: prs.filter(p => (getReviewStats(p).copilot_open || 0) > 0).length },
        { key: 'waterfall', label: 'Waterfall', count: prs.filter(p => p.is_waterfall).length },
    ];

    box.innerHTML = chips.map(chip => `
        <button type="button" class="ov-quick-chip ${activeQuickFilter === chip.key ? 'active' : ''}" data-filter="${chip.key}">
            <span>${chip.label}</span><strong>${chip.count}</strong>
        </button>
    `).join('');

    box.querySelectorAll('.ov-quick-chip').forEach(button => {
        button.addEventListener('click', () => {
            activeQuickFilter = button.dataset.filter || 'all';
            applyFilters();
        });
    });
}

function renderAgingBuckets(prs) {
    const buckets = [
        { label: '0-2 days', min: 0, max: 2, color: '#10b981' },
        { label: '3-7 days', min: 3, max: 7, color: '#3b82f6' },
        { label: '8-14 days', min: 8, max: 14, color: '#f59e0b' },
        { label: '15-30 days', min: 15, max: 30, color: '#ef4444' },
        { label: '30+ days', min: 31, max: Infinity, color: '#a78bfa' },
    ];
    const total = prs.length || 1;
    const rows = buckets.map(bucket => {
        const count = prs.filter(p => {
            const age = ageDays(p.created_at);
            return age != null && age >= bucket.min && age <= bucket.max;
        }).length;
        return `
            <div class="ov-bucket-row">
                <div class="ov-bucket-label"><span>${bucket.label}</span><strong>${count}</strong></div>
                <div class="ov-progress-track"><div class="ov-progress-bar" style="width:${(count / total) * 100}%;background:${bucket.color};"></div></div>
            </div>`;
    }).join('');
    document.getElementById('aging-buckets').innerHTML = rows || '<p class="ov-subtle">No data</p>';
}

function renderCopilotActivity(prs) {
    const totals = prs.reduce((acc, p) => {
        const rs = getReviewStats(p);
        acc.comments += rs.copilot_comments || 0;
        acc.open += rs.copilot_open || 0;
        acc.addressed += rs.copilot_addressed || 0;
        acc.withCopilot += (rs.copilot_comments || 0) > 0 ? 1 : 0;
        return acc;
    }, { comments: 0, open: 0, addressed: 0, withCopilot: 0 });
    const addressedRate = totals.comments ? Math.round((totals.addressed / totals.comments) * 100) : 0;
    const tiles = [
        { label: 'Copilot Comments', value: nf(totals.comments), tone: '#3b82f6' },
        { label: 'Open Copilot Items', value: nf(totals.open), tone: totals.open ? '#f59e0b' : '#10b981' },
        { label: 'Addressed Items', value: nf(totals.addressed), tone: '#10b981' },
        { label: 'PRs With Copilot', value: nf(totals.withCopilot), tone: '#a78bfa' },
        { label: 'Addressed Rate', value: `${addressedRate}%`, tone: addressedRate >= 70 ? '#10b981' : '#f59e0b' },
    ];
    document.getElementById('copilot-activity').innerHTML = tiles.map(t => `
        <div class="ov-insight-tile" style="border-color:${t.tone};">
            <strong style="color:${t.tone};">${t.value}</strong>
            <span>${t.label}</span>
        </div>
    `).join('');
}

function renderOwnerWorkload(prs) {
    const byAuthor = {};
    prs.forEach(p => {
        const author = p.author || 'unknown';
        if (!byAuthor[author]) byAuthor[author] = { count: 0, critical: 0, unresolved: 0, score: 0 };
        byAuthor[author].count++;
        byAuthor[author].critical += p.health.band === 'critical' ? 1 : 0;
        byAuthor[author].unresolved += p.health.unresolved || 0;
        byAuthor[author].score += p.health.score || 0;
    });
    const rows = Object.entries(byAuthor)
        .map(([author, data]) => ({ author, ...data, avg: Math.round(data.score / data.count) }))
        .sort((a, b) => b.count - a.count || b.critical - a.critical)
        .slice(0, 8);
    document.getElementById('owner-workload').innerHTML = rows.map(row => `
        <button type="button" class="ov-workload-row" data-author="${row.author}">
            <span class="ov-workload-owner">@${row.author}</span>
            <span>${row.count} PRs</span>
            <span>${row.critical} critical</span>
            <span>${row.unresolved} threads</span>
            <strong style="color:${scoreColor(row.avg)};">${row.avg}</strong>
        </button>
    `).join('') || '<p class="ov-subtle">No data</p>';

    document.querySelectorAll('.ov-workload-row').forEach(button => {
        button.addEventListener('click', () => {
            const input = document.getElementById('filter-author');
            input.value = button.dataset.author || '';
            applyFilters();
        });
    });
}

function renderApprovalReadiness(prs) {
    const buckets = ['Ready', 'Needs Review', 'Threads Open', 'Build Blocked', 'Changes Requested', 'Draft'];
    const counts = Object.fromEntries(buckets.map(bucket => [bucket, 0]));
    prs.forEach(p => counts[readinessBucket(p)]++);
    const colors = {
        'Ready': '#10b981',
        'Needs Review': '#3b82f6',
        'Threads Open': '#f59e0b',
        'Build Blocked': '#ef4444',
        'Changes Requested': '#ef4444',
        'Draft': '#64748b',
    };
    document.getElementById('approval-readiness').innerHTML = buckets.map(bucket => `
        <div class="ov-readiness-row">
            <span><i style="background:${colors[bucket]};"></i>${bucket}</span>
            <strong>${counts[bucket]}</strong>
        </div>
    `).join('');
}

function renderLargestPRs(prs) {
    const largest = [...prs]
        .map(p => ({ ...p, size: prSize(p) }))
        .filter(p => p.size.total > 0 || p.size.files > 0)
        .sort((a, b) => (b.size.total + b.size.files * 40) - (a.size.total + a.size.files * 40))
        .slice(0, 8);
    const rows = largest.map(p => `
        <tr onclick="window.location.href='dashboard.html?project=${currentProject.name}&pr=${p.number}'">
            <td class="ov-td-num">#${p.number}</td>
            <td class="ov-td-title">${p.title || ''}<div class="ov-td-author">@${p.author}</div></td>
            <td>+${nf(p.size.add)} / -${nf(p.size.del)}</td>
            <td>${nf(p.size.files)}</td>
            <td style="color:${scoreColor(p.health.score)};font-weight:700;">${p.health.score}</td>
        </tr>
    `).join('');
    document.getElementById('largest-prs').innerHTML = rows ? `
        <table class="ov-table">
            <thead><tr><th>PR</th><th>Title</th><th>Lines</th><th>Files</th><th>Health</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>` : '<p class="ov-subtle">No size data available for this filtered set.</p>';
}

function renderNoMovementPRs(prs) {
    const rows = [...prs]
        .map(p => ({ ...p, idle: ageDays(p.updated_at) }))
        .filter(p => p.idle != null)
        .sort((a, b) => b.idle - a.idle)
        .slice(0, 10)
        .map(p => `
            <tr onclick="window.location.href='dashboard.html?project=${currentProject.name}&pr=${p.number}'">
                <td class="ov-td-num">#${p.number}</td>
                <td class="ov-td-title">${p.title || ''}<div class="ov-td-author">@${p.author}</div></td>
                <td>${p.idle}d</td>
                <td>${formatDate(p.updated_at)}</td>
                <td>${(STATUS_META[p.pr_status]?.label) || p.pr_status || 'Open'}</td>
            </tr>
        `).join('');
    document.getElementById('no-movement-prs').innerHTML = rows ? `
        <table class="ov-table">
            <thead><tr><th>PR</th><th>Title</th><th>Idle</th><th>Last Updated</th><th>Status</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>` : '<p class="ov-subtle">No data</p>';
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
            additions: pr.additions || source.additions || 0,
            deletions: pr.deletions || source.deletions || 0,
            changed_files: pr.changed_files || source.changed_files || 0,
            is_waterfall: !!(pr.is_waterfall || source.is_waterfall),
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
    authorOptions = [...new Set(prs.map(p => p.author).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
    renderAuthorSuggestions('');
}

function renderAuthorSuggestions(query) {
    const box = document.getElementById('author-suggestions');
    if (!box) return;

    const normalized = query.trim().toLowerCase().replace(/^@/, '');
    const matches = authorOptions
        .filter(author => !normalized || author.toLowerCase().includes(normalized))
        .sort((a, b) => {
            const aLower = a.toLowerCase();
            const bLower = b.toLowerCase();
            const aStarts = normalized && aLower.startsWith(normalized) ? 0 : 1;
            const bStarts = normalized && bLower.startsWith(normalized) ? 0 : 1;
            if (aStarts !== bStarts) return aStarts - bStarts;
            return a.localeCompare(b);
        })
        .slice(0, 8);

    if (!matches.length) {
        box.hidden = true;
        box.innerHTML = '';
        return;
    }

    box.innerHTML = matches.map(author => `
        <button type="button" class="ov-author-suggestion" data-author="${author}">
            <span>@${author}</span>
        </button>
    `).join('');
    box.hidden = false;

    box.querySelectorAll('.ov-author-suggestion').forEach(button => {
        button.addEventListener('mousedown', event => {
            event.preventDefault();
            const input = document.getElementById('filter-author');
            input.value = button.dataset.author || '';
            box.hidden = true;
            applyFilters();
        });
    });
}

function setupFilters() {
    ['filter-period', 'filter-from', 'filter-to'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', applyFilters);
    });
    const authorInput = document.getElementById('filter-author');
    const suggestions = document.getElementById('author-suggestions');
    if (authorInput) {
        authorInput.addEventListener('input', () => {
            renderAuthorSuggestions(authorInput.value);
            applyFilters();
        });
        authorInput.addEventListener('focus', () => renderAuthorSuggestions(authorInput.value));
        authorInput.addEventListener('blur', () => {
            window.setTimeout(() => {
                if (suggestions) suggestions.hidden = true;
            }, 120);
        });
    }
    const reset = document.getElementById('filter-reset');
    if (reset) reset.addEventListener('click', () => {
        document.getElementById('filter-author').value = '';
        if (suggestions) suggestions.hidden = true;
        document.getElementById('filter-period').value = '0';
        document.getElementById('filter-from').value = '';
        document.getElementById('filter-to').value = '';
        activeQuickFilter = 'all';
        applyFilters();
    });
}

function applyFilters() {
    const author = (document.getElementById('filter-author')?.value || '').trim().toLowerCase().replace(/^@/, '');
    const period = parseInt(document.getElementById('filter-period')?.value) || 0;
    const fromStr = document.getElementById('filter-from')?.value || '';
    const toStr = document.getElementById('filter-to')?.value || '';

    const now = Date.now();
    const periodTs = period > 0 ? now - period * 86400000 : null;
    const fromTs = fromStr ? Date.parse(`${fromStr}T00:00:00`) : null;
    const toTs = toStr ? Date.parse(`${toStr}T23:59:59`) : null;

    const baseFiltered = allPRs.filter(p => {
        if (author && !String(p.author || '').toLowerCase().includes(author)) return false;
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

    renderQuickFilterChips(baseFiltered);
    const filtered = baseFiltered.filter(quickFilterMatches);

    renderAll(filtered);
}

function renderAll(prs) {
    renderExecutiveSummary(prs);
    renderKPIs(prs);
    renderStatusChart(prs);
    renderHealthChart(prs);
    renderBuildChart(prs);
    renderAgingBuckets(prs);
    renderStatusTrend(prs);
    renderCopilotActivity(prs);
    renderOwnerWorkload(prs);
    renderApprovalReadiness(prs);
    renderLargestPRs(prs);
    renderNoMovementPRs(prs);
    renderContributors(prs);
    renderLowestTable(prs);
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
