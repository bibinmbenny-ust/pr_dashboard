// Project Configuration - Add new projects here
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

// Global variables - will be set based on selected project
let repoBaseUrl = "";
let commitBaseUrl = "";
let dataPathBase = "";
let currentProject = null; 

// Exponential backoff retry mechanism for fetching data
async function fetchWithRetry(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            // Add cache-busting query param
            const cacheBuster = `?v=${new Date().getTime()}`;
            const response = await fetch(url + cacheBuster, { credentials: "include", cache: "no-store" });
            
            if (!response.ok) {
                if (response.status === 404) {
                     throw new Error(`File not found at ${url}.`);
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                console.log("Data fetched successfully from path.");
                return data;
            }
            throw new Error("Fetched data is empty or not an array.");
        } catch (error) {
            console.error(`Attempt ${i + 1} failed: ${error.message}`);
            if (i === maxRetries - 1) {
                return null; // All retries failed
            }
            const delay = Math.pow(2, i) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// --- Dashboard Utility Functions ---

function getStatusClass(status) {
    status = String(status).toUpperCase();
    if (status === "SUCCESS" || status === "TRUE" || status === "PASSING BUILD") return "status-success";
    if (status === "FAILURE" || status === "FALSE" || status === "FAILING BUILD") return "status-failure";
    if (status === "IN PROGRESS" || status === "PENDING" || status === "UNKNOWN" || status === "OPEN") return "status-in-progress";
    return "status-warning"; // Default for 'WARNING' or other statuses
}

function getStatusBgClass(status) {
    status = String(status).toUpperCase();
    if (status.includes("SUCCESS") || status.includes("PASSING")) return "status-success-bg";
    if (status.includes("FAILURE") || status.includes("FAILING")) return "status-failure-bg";
    if (status.includes("IN PROGRESS") || status.includes("PENDING")) return "status-inprogress-bg";
    return "status-warning-bg";
}

// Determines the overall build status for a single revision
function getOverallStatus(data) {
    const buildStatusKeys = Object.keys(data).filter(key => key.includes("Build Status"));
    let hasFailure = false;
    let hasInProgressOrPending = false;
    let hasSuccess = false;

    // If no build status keys are found, the status is UNKNOWN
    if (buildStatusKeys.length === 0) {
         return "UNKNOWN";
    }

    for (const key of buildStatusKeys) {
        const status = String(data[key]).toUpperCase();
        if (status === "FAILURE") {
            hasFailure = true;
        } else if (status === "IN PROGRESS" || status === "PENDING" || status === "UNKNOWN") {
            hasInProgressOrPending = true;
        } else if (status === "SUCCESS") {
            hasSuccess = true;
        }
    }

    if (hasFailure) return "FAILING BUILD";
    if (hasInProgressOrPending) return "IN PROGRESS";
    if (hasSuccess) return "PASSING BUILD";
    
    return "UNKNOWN"; // If only 'N/A' or other non-standard statuses are present
}

function formatCiRunTime(timestamp) {
    if (!timestamp) return 'N/A';
    try {
        const date = new Date(timestamp);
        // Example output: Nov 17, 10:00 UTC
        return date.toLocaleString('en-US', { 
            month: 'short', day: 'numeric', 
            hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short'
        });
    } catch (e) {
        return 'Invalid Date';
    }
}

function calculateDuration(seconds) {
    if (seconds === undefined || seconds === null) return 'N/A';
    const minutes = Math.round(seconds / 60);
    return `${minutes} min`;
}

// Helper to render the failure card if data exists
function renderFailureCard(data) {
    // Only render if both failed_stage AND error_message are present in the JSON
    if (!data.failed_stage || !data.error_message) return '';

    return `
        <div class="failure-card">
            <h3>Failure Details</h3>
            <p><strong>Failed Stage:</strong> <span>${data.failed_stage}</span></p>
            <p><strong>Error Message:</strong> <span>${data.error_message}</span></p>
        </div>
    `;
}

// Helper to render the new General Metrics card
function renderGeneralMetricsCard(data) {
    // Define specific keys for this card
    const keys = [
        'updated_at', 'pr_state', 'base_branch', 'head_branch', 
        'ci_start_time', 'jenkins_build_number', 'jenkins_build_url'
    ];

    // Check if at least one relevant key exists to avoid empty card
    const hasGeneralMetrics = keys.some(key => data.hasOwnProperty(key));
    if (!hasGeneralMetrics) return '';

    const jenkinsUrl = data.jenkins_build_url || '#';
    const buildNum = data.jenkins_build_number || 'N/A';
    const prState = data.pr_state ? data.pr_state.toUpperCase() : 'N/A';
    // Determine status color for PR state (OPEN is treated as In Progress)
    const stateClass = getStatusClass(prState);

    return `
        <div class="card">
            <div class="card-header"><h3>General Metrics</h3></div>
            <div class="pr-metadata-grid">
                <div class="pr-metadata-left">
                     <p><strong>PR State:</strong> <span class="status-badge ${getStatusBgClass(prState === 'OPEN' ? 'IN PROGRESS' : prState)}">${prState}</span></p>
                     <p><strong>Base Branch:</strong> <span style="font-family:monospace; color:var(--cisco-blue);">${data.base_branch || 'N/A'}</span></p>
                     <p><strong>Head Branch:</strong> <span style="font-family:monospace; color:var(--cisco-blue);">${data.head_branch || 'N/A'}</span></p>
                </div>
                <div class="pr-metadata-right">
                     <p><strong>CI Start:</strong> ${formatCiRunTime(data.ci_start_time)}</p>
                     <p><strong>Last Update:</strong> ${formatCiRunTime(data.updated_at)}</p>
                     <p><strong>Jenkins Build:</strong> <a href="${jenkinsUrl}" target="_blank" class="btn" style="padding:0.2rem 0.5rem; font-size:0.85rem; margin-top:0;">#${buildNum}</a></p>
                </div>
            </div>
        </div>
    `;
}

// Helper to render build metrics (Unit Tests, Static Analysis, etc.)
function renderMetrics(data) {
    const metricsHtml = [];

    // Keys to ignore - added General Metrics keys here
    const ignoredKeys = new Set([
        'author', 'pr_id', 'title', 'revision', 'changed_files', 'additions', 'deletions', 'merged',
        'created_at', 'commit_hash', 'ci_duration_seconds', 'failed_stage', 'error_message',
        'changed_files_details',
        // General Metrics keys to exclude from generic list
        'updated_at', 'pr_state', 'base_branch', 'head_branch', 
        'ci_start_time', 'jenkins_build_number', 'jenkins_build_url'
    ]);

    // Grouping metrics by stage prefix
    const metricGroups = {};
    Object.keys(data).forEach(key => {
        if (!ignoredKeys.has(key)) {
            const parts = key.split(':');
            const stage = parts.length > 1 ? parts[0].trim() : 'General Metrics';
            const metricName = parts.length > 1 ? parts.slice(1).join(':').trim() : key;

            if (!metricGroups[stage]) {
                metricGroups[stage] = [];
            }
            metricGroups[stage].push({ name: metricName, value: data[key] });
        }
    });
    
    // Sort groups, pushing "Unit Tests" to the top
    const sortedGroupNames = Object.keys(metricGroups).sort((a, b) => {
         if (a === "Unit Tests") return -1;
         if (b === "Unit Tests") return 1;
         return a.localeCompare(b);
    });


    for (const stage of sortedGroupNames) {
        const metrics = metricGroups[stage];
        let stageStatus = data[`${stage}: Build Status`]; // Check for explicit build status
        
        // If no explicit status, infer from metrics (e.g., if stage is 'ARMV' but no 'ARMV: Build Status')
        if (!stageStatus) {
             const hasFailure = metrics.some(m => (m.name.includes('Issues') || m.name.includes('Failed')) && parseFloat(m.value) > 0);
             stageStatus = hasFailure ? "FAILURE" : "SUCCESS";
        }
        
        // Render the build status if available, otherwise just use the stage name
        const summaryTitle = data.hasOwnProperty(`${stage}: Build Status`)
            ? `<span class="${getStatusClass(stageStatus)}">${stage} - ${String(stageStatus).toUpperCase()}</span>`
            : `<span class="${getStatusClass(stageStatus)}">${stage}</span>`;
            
        // Render detailed metrics
        const metricContent = metrics.map(metric => {
            let value = metric.value ?? 'N/A'; // Default to N/A
            let metricClass = '';
            
            if (metric.name === 'Build Status') return null; // Don't show build status twice

            // Special handling for percentages or known values
            if (metric.name === 'Coverage Percentage' && typeof value === 'number' && !String(value).includes('%')) {
                 value = `${value}%`;
                 if (parseFloat(value) < 50) metricClass = 'status-failure';
            } else if (metric.name === 'Coverage Percentage' && typeof value === 'string' && value.includes('%')) {
                // Handle case where "33%" is a string
                if (parseFloat(value) < 50) metricClass = 'status-failure';
            } else if ((metric.name.includes('Issues') || metric.name.includes('Failed')) && parseFloat(value) > 0) {
                 metricClass = 'status-failure';
            } else if (metric.name.includes('Passed') && parseFloat(value) > 0) {
                 metricClass = 'status-success';
            } else if ((metric.name.includes('Issues') || metric.name.includes('Failed')) && parseFloat(value) === 0) {
                 metricClass = 'status-success';
            }

            return `<p><strong>${metric.name}:</strong> <span class="${metricClass}">${value}</span></p>`;
        }).filter(Boolean).join(''); // filter(Boolean) removes null entries

        // Only open by default if it's a failure
        const isOpen = String(stageStatus).toUpperCase() === "FAILURE" ? 'open' : '';

        metricsHtml.push(`
            <details ${isOpen}>
                <summary>${summaryTitle}</summary>
                <div class="metric-content">
                    ${metricContent}
                </div>
            </details>
        `);
    }

    return `
        <div class="card-header"><h2>CI/CD & Code Quality</h2></div>
        <div class="metric-group">
            ${metricsHtml.length > 0 ? metricsHtml.join('') : '<p>No metric data available for this revision.</p>'}
        </div>
    `;
}


// Helper to render the files changed section
function renderFilesChanged(data) {
    const fileDetails = data.changed_files_details ?? [];
    const totalFiles = data.changed_files ?? 0;
    const totalAdditions = data.additions ?? 0;
    const totalDeletions = data.deletions ?? 0;

    let fileListHtml = '';
    // Only show file list if details are present in the JSON
    if (fileDetails.length > 0) {
        fileListHtml = fileDetails.map(file => {
            const diffHash = file.diff_hash ?? ''; // Use empty hash if not provided
            const fileDiffUrl = `${repoBaseUrl}${data.pr_id}/files#diff-${diffHash}`;
            return `
                <div class="file-item">
                    <a href="${fileDiffUrl}" target="_blank">${file.file_name ?? 'N/A'}</a>
                    <div class="file-stats">
                        <span class="status-success">+${file.additions ?? 0}</span>
                        <span class="status-failure" style="margin-left: 0.5rem;">-${file.deletions ?? 0}</span>
                    </div>
                </div>
            `;
        }).join('');
    } else if (totalFiles > 0) {
        // Show if count exists but details array is empty
         fileListHtml = `<p style="padding: 0.5rem; opacity: 0.8;">${totalFiles} files changed (no detailed list available).</p>`;
    } else {
         fileListHtml = `<p style="padding: 0.5rem; opacity: 0.8;">No files changed in this revision.</p>`;
    }


    return `
        <div class="card">
            <div class="card-header">
                <h3>Files Changed</h3>
                <div>
                    <span class="status-success" style="font-weight:700;">+${totalAdditions}</span>
                    <span class="status-failure" style="margin-left: 0.5rem; font-weight:700;">-${totalDeletions}</span>
                </div>
            </div>
            
            <details class="file-details-collapsible" ${fileDetails.length > 0 ? 'open' : ''}>
                <summary class="file-details-summary">
                    Total Files: <span class="file-count">${totalFiles}</span>
                </summary>
                <div class="file-list-content">
                    ${fileListHtml}
                </div>
            </details>
        </div>
    `;
}

// Helper to render the right-side metadata card (Commit/CI)
function renderMetadataCard(data) {
    const shortHash = (data.commit_hash ?? 'N/A').substring(0, 8);
    const prLink = data.commit_hash ? `${repoBaseUrl}${data.pr_id}/commits/${data.commit_hash}` : '#';
    const durationDisplay = calculateDuration(data.ci_duration_seconds);
    const mergedStatusText = data.merged === undefined ? "N/A" : (data.merged ? "TRUE" : "FALSE");
    const mergedClass = getStatusClass(data.merged);
    
    return `
        <div class="card">
            <div class="card-header"><h3>Commit & CI Details</h3></div>
            <div class="pr-metadata-grid">
                <div class="pr-metadata-left">
                    <p><strong>Commit Hash:</strong> <a href="${prLink}" target="_blank">${shortHash}</a></p>
                    <p><strong>Run Initiated:</strong> ${formatCiRunTime(data.created_at)}</p>
                    <p><strong>CI Duration:</strong> ${durationDisplay}</p>
                </div>
                <div class="pr-metadata-right">
                    <p><strong>Overall Build:</strong> <span class="${getStatusClass(getOverallStatus(data))}">${getOverallStatus(data)}</span></p>
                    <p><strong>Merged:</strong> <span class="status-merged-${String(data.merged).toLowerCase()}">${mergedStatusText}</span></p>
                    <div class="pr-metadata-btn-container">
                        <a href="${prLink}" target="_blank" class="btn">View CI Log & Commit</a>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Main function to create a single collapsible revision card
function createRevisionCard(data, isOpen = '') {
    const overallStatus = getOverallStatus(data);
    const summaryStatusBadge = `<span class="revision-status-display ${getStatusBgClass(overallStatus)}">${overallStatus}</span>`;
    const runTime = formatCiRunTime(data.created_at);
    const shortHash = (data.commit_hash ?? 'N/A').substring(0, 7);
    const commitLink = data.commit_hash ? `${commitBaseUrl}${data.commit_hash}` : '#';
    
    // Render the failure card only if there was a failure
    const failureCardHtml = renderFailureCard(data);
    // Render the new General Metrics card
    const generalMetricsCardHtml = renderGeneralMetricsCard(data);

    return `
        <details class="revision-details" ${isOpen}>
            <summary class="revision-summary">
                <div class="revision-info">
                    <strong>Rev ${data.revision ?? 'N/A'}:</strong> 
                    <a href="${commitLink}" target="_blank" title="View Commit ${data.commit_hash ?? ''}">Commit ${shortHash}</a> 
                    &middot; ${data.title ?? 'N/A'}
                    <small>Run started: ${runTime} | Duration: ${calculateDuration(data.ci_duration_seconds)}</small>
                </div>
                ${summaryStatusBadge}
            </summary>
            
            <div class="content-grid">
                ${failureCardHtml}

                ${renderMetadataCard(data)}
                
                ${generalMetricsCardHtml}

                <div class="card">
                    ${renderMetrics(data)}
                </div>

                ${renderFilesChanged(data)}
                
            </div>
        </details>
    `;
}

// Initialize project configuration based on URL parameters
function initializeProject() {
    const urlParams = new URLSearchParams(window.location.search);
    const projectParam = urlParams.get("project");
    
    // Default to FXOS if no project specified
    const projectKey = projectParam ? projectParam.toUpperCase() : 'FXOS';
    
    // Check if project exists in configuration
    if (!PROJECT_CONFIG[projectKey]) {
        return {
            success: false,
            error: `Unknown project: ${projectKey}. Available projects: ${Object.keys(PROJECT_CONFIG).join(', ')}`
        };
    }
    
    // Set global variables based on selected project
    currentProject = PROJECT_CONFIG[projectKey];
    const repoPath = currentProject.repo;
    repoBaseUrl = `https://github.com/${repoPath}/pull/`;
    commitBaseUrl = `https://github.com/${repoPath}/commit/`;
    dataPathBase = `pr-reports/${currentProject.name}/dashboard_`;
    
    // Update page title and header
    updatePageHeader();
    
    return { success: true, project: currentProject };
}

// Update page header with project information
function updatePageHeader() {
    if (currentProject) {
        // Update page title
        document.title = `${currentProject.name} PR Dashboard`;
        
        // Update header title
        const headerTitle = document.getElementById('dashboard-title');
        if (headerTitle) {
            headerTitle.textContent = `${currentProject.name} PR Dashboard`;
        }
        
        // Update subtitle
        const subtitle = document.getElementById('project-subtitle');
        if (subtitle) {
            subtitle.textContent = currentProject.displayName;
        }
        
        // Update footer
        const footer = document.getElementById('dashboard-footer');
        if (footer) {
            footer.textContent = `${currentProject.name} PR Dashboard`;
        }
    }
}

// --- Main Loader Function ---

async function loadMetrics() {
    console.log("=== Dashboard Loading Started ===");
    const dashboardContainer = document.getElementById("dashboard");
    const prDetailsContainer = document.getElementById("pr-details-container");
    const loadingParagraph = prDetailsContainer.querySelector('p');
    
    console.log("Dashboard container:", dashboardContainer);
    console.log("PR details container:", prDetailsContainer);
    
    // 0. Initialize project configuration
    console.log("Initializing project...");
    const projectInit = initializeProject();
    console.log("Project initialization result:", projectInit);
    
    if (!projectInit.success) {
        console.error("Project initialization failed:", projectInit.error);
        dashboardContainer.innerHTML = ''; 
        if (loadingParagraph) {
            loadingParagraph.innerHTML = `
                <span class="status-failure">⚠️ Invalid Project</span><br><br>
                ${projectInit.error}<br><br>
                <strong>Example:</strong> <code>?project=FXOS&pr=4</code>
            `;
            loadingParagraph.style.color = "var(--failure)";
            loadingParagraph.style.textAlign = "center";
            loadingParagraph.style.padding = "2rem";
        }
        prDetailsContainer.style.border = "2px solid var(--failure)";
        return;
    }
    
    console.log("Current project:", currentProject);
    console.log("Data path base:", dataPathBase);
    
    // 1. Get PR ID from URL
    const prId = new URLSearchParams(window.location.search).get("pr");
    console.log("PR ID from URL:", prId);
    
    // 2. CHECK: If PR ID is missing or empty, show error and stop.
    if (!prId || prId.trim() === '') {
        // Clear dashboard content first
        dashboardContainer.innerHTML = ''; 
        
        // Update the PR details container with error message
        if (loadingParagraph) {
            loadingParagraph.innerHTML = `
                <span class="status-failure">⚠️ No PR Selected</span><br><br>
                Please provide a Pull Request ID in the URL to view the dashboard.<br>
                <strong>Project:</strong> ${currentProject.displayName}<br>
                <strong>Example:</strong> <code>?project=${currentProject.name}&pr=4</code> or <code>?project=${currentProject.name}&pr=6</code>
            `;
            loadingParagraph.style.color = "var(--failure)";
            loadingParagraph.style.textAlign = "center";
            loadingParagraph.style.padding = "2rem";
        }
        prDetailsContainer.style.border = "2px solid var(--failure)";
        
        // Prevent further execution - no PR data should be loaded
        return;
    }


    // 3. Fetch data (Only runs if prId exists)
    console.log(`Attempting to fetch: ${dataPathBase}${prId}.json`);
    let dataList = await fetchWithRetry(dataPathBase + prId + ".json");

    if (!dataList) {
         if (loadingParagraph) {
             loadingParagraph.innerHTML = `
                 <span class="status-failure">❌ Failed to Load PR Data</span><br><br>
                 Could not fetch data for PR #${prId}<br>
                 <strong>Expected file:</strong> <code>${dataPathBase}${prId}.json</code><br><br>
                 <strong>Possible reasons:</strong><br>
                 • File doesn't exist in the repository<br>
                 • File path is incorrect<br>
                 • Network error<br><br>
                 <a href="pr-list.html?project=${currentProject.name}" class="btn">← Back to PR List</a>
             `;
             loadingParagraph.style.color = "var(--failure)";
             loadingParagraph.style.textAlign = "center";
         }
         prDetailsContainer.style.border = "2px solid var(--failure)";
         return;
    }

    // Data is fetched, remove loading paragraph
    if (loadingParagraph) {
        loadingParagraph.remove();
    }

    // Sort data by revision descending (latest first)
    dataList.sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0));
    const latestRevisionData = dataList[0];


    // --- 1. Populate Static PR Details Card (using latest revision data as source) ---
    const overallStatus = getOverallStatus(latestRevisionData);
    const overallStatusBadge = `<span class="status-badge ${getStatusBgClass(overallStatus)}">${overallStatus}</span>`;
    const prIdDisplay = `#${latestRevisionData.pr_id ?? prId}`;
    const authorDisplay = `@${latestRevisionData.author ?? 'N/A'}`;
    const headerElement = prDetailsContainer.querySelector('.card-header'); 
    
    const createdDate = new Date(latestRevisionData.created_at || Date.now()).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
    });
    const prLink = `${repoBaseUrl}${latestRevisionData.pr_id ?? prId}`;

    headerElement.innerHTML = `
        <div class="pr-title-block">
            <h2>${latestRevisionData.title ?? 'PR Dashboard'}</h2>
            ${overallStatusBadge}
        </div>
    `;
    
    // --- Generate Subtitle Block ---
    const subtitleHtml = `
        <div class="pr-subtitle-block">
            PR ${prIdDisplay} opened by ${authorDisplay} on ${createdDate}
        </div>
    `;
    
    // Insert the subtitle immediately after the title/badge block
    headerElement.insertAdjacentHTML('afterend', subtitleHtml);

    // --- Generate Files Changed Details HTML for the *main card* ---
    let fileDetailsHTML = '';
    const filesChangedCount = latestRevisionData.changed_files ?? 0;
    const fileDetails = latestRevisionData.changed_files_details ?? []; 
    const diffHashBaseUrl = `${repoBaseUrl}${prId}/files#diff-`;

    if (filesChangedCount > 0 && fileDetails.length > 0) {
        const fileListItems = fileDetails.map(file => {
            const diffHash = file.diff_hash ?? ''; 
            const fileDiffUrl = `${diffHashBaseUrl}${diffHash}`;
            const additionsDisplay = (file.additions ?? 0) > 0 ? `<span class="${getStatusClass(true)}">+${file.additions}</span>` : '';
            const deletionsDisplay = (file.deletions ?? 0) > 0 ? `<span class="${getStatusClass(false)}">-${file.deletions}</span>` : '';
            
            return `
                <div class="file-item">
                    <a href="${fileDiffUrl}" target="_blank" title="View Diff for ${file.file_name ?? 'N/A'}">
                        ${file.file_name ?? 'N/A'} 
                    </a>
                    <span class="file-stats">${additionsDisplay} ${deletionsDisplay}</span>
                </div>
            `;
        }).join('');

        fileDetailsHTML = `
            <div>
                <details class="file-details-collapsible">
                    <summary class="file-details-summary">
                        <strong>Files Changed:</strong> 
                        <span class="file-count">${filesChangedCount}</span>
                    </summary>
                    <div class="file-list-content">
                        ${fileListItems}
                    </div>
                </details>
            </div>
        `;
    } else {
        fileDetailsHTML = `<p><strong>Files Changed:</strong> <span>${filesChangedCount}</span></p>`;
    }

    // --- Generate the main metadata grid ---
    const mergedStatusText = latestRevisionData.merged === undefined ? "N/A" : (latestRevisionData.merged ? "TRUE" : "FALSE");
    const mergedClass = getStatusClass(latestRevisionData.merged);
    
    const metadataHtml = `
        <div class="pr-metadata-grid">
            <div class="pr-metadata-left">
                <h3>Revision Summary</h3>
                <p><strong>Latest Revision:</strong> <span>${latestRevisionData.revision ?? 'N/A'}</span></p>
                <p><strong>Latest Commit:</strong> <span><a href="${commitBaseUrl}${latestRevisionData.commit_hash ?? ''}" target="_blank">${(latestRevisionData.commit_hash ?? 'N/A').substring(0, 7)}</a></span></p>
                ${fileDetailsHTML}
            </div>
            
            <div class="pr-metadata-right">
                <div>
                    <h3>Impact & Merge Status</h3>
                    <p><strong>Lines Added:</strong> <span class="${getStatusClass((latestRevisionData.additions ?? 0) > 0 ? true : false)}">+${latestRevisionData.additions ?? 0}</span></p>
                    <p><strong>Lines Deleted:</strong> <span class="${getStatusClass((latestRevisionData.deletions ?? 0) === 0 ? true : false)}">-${latestRevisionData.deletions ?? 0}</span></p>
                    <p><strong>Merged Status:</strong> <span class="${mergedClass}">${mergedStatusText}</span></p>
                </div>

                <div class="pr-metadata-btn-container">
                    <a href="${prLink}" class="btn" target="_blank">Open PR ${prIdDisplay} on GitHub</a>
                </div>
            </div>
        </div>
    `;
    
    // Safely insert the new HTML structure
    prDetailsContainer.insertAdjacentHTML('beforeend', metadataHtml);


    // --- 2. Render individual revisions (CI/CD only) ---
    const revisionCardsHtml = dataList.map((data, index) => {
        // Open the latest revision by default
        const isOpen = index === 0 ? 'open' : '';
        return createRevisionCard(data, isOpen);
    }).join('');

    dashboardContainer.innerHTML = revisionCardsHtml;
}

// --- Execute when the window loads ---
window.onload = loadMetrics;