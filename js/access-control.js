(() => {
    const CONFIG = {
        enabled: true,
        requiredRepo: 'cisco-sbg-emu/netsec-pr-dashboard',
        allowedOrganizations: ['cisco-sbg-emu'],
        tokenStorageKey: 'netsec-dashboard-github-token',
        authStorageKey: 'netsec-dashboard-auth-v1',
        sessionAuthTtlMs: 8 * 60 * 60 * 1000,
        rememberedAuthTtlMs: 30 * 24 * 60 * 60 * 1000
    };

    const callbacks = [];
    let state = CONFIG.enabled ? 'pending' : 'authorized';

    document.documentElement.classList.add(CONFIG.enabled ? 'access-pending' : 'access-granted');

    function runWhenAuthorized(callback) {
        if (!CONFIG.enabled || state === 'authorized') {
            callback();
            return;
        }
        callbacks.push(callback);
    }

    window.NetSecAccessControl = {
        runWhenAuthorized
    };

    function getStoredAuth() {
        return getStoredAccess(sessionStorage) || getStoredAccess(localStorage);
    }

    function getStoredAccess(storage) {
        try {
            const raw = storage.getItem(CONFIG.authStorageKey);
            const token = storage.getItem(CONFIG.tokenStorageKey);
            if (!raw || !token) return null;
            const auth = JSON.parse(raw);
            return { auth, token, storage };
        } catch (error) {
            return null;
        }
    }

    function storeAuth(user, token, rememberBrowser) {
        const storage = rememberBrowser ? localStorage : sessionStorage;
        const otherStorage = rememberBrowser ? sessionStorage : localStorage;
        const ttlMs = rememberBrowser ? CONFIG.rememberedAuthTtlMs : CONFIG.sessionAuthTtlMs;

        otherStorage.removeItem(CONFIG.authStorageKey);
        otherStorage.removeItem(CONFIG.tokenStorageKey);
        storage.setItem(CONFIG.tokenStorageKey, token);
        storage.setItem(CONFIG.authStorageKey, JSON.stringify({
            login: user.login,
            expiresAt: Date.now() + ttlMs,
            remembered: rememberBrowser
        }));
    }

    function getStoredAuthLegacy() {
        try {
            const raw = sessionStorage.getItem(CONFIG.authStorageKey);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    }

    function clearAuth() {
        sessionStorage.removeItem(CONFIG.authStorageKey);
        sessionStorage.removeItem(CONFIG.tokenStorageKey);
        localStorage.removeItem(CONFIG.authStorageKey);
        localStorage.removeItem(CONFIG.tokenStorageKey);
    }

    function setState(nextState) {
        state = nextState;
        document.documentElement.classList.toggle('access-pending', nextState === 'pending');
        document.documentElement.classList.toggle('access-denied', nextState !== 'authorized');
        document.documentElement.classList.toggle('access-granted', nextState === 'authorized');
    }

    function renderGate(message = '') {
        let root = document.getElementById('access-control-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'access-control-root';
            document.body.prepend(root);
        }

        root.innerHTML = `
            <section class="access-card" role="dialog" aria-labelledby="access-title" aria-modal="true">
                <div class="access-card-header">
                    <img src="img/cisco-logo.png" alt="Cisco Logo" class="access-logo" />
                    <span class="access-kicker">Restricted Dashboard</span>
                </div>
                <h1 id="access-title">GitHub access required</h1>
                <p class="access-copy">Use a GitHub token that can read the dashboard repository and verify membership in the approved organization.</p>
                <form id="access-form" class="access-form">
                    <label for="access-token">GitHub token</label>
                    <input id="access-token" name="token" type="password" autocomplete="off" required placeholder="ghp_... or github_pat_..." />
                    <label class="access-checkbox" for="access-remember">
                        <input id="access-remember" name="remember" type="checkbox" checked />
                        <span>Remember this browser for 30 days</span>
                    </label>
                    <button class="btn" type="submit">Unlock Dashboard</button>
                </form>
                <p class="access-help">Required scopes: repo read access and read:org for organization membership checks. Use Sign out to clear saved access from this browser.</p>
                ${message ? `<p class="access-error" role="alert">${message}</p>` : ''}
            </section>
        `;

        const form = document.getElementById('access-form');
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const button = form.querySelector('button');
            const input = document.getElementById('access-token');
            const remember = document.getElementById('access-remember')?.checked !== false;
            const token = input.value.trim();
            if (!token) return;

            button.disabled = true;
            button.textContent = 'Checking Access...';

            try {
                const user = await validateToken(token);
                grantAccess(user, token, remember);
            } catch (error) {
                clearAuth();
                setState('denied');
                renderGate(error.message || 'Access denied.');
            }
        });
    }

    async function githubFetch(path, token) {
        const response = await fetch(`https://api.github.com${path}`, {
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28'
            },
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`GitHub API returned ${response.status}`);
        }

        return response.json();
    }

    async function validateToken(token) {
        const user = await githubFetch('/user', token);

        if (CONFIG.requiredRepo) {
            await githubFetch(`/repos/${CONFIG.requiredRepo}`, token);
        }

        for (const org of CONFIG.allowedOrganizations) {
            const membership = await githubFetch(`/user/memberships/orgs/${org}`, token);
            if (membership.state !== 'active') {
                throw new Error(`Your GitHub account is not an active member of ${org}.`);
            }
        }

        return user;
    }

    function renderSignOut(user) {
        const button = document.createElement('button');
        button.id = 'access-sign-out';
        button.type = 'button';
        button.textContent = `Sign out ${user.login}`;
        button.addEventListener('click', () => {
            clearAuth();
            location.reload();
        });
        document.body.appendChild(button);
    }

    function grantAccess(user, token, rememberBrowser) {
        if (token) {
            storeAuth(user, token, rememberBrowser);
        }
        setState('authorized');
        document.getElementById('access-control-root')?.remove();
        renderSignOut(user);

        while (callbacks.length) {
            callbacks.shift()();
        }
    }

    async function initializeAccessControl() {
        if (!CONFIG.enabled) return;

        const storedAccess = getStoredAuth();
        const storedAuth = storedAccess?.auth || getStoredAuthLegacy();
        const storedToken = storedAccess?.token || sessionStorage.getItem(CONFIG.tokenStorageKey);

        if (storedAuth?.expiresAt > Date.now() && storedToken) {
            try {
                const user = await validateToken(storedToken);
                grantAccess(user);
                return;
            } catch (error) {
                clearAuth();
            }
        }

        setState('denied');
        renderGate();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeAccessControl, { once: true });
    } else {
        initializeAccessControl();
    }
})();