// Small SVG/HTML chart helpers for the JIRA Dashboard. No external library.
// Rules: one y-axis, thin marks, 4px rounded bar ends, 2px gaps, legend for 2+ series,
// hover tooltip on every mark (elements with data-tip), text in text colors only.
const JiraCharts = (() => {
    const esc = s => RepoCommon.esc(s);
    const num = n => RepoCommon.num(n);

    function niceMax(v) {
        if (v <= 5) return 5;
        const p = Math.pow(10, Math.floor(Math.log10(v)));
        return Math.ceil(v / p) * p;
    }

    function legend(series) {
        if (series.length < 2) return '';
        return `<ul class="rd-legend">${series.map(s => `
            <li><i class="jr-key ${s.dashed ? 'jr-key-dashed' : ''}" style="--c:${s.color}"></i>${esc(s.name)}</li>`).join('')}</ul>`;
    }

    // Rounded top, square baseline.
    function barPath(x, top, w, base) {
        const h = base - top;
        if (h <= 0) return '';
        const r = Math.min(4, h, w / 2);
        return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
    }

    function axis(W, H, pad, max, y) {
        return `
            <line class="rd-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(max)}" y2="${y(max)}" />
            <line class="rd-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(max / 2)}" y2="${y(max / 2)}" />
            <line class="rd-axis" x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}" />
            <text class="rd-axis-text" x="${pad.l - 6}" y="${y(max) + 4}" text-anchor="end">${num(max)}</text>
            <text class="rd-axis-text" x="${pad.l - 6}" y="${y(max / 2) + 4}" text-anchor="end">${num(max / 2)}</text>
            <text class="rd-axis-text" x="${pad.l - 6}" y="${H - pad.b + 4}" text-anchor="end">0</text>`;
    }

    // Evenly spaced labels; the last label replaces the previous one when they would collide.
    function xLabels(labels, xAt, H, every) {
        const last = labels.length - 1;
        const prev = Math.floor(last / every) * every;
        const show = i => i === last || (i % every === 0 && !(i === prev && last - prev < every));
        return labels.map((l, i) => show(i)
            ? `<text class="rd-axis-text" x="${xAt(i)}" y="${H - 6}" text-anchor="middle">${esc(l)}</text>` : '').join('');
    }

    // Vertical bars: 1 series, or 2 series grouped side by side.
    function bars({ labels, series, height = 200, ariaLabel, unit = '' }) {
        const W = 600, H = height, pad = { l: 34, r: 8, t: 10, b: 24 };
        const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)));
        const y = v => pad.t + (H - pad.t - pad.b) * (1 - v / max);
        const colW = (W - pad.l - pad.r) / labels.length;
        const groupW = Math.min(series.length === 1 ? 34 : 44, colW - 8);
        const barW = (groupW - (series.length - 1) * 2) / series.length;
        const base = H - pad.b;
        const cols = labels.map((label, i) => {
            const x0 = pad.l + i * colW + (colW - groupW) / 2;
            const tip = `${esc(label)}<br>` + series.map(s => `${esc(s.name)}: <strong>${num(s.values[i])}${unit}</strong>`).join('<br>');
            return `<g class="jr-col" data-tip="${tip}">
                <rect class="rd-hit" x="${pad.l + i * colW}" y="${pad.t}" width="${colW}" height="${base - pad.t}" />
                ${series.map((s, k) => `<path class="jr-bar" fill="${s.color}" d="${barPath(x0 + k * (barW + 2), y(s.values[i]), barW, base)}" />`).join('')}
            </g>`;
        }).join('');
        return `<svg class="rd-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">
            ${axis(W, H, pad, max, y)}${cols}${xLabels(labels, i => pad.l + i * colW + colW / 2, H, Math.ceil(labels.length / 6))}
        </svg>${legend(series)}`;
    }

    // Lines with markers, a crosshair column per x, and direct end labels (<= 4 series).
    function lines({ labels, series, height = 200, ariaLabel }) {
        const W = 600, H = height, pad = { l: 34, r: 70, t: 12, b: 24 };
        const max = niceMax(Math.max(1, ...series.flatMap(s => s.values.filter(v => v != null))));
        const y = v => pad.t + (H - pad.t - pad.b) * (1 - v / max);
        const step = (W - pad.l - pad.r) / Math.max(1, labels.length - 1);
        const x = i => pad.l + i * step;
        const paths = series.map(s => {
            const pts = s.values.map((v, i) => v == null ? null : [x(i), y(v)]).filter(Boolean);
            const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
            const last = pts[pts.length - 1];
            return `<path class="jr-line" d="${d}" stroke="${s.color}" ${s.dashed ? 'stroke-dasharray="6 5"' : ''} />
                ${s.dashed ? '' : pts.map(p => `<circle class="jr-dot" cx="${p[0]}" cy="${p[1]}" r="4" fill="${s.color}" />`).join('')}
                ${last ? `<text class="jr-end-label" x="${last[0] + 8}" y="${last[1] + 4}">${esc(s.name)}</text>` : ''}`;
        }).join('');
        const hits = labels.map((label, i) => {
            const tip = `${esc(label)}<br>` + series.filter(s => s.values[i] != null)
                .map(s => `${esc(s.name)}: <strong>${num(s.values[i])}</strong>`).join('<br>');
            return `<g class="jr-col" data-tip="${tip}">
                <rect class="rd-hit" x="${x(i) - step / 2}" y="${pad.t}" width="${step}" height="${H - pad.t - pad.b}" />
                <line class="jr-crosshair" x1="${x(i)}" x2="${x(i)}" y1="${pad.t}" y2="${H - pad.b}" />
            </g>`;
        }).join('');
        return `<svg class="rd-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">
            ${axis(W, H, pad, max, y)}${hits}${paths}${xLabels(labels, x, H, Math.ceil(labels.length / 6))}
        </svg>${legend(series)}`;
    }

    // Horizontal stacked bar with 2px gaps and a legend carrying names + counts.
    function stacked(segments, { ariaLabel, showLegend = true } = {}) {
        const total = segments.reduce((a, s) => a + s.value, 0) || 1;
        const segs = segments.filter(s => s.value > 0).map(s => `
            <span class="rd-lang-seg" style="width:${(s.value / total) * 100}%;background:${s.color}"
                  data-tip="${esc(s.label)}: <strong>${num(s.value)}</strong> (${Math.round((s.value / total) * 100)}%)"></span>`).join('');
        const leg = showLegend ? `<ul class="rd-legend">${segments.map(s => `
            <li><i class="rd-lang-dot" style="background:${s.color}"></i>${esc(s.label)} <span class="rd-dim">${num(s.value)}</span></li>`).join('')}</ul>` : '';
        return `<div class="rd-lang-bar jr-stack" role="img" aria-label="${esc(ariaLabel || '')}">${segs}</div>${leg}`;
    }

    // Labeled horizontal bars for one measure across categories.
    function hbars(items, { color = JIRA_COLORS.single, unit = '' } = {}) {
        const max = Math.max(1, ...items.map(i => i.value));
        return `<ul class="rd-contrib jr-hbars">${items.map(i => `
            <li data-tip="${esc(i.label)}: <strong>${num(i.value)}${unit}</strong>">
                <span class="rd-contrib-name">${i.icon ? `${i.icon} ` : ''}${esc(i.label)}</span>
                <span class="rd-contrib-track"><span class="rd-contrib-bar" style="width:${(i.value / max) * 100}%;background:${color}"></span></span>
                <span class="rd-contrib-count">${num(i.value)}${unit}</span>
            </li>`).join('')}</ul>`;
    }

    function table(headers, rows) {
        return `<details class="rd-table-toggle"><summary>View as table</summary>
            <table class="rd-table"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;
    }

    function initTooltip(root) {
        let tip = document.getElementById('jr-tooltip');
        if (!tip) {
            tip = document.createElement('div');
            tip.id = 'jr-tooltip';
            tip.className = 'rd-tooltip';
            tip.setAttribute('role', 'tooltip');
            tip.hidden = true;
            document.body.appendChild(tip);
        }
        const clear = () => root.querySelectorAll('.rd-active').forEach(n => n.classList.remove('rd-active'));
        root.addEventListener('mousemove', e => {
            const el = e.target.closest('[data-tip]');
            if (!el || !root.contains(el)) { tip.hidden = true; clear(); return; }
            clear();
            el.classList.add('rd-active');
            tip.innerHTML = el.getAttribute('data-tip');
            tip.hidden = false;
            const box = tip.getBoundingClientRect();
            const left = Math.min(window.innerWidth - box.width - 8, Math.max(8, e.clientX - box.width / 2));
            tip.style.left = `${left + window.scrollX}px`;
            tip.style.top = `${e.clientY + window.scrollY - box.height - 14}px`;
        });
        root.addEventListener('mouseleave', () => { tip.hidden = true; clear(); });
    }

    return { bars, lines, stacked, hbars, table, initTooltip };
})();
