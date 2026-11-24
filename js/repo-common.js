// Shared helpers for the Repo Dashboard pages (repo-list.html, repo-details.html).
// Data is read from static JSON under repo-reports/ that a GitHub workflow produces.
// These pages never call the GitHub API themselves.
const REPO_PROJECTS = {
    FXOS: { key: 'FXOS', displayName: 'Orion' },
    IMS: { key: 'IMS', displayName: 'Luna' },
    USM: { key: 'USM', displayName: 'Harbor' },
    ASA: { key: 'ASA', displayName: 'Quasar' }
};

// Fixed color per language so a language keeps its color on every page.
// Dark-mode categorical slots, validated against the card surface (#111a2d).
const LANGUAGE_COLORS = {
    'C': '#3987e5',
    'C++': '#d95926',
    'Python': '#199e70',
    'TypeScript': '#c98500',
    'Go': '#d55181',
    'Shell': '#0ca30c',
    'Java': '#9085e9',
    'HCL': '#e66767'
};
const OTHER_LANGUAGE_COLOR = '#7d8ba3';

const RepoCommon = {
    getProject() {
        const key = (new URLSearchParams(window.location.search).get('project') || '').toUpperCase();
        return REPO_PROJECTS[key] || null;
    },

    async fetchJSON(url) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const res = await fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.json();
            } catch (err) {
                console.error(`Failed to load ${url} (attempt ${attempt + 1}): ${err.message}`);
                if (attempt === 0) await new Promise(r => setTimeout(r, 800));
            }
        }
        return null;
    },

    esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    },

    num(n) {
        return Number(n || 0).toLocaleString('en-US');
    },

    formatDate(iso) {
        if (!iso) return 'N/A';
        return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    },

    timeAgo(iso) {
        if (!iso) return 'never';
        const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
        const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
        for (const [name, size] of units) {
            const value = Math.floor(seconds / size);
            if (value >= 1) return `${value} ${name}${value > 1 ? 's' : ''} ago`;
        }
        return 'just now';
    },

    formatSize(kb) {
        if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(1)} GB`;
        if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
        return `${kb} KB`;
    },

    formatDuration(seconds) {
        if (seconds == null) return '';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
    },

    languageColor(lang) {
        return LANGUAGE_COLORS[lang] || OTHER_LANGUAGE_COLOR;
    },

    // CI status shown with icon + label, never color alone.
    ciBadge(status) {
        const map = {
            success: ['status-success-bg', '✓ Passing'],
            failure: ['status-failure-bg', '✕ Failing'],
            in_progress: ['status-inprogress-bg', '● Running'],
            none: ['rd-badge-muted', '– No CI']
        };
        const [cls, label] = map[status] || map.none;
        return `<span class="status-badge ${cls}">${label}</span>`;
    },

    runBadge(run) {
        if (!run) return RepoCommon.ciBadge('none');
        if (run.status !== 'completed') return RepoCommon.ciBadge('in_progress');
        return RepoCommon.ciBadge(run.conclusion === 'success' ? 'success' : 'failure');
    },

    visibilityBadge(visibility) {
        const v = RepoCommon.esc(visibility || 'private');
        return `<span class="rd-visibility rd-visibility-${v}">${v}</span>`;
    },

    showError(container, message, backHref) {
        container.innerHTML = `
            <div class="rd-empty">
                <p><span style="color: var(--failure);">⚠️ ${message}</span></p>
                <p>The repository data workflow may not have run yet, or the file doesn't exist.</p>
                <a href="${backHref}" class="btn">Go back</a>
            </div>`;
    }
};
