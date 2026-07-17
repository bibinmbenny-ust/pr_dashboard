// PR Overview login gate.
// Temporary username/password auth. Credentials live base64-encoded in
// auth/pr-overview-credentials.txt (to be replaced with a real auth option later).
(() => {
    const CREDENTIALS_URL = 'auth/pr-overview-credentials.txt?v=20260717';
    const SESSION_KEY = 'pr-overview-auth';

    function decode(value) {
        try {
            return atob((value || '').trim());
        } catch (err) {
            return '';
        }
    }

    async function loadCredentials() {
        const res = await fetch(CREDENTIALS_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load credentials (${res.status})`);
        const text = await res.text();
        const creds = { user: '', pass: '' };
        text.split(/\r?\n/).forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const idx = trimmed.indexOf('=');
            if (idx === -1) return;
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim();
            if (key === 'user') creds.user = decode(val);
            else if (key === 'pass') creds.pass = decode(val);
        });
        return creds;
    }

    function buildOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'pr-overview-login';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:9999',
            'display:flex', 'align-items:center', 'justify-content:center',
            'background:rgba(15,23,42,0.92)', 'backdrop-filter:blur(4px)'
        ].join(';');

        overlay.innerHTML = `
            <form id="pr-overview-login-form" style="
                width:min(360px,90vw);background:#ffffff;border-radius:14px;
                padding:1.75rem 1.75rem 1.5rem;box-shadow:0 24px 60px rgba(0,0,0,0.45);
                font-family:inherit;">
                <h2 style="margin:0 0 0.35rem;font-size:1.25rem;color:#0f172a;">PR Overview Login</h2>
                <p style="margin:0 0 1.25rem;font-size:0.85rem;color:#64748b;">
                    Enter your credentials to view the analytics.
                </p>
                <label style="display:block;font-size:0.8rem;color:#475569;margin-bottom:0.35rem;">Username</label>
                <input id="pr-login-user" type="text" autocomplete="username" required style="
                    width:100%;padding:0.6rem 0.7rem;margin-bottom:1rem;border:1px solid #cbd5e1;
                    border-radius:8px;font-size:0.9rem;box-sizing:border-box;">
                <label style="display:block;font-size:0.8rem;color:#475569;margin-bottom:0.35rem;">Password</label>
                <input id="pr-login-pass" type="password" autocomplete="current-password" required style="
                    width:100%;padding:0.6rem 0.7rem;margin-bottom:1rem;border:1px solid #cbd5e1;
                    border-radius:8px;font-size:0.9rem;box-sizing:border-box;">
                <div id="pr-login-error" style="min-height:1.1rem;margin-bottom:0.75rem;
                    font-size:0.8rem;color:#ef4444;"></div>
                <button type="submit" style="
                    width:100%;padding:0.65rem;border:none;border-radius:8px;cursor:pointer;
                    background:#1d4ed8;color:#fff;font-size:0.95rem;font-weight:600;">Sign in</button>
            </form>`;
        return overlay;
    }

    function requireLogin(onSuccess) {
        if (sessionStorage.getItem(SESSION_KEY) === 'ok') {
            onSuccess();
            return;
        }

        const overlay = buildOverlay();
        document.body.appendChild(overlay);

        const form = overlay.querySelector('#pr-overview-login-form');
        const userInput = overlay.querySelector('#pr-login-user');
        const passInput = overlay.querySelector('#pr-login-pass');
        const errorEl = overlay.querySelector('#pr-login-error');
        userInput.focus();

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            errorEl.textContent = '';
            try {
                const creds = await loadCredentials();
                if (userInput.value === creds.user && passInput.value === creds.pass) {
                    sessionStorage.setItem(SESSION_KEY, 'ok');
                    overlay.remove();
                    onSuccess();
                } else {
                    errorEl.textContent = 'Invalid username or password.';
                    passInput.value = '';
                    passInput.focus();
                }
            } catch (err) {
                errorEl.textContent = 'Unable to verify credentials. Please try again.';
            }
        });
    }

    window.PROverviewAuth = { requireLogin };
})();
