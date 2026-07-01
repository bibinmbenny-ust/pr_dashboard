// Project Configuration - Must match dashboard.js
const PROJECT_CONFIG = {
    'FXOS': {
        name: 'FXOS',
        repo: 'cisco-netsec-sandbox/netsec-fxos-pr-dashboard-poc1',
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

// Fetch PR list with retry
async function fetchPRList(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const cacheBuster = `?v=${new Date().getTime()}`;
            const response = await fetch(url + cacheBuster, { 
                credentials: "include", 
                cache: "no-store" 
            });
            
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error(`PR list file not found at ${url}`);
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log("PR list fetched successfully");
            return data;
        } catch (error) {
            console.error(`Attempt ${i + 1} failed: ${error.message}`);
            if (i === maxRetries - 1) {
                return null;
            }
            const delay = Math.pow(2, i) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Get PR status badge class (reflects PR review/lifecycle status, not build CI)
function getStatusBadgeClass(pr_status) {
    switch (pr_status) {
        case 'merged':
        case 'approved':          return 'status-success-bg';
        case 'closed':
        case 'changes_requested': return 'status-failure-bg';
        case 'review_required':
        case 'open':              return 'status-inprogress-bg';
        case 'draft':
        default:                  return 'status-warning-bg';
    }
}

// Get PR status display text
function getStatusText(pr_status) {
    const labels = {
        merged: 'MERGED',
        approved: 'APPROVED',
        closed: 'CLOSED',
        changes_requested: 'CHANGES REQUESTED',
        review_required: 'REVIEW REQUIRED',
        open: 'OPEN',
        draft: 'DRAFT'
    };
    return labels[pr_status] || 'OPEN';
}

// Format date
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false
        });
    } catch (e) {
        return 'Invalid Date';
    }
}

// Render PR list
// ── State for filtering / sorting / pagination ──────────────────────────
const PAGE_SIZE = 10;
let allPRs = [];          // full, unfiltered list
let filteredPRs = [];     // after search/sort/date filters
let currentPage = 1;

// Build a single PR card's HTML
function renderPRItem(pr) {
    const statusBadgeClass = getStatusBadgeClass(pr.pr_status);
    const statusText = getStatusText(pr.pr_status);
    const updatedDate = formatDate(pr.updated_at);
    const isDraft = pr.draft ? '<span style="opacity: 0.6; font-size: 0.85rem;">[DRAFT]</span>' : '';

    return `
        <div class="pr-list-item" onclick="window.location.href='dashboard.html?project=${currentProject.name}&pr=${pr.number}'">
            <div class="pr-list-header">
                <div class="pr-list-title">
                    <h3>
                        <a href="dashboard.html?project=${currentProject.name}&pr=${pr.number}">
                            #${pr.number} - ${pr.title}
                        </a>
                        ${isDraft}
                    </h3>
                    <div class="pr-list-meta">
                        <span>by <strong>@${pr.author}</strong></span>
                        <span>&middot;</span>
                        <span>${pr.head_branch} → ${pr.base_branch}</span>
                        <span>&middot;</span>
                        <span>Updated: ${updatedDate}</span>
                    </div>
                </div>
                <span class="status-badge ${statusBadgeClass}">${statusText}</span>
            </div>
            ${pr.labels && pr.labels.length > 0 ? `
                <div class="pr-labels">
                    ${pr.labels.map(label => `<span class="pr-label">${label}</span>`).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

// Apply current search / sort / date-range settings to allPRs
function applyFilters() {
    const searchEl = document.getElementById('pr-search');
    const sortEl = document.getElementById('pr-sort');
    const fromEl = document.getElementById('pr-date-from');
    const toEl = document.getElementById('pr-date-to');

    const searchTerm = (searchEl?.value || '').trim();
    const sortMode = sortEl?.value || 'default';
    const fromVal = fromEl?.value || '';
    const toVal = toEl?.value || '';

    let list = allPRs.slice();

    // Search by PR number (substring match on the number)
    if (searchTerm) {
        list = list.filter(pr => String(pr.number).includes(searchTerm));
    }

    // Date range on updated_at (inclusive)
    if (fromVal) {
        const fromTime = new Date(fromVal + 'T00:00:00').getTime();
        list = list.filter(pr => {
            const t = new Date(pr.updated_at).getTime();
            return !isNaN(t) && t >= fromTime;
        });
    }
    if (toVal) {
        const toTime = new Date(toVal + 'T23:59:59').getTime();
        list = list.filter(pr => {
            const t = new Date(pr.updated_at).getTime();
            return !isNaN(t) && t <= toTime;
        });
    }

    // Sort by author
    if (sortMode === 'author-asc' || sortMode === 'author-desc') {
        const dir = sortMode === 'author-asc' ? 1 : -1;
        list.sort((a, b) => {
            const cmp = String(a.author || '').toLowerCase()
                .localeCompare(String(b.author || '').toLowerCase());
            if (cmp !== 0) return cmp * dir;
            return (b.number || 0) - (a.number || 0);
        });
    }

    filteredPRs = list;
    currentPage = 1;
    renderCurrentPage();
}

// Render the current page of filteredPRs + pagination + results info
function renderCurrentPage() {
    const prListContent = document.getElementById('pr-list-content');
    const paginationEl = document.getElementById('pr-pagination');
    const infoEl = document.getElementById('pr-results-info');

    const total = filteredPRs.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;

    if (total === 0) {
        prListContent.innerHTML = `
            <div class="pr-empty-state">
                <p>No pull requests match your filters.</p>
            </div>
        `;
        prListContent.style.display = 'block';
        paginationEl.style.display = 'none';
        infoEl.style.display = 'block';
        infoEl.textContent = 'Showing 0 of ' + allPRs.length + ' PRs';
        return;
    }

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const endIdx = Math.min(startIdx + PAGE_SIZE, total);
    const pageItems = filteredPRs.slice(startIdx, endIdx);

    prListContent.innerHTML = pageItems.map(renderPRItem).join('');
    prListContent.style.display = 'block';

    // Results info
    infoEl.style.display = 'block';
    infoEl.innerHTML = `Showing <strong>${startIdx + 1}–${endIdx}</strong> of <strong>${total}</strong> ${total === 1 ? 'PR' : 'PRs'}` +
        (total !== allPRs.length ? ` <span style="opacity:0.7;">(filtered from ${allPRs.length})</span>` : '');

    renderPagination(totalPages);
}

// Build pagination controls
function renderPagination(totalPages) {
    const paginationEl = document.getElementById('pr-pagination');

    if (totalPages <= 1) {
        paginationEl.style.display = 'none';
        paginationEl.innerHTML = '';
        return;
    }

    // Windowed page numbers around current page
    const pages = [];
    const windowSize = 2;
    const push = (p) => pages.push(p);

    push(1);
    let rangeStart = Math.max(2, currentPage - windowSize);
    let rangeEnd = Math.min(totalPages - 1, currentPage + windowSize);
    if (rangeStart > 2) pages.push('...');
    for (let p = rangeStart; p <= rangeEnd; p++) push(p);
    if (rangeEnd < totalPages - 1) pages.push('...');
    if (totalPages > 1) push(totalPages);

    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';

    const numbersHTML = pages.map(p => {
        if (p === '...') {
            return `<span class="pr-page-ellipsis">…</span>`;
        }
        const active = p === currentPage ? 'active' : '';
        return `<button type="button" class="pr-page-btn ${active}" data-page="${p}">${p}</button>`;
    }).join('');

    paginationEl.innerHTML = `
        <button type="button" class="pr-page-btn pr-page-nav" data-page="prev" ${prevDisabled}>← Prev</button>
        ${numbersHTML}
        <button type="button" class="pr-page-btn pr-page-nav" data-page="next" ${nextDisabled}>Next →</button>
    `;
    paginationEl.style.display = 'flex';

    paginationEl.querySelectorAll('.pr-page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.page;
            if (target === 'prev') {
                if (currentPage > 1) currentPage--;
            } else if (target === 'next') {
                if (currentPage < totalPages) currentPage++;
            } else {
                currentPage = parseInt(target, 10);
            }
            renderCurrentPage();
            document.getElementById('pr-list-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

// Wire up toolbar controls
function initToolbar() {
    const searchEl = document.getElementById('pr-search');
    const sortEl = document.getElementById('pr-sort');
    const fromEl = document.getElementById('pr-date-from');
    const toEl = document.getElementById('pr-date-to');
    const clearEl = document.getElementById('pr-clear-filters');

    searchEl?.addEventListener('input', applyFilters);
    sortEl?.addEventListener('change', applyFilters);
    fromEl?.addEventListener('change', applyFilters);
    toEl?.addEventListener('change', applyFilters);

    clearEl?.addEventListener('click', () => {
        if (searchEl) searchEl.value = '';
        if (sortEl) sortEl.value = 'default';
        if (fromEl) fromEl.value = '';
        if (toEl) toEl.value = '';
        applyFilters();
    });

    document.getElementById('pr-toolbar').style.display = 'flex';
}

// Render PR list (entry point)
function renderPRList(prData) {
    const prListContent = document.getElementById('pr-list-content');
    const pullRequests = prData.pull_requests || [];

    if (pullRequests.length === 0) {
        prListContent.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: var(--text-secondary);">
                <p>No open pull requests found for this project.</p>
            </div>
        `;
        prListContent.style.display = 'block';
        return;
    }

    allPRs = pullRequests;
    filteredPRs = pullRequests.slice();
    initToolbar();
    applyFilters();
}

// Initialize page
async function initializePage() {
    const urlParams = new URLSearchParams(window.location.search);
    const projectParam = urlParams.get("project");
    
    // Default to FXOS if no project specified
    const projectKey = projectParam ? projectParam.toUpperCase() : 'FXOS';
    
    // Check if project exists
    if (!PROJECT_CONFIG[projectKey]) {
        document.getElementById('loading-message').innerHTML = `
            <span style="color: var(--failure);">⚠️ Unknown project: ${projectKey}</span><br><br>
            Available projects: ${Object.keys(PROJECT_CONFIG).join(', ')}<br><br>
            <a href="index.html" class="btn">Back to Projects</a>
        `;
        return;
    }
    
    currentProject = PROJECT_CONFIG[projectKey];
    
    // Update page title and header
    document.title = `${currentProject.name} - Pull Requests`;
    document.getElementById('project-title').textContent = `${currentProject.name} Pull Requests`;
    document.getElementById('project-title').insertAdjacentHTML('beforeend', 
        `<div style="font-size: 0.85rem; opacity: 0.8; font-weight: 400; margin-top: 0.3rem;">${currentProject.displayName}</div>`
    );

    // Point the overview button at this project
    const overviewLink = document.getElementById('overview-link');
    if (overviewLink) overviewLink.href = `pr-overview.html?project=${currentProject.name}`;
    
    // Fetch PR list
    const prListPath = `pr-reports/${currentProject.name}/pr-list.json`;
    const prData = await fetchPRList(prListPath);
    
    if (!prData) {
        document.getElementById('loading-message').innerHTML = `
            <span style="color: var(--failure);">❌ Failed to load PR list</span><br><br>
            Could not fetch data from: <code>${prListPath}</code><br><br>
            The GitHub Action may not have run yet, or the file doesn't exist.<br><br>
            <a href="index.html" class="btn">Back to Projects</a>
        `;
        return;
    }
    
    // Hide loading message
    document.getElementById('loading-message').style.display = 'none';
    
    // Update PR count badge
    const prCount = prData.total_count || 0;
    const countBadge = document.getElementById('pr-count-badge');
    countBadge.textContent = `${prCount} PR${prCount !== 1 ? 's' : ''}`;
    countBadge.className = prCount > 0 ? 'status-badge status-success-bg' : 'status-badge status-warning-bg';
    
    // Update timestamp if available
    if (prData.timestamp) {
        const timestampEl = document.createElement('p');
        timestampEl.style.cssText = 'font-size: 0.85rem; opacity: 0.7; margin-top: 0.5rem;';
        timestampEl.textContent = `Last updated: ${formatDate(prData.timestamp)}`;
        document.querySelector('.card-header').appendChild(timestampEl);
    }
    
    // Render PR list
    renderPRList(prData);
}

// Load on page load
window.onload = initializePage;
