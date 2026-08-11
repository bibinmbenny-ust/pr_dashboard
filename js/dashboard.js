// Project Configuration - Add new projects here
const PROJECT_CONFIG = {
    'FXOS': {
        name: 'FXOS',
        repo: 'demo-sbg-emu/netsec-fxos',
        displayName: 'Phoenix Security Platform'
    },
    'ASA': {
        name: 'ASA',
        repo: 'demo-sbg-emu/netsec-asa',
        displayName: 'Aegis Firewall Suite'
    },
    'IMS': {
        name: 'IMS',
        repo: 'demo-sbg-emu/netsec-ims',
        displayName: 'Sentinel Identity System'
    },
    'USM': {
        name: 'USM',
        repo: 'demo-sbg-emu/netsec-ims',
        displayName: 'Atlas Security Manager'
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
            const cacheBuster = `?v=20260717 Date().getTime()}`;
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

async function fetchJSONFile(url) {
    try {
        const cacheBuster = `?v=20260717 Date().getTime()}`;
        const response = await fetch(url + cacheBuster, { credentials: "include", cache: "no-store" });
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error(`Failed to fetch ${url}: ${error.message}`);
        return null;
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
    if (seconds === undefined || seconds === null || seconds <= 0) return 'N/A';
    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

// Helper to render the failure card if data exists
function renderFailureCard(data) {
    // Only render if failed_stage is present
    if (!data.failed_stage) return '';

    return `
        <div class="failure-card" style="padding: 0.75rem 1rem; margin-bottom: 1rem;">
            <p style="margin: 0; font-size: 0.9rem;"><strong>❌ Failed:</strong> <span>${data.failed_stage}</span></p>
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
    const buildNum = (data.jenkins_build_number && data.jenkins_build_number !== 'N/A') ? ` #${data.jenkins_build_number}` : '';
    const prState = data.pr_state ? data.pr_state.toUpperCase() : 'N/A';

    return `
        <div class="card" style="padding: 1.25rem;">
            <div style="display: grid; grid-template-columns: auto 1fr auto; gap: 2rem; align-items: center;">
                <div>
                    <p style="margin: 0;"><strong>State:</strong> <span class="status-badge ${getStatusBgClass(prState === 'OPEN' ? 'IN PROGRESS' : prState)}" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;">${prState}</span></p>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <p style="margin: 0; font-size: 0.9rem;"><strong>Base:</strong> <span style="font-family:monospace; color:var(--demo-blue); font-size: 0.85rem;">${data.base_branch || 'N/A'}</span></p>
                    <p style="margin: 0; font-size: 0.9rem;"><strong>Head:</strong> <span style="font-family:monospace; color:var(--demo-blue); font-size: 0.85rem;">${data.head_branch || 'N/A'}</span></p>
                </div>
                <div>
                    <a href="${jenkinsUrl}" target="_blank" class="btn" style="padding: 0.4rem 0.75rem; font-size: 0.85rem;">Jenkins${buildNum}</a>
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
        'ci_start_time', 'jenkins_build_number', 'jenkins_build_url',
        'total_failures', 'errors'
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
            ? `<span class="${getStatusClass(stageStatus)}" style="font-size: 1.05rem; font-weight: 700;">${stage} - ${String(stageStatus).toUpperCase()}</span>`
            : `<span class="${getStatusClass(stageStatus)}" style="font-size: 1.05rem; font-weight: 700;">${stage}</span>`;
        
        // Get stage-specific error details and AI suggestion
        const errorDetailsKey = `${stage}: Error Details`;
        const aiSuggestionKey = `${stage}: AI Suggestion`;
        const errorDetails = data[errorDetailsKey];
        const aiSuggestion = data[aiSuggestionKey];
        const hasError = errorDetails && errorDetails !== 'null';
        
        // Generate unique ID for this stage's AI container
        const stageId = `${stage.replace(/\s+/g, '-')}-${data.revision}`;
            
        // Render detailed metrics
        const metricContent = metrics.map(metric => {
            let value = metric.value ?? 'N/A'; // Default to N/A
            let metricClass = '';
            
            if (metric.name === 'Build Status') return null; // Don't show build status twice
            if (metric.name === 'Error Details') return null; // Handle separately
            if (metric.name === 'AI Suggestion') return null; // Handle separately

            if (metric.name === 'Coverage Report Links' && typeof value === 'string' && value !== 'N/A') {
                const escapeHtml = (text) => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
                const links = value.split('\n').filter(Boolean).map(line => {
                    const separator = line.indexOf(': http');
                    if (separator < 0) return `<span>${escapeHtml(line)}</span>`;
                    const label = line.slice(0, separator);
                    const url = line.slice(separator + 2);
                    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:inline-block;margin:0.12rem 0.45rem 0.12rem 0;color:var(--demo-blue);text-decoration:none;font-weight:600;">${escapeHtml(label)}</a>`;
                }).join('');
                return `<div style="margin-bottom:0.45rem;font-size:0.88rem;"><strong style="display:block;color:var(--demo-blue);font-weight:600;margin-bottom:0.25rem;">${metric.name}:</strong><div>${links}</div></div>`;
            }

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

            return `<p style="margin-bottom: 0.35rem; font-size: 0.88rem; display: flex; align-items: center;"><strong style="min-width: 180px; color: var(--demo-blue); font-weight: 600;">${metric.name}:</strong> <span class="${metricClass}">${value}</span></p>`;
        }).filter(Boolean).join(''); // filter(Boolean) removes null entries
        
        // Add error details and AI suggestion if available from JSON
        const errorSection = hasError ? `
            <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(239, 68, 68, 0.2);">
                <details class="error-details-section">
                    <summary style="color: var(--failure); font-weight: 700; font-size: 0.88rem; list-style: none; display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.5rem 0.65rem; border-radius: 0.4rem; transition: all 0.2s ease; background: rgba(239, 68, 68, 0.05);">
                        <span style="font-size: 1.1rem;">⚠️</span>
                        <span>Error Details</span>
                        <span class="arrow-indicator" style="margin-left: auto; font-size: 0.85rem; opacity: 0.7; transition: transform 0.3s ease;">▼</span>
                    </summary>
                    <div style="margin-top: 0.65rem; padding: 0.85rem; background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.04) 100%); border-left: 3px solid var(--failure); border-radius: 0.4rem; font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Courier New', monospace; font-size: 0.82rem; white-space: pre-wrap; line-height: 1.5; color: #ffaaaa; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);">
${errorDetails}</div>
                    ${aiSuggestion && aiSuggestion !== 'AI analysis temporarily unavailable. Please check logs manually.\n' ? `
                        <div style="margin-top: 0.75rem; padding: 0.9rem; background: linear-gradient(135deg, rgba(0, 188, 235, 0.15) 0%, rgba(0, 188, 235, 0.06) 100%); border-left: 3px solid var(--demo-blue); border-radius: 0.4rem; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);">
                            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.65rem; color: var(--demo-blue); font-weight: 700; font-size: 0.9rem;">
                                <span style="font-size: 1.15rem;">🤖</span>
                                <span>AI Analysis & Suggestions</span>
                            </div>
                            <div style="white-space: pre-wrap; line-height: 1.6; font-size: 0.85rem; color: #f0f0f0;">
${aiSuggestion}</div>
                        </div>
                    ` : ''}
                </details>
            </div>
        ` : '';

        // Only open by default if it's a failure
        const isOpen = String(stageStatus).toUpperCase() === "FAILURE" ? 'open' : '';

        // Fallback: if a stage only reports a build status (no detailed metrics and no error),
        // show the build status so the expanded panel is never blank.
        const hasVisibleContent = metricContent.trim() !== '' || errorSection.trim() !== '';
        const fallbackContent = !hasVisibleContent
            ? `<p style="margin-bottom: 0.35rem; font-size: 0.88rem; display: flex; align-items: center;"><strong style="min-width: 180px; color: var(--demo-blue); font-weight: 600;">Build Status:</strong> <span class="${getStatusClass(stageStatus)}">${String(stageStatus).toUpperCase()}</span></p>`
            : '';

        metricsHtml.push(`
            <details ${isOpen}>
                <summary>${summaryTitle}</summary>
                <div class="metric-content">
                    ${metricContent}
                    ${fallbackContent}
                    ${errorSection}
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
    const shortHash = (data.commit_hash ?? 'N/A').substring(0, 7);
    const prLink = data.commit_hash ? `${repoBaseUrl}${data.pr_id}/commits/${data.commit_hash}` : '#';
    const durationDisplay = calculateDuration(data.ci_duration_seconds);
    const overallStatus = getOverallStatus(data);
    
    return `
        <div class="card" style="padding: 1.25rem;">
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.5rem; align-items: start;">
                <div>
                    <p style="margin-bottom: 0.5rem;"><strong>Commit:</strong> <a href="${prLink}" target="_blank">${shortHash}</a></p>
                    <p style="margin-bottom: 0.5rem;"><strong>Initiated:</strong> ${formatCiRunTime(data.created_at)}</p>
                    <p style="margin-bottom: 0;"><strong>Duration:</strong> ${durationDisplay}</p>
                </div>
                <div>
                    <p style="margin-bottom: 0.5rem;"><strong>Build:</strong> <span class="${getStatusClass(overallStatus)}">${overallStatus}</span></p>
                </div>
                <div style="text-align: right;">
                    <a href="${prLink}" target="_blank" class="btn" style="padding: 0.5rem 1rem; font-size: 0.85rem;">View CI Log</a>
                </div>
            </div>
        </div>
    `;
}

// Combined summary card with failed stages, commit details, and general metrics
function renderCombinedSummaryCard(data) {
    const shortHash = (data.commit_hash ?? 'N/A').substring(0, 7);
    const prLink = data.commit_hash ? `${repoBaseUrl}${data.pr_id}/commits/${data.commit_hash}` : '#';
    const durationDisplay = calculateDuration(data.ci_duration_seconds);
    const overallStatus = getOverallStatus(data);
    
    const jenkinsUrl = data.jenkins_build_url || '#';
    const buildNum = (data.jenkins_build_number && data.jenkins_build_number !== 'N/A') ? ` #${data.jenkins_build_number}` : '';
    const prState = data.pr_state ? data.pr_state.toUpperCase() : 'N/A';
    
    // Failed stages section (conditional)
    let failedStagesHtml = '';
    if (data.failed_stage && data.failed_stage !== 'null') {
        failedStagesHtml = `
            <div style="background: rgba(239, 68, 68, 0.15); padding: 0.6rem 1rem; border-radius: 0.5rem; border-left: 3px solid var(--failure); margin-bottom: 1rem;">
                <strong>❌ Failed Stages:</strong> ${data.failed_stage}
            </div>
        `;
    }
    
    return `
        <div class="card" style="padding: 1.25rem;">
            ${failedStagesHtml}
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: ${failedStagesHtml ? '0' : '0'};">
                <!-- Left: Commit & CI Details -->
                <div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <p style="margin-bottom: 0.5rem; font-size: 0.9rem;"><strong>Commit:</strong> <a href="${prLink}" target="_blank">${shortHash}</a></p>
                        <p style="margin-bottom: 0.5rem; font-size: 0.9rem;"><strong>Duration:</strong> ${durationDisplay}</p>
                        <p style="margin-bottom: 0.5rem; font-size: 0.9rem;"><strong>State:</strong> <span class="status-badge ${getStatusBgClass(prState === 'OPEN' ? 'IN PROGRESS' : prState)}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">${prState}</span></p>
                        <p style="margin-bottom: 0.5rem; font-size: 0.9rem;"><strong>Build:</strong> <span class="${getStatusClass(overallStatus)}">${overallStatus}</span></p>
                    </div>
                </div>
                
                <!-- Right: Branches & Actions -->
                <div>
                    <div style="display: grid; grid-template-columns: 1fr auto; gap: 1rem; align-items: start;">
                        <div>
                            <p style="margin-bottom: 0.5rem; font-size: 0.9rem;"><strong>Base:</strong> <span style="font-family:monospace; color:var(--demo-blue); font-size: 0.85rem;">${data.base_branch || 'N/A'}</span></p>
                            <p style="margin-bottom: 0.5rem; font-size: 0.9rem;"><strong>Head:</strong> <span style="font-family:monospace; color:var(--demo-blue); font-size: 0.85rem;">${data.head_branch || 'N/A'}</span></p>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                            <a href="${prLink}" target="_blank" class="btn" style="padding: 0.4rem 0.75rem; font-size: 0.8rem; white-space: nowrap;">View Commit</a>
                            <a href="${jenkinsUrl}" target="_blank" class="btn" style="padding: 0.4rem 0.75rem; font-size: 0.8rem; white-space: nowrap;">Jenkins${buildNum}</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        ${renderAISuggestion(data)}
    `;
}

// Render AI suggestion card if available
function renderAISuggestion(data) {
    // Check if we have AI suggestion from pr-list.json (ciStatusData)
    if (!window.currentPRAISuggestion || window.currentPRAISuggestion === 'AI analysis unavailable' || !window.currentPRAISuggestion) {
        return '';
    }
    
    return `
        <div class="card" style="padding: 1.25rem; background: linear-gradient(135deg, rgba(0, 188, 235, 0.05) 0%, rgba(0, 188, 235, 0.02) 100%); border: 1px solid rgba(0, 188, 235, 0.3);">
            <details style="cursor: pointer;">
                <summary style="font-weight: 600; color: var(--demo-blue); font-size: 1rem; padding: 0.5rem 0; list-style: none; display: flex; align-items: center; gap: 0.5rem;">
                    <span style="font-size: 1.2rem;">🤖</span>
                    <span>AI Analysis & Suggestions</span>
                    <span style="font-size: 0.7rem; opacity: 0.7; margin-left: auto;">Powered by GitHub Copilot</span>
                </summary>
                <div style="margin-top: 1rem; padding: 1rem; background: rgba(239,246,255,0.95); border-radius: 0.5rem; white-space: pre-wrap; line-height: 1.6; font-size: 0.9rem;">
${window.currentPRAISuggestion}
                </div>
            </details>
        </div>
    `;
}

// Main function to create a single collapsible revision card
function renderGHActions(data) {
    const runs = data.github_actions_runs;
    if (!runs || runs.length === 0) return '';

    const iconFor = c => ({ success:'✅', failure:'❌', cancelled:'🚫', skipped:'⏭️', timed_out:'⌛', in_progress:'⏳' }[c] || '🔵');
    const colorFor = c => ({ success:'#10b981', failure:'#ef4444', cancelled:'#64748b', timed_out:'#f59e0b', in_progress:'#3b82f6' }[c] || '#94a3b8');

    const runsHtml = runs.map(run => {
        const rColor = colorFor(run.conclusion);
        const rDur = run.duration_seconds > 0 ? `<span style="color:#64748b;font-size:0.72rem;">${calculateDuration(run.duration_seconds)}</span>` : '';

        const jobsHtml = (run.jobs || []).map(job => {
            const jColor = colorFor(job.conclusion);
            const jDur = job.duration_seconds > 0 ? `<span style="color:#64748b;font-size:0.7rem;margin-left:auto;">${calculateDuration(job.duration_seconds)}</span>` : '';
            const jobLink = job.url ? `<a href="${job.url}" target="_blank" style="color:var(--demo-blue);font-size:0.7rem;text-decoration:none;">↗</a>` : '';

            const stepsHtml = (job.steps || []).map(step => {
                const sColor = colorFor(step.conclusion);
                const sDur = step.duration_seconds > 0 ? `<span style="color:#475569;margin-left:auto;font-size:0.68rem;">${step.duration_seconds}s</span>` : '';
                return `<div style="display:flex;align-items:center;gap:0.4rem;padding:0.15rem 0;font-size:0.74rem;border-bottom:1px solid rgba(59,130,246,0.12);">
                    <span>${iconFor(step.conclusion)}</span>
                    <span style="color:${sColor};">${step.name}</span>
                    ${sDur}
                </div>`;
            }).join('');

            return `<div style="margin-left:1rem;margin-bottom:0.35rem;padding:0.4rem 0.65rem;background:rgba(239,246,255,0.95);border-left:2px solid ${jColor}50;border-radius:0 0.3rem 0.3rem 0;">
                <div style="display:flex;align-items:center;gap:0.45rem;${stepsHtml ? 'margin-bottom:0.4rem;' : ''}">
                    <span>${iconFor(job.conclusion)}</span>
                    <span style="color:${jColor};font-size:0.8rem;font-weight:600;">${job.name}</span>
                    ${jDur}
                    ${jobLink}
                </div>
                ${stepsHtml ? `<div style="padding-left:1rem;">${stepsHtml}</div>` : ''}
            </div>`;
        }).join('');

        return `<div style="border:1px solid rgba(255,255,255,0.07);border-radius:0.5rem;padding:0.65rem 0.8rem;margin-bottom:0.5rem;">
            <div style="display:flex;align-items:center;gap:0.5rem;${jobsHtml ? 'margin-bottom:0.5rem;' : ''}">
                <span style="font-size:1rem;">${iconFor(run.conclusion)}</span>
                <span style="color:${rColor};font-weight:700;font-size:0.85rem;">${run.name}</span>
                <span style="font-size:0.72rem;color:#475569;">#${run.run_number}</span>
                <div style="margin-left:auto;display:flex;gap:0.5rem;align-items:center;">
                    ${rDur}
                    <a href="${run.url}" target="_blank" style="color:var(--demo-blue);font-size:0.75rem;text-decoration:none;">↗ View</a>
                </div>
            </div>
            ${jobsHtml}
        </div>`;
    }).join('');

    const passCount = runs.filter(r => r.conclusion === 'success').length;
    const failCount = runs.filter(r => r.conclusion === 'failure').length;
    const pendCount = runs.filter(r => r.status !== 'completed').length;

    return `
        <div class="card" style="grid-column:1/-1;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
                <span style="font-weight:700;font-size:0.9rem;color:var(--demo-blue);">⚙️ GitHub Actions</span>
                <span style="font-size:0.78rem;color:#64748b;">
                    <span style="color:#10b981;">✅ ${passCount} passed</span>
                    ${failCount > 0 ? `<span style="color:#ef4444;"> &nbsp;❌ ${failCount} failed</span>` : ''}
                    ${pendCount > 0 ? `<span style="color:#3b82f6;"> &nbsp;⏳ ${pendCount} running</span>` : ''}
                </span>
            </div>
            ${runsHtml}
        </div>`;
}

function renderReviewStats(data) {
    const rs = data.review_stats;
    if (!rs) return '';

    const score = rs.engagement_score ?? 100;
    const scoreColor = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
    const scoreLabel = score >= 80 ? 'Highly Engaged' : score >= 50 ? 'Partially Addressed' : 'Low Engagement';

    // Review decision badges
    const decisionBadges = [
        rs.reviews_approved > 0
            ? `<span style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.35);padding:0.2rem 0.65rem;border-radius:1rem;font-size:0.78rem;color:#10b981;">✅ ${rs.reviews_approved} Approved</span>` : '',
        rs.reviews_changes_requested > 0
            ? `<span style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.35);padding:0.2rem 0.65rem;border-radius:1rem;font-size:0.78rem;color:#ef4444;">🔴 ${rs.reviews_changes_requested} Changes Requested</span>` : '',
        rs.reviews_commented > 0
            ? `<span style="background:rgba(148,163,184,0.1);border:1px solid rgba(148,163,184,0.25);padding:0.2rem 0.65rem;border-radius:1rem;font-size:0.78rem;color:#94a3b8;">💬 ${rs.reviews_commented} Commented</span>` : '',
        rs.unique_reviewers > 0
            ? `<span style="background:rgba(0,188,235,0.1);border:1px solid rgba(0,188,235,0.25);padding:0.2rem 0.65rem;border-radius:1rem;font-size:0.78rem;color:var(--demo-blue);">👥 ${rs.unique_reviewers} Reviewer${rs.unique_reviewers !== 1 ? 's' : ''}</span>` : '',
    ].filter(Boolean).join(' ');

    // Copilot section (only shown if Copilot left comments)
    const copilotSection = rs.copilot_comments > 0 ? (() => {
        const pct = Math.round((rs.copilot_addressed / rs.copilot_comments) * 100);
        const barColor = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
        return `
            <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid rgba(59,130,246,0.2);">
                <div style="font-size:0.82rem;color:#94a3b8;font-weight:600;margin-bottom:0.6rem;">🤖 Copilot Review</div>
                <div style="display:flex;gap:1.5rem;align-items:center;flex-wrap:wrap;">
                    <div style="text-align:center;">
                        <div style="font-size:1.4rem;font-weight:700;color:var(--demo-blue);">${rs.copilot_comments}</div>
                        <div style="font-size:0.7rem;color:#64748b;">Total</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:1.4rem;font-weight:700;color:#10b981;">${rs.copilot_addressed}</div>
                        <div style="font-size:0.7rem;color:#64748b;">Addressed</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:1.4rem;font-weight:700;color:#ef4444;">${rs.copilot_open}</div>
                        <div style="font-size:0.7rem;color:#64748b;">Still Open</div>
                    </div>
                    <div style="flex:1;min-width:140px;">
                        <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:#64748b;margin-bottom:0.3rem;">
                            <span>Address Rate</span><span style="color:${barColor};font-weight:600;">${pct}%</span>
                        </div>
                        <div style="background:rgba(255,255,255,0.08);border-radius:1rem;height:8px;overflow:hidden;">
                            <div style="width:${pct}%;height:100%;background:${barColor};border-radius:1rem;transition:width 0.6s;"></div>
                        </div>
                    </div>
                </div>
            </div>`;
    })() : '';

    // Comment activity row
    const totalActivity = rs.total_review_comments;
    const humanComments = rs.human_reviewer_comments;
    const authorReplies = rs.author_replies;
    const authorOwn = rs.author_own_comments;

    return `
        <div class="card" style="grid-column:1/-1;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.9rem;">
                <span style="font-weight:700;font-size:0.9rem;color:var(--demo-blue);">💬 PR Review</span>
                <div style="display:flex;align-items:center;gap:0.5rem;">
                    <span style="font-size:0.78rem;color:#64748b;">Engagement Score</span>
                    <span style="font-size:1rem;font-weight:700;color:${scoreColor};background:rgba(255,255,255,0.05);padding:0.15rem 0.6rem;border-radius:0.4rem;border:1px solid ${scoreColor}40;">${score} — ${scoreLabel}</span>
                </div>
            </div>

            <!-- Review decisions -->
            ${decisionBadges ? `<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.9rem;">${decisionBadges}</div>` : ''}

            <!-- Comment activity stats -->
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem;">
                <div style="background:rgba(239,246,255,0.95);border:1px solid rgba(59,130,246,0.18);border-radius:0.5rem;padding:0.6rem;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:#0f172a;">${totalActivity}</div>
                    <div style="font-size:0.7rem;color:#64748b;">Review Comments</div>
                </div>
                <div style="background:rgba(239,246,255,0.95);border:1px solid rgba(59,130,246,0.18);border-radius:0.5rem;padding:0.6rem;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:#0f172a;">${humanComments}</div>
                    <div style="font-size:0.7rem;color:#64748b;">From Reviewers</div>
                </div>
                <div style="background:rgba(239,246,255,0.95);border:1px solid rgba(59,130,246,0.18);border-radius:0.5rem;padding:0.6rem;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:#0f172a;">${authorReplies}</div>
                    <div style="font-size:0.7rem;color:#64748b;">Author Replies</div>
                </div>
                <div style="background:rgba(239,246,255,0.95);border:1px solid rgba(59,130,246,0.18);border-radius:0.5rem;padding:0.6rem;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:700;color:#0f172a;">${rs.outdated_threads}</div>
                    <div style="font-size:0.7rem;color:#64748b;">Threads Resolved</div>
                </div>
            </div>

            ${copilotSection}
        </div>`;
}

function renderCheckRuns(data) {
    const checks = data.check_runs;
    if (!checks || checks.length === 0) return '';

    const iconFor = (conclusion, status) => {
        if (status === 'in_progress' || status === 'queued') return '⏳';
        switch (conclusion) {
            case 'success':   return '✅';
            case 'failure':   return '❌';
            case 'cancelled': return '🚫';
            case 'skipped':   return '⏭️';
            case 'timed_out': return '⌛';
            default:          return '🔵';
        }
    };

    const colorFor = conclusion => {
        switch (conclusion) {
            case 'success':    return '#10b981';
            case 'failure':    return '#ef4444';
            case 'cancelled':  return '#64748b';
            case 'timed_out':  return '#f59e0b';
            case 'in_progress':return '#3b82f6';
            default:           return '#94a3b8';
        }
    };

    const rows = checks.map(c => {
        const icon = iconFor(c.conclusion, c.status);
        const color = colorFor(c.conclusion === 'in_progress' ? c.status : c.conclusion);
        const dur = c.duration_seconds > 0 ? `<span style="color:#64748b;font-size:0.72rem;">${calculateDuration(c.duration_seconds)}</span>` : '';
        const link = c.details_url
            ? `<a href="${c.details_url}" target="_blank" style="color:var(--demo-blue);font-size:0.78rem;text-decoration:none;">↗ details</a>`
            : '';
        const summary = c.summary ? `<div style="color:#64748b;font-size:0.72rem;margin-top:0.1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px;">${c.summary}</div>` : '';
        const appBadge = c.app ? `<span style="font-size:0.65rem;color:#475569;background:rgba(255,255,255,0.05);padding:0.1rem 0.35rem;border-radius:0.25rem;">${c.app}</span>` : '';
        return `
            <div style="display:grid;grid-template-columns:1.4rem 1fr auto auto;align-items:start;gap:0.5rem;padding:0.45rem 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                <span style="font-size:1rem;">${icon}</span>
                <div>
                    <span style="color:${color};font-weight:600;font-size:0.82rem;">${c.name}</span>
                    ${appBadge}
                    ${summary}
                </div>
                ${dur}
                ${link}
            </div>`;
    }).join('');

    const failCount = checks.filter(c => c.conclusion === 'failure').length;
    const pendCount = checks.filter(c => c.status === 'in_progress' || c.status === 'queued').length;
    const passCount = checks.filter(c => c.conclusion === 'success').length;

    const headerColor = failCount > 0 ? '#ef4444' : pendCount > 0 ? '#3b82f6' : '#10b981';
    const headerLabel = failCount > 0 ? `${failCount} failed` : pendCount > 0 ? `${pendCount} in progress` : 'all passed';

    return `
        <div class="card" style="grid-column:1/-1;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
                <span style="font-weight:700;font-size:0.9rem;color:var(--demo-blue);">🔍 Pre-Commit Checks</span>
                <span style="font-size:0.78rem;color:${headerColor};">
                    ✅ ${passCount} passed &nbsp;
                    ${failCount > 0 ? `❌ ${failCount} failed &nbsp;` : ''}
                    ${pendCount > 0 ? `⏳ ${pendCount} pending` : ''}
                    — <strong>${headerLabel}</strong>
                </span>
            </div>
            ${rows}
        </div>`;
}

// Render AI Triage panel for a revision (from Jenkins-collected triage API data).
// Reads the `ai_triage` object written by Jenkins:
//   { available, note, build_number, triaged_by:{name,version}, errors:[
//       { stage, error_category, confidence, triage_summary:[], artifact_log_url, analysis:[{step,source,observation,conclusion}] } ] }
function renderAITriage(data) {
    const t = data.ai_triage;
    if (!t) return '';

    const errors = Array.isArray(t.errors) ? t.errors : [];
    const tb = t.triaged_by || (errors[0] && errors[0].triaged_by) || null;
    const model = tb && tb.name
        ? `<small style="font-weight:400; color:#64748b; font-size:0.75rem;">${tb.name}${tb.version ? ` v${tb.version}` : ''}</small>`
        : '';

    const confColor = (c) => {
        const u = String(c || '').toUpperCase();
        return u === 'HIGH' ? '#10b981' : u === 'MEDIUM' ? '#3b82f6' : u === 'LOW' ? '#f59e0b' : '#64748b';
    };
    const validUrl = (u) => u && u !== "I don't know" && /^https?:\/\//.test(u);
    const normalizeNote = (note) => {
        if (!note) return '';
        if (typeof note === 'string') return note;
        if (Array.isArray(note.bytes)) return String.fromCharCode(...note.bytes);
        if (Array.isArray(note.strings) && Array.isArray(note.values)) {
            return note.strings.reduce((out, part, index) => out + part + (note.values[index] ?? ''), '');
        }
        return String(note);
    };
    const noteText = normalizeNote(t.note);

    // Short note shown for every revision that has triage data
    const noteHtml = noteText
        ? `<p style="margin:0 0 0.75rem 0; font-size:0.86rem; color:#cbd5e1; line-height:1.5;"><span style="color:var(--demo-blue);">📝</span> ${noteText}</p>`
        : '';

    let bodyHtml;
    if (t.available === false) {
        bodyHtml = noteHtml + `<p style="font-size:0.85rem; color:#f59e0b; margin:0;">AI triage data is not available for this build.</p>`;
    } else if (errors.length === 0) {
        bodyHtml = noteHtml + `<p style="font-size:0.85rem; color:#10b981; margin:0;">✅ No failures flagged by AI for this build.</p>`;
    } else {
        const errorBlocks = errors.map(e => {
            const cc = confColor(e.confidence);
            const bullets = (Array.isArray(e.triage_summary) ? e.triage_summary : [])
                .map(s => `<li style="margin-bottom:0.35rem;">${s}</li>`).join('');
            const steps = (Array.isArray(e.analysis) ? e.analysis : []).map(a => `
                <div style="margin-bottom:0.6rem; padding:0.6rem 0.75rem; background:rgba(255,255,255,0.03); border-left:2px solid var(--demo-blue); border-radius:0.35rem;">
                    <div style="font-size:0.75rem; color:#94a3b8; margin-bottom:0.25rem;"><strong>Step ${a.step ?? ''}</strong> &middot; <span style="text-transform:uppercase; letter-spacing:0.03em;">${a.source ?? ''}</span></div>
                    <div style="font-size:0.82rem; color:#e2e8f0; margin-bottom:0.3rem;"><strong>Observation:</strong> ${a.observation ?? ''}</div>
                    <div style="font-size:0.82rem; color:#cbd5e1;"><strong>Conclusion:</strong> ${a.conclusion ?? ''}</div>
                </div>`).join('');
            const logLink = validUrl(e.artifact_log_url)
                ? `<div style="margin-top:0.5rem;"><a href="${e.artifact_log_url}" target="_blank" style="font-size:0.8rem;">View artifact log ↗</a></div>` : '';

            return `
                <details open style="margin-bottom:0.6rem;">
                    <summary style="cursor:pointer; list-style:none; display:flex; align-items:center; gap:0.5rem; padding:0.55rem 0.7rem; border-radius:0.4rem; background:rgba(239,68,68,0.06);">
                        <span style="font-size:1.05rem;">⚠️</span>
                        <span style="font-weight:700; font-size:0.9rem; color:#f8fafc;">${e.stage ?? 'Unknown stage'}</span>
                        <span style="margin-left:auto; display:flex; gap:0.4rem; flex-wrap:wrap;">
                            <span style="font-size:0.68rem; font-weight:700; padding:0.15rem 0.5rem; border-radius:1rem; background:rgba(239,68,68,0.15); color:#fca5a5; text-transform:uppercase;">${e.error_category ?? 'unknown'}</span>
                            <span style="font-size:0.68rem; font-weight:700; padding:0.15rem 0.5rem; border-radius:1rem; background:${cc}22; color:${cc};">${String(e.confidence ?? 'N/A').toUpperCase()} CONF</span>
                        </span>
                    </summary>
                    <div style="margin-top:0.6rem; padding:0.85rem; background:linear-gradient(135deg, rgba(0,188,235,0.1) 0%, rgba(0,188,235,0.04) 100%); border-left:3px solid var(--demo-blue); border-radius:0.4rem;">
                        <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem; color:var(--demo-blue); font-weight:700; font-size:0.88rem;">
                            <span style="font-size:1.1rem;">🤖</span><span>AI Suggestion</span>
                        </div>
                        ${bullets ? `<ul style="margin:0 0 0.25rem 1.1rem; padding:0; font-size:0.84rem; color:#e2e8f0; line-height:1.5;">${bullets}</ul>` : '<p style="font-size:0.84rem; color:#94a3b8; margin:0;">No summary provided.</p>'}
                        ${logLink}
                        ${steps ? `
                            <details style="margin-top:0.6rem;">
                                <summary style="cursor:pointer; font-size:0.82rem; color:var(--demo-blue); font-weight:600;">Show reasoning (${e.analysis.length} step${e.analysis.length !== 1 ? 's' : ''})</summary>
                                <div style="margin-top:0.5rem;">${steps}</div>
                            </details>` : ''}
                    </div>
                </details>`;
        }).join('');
        bodyHtml = noteHtml + errorBlocks;
    }

    return `
        <div class="card">
            <div class="card-header">
                <h3>🤖 AI Triage ${model}</h3>
            </div>
            ${bodyHtml}
        </div>
    `;
}

function createRevisionCard(data, isOpen = '') {
    const overallStatus = getOverallStatus(data);
    const summaryStatusBadge = `<span class="revision-status-display ${getStatusBgClass(overallStatus)}">${overallStatus}</span>`;
    const runTime = formatCiRunTime(data.created_at);
    const shortHash = (data.commit_hash ?? 'N/A').substring(0, 7);
    const commitLink = data.commit_hash ? `${commitBaseUrl}${data.commit_hash}` : '#';
    
    // Build combined summary card with failed stages, commit details, and general metrics
    const combinedSummaryHtml = renderCombinedSummaryCard(data);

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
                ${combinedSummaryHtml}

                <div class="card">
                    ${renderMetrics(data)}
                </div>

                ${renderAITriage(data)}

                ${renderCheckRuns(data)}

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
        document.title = 'Dashboard';
        
        // Update header title
        const headerTitle = document.getElementById('dashboard-title');
        if (headerTitle) {
            headerTitle.textContent = 'Dashboard';
        }
        
        // Clear subtitle
        const subtitle = document.getElementById('project-subtitle');
        if (subtitle) {
            subtitle.textContent = '';
        }
        
        // Update footer
        const footer = document.getElementById('dashboard-footer');
        if (footer) {
            footer.textContent = 'Dashboard';
        }
    }
}

function setupDashboardExportButton() {
    const button = document.getElementById('download-dashboard-pdf');
    if (!button) return;

    button.addEventListener('click', () => {
        const params = new URLSearchParams(window.location.search);
        const prId = params.get('pr') || 'unknown';
        const originalTitle = document.title;
        const projectName = currentProject ? currentProject.name : 'NetSec';

        const restoreTitle = () => {
            document.title = originalTitle;
        };

        document.title = `${projectName}-PR-${prId}-Dashboard`;
        window.addEventListener('afterprint', restoreTitle, { once: true });
        window.print();
    });
}

function setDashboardExportReady(isReady) {
    const button = document.getElementById('download-dashboard-pdf');
    if (!button) return;

    button.disabled = !isReady;
    button.title = isReady
        ? 'Save this dashboard as a PDF'
        : 'Dashboard data is still loading';
}

function renderMissingBuildDashboard(pr, prId) {
    const prDetailsContainer = document.getElementById("pr-details-container");
    const dashboardContainer = document.getElementById("dashboard");
    const scorecardContainer = document.getElementById("scorecard-container");
    const loadingParagraph = prDetailsContainer.querySelector('p');
    const headerElement = prDetailsContainer.querySelector('.card-header');

    if (loadingParagraph) loadingParagraph.remove();
    if (scorecardContainer) scorecardContainer.innerHTML = '';
    if (dashboardContainer) dashboardContainer.innerHTML = '';

    const prNumber = pr.number ?? prId;
    const prTitle = pr.title || `PR #${prNumber}`;
    const prStatus = pr.pr_status || pr.state || 'open';
    const prStatusBadge = `<span class="status-badge ${getStatusBgClass(prStatus === 'open' ? 'IN PROGRESS' : prStatus)}">${String(prStatus).replace(/_/g, ' ').toUpperCase()}</span>`;
    const prLink = pr.html_url || `${repoBaseUrl}${prNumber}`;
    const createdDate = pr.created_at ? new Date(pr.created_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
    }) : 'N/A';

    if (headerElement) {
        headerElement.innerHTML = `
            <div class="pr-title-block">
                <h2>${prTitle}</h2>
                ${prStatusBadge}
            </div>
        `;
    }

    prDetailsContainer.insertAdjacentHTML('beforeend', `
        <div class="pr-subtitle-block">
            PR #${prNumber} opened by @${pr.author || 'N/A'} on ${createdDate}
        </div>
        <div class="missing-build-card">
            <h3>Build information not available</h3>
            <p>This PR is present in the live GitHub overview, but Jenkins has not written dashboard build data for it yet.</p>
            <p>Once the PR Dashboard Jenkins job runs and creates <code>dashboard_${prNumber}.json</code>, this page will show the full revision, CI, unit test, and AI triage details.</p>
        </div>
        <div class="pr-metadata-grid">
            <div class="pr-metadata-left">
                <h3>PR Metadata</h3>
                <p><strong>Base:</strong> <span>${pr.base_branch || 'N/A'}</span></p>
                <p><strong>Head:</strong> <span>${pr.head_branch || 'N/A'}</span></p>
                <p><strong>Updated:</strong> <span>${formatCiRunTime(pr.updated_at)}</span></p>
            </div>
            <div class="pr-metadata-right">
                <div>
                    <h3>Review Status</h3>
                    <p><strong>Review Decision:</strong> <span>${(pr.review_decision || 'No review yet').replace(/_/g, ' ')}</span></p>
                    <p><strong>Build Data:</strong> <span class="status-warning">Not available</span></p>
                </div>
                <div class="pr-metadata-btn-container">
                    <a href="${prLink}" class="btn" target="_blank">Open PR #${prNumber} on GitHub</a>
                </div>
            </div>
        </div>
    `);

    setDashboardExportReady(true);
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
         const prListData = await fetchJSONFile(`pr-reports/${currentProject.name}/pr-list.json`);
         const pr = prListData && Array.isArray(prListData.pull_requests)
             ? prListData.pull_requests.find(item => Number(item.number) === Number(prId))
             : null;

         if (pr) {
             renderMissingBuildDashboard(pr, prId);
             return;
         }

         if (loadingParagraph) {
             loadingParagraph.innerHTML = `
                 <span class="status-failure">❌ Failed to Load PR Data</span><br><br>
                 Could not fetch data for PR #${prId}<br>
                 <strong>Expected file:</strong> <code>${dataPathBase}${prId}.json</code><br><br>
                 This PR was also not found in <code>pr-list.json</code>.<br><br>
                 <a href="pr-list.html?project=${currentProject.name}" class="btn">← Back to PR List</a>
             `;
             loadingParagraph.style.color = "var(--failure)";
             loadingParagraph.style.textAlign = "center";
         }
         prDetailsContainer.style.border = "2px solid var(--failure)";
         return;
    }

    // 4. Fetch CI status from pr-list.json
    console.log(`Fetching CI status from: pr-reports/${currentProject.name}/pr-list.json`);
    let prListData = await fetchWithRetry(`pr-reports/${currentProject.name}/pr-list.json`);
    let ciStatusData = null;
    if (prListData && prListData.pull_requests) {
        ciStatusData = prListData.pull_requests.find(pr => pr.number === parseInt(prId));
        console.log("CI Status Data:", ciStatusData);
        
        // Store AI suggestion globally if available
        if (ciStatusData && ciStatusData.ai_suggestion) {
            window.currentPRAISuggestion = ciStatusData.ai_suggestion;
            console.log("AI Suggestion found for PR:", prId);
        } else {
            window.currentPRAISuggestion = null;
        }
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
            <h2>${latestRevisionData.title ?? 'Dashboard'}</h2>
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
    
    // --- Get PR status info from PR list data if available ---
    // Build/CI status comes from the Jenkins revision data; this panel shows the
    // GitHub PR lifecycle status (approved / changes requested / merged / etc.).
    let ciStatusHtml = '';
    const prStatus = ciStatusData?.pr_status;
    const prReviewDecision = ciStatusData?.review_decision;

    if (prStatus) {
        const prStatusBadge = (status) => {
            const map = {
                merged:            ['status-success-bg', 'MERGED'],
                approved:          ['status-success-bg', 'APPROVED'],
                closed:            ['status-failure-bg', 'CLOSED'],
                changes_requested: ['status-failure-bg', 'CHANGES REQUESTED'],
                review_required:   ['status-inprogress-bg', 'REVIEW REQUIRED'],
                open:              ['status-inprogress-bg', 'OPEN'],
                draft:             ['status-warning-bg', 'DRAFT']
            };
            const [cls, label] = map[status] || ['status-warning-bg', (status || 'N/A').toUpperCase()];
            return `<span class="status-badge ${cls}">${label}</span>`;
        };
        const decisionLabel = prReviewDecision
            ? prReviewDecision.replace(/_/g, ' ')
            : 'No review yet';

        ciStatusHtml = `
            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(0, 188, 235, 0.2);">
                <h4 style="color: var(--demo-blue); margin-bottom: 0.5rem;">GitHub PR Status</h4>
                <p><strong>PR Status:</strong> ${prStatusBadge(prStatus)}</p>
                <p><strong>Review Decision:</strong> <span style="text-transform: capitalize;">${decisionLabel.toLowerCase()}</span></p>
            </div>
        `;
    }
    
    const metadataHtml = `
        <div class="pr-metadata-grid">
            <div class="pr-metadata-left">
                <h3>Revision Summary</h3>
                <p><strong>Latest Revision:</strong> <span>${latestRevisionData.revision ?? 'N/A'}</span></p>
                <p><strong>Latest Commit:</strong> <span><a href="${commitBaseUrl}${latestRevisionData.commit_hash ?? ''}" target="_blank">${(latestRevisionData.commit_hash ?? 'N/A').substring(0, 7)}</a></span></p>
                ${fileDetailsHTML}
                ${ciStatusHtml}
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


    // --- 2. Score Card (aggregated across all revisions) ---
    renderScoreCard(dataList);

    // --- 3. Render individual revisions (CI/CD only) ---
    const revisionCardsHtml = dataList.map((data, index) => {
        // Open the latest revision by default
        const isOpen = index === 0 ? 'open' : '';
        return createRevisionCard(data, isOpen);
    }).join('');

    dashboardContainer.innerHTML = revisionCardsHtml;
    setDashboardExportReady(true);
}

// AI suggestions are generated by the GitHub Actions workflow and stored in the JSON files
// This client-side code only displays pre-generated suggestions from the dashboard_*.json files

// ── Score Card ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
//  Dashboard Insight Sections
//  Each helper is self-contained and returns an HTML string (or '' when it has no
//  data to show), so any single feature can be removed without touching the others.
// ═══════════════════════════════════════════════════════════════════════════════

// Shared: effective build duration for a revision (filters out timing noise)
function getEffectiveDuration(d) {
    if ((d.ci_duration_seconds || 0) > 10) return d.ci_duration_seconds;
    const gaRuns = (d.github_actions_runs || []).filter(r => (r.duration_seconds || 0) > 60);
    const gaMax = gaRuns.length > 0 ? Math.max(...gaRuns.map(r => r.duration_seconds)) : 0;
    if (gaMax > 0) return gaMax;
    const crRuns = (d.check_runs || []).filter(r => r.started_at && r.completed_at);
    if (crRuns.length > 0) {
        const elapsed = Math.max(...crRuns.map(r => Math.round((new Date(r.completed_at) - new Date(r.started_at)) / 1000)));
        if (elapsed > 60) return elapsed;
    }
    return 0;
}

// Shared: chronological (oldest → newest) copy of the revision list
function chronological(dataList) {
    return [...dataList].sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0));
}

// Shared: humanise a millisecond span → "3d 4h" / "5h 12m" / "8m"
function formatAgeSpan(ms) {
    if (ms == null || isNaN(ms) || ms < 0) return 'N/A';
    const days = Math.floor(ms / 86400000);
    const hrs  = Math.floor((ms % 86400000) / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (days > 0) return `${days}d ${hrs}h`;
    if (hrs  > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
}

// Feature 1: Merge Readiness Checklist (traffic-light on the latest revision)
function renderMergeReadiness(dataList) {
    const latest = dataList[0];
    if (!latest) return '';
    const rs = latest.review_stats || {};

    const buildsPass   = getOverallStatus(latest) === 'PASSING BUILD';
    const utStatus     = latest['Unit Tests: Build Status'];
    const utFailedCnt  = parseInt(latest['Unit Tests: Unit Tests Failed']) || 0;
    const utPass       = utStatus === 'SUCCESS' && utFailedCnt === 0;
    const unresolved   = rs.unresolved_threads;
    const threadsOk    = unresolved != null ? unresolved === 0 : null;
    const approvals    = rs.reviews_approved || 0;
    const changesReq   = rs.reviews_changes_requested || 0;

    const items = [
        { label: 'All module builds passing', ok: buildsPass, detail: buildsPass ? 'All green' : `${latest.failed_stage || 'Some'} failing` },
        { label: 'Unit tests green',           ok: (utStatus === 'SUCCESS' || utStatus == null) ? (utStatus == null ? null : utPass) : false, detail: utStatus == null ? 'No data' : (utPass ? 'Passed' : (utFailedCnt ? `${utFailedCnt} failed` : 'Not passing')) },
        { label: 'Review threads resolved', ok: threadsOk, detail: threadsOk == null ? 'No data yet' : (threadsOk ? 'All resolved' : `${unresolved} unresolved`) },
        { label: 'Has reviewer approval',      ok: approvals > 0, detail: approvals > 0 ? `${approvals} approval${approvals !== 1 ? 's' : ''}` : 'None yet' },
        { label: 'No changes requested',       ok: changesReq === 0, detail: changesReq === 0 ? 'Clear' : `${changesReq} requested` },
    ];

    const hardChecks  = items.filter(i => i.ok !== null);
    const passedCount = hardChecks.filter(i => i.ok === true).length;
    const allReady    = hardChecks.length > 0 && hardChecks.every(i => i.ok === true);
    const verdictColor = allReady ? '#10b981' : (passedCount >= hardChecks.length - 1 ? '#f59e0b' : '#ef4444');
    const verdictText  = allReady ? 'READY TO MERGE' : 'NOT READY';

    const rows = items.map(i => {
        const icon = i.ok === true ? '✅' : i.ok === false ? '❌' : '⚪';
        const col  = i.ok === true ? '#10b981' : i.ok === false ? '#ef4444' : '#64748b';
        return `<div style="display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0;border-bottom:1px solid rgba(255,255,255,0.04);">
            <span style="font-size:0.95rem;">${icon}</span>
            <span style="flex:1;font-size:0.82rem;color:var(--text);">${i.label}</span>
            <span style="font-size:0.72rem;color:${col};font-weight:600;">${i.detail}</span>
        </div>`;
    }).join('');

    return `
    <div class="card" style="padding:1.25rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
            <h3 style="color:var(--demo-blue);font-size:1rem;margin:0;">🚦 Merge Readiness</h3>
            <span style="background:${verdictColor}22;color:${verdictColor};border:1px solid ${verdictColor}55;padding:0.25rem 0.75rem;border-radius:1rem;font-size:0.72rem;font-weight:700;letter-spacing:0.03em;">${verdictText}</span>
        </div>
        ${rows}
    </div>`;
}

// Feature 2: Build History Timeline (Rev1 ❌ 30min → Rev2 ✅ 27min ...)
function renderBuildTimeline(dataList) {
    const chrono = chronological(dataList);
    if (chrono.length === 0) return '';
    const chips = chrono.map((d, i) => {
        const pass = getOverallStatus(d) === 'PASSING BUILD';
        const col  = pass ? '#10b981' : '#ef4444';
        const icon = pass ? '✅' : '❌';
        const dur  = getEffectiveDuration(d);
        const durLabel = dur > 0 ? calculateDuration(dur) : '—';
        const arrow = i < chrono.length - 1 ? `<span style="color:#475569;font-size:1.1rem;">→</span>` : '';
        return `
        <div style="display:flex;align-items:center;gap:0.5rem;">
            <div style="text-align:center;min-width:72px;background:rgba(239,246,255,0.95);border:1px solid ${col}55;border-radius:0.5rem;padding:0.5rem 0.6rem;">
                <div style="font-size:0.7rem;color:#94a3b8;font-weight:600;">Rev ${d.revision ?? (i + 1)}</div>
                <div style="font-size:1rem;margin:0.15rem 0;">${icon}</div>
                <div style="font-size:0.68rem;color:${col};font-weight:600;">${durLabel}</div>
            </div>
            ${arrow}
        </div>`;
    }).join('');
    return `
    <div class="card" style="padding:1.25rem;">
        <h3 style="color:var(--demo-blue);font-size:1rem;margin:0 0 0.85rem 0;">📈 Build History Timeline</h3>
        <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;overflow-x:auto;padding-bottom:0.25rem;">
            ${chips}
        </div>
    </div>`;
}

// Feature 3: PR Age & Velocity
function renderPrVelocity(dataList) {
    const chrono = chronological(dataList);
    if (chrono.length === 0) return '';
    const parseD = s => { const t = Date.parse(s); return isNaN(t) ? null : t; };
    const now = Date.now();
    const firstCreated = parseD(chrono[0].created_at);
    const lastUpdated  = parseD(dataList[0].updated_at) || parseD(dataList[0].created_at);
    const age = firstCreated != null ? now - firstCreated : null;

    const times = chrono.map(d => parseD(d.created_at)).filter(t => t != null);
    let avgGap = null;
    if (times.length > 1) {
        let sum = 0;
        for (let i = 1; i < times.length; i++) sum += times[i] - times[i - 1];
        avgGap = sum / (times.length - 1);
    }
    const lastActivity = lastUpdated != null ? now - lastUpdated : null;

    const tile = (val, label, color) => `
        <div style="background:rgba(239,246,255,0.95);border:1px solid rgba(59,130,246,0.18);border-radius:0.6rem;padding:0.75rem;text-align:center;">
            <div style="font-size:1.2rem;font-weight:700;color:${color};">${val}</div>
            <div style="font-size:0.68rem;color:#64748b;margin-top:0.2rem;">${label}</div>
        </div>`;
    return `
    <div class="card" style="padding:1.25rem;">
        <h3 style="color:var(--demo-blue);font-size:1rem;margin:0 0 0.85rem 0;">⏱️ PR Age & Velocity</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:0.6rem;">
            ${tile(formatAgeSpan(age), 'PR Age', '#3b82f6')}
            ${tile(chrono.length, 'Revisions', 'var(--demo-blue)')}
            ${tile(avgGap != null ? formatAgeSpan(avgGap) : 'N/A', 'Avg / Revision', '#a78bfa')}
            ${tile(lastActivity != null ? formatAgeSpan(lastActivity) + ' ago' : 'N/A', 'Last Activity', '#f59e0b')}
        </div>
    </div>`;
}

// Feature 4: Trend charts (coverage, churn, duration) — HTML shell; charts init later
function renderTrendCharts(dataList) {
    if (chronological(dataList).length < 2) return '';
    return `
    <div class="card" style="padding:1.25rem;">
        <h3 style="color:var(--demo-blue);font-size:1rem;margin:0 0 0.85rem 0;">📉 Trends Across Revisions</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;">
            <div>
                <div style="font-size:0.75rem;color:#94a3b8;margin-bottom:0.4rem;">Coverage %</div>
                <div style="height:90px;"><canvas id="sc-trendCoverage"></canvas></div>
            </div>
            <div>
                <div style="font-size:0.75rem;color:#94a3b8;margin-bottom:0.4rem;">Code Churn (± lines)</div>
                <div style="height:90px;"><canvas id="sc-trendChurn"></canvas></div>
            </div>
            <div>
                <div style="font-size:0.75rem;color:#94a3b8;margin-bottom:0.4rem;">Build Duration</div>
                <div style="height:90px;"><canvas id="sc-trendDuration"></canvas></div>
            </div>
        </div>
    </div>`;
}

function initTrendCharts(dataList) {
    const chrono = chronological(dataList);
    if (chrono.length < 2) return;
    const labels = chrono.map(d => 'R' + (d.revision ?? ''));
    const baseOpts = (fmt) => ({
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + fmt(ctx.raw) } } },
        scales: {
            x: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { display: false } },
            y: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
        },
        animation: { duration: 600 }, elements: { point: { radius: 2 } }
    });

    const covCanvas = document.getElementById('sc-trendCoverage');
    if (covCanvas) {
        const cov = chrono.map(d => { const c = parseFloat(d['Unit Tests: Coverage Percentage']); return isNaN(c) ? null : c; });
        new Chart(covCanvas, { type: 'line', data: { labels, datasets: [{ data: cov, borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.15)', fill: true, tension: 0.3, spanGaps: true }] }, options: baseOpts(v => v + '%') });
    }
    const churnCanvas = document.getElementById('sc-trendChurn');
    if (churnCanvas) {
        const adds = chrono.map(d => parseInt(d.additions) || 0);
        const dels = chrono.map(d => -(parseInt(d.deletions) || 0));
        new Chart(churnCanvas, {
            type: 'bar',
            data: { labels, datasets: [
                { data: adds, backgroundColor: 'rgba(16,185,129,0.7)' },
                { data: dels, backgroundColor: 'rgba(239,68,68,0.7)' }
            ] },
            options: { ...baseOpts(v => (v >= 0 ? '+' : '') + v + ' lines'),
                scales: {
                    x: { stacked: true, ticks: { color: '#64748b', font: { size: 9 } }, grid: { display: false } },
                    y: { stacked: true, ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
                } }
        });
    }
    const durCanvas = document.getElementById('sc-trendDuration');
    if (durCanvas) {
        const durs = chrono.map(d => { const s = getEffectiveDuration(d); return s > 0 ? Math.round(s / 60) : null; });
        new Chart(durCanvas, { type: 'line', data: { labels, datasets: [{ data: durs, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.15)', fill: true, tension: 0.3, spanGaps: true }] }, options: baseOpts(v => v + ' min') });
    }
}

// Feature 6: Reviewer Engagement panel
function renderReviewerEngagement(dataList) {
    const rev = dataList.find(d => d.review_stats);
    if (!rev) return '';
    const rs = rev.review_stats;
    const tile = (val, label, color) => `
        <div style="background:rgba(239,246,255,0.95);border:1px solid rgba(59,130,246,0.18);border-radius:0.6rem;padding:0.7rem;text-align:center;">
            <div style="font-size:1.3rem;font-weight:700;color:${color};">${val}</div>
            <div style="font-size:0.66rem;color:#64748b;margin-top:0.15rem;">${label}</div>
        </div>`;
    return `
    <div class="card" style="padding:1.25rem;">
        <h3 style="color:var(--demo-blue);font-size:1rem;margin:0 0 0.85rem 0;">👥 Reviewer Engagement</h3>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.6rem;">
            ${tile(rs.unique_reviewers || 0, 'Reviewers', 'var(--demo-blue)')}
            ${tile(rs.reviews_approved || 0, 'Approvals', '#10b981')}
            ${tile(rs.reviews_changes_requested || 0, 'Changes Req', '#ef4444')}
            ${tile(rs.total_review_comments || 0, 'Comments', '#a78bfa')}
        </div>
    </div>`;
}

// Feature 7: Flaky Module Detection (modules that both passed AND failed across revisions)
function renderFlakyModules(dataList) {
    if (dataList.length < 2) return '';
    const mod = {};
    dataList.forEach(d => {
        Object.keys(d).forEach(k => {
            if (k.endsWith(': Build Status')) {
                const name = k.replace(': Build Status', '');
                const st = d[k];
                if (st === 'SUCCESS' || st === 'FAILURE') {
                    mod[name] = mod[name] || { pass: 0, fail: 0 };
                    if (st === 'SUCCESS') mod[name].pass++; else mod[name].fail++;
                }
            }
        });
    });
    const flaky = Object.entries(mod).filter(([, v]) => v.pass > 0 && v.fail > 0).sort((a, b) => b[1].fail - a[1].fail);
    if (flaky.length === 0) return '';
    const rows = flaky.map(([name, v]) => {
        const total = v.pass + v.fail;
        const failPct = Math.round(v.fail / total * 100);
        return `
        <div style="display:flex;align-items:center;gap:0.6rem;padding:0.4rem 0;">
            <span style="flex:1;font-family:monospace;font-size:0.8rem;color:var(--text);">${name}</span>
            <span style="font-size:0.72rem;color:#10b981;">${v.pass}✓</span>
            <span style="font-size:0.72rem;color:#ef4444;">${v.fail}✗</span>
            <div style="width:80px;background:#1e293b;border-radius:0.3rem;height:6px;overflow:hidden;">
                <div style="height:100%;width:${failPct}%;background:#f59e0b;"></div>
            </div>
        </div>`;
    }).join('');
    return `
    <div class="card" style="padding:1.25rem;">
        <h3 style="color:var(--demo-blue);font-size:1rem;margin:0 0 0.35rem 0;">🎲 Flaky Modules</h3>
        <div style="font-size:0.72rem;color:#64748b;margin-bottom:0.6rem;">Modules that both passed and failed across revisions</div>
        ${rows}
    </div>`;
}

// Feature 8: Error Fingerprint (group error_message by type across builds)
function renderErrorFingerprint(dataList) {
    const errs = {};
    dataList.forEach(d => {
        const msg = d.error_message;
        if (msg && msg !== 'N/A' && String(msg).trim()) {
            const m = String(msg);
            let type = 'Other';
            if (/linker|undefined reference|vtable/i.test(m)) type = 'Linker Error';
            else if (/compil|syntax|expected|undeclared/i.test(m)) type = 'Compilation Error';
            else if (/timeout|timed out/i.test(m)) type = 'Timeout';
            else if (/test|assert/i.test(m)) type = 'Test Failure';
            else if (/dependency|not found|no such file|missing/i.test(m)) type = 'Missing Dependency';
            else if (/permission|denied|auth/i.test(m)) type = 'Permission / Auth';
            errs[type] = errs[type] || { count: 0, sample: m };
            errs[type].count++;
        }
    });
    const entries = Object.entries(errs).sort((a, b) => b[1].count - a[1].count);
    if (entries.length === 0) return '';
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = entries.map(([type, v]) => `
        <div style="padding:0.5rem 0;border-bottom:1px solid rgba(255,255,255,0.04);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:0.82rem;color:#ef4444;font-weight:600;">⚠ ${type}</span>
                <span style="font-size:0.72rem;color:#94a3b8;">${v.count}×</span>
            </div>
            <div style="font-size:0.7rem;color:#64748b;margin-top:0.2rem;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(v.sample.slice(0, 100))}</div>
        </div>`).join('');
    return `
    <div class="card" style="padding:1.25rem;">
        <h3 style="color:var(--demo-blue);font-size:1rem;margin:0 0 0.6rem 0;">🧬 Error Fingerprint</h3>
        ${rows}
    </div>`;
}

// Feature 9: CDET / bug ticket badge (linked to CDETS)
function renderCdetLink(dataList) {
    const rev = dataList.find(d => d.cdet && d.cdet !== 'N/A' && d.cdet !== 'No CDET found');
    if (!rev) return '';
    const cdet = rev.cdet;
    const url = `https://cdetsng.demo.com/summary/#/defect/${cdet}`;
    return `<a href="${url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:0.35rem;background:rgba(239,246,255,0.95);border:1px solid rgba(0,188,235,0.3);border-radius:1rem;padding:0.25rem 0.7rem;font-size:0.75rem;color:var(--demo-blue);text-decoration:none;font-weight:600;">🐞 ${cdet}</a>`;
}

function renderScoreCard(dataList) {
    const container = document.getElementById('scorecard-container');
    if (!container || dataList.length === 0) return;

    // ── Build Score Card data ─────────────────────────────────────────────────
    const total = dataList.length;
    const passedBuilds = dataList.filter(d => getOverallStatus(d) === 'PASSING BUILD').length;
    const failedBuilds  = total - passedBuilds;
    const buildSuccessRate = Math.round((passedBuilds / total) * 100);

    const utRevisions = dataList.filter(d => d['Unit Tests: Build Status'] && d['Unit Tests: Build Status'] !== 'N/A');
    const utPassed = utRevisions.filter(d => d['Unit Tests: Build Status'] === 'SUCCESS').length;
    const utFailed = utRevisions.length - utPassed;
    const utPassRate = utRevisions.length > 0 ? Math.round((utPassed / utRevisions.length) * 100) : 0;

    // Effective duration: prefer Jenkins ci_duration_seconds, fall back to
    // the longest GH Actions run duration, then to check_runs elapsed time
    const effectiveDuration = (d) => {
        // Require >10s to filter out timing noise (e.g. 1s from near-instant banner timestamps)
        if ((d.ci_duration_seconds || 0) > 10) return d.ci_duration_seconds;
        // Only use GH Actions runs >60s — utility workflows (PR-title setter, AI review) are 10-20s
        const gaRuns = (d.github_actions_runs || []).filter(r => (r.duration_seconds || 0) > 60);
        const gaMax = gaRuns.length > 0 ? Math.max(...gaRuns.map(r => r.duration_seconds)) : 0;
        if (gaMax > 0) return gaMax;
        // Check runs: only count if >60s (skip quick linting/scanning runs)
        const crRuns = (d.check_runs || []).filter(r => r.started_at && r.completed_at);
        if (crRuns.length > 0) {
            const elapsed = Math.max(...crRuns.map(r =>
                Math.round((new Date(r.completed_at) - new Date(r.started_at)) / 1000)));
            if (elapsed > 60) return elapsed;
        }
        return 0;
    };
    const durRevisions = dataList.filter(d => effectiveDuration(d) > 0);
    const avgDuration = durRevisions.length > 0
        ? Math.round(durRevisions.reduce((s, d) => s + effectiveDuration(d), 0) / durRevisions.length) : 0;

    const covRevisions = dataList.filter(d => { const c = d['Unit Tests: Coverage Percentage']; return c && c !== 'N/A' && !isNaN(parseFloat(c)); });
    const avgCoverage = covRevisions.length > 0
        ? (covRevisions.reduce((s, d) => s + parseFloat(d['Unit Tests: Coverage Percentage']), 0) / covRevisions.length).toFixed(1) : null;
    const coverageReportRevisions = dataList.filter(d => parseInt(d['Unit Tests: Coverage Reports Expected']) > 0);
    const coverageReportsAvailable = coverageReportRevisions.reduce((s, d) => s + (parseInt(d['Unit Tests: Coverage Reports Available']) || 0), 0);
    const coverageReportsExpected = coverageReportRevisions.reduce((s, d) => s + (parseInt(d['Unit Tests: Coverage Reports Expected']) || 0), 0);
    const coverageReportRate = coverageReportsExpected > 0 ? Math.round((coverageReportsAvailable / coverageReportsExpected) * 100) : null;
    const coverageScore = avgCoverage ? Math.min(parseFloat(avgCoverage), 100) : (coverageReportRate != null ? coverageReportRate : 50);
    const coverageDisplay = avgCoverage ? `${avgCoverage}%` : (coverageReportRate != null ? `${coverageReportRate}%` : 'N/A');

    const utCountRevisions = dataList.filter(d => parseInt(d['Unit Tests: Unit Tests Passed']) > 0);
    const avgUtTests = utCountRevisions.length > 0
        ? Math.round(utCountRevisions.reduce((s, d) => s + parseInt(d['Unit Tests: Unit Tests Passed'] || 0) + parseInt(d['Unit Tests: Unit Tests Failed'] || 0), 0) / utCountRevisions.length) : 0;
    // Use the most recent build's UT count (last revision with UT data), not a cumulative sum
    const lastUtRevision = [...dataList].reverse().find(d => (parseInt(d['Unit Tests: Unit Tests Passed']) || 0) > 0 || (parseInt(d['Unit Tests: Unit Tests Failed']) || 0) > 0);
    const totalUtTestsPassed = lastUtRevision ? (parseInt(lastUtRevision['Unit Tests: Unit Tests Passed']) || 0) : 0;
    const totalUtTestsFailed = lastUtRevision ? (parseInt(lastUtRevision['Unit Tests: Unit Tests Failed']) || 0) : 0;
    const totalUtTests = totalUtTestsPassed + totalUtTestsFailed;

    const coverityRevisions = dataList.filter(d => d['Coverity: Build Status'] && d['Coverity: Build Status'] !== 'N/A');
    const coverityPassed = coverityRevisions.filter(d => d['Coverity: Build Status'] === 'SUCCESS').length;
    const coverityFailed = coverityRevisions.filter(d => d['Coverity: Build Status'] === 'FAILURE').length;
    const coveritySkipped = coverityRevisions.filter(d => d['Coverity: Build Status'] === 'SKIPPED').length;
    const coverityScore = coverityRevisions.length > 0 ? Math.round((coverityPassed / coverityRevisions.length) * 100) : 50;

    const moduleFailures = {};
    dataList.forEach(d => { Object.keys(d).forEach(k => { if (k.endsWith(': Build Status') && d[k] === 'FAILURE') { const mod = k.replace(': Build Status', ''); if (mod !== 'Unit Tests') moduleFailures[mod] = (moduleFailures[mod] || 0) + 1; } }); });
    const sortedFailures = Object.entries(moduleFailures).sort((a, b) => b[1] - a[1]);

    // ── PR Review thread data (from review_stats) ─────────────────────────────
    const revWithStats = dataList.filter(d => d.review_stats);
    let rvTotalThreads = null, rvResolvedThreads = null, rvUnresolvedThreads = null, rvOutdatedThreadsGql = null;
    let rvTotalComments = 0, rvAuthorReplies = 0, rvCopilotTotal = 0, rvCopilotAddressed = 0;
    let rvOutdated = 0, rvApproved = 0, rvChangesReq = 0, rvMaxReviewers = 0;
    let hasReviewData = false;
    if (revWithStats.length > 0) {
        hasReviewData = true;
        rvTotalComments    = revWithStats.reduce((s, d) => s + (d.review_stats.total_review_comments || 0), 0);
        rvAuthorReplies    = revWithStats.reduce((s, d) => s + (d.review_stats.author_replies || 0), 0);
        rvCopilotTotal     = revWithStats.reduce((s, d) => s + (d.review_stats.copilot_comments || 0), 0);
        rvCopilotAddressed = revWithStats.reduce((s, d) => s + (d.review_stats.copilot_addressed || 0), 0);
        rvOutdated         = revWithStats.reduce((s, d) => s + (d.review_stats.outdated_threads || 0), 0);
        rvApproved         = revWithStats[0].review_stats.reviews_approved || 0;
        rvChangesReq       = revWithStats[0].review_stats.reviews_changes_requested || 0;
        rvMaxReviewers     = Math.max(...revWithStats.map(d => d.review_stats.unique_reviewers || 0));
        const latestWithGql = revWithStats.find(d => d.review_stats.total_threads != null);
        if (latestWithGql) {
            rvTotalThreads       = latestWithGql.review_stats.total_threads;
            rvResolvedThreads    = latestWithGql.review_stats.resolved_threads || 0;
            rvUnresolvedThreads  = latestWithGql.review_stats.unresolved_threads || 0;
            rvOutdatedThreadsGql = latestWithGql.review_stats.outdated_threads_gql || 0;
        }
    }

    // Thread resolution rate for health score (0-100); neutral 50 if no data yet
    const threadResolvedPct = (rvTotalThreads != null && rvTotalThreads > 0)
        ? Math.round((rvResolvedThreads / rvTotalThreads) * 100)
        : (rvTotalThreads === 0 ? 100 : null);
    const authorReplyPct = rvTotalComments > 0 ? Math.round((rvAuthorReplies / rvTotalComments) * 100) : null;
    const reviewCommentScore = threadResolvedPct != null
        ? threadResolvedPct
        : (authorReplyPct != null ? Math.min(authorReplyPct, 100) : 50);

    const healthScore = Math.round(
        buildSuccessRate   * 0.30 +
        utPassRate         * 0.20 +
        coverageScore      * 0.15 +
        coverityScore      * 0.15 +
        reviewCommentScore * 0.20
    );
    const healthColor = healthScore >= 80 ? '#10b981' : healthScore >= 55 ? '#f59e0b' : '#ef4444';
    const healthLabel = healthScore >= 80 ? 'HEALTHY' : healthScore >= 55 ? 'MODERATE' : 'NEEDS ATTENTION';

    // ── Additional insight sections (each modular / independently removable) ───
    const cdetBadge = renderCdetLink(dataList);
    const extraSections =
        renderMergeReadiness(dataList) +
        renderBuildTimeline(dataList) +
        renderTrendCharts(dataList) +
        renderPrVelocity(dataList) +
        renderReviewerEngagement(dataList) +
        renderFlakyModules(dataList) +
        renderErrorFingerprint(dataList);

    // ── Set container HTML ─────────────────────────────────────────────────────
    container.innerHTML = `
        <div style="display:grid; grid-template-columns:1fr; gap:1rem; margin-bottom:1.5rem;">
            <div class="card" style="padding:1.5rem;">
                <h3 style="color:var(--demo-blue); margin-bottom:1.5rem; font-size:1.15rem; border-bottom:1px solid rgba(0,188,235,0.2); padding-bottom:0.75rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
                    <span>📊 PR Build Score Card &nbsp;<span style="font-size:0.8rem; font-weight:400; color:#64748b;">${total} build${total !== 1 ? 's' : ''} analysed</span></span>
                    ${cdetBadge}
                </h3>
                <div style="display:grid; grid-template-columns:220px 1fr; gap:2rem; align-items:start;">
                    <!-- Overall Score doughnut -->
                    <div style="text-align:center;">
                        <div style="font-size:0.82rem; color:#94a3b8; margin-bottom:0.6rem; font-weight:600;">PR Overall Score</div>
                        <div style="position:relative; width:190px; margin:0 auto;">
                            <canvas id="sc-overallPie" width="190" height="190"></canvas>
                            <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); text-align:center; pointer-events:none;">
                                <div style="display:flex; align-items:baseline; justify-content:center; gap:0.1rem; color:${healthColor};">
                                    <span style="font-size:2rem; font-weight:700; line-height:1;">${healthScore}</span>
                                    <span style="font-size:0.85rem; font-weight:600; opacity:0.75;">/ 100</span>
                                </div>
                                <div style="font-size:0.65rem; color:${healthColor}; font-weight:600; letter-spacing:0.05em; margin-top:0.15rem;">${healthLabel}</div>
                            </div>
                        </div>
                        <!-- Score signal breakdown below the chart -->
                        <div style="margin-top:0.9rem; display:flex; flex-direction:column; gap:0.35rem; text-align:left; padding:0 0.25rem;">
                            <div style="display:flex; justify-content:space-between; font-size:0.75rem;">
                                <span style="color:#94a3b8;">🔨 Build success</span>
                                <span style="color:${buildSuccessRate >= 50 ? '#10b981' : '#ef4444'}; font-weight:600;">${buildSuccessRate}%</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; font-size:0.75rem;">
                                <span style="color:#94a3b8;">🧪 UT pass/fail</span>
                                <span style="color:${utPassRate >= 50 ? '#3b82f6' : '#f59e0b'}; font-weight:600;">${utPassRate}%</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; font-size:0.75rem;">
                                <span style="color:#94a3b8;">📊 UT coverage</span>
                                <span style="color:${coverageScore >= 70 ? '#10b981' : coverageScore >= 50 ? '#f59e0b' : '#ef4444'}; font-weight:600;">${coverageDisplay}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; font-size:0.75rem;">
                                <span style="color:#94a3b8;">🔬 Coverity</span>
                                <span style="color:${coverityScore >= 80 ? '#10b981' : coverityScore >= 50 ? '#f59e0b' : '#ef4444'}; font-weight:600;">${coverityPassed} / ${coverityRevisions.length || total}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; font-size:0.75rem;">
                                <span style="color:#94a3b8;">💬 Review comments</span>
                                <span style="color:${reviewCommentScore === 100 ? '#10b981' : reviewCommentScore >= 50 ? '#f59e0b' : '#ef4444'}; font-weight:600;">${threadResolvedPct != null ? `${threadResolvedPct}%` : (authorReplyPct != null ? `${authorReplyPct}%` : 'N/A')}</span>
                            </div>
                        </div>
                    </div>
                    <!-- Right: stat tiles + module info -->
                    <div>
                        <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:0.75rem; margin-bottom:1.25rem;">
                            <div style="background:rgba(239,246,255,0.95); border:1px solid rgba(59,130,246,0.18); border-radius:0.6rem; padding:0.75rem; text-align:center;">
                                <div style="font-size:1.5rem; font-weight:700; color:var(--demo-blue);">${total}</div>
                                <div style="font-size:0.7rem; color:#64748b; margin-top:0.2rem;">Total Revisions</div>
                            </div>
                            <div style="background:rgba(239,246,255,0.95); border:1px solid rgba(59,130,246,0.18); border-radius:0.6rem; padding:0.75rem; text-align:center;">
                                <div style="font-size:1.3rem; font-weight:700; color:#f59e0b;">${avgDuration > 0 ? calculateDuration(avgDuration) : 'N/A'}</div>
                                <div style="font-size:0.7rem; color:#64748b; margin-top:0.2rem;">Avg Build Time</div>
                            </div>
                            <div style="background:rgba(239,246,255,0.95); border:1px solid rgba(59,130,246,0.18); border-radius:0.6rem; padding:0.75rem; text-align:center;">
                                <div style="font-size:1.5rem; font-weight:700; color:#a78bfa;">${coverageDisplay}</div>
                                <div style="font-size:0.7rem; color:#64748b; margin-top:0.2rem;">UT Coverage</div>
                            </div>
                            <div style="background:rgba(239,246,255,0.95); border:1px solid rgba(59,130,246,0.18); border-radius:0.6rem; padding:0.75rem; text-align:center;">
                                <div style="font-size:1.5rem; font-weight:700; color:${coverityScore >= 80 ? '#10b981' : coverityScore >= 50 ? '#f59e0b' : '#ef4444'};">${coverityRevisions.length > 0 ? `${coverityPassed}/${coverityRevisions.length}` : 'N/A'}</div>
                                <div style="font-size:0.7rem; color:#64748b; margin-top:0.2rem;">Coverity Passed</div>
                            </div>
                        </div>
                        ${avgUtTests > 0 ? `
                        <div style="background:rgba(239,246,255,0.95); border:1px solid rgba(59,130,246,0.15); border-radius:0.6rem; padding:0.6rem 0.9rem; margin-bottom:1rem; display:flex; gap:2rem; font-size:0.82rem; color:#0f172a;">
                            <span>🧪 Avg UT stages/run: <strong style="color:var(--text);">${avgUtTests}</strong></span>
                            <span>📊 Coverage reports: <strong style="color:var(--text);">${coverageReportsAvailable} / ${coverageReportsExpected || 'N/A'}</strong></span>
                            <span>🔬 Coverity: <strong style="color:var(--text);">${coverityPassed} pass / ${coverityFailed} fail</strong></span>
                        </div>` : ''}
                        ${sortedFailures.length > 0 ? `
                        <div style="font-size:0.82rem; color:#94a3b8; margin-bottom:0.5rem; font-weight:600;">Most Failed Modules</div>
                        <div style="position:relative; height:${Math.min(sortedFailures.length, 6) * 32 + 36}px;">
                            <canvas id="sc-moduleBar"></canvas>
                        </div>` : `<div style="font-size:0.82rem; color:#10b981; padding:0.5rem 0;">✅ No module build failures across all builds</div>`}

                        ${(() => {
                            if (!hasReviewData) return '<div style="font-size:0.8rem;color:#334155;margin-top:0.75rem;">💬 Review thread data will appear after the next workflow run</div>';
                            const barPct = threadResolvedPct != null ? threadResolvedPct : 0;
                            const barColor = barPct === 100 ? '#10b981' : barPct >= 50 ? '#f59e0b' : '#ef4444';
                            const openColor = rvUnresolvedThreads === 0 ? '#10b981' : '#ef4444';
                            const resolvedLabel = rvTotalThreads != null ? `${rvResolvedThreads} / ${rvTotalThreads}` : '—';
                            const openLabel    = rvTotalThreads != null ? `${rvUnresolvedThreads}` : '—';
                            const pctLabel     = threadResolvedPct != null ? `${threadResolvedPct}%` : '—';
                            return `
                        <div style="margin-top:1rem;padding-top:0.85rem;border-top:1px solid rgba(0,188,235,0.12);">
                            <div style="font-size:0.82rem;color:#94a3b8;font-weight:600;margin-bottom:0.6rem;">💬 PR Review Threads</div>
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.6rem;margin-bottom:0.75rem;">
                                <div style="background:rgba(239,246,255,0.95);border:1px solid rgba(16,185,129,0.25);border-radius:0.5rem;padding:0.6rem;text-align:center;">
                                    <div style="font-size:1.3rem;font-weight:700;color:#10b981;">${resolvedLabel}</div>
                                    <div style="font-size:0.68rem;color:#64748b;margin-top:0.15rem;">Resolved</div>
                                </div>
                                <div style="background:rgba(239,246,255,0.95);border:1px solid rgba(${rvUnresolvedThreads === 0 ? '16,185,129' : '239,68,68'},0.25);border-radius:0.5rem;padding:0.6rem;text-align:center;">
                                    <div style="font-size:1.3rem;font-weight:700;color:${openColor};">${openLabel}</div>
                                    <div style="font-size:0.68rem;color:#64748b;margin-top:0.15rem;">Open</div>
                                </div>
                                <div style="background:rgba(239,246,255,0.95);border:1px solid rgba(0,188,235,0.2);border-radius:0.5rem;padding:0.6rem;text-align:center;">
                                    <div style="font-size:1.3rem;font-weight:700;color:${barColor};">${pctLabel}</div>
                                    <div style="font-size:0.68rem;color:#64748b;margin-top:0.15rem;">Resolution Rate</div>
                                </div>
                            </div>
                            <div style="background:rgba(59,130,246,0.12);border-radius:0.3rem;height:7px;overflow:hidden;">
                                <div style="height:100%;width:${barPct}%;background:${barColor};border-radius:0.3rem;transition:width 0.6s ease;"></div>
                            </div>
                            ${rvOutdatedThreadsGql > 0 ? `<div style="font-size:0.7rem;color:#f59e0b;margin-top:0.35rem;">⚠ ${rvOutdatedThreadsGql} outdated thread${rvOutdatedThreadsGql !== 1 ? 's' : ''}</div>` : ''}
                        </div>`;
                        })()}
                    </div>
                </div>
            </div>
            ${extraSections}
        </div>
    `;

    // ── Charts ────────────────────────────────────────────────────────────────
    const doughnutOpts = {
        responsive: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        animation: { duration: 700 },
        cutout: '68%'
    };

    // Overall Score doughnut — IMS weighted signals: build, UT, coverage, Coverity, review comments
    new Chart(document.getElementById('sc-overallPie'), {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [buildSuccessRate, utPassRate, coverageScore, coverityScore, reviewCommentScore],
                backgroundColor: [
                    buildSuccessRate >= 50  ? 'rgba(16,185,129,0.85)'  : 'rgba(239,68,68,0.85)',
                    utPassRate >= 50        ? 'rgba(59,130,246,0.85)'  : 'rgba(245,158,11,0.85)',
                    coverageScore >= 70     ? 'rgba(167,139,250,0.85)' : coverageScore >= 50 ? 'rgba(245,158,11,0.75)' : 'rgba(239,68,68,0.75)',
                    coverityScore >= 80     ? 'rgba(20,184,166,0.85)'  : coverityScore >= 50 ? 'rgba(245,158,11,0.75)' : 'rgba(239,68,68,0.75)',
                    reviewCommentScore === 100 ? 'rgba(16,185,129,0.7)' :
                    reviewCommentScore >= 50   ? 'rgba(245,158,11,0.7)' : 'rgba(239,68,68,0.7)'
                ],
                borderWidth: 2,
                borderColor: '#1e293b'
            }]
        },
        options: doughnutOpts
    });

    if (sortedFailures.length > 0) {
        const topMods = sortedFailures.slice(0, 6);
        new Chart(document.getElementById('sc-moduleBar'), {
            type: 'bar',
            data: {
                labels: topMods.map(([m]) => m),
                datasets: [{ data: topMods.map(([, c]) => c), backgroundColor: topMods.map(([, c]) => `rgba(239,68,68,${Math.min(0.4 + c * 0.1, 0.9)})`), borderColor: '#ef4444', borderWidth: 1, borderRadius: 4 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                layout: { padding: { right: 12, bottom: 4 } },
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` Failed ${ctx.raw}× out of ${total} revision${total !== 1 ? 's' : ''}` } } },
                scales: { x: { beginAtZero: true, max: total, ticks: { color: '#64748b', stepSize: 1, precision: 0 }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { ticks: { color: '#94a3b8', font: { size: 12 } }, grid: { display: false } } },
                animation: { duration: 700 }
            }
        });
    }

    // Trend sparklines (coverage / churn / duration) for the new insight section
    initTrendCharts(dataList);
}
// ── End Score Card ─────────────────────────────────────────────────────────────

// --- Execute when the window loads ---
window.onload = () => {
    window.NetSecAccessControl.runWhenAuthorized(() => {
        setupDashboardExportButton();
        setDashboardExportReady(false);
        loadMetrics();
    });
};

