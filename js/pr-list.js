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

// Get status badge class
function getStatusBadgeClass(ci_status, check_status, check_conclusion) {
    // Priority: check_conclusion > check_status > ci_status
    if (check_conclusion === 'success') return 'status-success-bg';
    if (check_conclusion === 'failure') return 'status-failure-bg';
    if (check_status === 'in_progress' || check_status === 'queued') return 'status-inprogress-bg';
    if (ci_status === 'success') return 'status-success-bg';
    if (ci_status === 'failure') return 'status-failure-bg';
    if (ci_status === 'pending') return 'status-inprogress-bg';
    return 'status-warning-bg';
}

// Get status text
function getStatusText(ci_status, check_status, check_conclusion) {
    if (check_conclusion && check_conclusion !== 'none') {
        return check_conclusion.toUpperCase();
    }
    if (check_status && check_status !== 'none') {
        return check_status.replace('_', ' ').toUpperCase();
    }
    if (ci_status && ci_status !== 'unknown') {
        return ci_status.toUpperCase();
    }
    return 'UNKNOWN';
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
    
    const prListHTML = pullRequests.map(pr => {
        const statusBadgeClass = getStatusBadgeClass(pr.ci_status, pr.check_status, pr.check_conclusion);
        const statusText = getStatusText(pr.ci_status, pr.check_status, pr.check_conclusion);
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
    }).join('');
    
    prListContent.innerHTML = prListHTML;
    prListContent.style.display = 'block';
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
