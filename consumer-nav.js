/* ═══════════════════════════════════════════════════════════════
   consumer-nav.js — Shared Consumer Sidebar + Nav Logic
   Include AFTER script.js on every consumer page.
   Call: buildConsumerSidebar('pageKey') on DOMContentLoaded
   pageKeys: 'dashboard' | 'generation' | 'grid' | 'battery'
             | 'bills' | 'qr' | 'profile' | 'settings'
═══════════════════════════════════════════════════════════════ */
"use strict";

const NAV_ITEMS = [
    { key: 'dashboard', icon: '🏠', label: 'Overview', url: 'dashboard.html', section: 'My Dashboard' },
    { key: 'generation', icon: '☀', label: 'Solar Generation', url: 'consumer-generation.html', section: 'My Energy' },
    { key: 'grid', icon: '⚡', label: 'Grid Export/Import', url: 'consumer-grid.html', section: null },
    { key: 'battery', icon: '🔋', label: 'Battery Status', url: 'consumer-battery.html', section: null },
    { key: 'bills', icon: '🧾', label: 'My Bills', url: 'consumer-bills.html', section: 'Billing' },
    { key: 'qr', icon: '📱', label: 'Scan QR Code', url: 'consumer-qr.html', section: null },
    { key: 'profile', icon: '👤', label: 'My Profile', url: 'consumer-profile.html', section: 'Account' },
    { key: 'settings', icon: '⚙', label: 'Settings', url: 'consumer-settings.html', section: null },
    { key: 'logout', icon: '🚪', label: 'Logout', url: null, section: null },
];

function buildConsumerSidebar(activeKey) {
    const sidebar = document.getElementById('csb');
    if (!sidebar) return;

    let html = `
  <div class="csb-brand">
    <div class="sb-brand-icon" style="background:none;box-shadow:none;"><img src="logo.png" width="32" height="32" alt="Logo"></div>
    <div class="sb-brand-text"><div class="cb-name">SolarTrack Pro</div><div class="cb-sub">TNPDCL Net Metering</div></div>
  </div>
  <div class="csb-user">
    <div class="csb-av">👤</div>
    <div class="sb-user-text"><div class="sb-uname" id="sb-uname">Consumer</div><div class="sb-urole">Solar Consumer</div></div>
  </div>
  <nav class="csb-nav">`;

    let lastSection = '';
    NAV_ITEMS.forEach(item => {
        if (item.section && item.section !== lastSection) {
            html += `<div class="sb-label">${item.section}</div>`;
            lastSection = item.section;
        } else if (!item.section && lastSection === '') {
            // no label
        }
        const isActive = item.key === activeKey ? ' active' : '';
        const onclick = item.key === 'logout'
            ? `onclick="authLogout()"`
            : `onclick="navTo('${item.url}')"`;
        html += `<div class="snav-item${isActive}" ${onclick}><span class="sni-icon">${item.icon}</span><span class="sni-label">${item.label}</span></div>`;
    });

    html += `</nav>
  <div class="csb-foot">
    <div class="sb-foot-txt">Tamil Nadu Power Distribution<br>Corporation Ltd. — Solar Division<br><span id="sb-date" style="color:var(--green);font-weight:600"></span></div>
  </div>`;

    sidebar.innerHTML = html;

    // Populate user name from session
    const s = getSession();
    if (s) {
        const el = document.getElementById('sb-uname');
        if (el) el.textContent = s.name;
    }

    // Update date
    function updateDate() {
        const el = document.getElementById('sb-date');
        if (el) el.textContent = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    updateDate();
    setInterval(updateDate, 60000);
}

/* ── Sidebar toggle (shared) ── */
function initSidebarToggle() {
    const csb = document.getElementById('csb');
    const cmain = document.getElementById('cmain');
    const hbg = document.getElementById('hbg');
    const ov = document.getElementById('overlay');
    if (!csb || !cmain || !hbg) return;

    let open = false;
    const mob = () => window.innerWidth <= 768;

    hbg.addEventListener('click', () => {
        if (mob()) {
            open = !open;
            csb.classList.toggle('mob-open', open);
            if (ov) ov.style.display = open ? 'block' : 'none';
            csb.classList.remove('collapsed');
            hbg.classList.toggle('open', open);
        } else {
            open = !open;
            csb.classList.toggle('collapsed', !open);
            cmain.classList.toggle('sb-col', !open);
            hbg.classList.toggle('open', open);
        }
    });

    if (ov) ov.addEventListener('click', () => {
        open = false;
        csb.classList.remove('mob-open');
        ov.style.display = 'none';
        hbg.classList.remove('open');
    });
}

/* ── Navigation with fade transition ── */
function navTo(url) {
    if (!url) return;
    document.body.style.transition = 'opacity .28s ease';
    document.body.style.opacity = '0';
    setTimeout(() => window.location.href = url, 290);
}
