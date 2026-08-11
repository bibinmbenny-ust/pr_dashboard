document.addEventListener('DOMContentLoaded', async () => {
    try {
        const url = 'includes/footer.html';
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return;
        const html = await res.text();
        // Replace any existing footer elements with the shared footer
        const existing = document.getElementById('site-footer');
        if (existing) {
            existing.outerHTML = html;
            return;
        }
        // Insert at end of body
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container.firstElementChild);
    } catch (err) {
        // silent fail
        console.error('Failed to load shared footer', err);
    }
});
