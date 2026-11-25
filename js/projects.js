// Project picker: shared by the PR, Repo and JIRA dashboards.
// projects.html                -> project cards open the PR list (default)
// projects.html?dashboard=repo -> the same cards open the repository list
// projects.html?dashboard=jira -> the same cards open the JIRA project view, plus a Portfolio link
(() => {
    const MODES = {
        repo: {
            title: 'Repo Dashboard - OneView Dashboard',
            subtitle: 'Choose a project to explore its GitHub repositories.',
            target: p => `repo-list.html?project=${p}`,
            button: 'View Repos',
            stats: '<span class="stat">📦 Repositories</span><span class="stat">🛡️ Security</span>',
            blurbs: {
                ORION: 'Orion repositories: activity, CI health, security alerts and repo health.',
                LUNA: 'Luna repositories: contributors, branch protection, releases and alerts.',
                HARBOR: 'Harbor repositories: workflows, open issues, languages and activity.',
                QUASAR: 'Quasar repositories: commit trends, CI status, security and settings.'
            }
        },
        jira: {
            title: 'JIRA Dashboard - OneView Dashboard',
            subtitle: 'Choose a project to see its sprint, board, team workload and issues, or compare all projects in the Portfolio view.',
            target: p => `jira-project.html?project=${p}`,
            button: 'View JIRA',
            stats: '<span class="stat">🏃 Sprint</span><span class="stat">👥 Team</span>',
            blurbs: {
                ORION: 'Orion JIRA: sprint health, blockers, workload and releases.',
                LUNA: 'Luna JIRA: sprint health, blockers, workload and releases.',
                HARBOR: 'Harbor JIRA: sprint health, blockers, workload and releases.',
                QUASAR: 'Quasar JIRA: sprint health, blockers, workload and releases.'
            },
            extra: '<a href="jira-portfolio.html" class="btn btn-primary jr-portfolio-link">📊 View all projects (Portfolio)</a>'
        }
    };
    const mode = MODES[new URLSearchParams(window.location.search).get('dashboard')];
    if (!mode) return;

    document.addEventListener('DOMContentLoaded', () => {
        document.title = mode.title;

        const subtitle = document.querySelector('.intro-section .hero-subtitle');
        if (subtitle) subtitle.textContent = mode.subtitle;
        if (mode.extra) {
            const pills = document.querySelector('.intro-section .feature-pills');
            if (pills) pills.insertAdjacentHTML('afterend', `<div class="jr-portfolio-cta">${mode.extra}</div>`);
        }

        document.querySelectorAll('.project-card').forEach(card => {
            const link = card.querySelector('a.btn');
            const match = link && link.getAttribute('href').match(/project=([A-Za-z]+)/);
            if (!match) return;
            const project = match[1].toUpperCase();
            const target = mode.target(project);

            link.setAttribute('href', target);
            link.textContent = mode.button;
            card.onclick = () => { window.location.href = target; };

            const blurb = card.querySelector('p');
            if (blurb && mode.blurbs[project]) blurb.textContent = mode.blurbs[project];

            const stats = card.querySelector('.card-stats');
            if (stats) stats.innerHTML = mode.stats;
        });
    });
})();
