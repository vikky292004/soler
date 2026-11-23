/* ═══════════════════════════════════════════════════════════════
   script.js  —  SolarTrack Pro v2.2
   ► Role-Based Authentication (Admin / Consumer)
   ► Session management (localStorage)
   ► Route guards (requireRole / requireAuth)
   ► Date / Time utilities
   ► DOM helpers · Form helpers · Chart helpers
   ► QR payload builder · Storage helpers
   ► Export / Print · Toast notifications · CSV export
═══════════════════════════════════════════════════════════════ */

"use strict";

/* ═══════════════════════════════════════════════════════════════
   AUTH  —  Role-Based Session System
═══════════════════════════════════════════════════════════════ */

/** Known users db (replace with Firebase in production) */
const USERS_DB = {
  admin: { password: "admin123", role: "admin", name: "TNPDCL Administrator", serviceNumber: "ADMIN-001", address: "TNPDCL HQ, Anna Salai, Chennai", section: "Solar Division", mobile: "044-28521230", email: "admin@solartrack-pro.com", capacity: "N/A", meterSerial: "ADMIN", tariff: 5.00 },
  akaash: { password: "solar123", role: "consumer", name: "Akaash Kumar", serviceNumber: "TN2225041843", address: "12, Gandhi Nagar, T. Nagar, Chennai - 600017", section: "Section 7 — T. Nagar", mobile: "98765-43210", email: "vikkyakaash@gmail.com", capacity: "10 kWh / 5 kWp", meterSerial: "MET-TN-2843", tariff: 5.00 },
  kumar: { password: "solar456", role: "consumer", name: "Kumar Selvam", serviceNumber: "TN2225041899", address: "45, Nehru Street, Anna Nagar, Chennai - 600040", section: "Section 12 — Anna Nagar", mobile: "99887-76543", email: "kumar.selvam@yahoo.com", capacity: "10 kWh / 5 kWp", meterSerial: "MET-TN-1899", tariff: 5.00 },
  "vikky292004@gmail.com": { password: "solar123", role: "consumer", name: "Vikky Vignesh", serviceNumber: "TN-VIKKY-001", address: "Tech Park, OMR, Chennai", section: "Section OMR", mobile: "99887-11223", email: "vikky292004@gmail.com", capacity: "5 kWp", meterSerial: "MET-V-292004", tariff: 5.00 }
};

const SESSION_KEY = "solar_session_v2";

/** Save session to localStorage */
function setSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    username: user.username,
    name: user.name,
    role: user.role,
    serviceNumber: user.serviceNumber,
    loginAt: Date.now()
  }));
}

/** Read current session; returns null if not logged in */
function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

/** Clear session (logout) */
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Attempt login. Returns session object on success, throws string on failure.
 * Compatible with original authLogin() calling convention.
 */
async function authLogin(identifier, password) {
  const uLower = identifier.toLowerCase();

  // 1. Check static USERS_DB first (Prioritize hardcoded accounts like 'admin')
  const u = USERS_DB[uLower];
  if (u) {
    // Check if admin has a locally-saved custom password
    const savedPwd = uLower === 'admin' ? localStorage.getItem('solar_admin_pwd') : null;
    const effectivePwd = savedPwd || u.password;
    if (effectivePwd === password) {
      const session = { username: uLower, ...u };
      setSession(session);
      return session;
    }
  }

  // 2. If Firebase is enabled, route to Firebase Auth
  if (typeof FIREBASE_ENABLED !== 'undefined' && FIREBASE_ENABLED && firebaseAuth && firebaseDB) {
    return new Promise((resolve, reject) => {
      // Basic check if it's an email, otherwise assume admin dummy domain
      let email = identifier;
      if (!email.includes('@')) {
         if (identifier.toLowerCase() === 'admin') email = 'admin@solartrack-pro.com';
         else email = identifier.toLowerCase() + '@solar.local'; // fallback for old usernames
      }
      
      firebaseAuth.signInWithEmailAndPassword(email, password)
        .then(async (cred) => {
           try {
             let sessionData = null;
             
             // Try Realtime Database first
             if (typeof firebaseRTDB !== 'undefined' && firebaseRTDB) {
                 try {
                     const snap = await firebaseRTDB.ref('users/' + cred.user.uid).get();
                     if (snap.exists()) {
                         sessionData = { ...snap.val(), uid: cred.user.uid, username: identifier };
                     }
                 } catch (dbErr) {
                     console.warn("[Auth] RTDB fetch failed (possibly permission denied):", dbErr);
                 }
             }
             
             // Fallback to Firestore if not found in RTDB
             if (!sessionData && typeof firebaseDB !== 'undefined' && firebaseDB) {
                 try {
                     const docSnap = await firebaseDB.collection('users').doc(cred.user.uid).get();
                     if (docSnap.exists) {
                         sessionData = { ...docSnap.data(), uid: cred.user.uid, username: identifier };
                     }
                 } catch (fsErr) {
                     console.warn("[Auth] Firestore fetch failed (possibly permission denied):", fsErr);
                 }
             }

             if (!sessionData) {
                  // Final fallback for missing profile (Firebase login without Firestore record)
                  const idLower = identifier.toLowerCase();
                  const isAd = idLower === 'admin' || idLower === 'admin@solartrack-pro.com';
                  const namePart = identifier.split('@')[0];
                  
                  sessionData = { 
                      username: identifier, 
                      name: isAd ? "Admin User" : (namePart.charAt(0).toUpperCase() + namePart.slice(1)),
                      email: cred.user.email || (identifier.includes('@') ? identifier : idLower + '@solar.local'), 
                      role: isAd ? 'admin' : 'consumer', 
                      uid: cred.user.uid,
                      serviceNumber: isAd ? "ADMIN-FIXUP" : "TN-DYN-" + Math.floor(Math.random() * 900000 + 100000),
                      address: "Registration Active — Complete Profile in Settings",
                      section: "Registered via Firebase",
                      capacity: "5 kWp",
                      meterSerial: "NA-" + cred.user.uid.slice(-4).toUpperCase(),
                      tariff: 5.00,
                      loginTime: Date.now()
                  };
              }
             
             setSession(sessionData);
             resolve(sessionData);
           } catch(err) {
             reject(err.message);
           }
        })
        .catch(err => {
             // Fallback to local storage if Firebase Auth fails (e.g., demo password reset)
             try {
                const registered = JSON.parse(localStorage.getItem('solar_registered_consumers') || '[]');
                const dynUser = registered.find(r => 
                    (r.username && r.username.toLowerCase() === uLower) || 
                    (r.email && r.email.toLowerCase() === uLower)
                );
                if (dynUser && dynUser.password === password) {
                    console.info("[Auth] Fallback: Logged in via LocalStorage after Firebase failed.");
                    let sessionData = { ...dynUser, uid: "LOCAL-" + Date.now(), loginTime: Date.now() };
                    setSession(sessionData);
                    return resolve(sessionData);
                }
             } catch(e) {}

             let errMsg = err.message || "Login failed.";
             if (errMsg.includes("INVALID_LOGIN_CREDENTIALS") || (err.code && err.code.includes("login-credentials"))) {
                 errMsg = "Invalid username or password.";
             } else if (err.code === "auth/user-not-found") {
                 errMsg = "User not found. Please register first.";
             } else if (err.code === "auth/wrong-password") {
                 errMsg = "Incorrect password.";
             } else if (errMsg.startsWith("{")) {
                 try {
                     const parsed = JSON.parse(errMsg);
                     if (parsed.error && parsed.error.message) errMsg = "Login failed: " + parsed.error.message.replace(/_/g, " ");
                 } catch(e) {}
             }
             
             if (errMsg === "Permission denied" || errMsg.includes("permission_denied")) {
                 errMsg = "Access Denied: Please check your account permissions.";
             }
             
             reject(errMsg);
        });
    });
  }

  // 3. Check dynamically registered consumers from localStorage
  try {
    const registered = JSON.parse(localStorage.getItem("solar_registered_consumers") || "[]");
    const dynUser = registered.find(r => 
       (r.username && r.username.toLowerCase() === uLower) || 
       (r.email && r.email.toLowerCase() === uLower)
    );
    if (dynUser) {
      if (dynUser.password !== password) throw "Invalid username or password.";
      const session = {
        username: dynUser.username,
        name: dynUser.name,
        role: "consumer",
        serviceNumber: dynUser.serviceNumber || dynUser.consumerId || "",
        address: dynUser.address || "",
        section: dynUser.section || dynUser.location || "",
        mobile: dynUser.mobile || "",
        email: dynUser.email || "",
        capacity: dynUser.capacity || "",
        meterSerial: dynUser.meterSerial || "",
        tariff: dynUser.tariff || 5.00
      };
      setSession(session);
      return session;
    }
  } catch (e) { /* Ignore localStorage parse errors */ }

  // 4. DEMO BYPASS — Allow any valid-looking email to login for demonstration purposes
  if (identifier.includes('@') && password.length >= 4) {
    console.info("[Auth] Demo Mode: Bypassing credentials for:", identifier);
    const demoSession = {
      username: identifier.split('@')[0],
      name: "Solar User (" + identifier.split('@')[0] + ")",
      role: "consumer",
      serviceNumber: "TN-" + Math.floor(Math.random() * 899999 + 100000),
      address: "Demo Residency, Solar Street, Chennai",
      section: "Demo Section",
      mobile: "+91 00000 00000",
      email: identifier,
      capacity: "5 kWp",
      meterSerial: "MET-DEMO-" + Math.floor(Math.random() * 900),
      tariff: 5.00
    };
    setSession(demoSession);
    return demoSession;
  }

  throw "Invalid username or password.";
}

/** 
 * Explore Mode — One-click entry into the dashboard for demonstrators 
 * satisfying the "Run for all" requirement by bypassing the login form. 
 */
function launchExploreMode() {
  console.info("[Auth] Initializing Explore Mode (Guest Session)");
  try {
      const guestUser = {
          username: "guest_" + Math.floor(Math.random() * 9999),
          name: "Guest Explorer",
          role: "consumer",
          serviceNumber: "TN-EX-" + Math.floor(Math.random() * 89999 + 10000),
          address: "Solar Estate, Green Way, Chennai",
          section: "Public Explore Section",
          mobile: "+91 99999 00000",
          email: "guest@solarpro.local",
          capacity: "10 kWp",
          meterSerial: "MET-EXPLORE",
          tariff: 5.00
      };
      setSession(guestUser);
      console.log("[Auth] Redirecting to Dashboard...");
      window.location.href = "dashboard.html";
  } catch (err) {
      console.error("[Auth] Explore Mode failed:", err);
      // Fallback redirect if session fails
      window.location.href = "dashboard.html";
  }
}

/** Logout — clear session and redirect to login */
function authLogout(showConfirmation = false) {
  if (showConfirmation) {
    showConfirm({
      title: "🚪 Confirm Logout",
      body: "Are you sure you want to end your session? You will need to log in again to access your solar monitoring data.",
      confirmText: "Logout Now",
      onConfirm: () => performLogout()
    });
  } else {
    performLogout();
  }
}

/** Internal logout execution */
function performLogout() {
  clearSession();
  try {
    if (typeof FIREBASE_ENABLED !== 'undefined' && FIREBASE_ENABLED && typeof firebaseAuth !== 'undefined' && firebaseAuth) {
      firebaseAuth.signOut().catch(e => console.warn("[Auth] Firebase signOut failed:", e));
    }
  } catch (err) {
    console.warn("[Auth] Firebase signOut error:", err);
  }
  // Hard redirect to ensure state is reset
  window.location.replace("login.html");
}

/* ═══════════════════════════════════════════════════════════════
   CONFIRMATION MODAL SYSTEM
   Visual, premium replacement for window.confirm()
═══════════════════════════════════════════════════════════════ */

let confirmCallback = null;

/**
 * showConfirm({ title, body, confirmText, cancelText, onConfirm })
 */
function showConfirm(options) {
  let modal = document.getElementById('sol-confirm-modal');
  
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'sol-confirm-modal';
    modal.className = 'sol-modal-overlay';
    modal.innerHTML = `
      <div class="sol-modal-box">
        <div id="sol-confirm-title" class="sol-modal-title"></div>
        <div id="sol-confirm-body" class="sol-modal-body"></div>
        <div class="sol-modal-actions">
          <button id="sol-confirm-cancel" class="sol-btn-sec"></button>
          <button id="sol-confirm-ok" class="sol-btn-pri"></button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Inject Styles if not already in style.css
    if (!document.getElementById('sol-modal-css')) {
      const style = document.createElement('style');
      style.id = 'sol-modal-css';
      style.textContent = `
        .sol-modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.7);
          backdrop-filter: blur(4px); z-index: 9999;
          display: none; align-items: center; justify-content: center;
          animation: fade-in 0.2s ease forwards;
        }
        .sol-modal-box {
          background: #111e2f; border: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px; padding: 28px; width: 90%; max-width: 400px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.5); transform: translateY(20px);
          animation: slide-up 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .sol-modal-title { font-size: 18px; font-weight: 800; color: #fff; margin-bottom: 12px; }
        .sol-modal-body { font-size: 14px; color: rgba(255,255,255,0.6); margin-bottom: 24px; line-height: 1.6; }
        .sol-modal-actions { display: flex; gap: 12px; justify-content: flex-end; }
        .sol-btn-sec { padding: 10px 20px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); background: transparent; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s; }
        .sol-btn-pri { padding: 10px 20px; border-radius: 8px; border: none; background: #00c853; color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 12px rgba(0, 200, 83, 0.3); }
        .sol-btn-sec:hover { background: rgba(255,255,255,0.05); }
        .sol-btn-pri:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0, 200, 83, 0.4); }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide-up { from { transform: translateY(20px); } to { transform: translateY(0); } }
      `;
      document.head.appendChild(style);
    }
    
    document.getElementById('sol-confirm-cancel').onclick = closeConfirm;
    modal.onclick = (e) => { if (e.target === modal) closeConfirm(); };
  }
  
  document.getElementById('sol-confirm-title').textContent = options.title || "Confirmation";
  document.getElementById('sol-confirm-body').textContent = options.body || "Are you sure?";
  document.getElementById('sol-confirm-cancel').textContent = options.cancelText || "Cancel";
  
  const okBtn = document.getElementById('sol-confirm-ok');
  okBtn.textContent = options.confirmText || "Confirm";
  okBtn.onclick = () => {
    closeConfirm();
    if (options.onConfirm) options.onConfirm();
  };
  
  modal.style.display = 'flex';
}

function closeConfirm() {
  const modal = document.getElementById('sol-confirm-modal');
  if (modal) modal.style.display = 'none';
}


/**
 * Route guard — call at top of any protected page.
 * @param {string} requiredRole  'admin' | 'consumer' | null (any)
 * Returns session on success, redirects on failure.
 */
function requireAuth(requiredRole = null) {
  const s = getSession();
  if (!s) { window.location.replace("login.html"); throw new Error("Not logged in"); }
  if (requiredRole && s.role !== requiredRole) {
    if (s.role === "admin") window.location.replace("admin-home.html");
    if (s.role === "consumer") window.location.replace("dashboard.html");
    throw new Error("Wrong role");
  }
  return s;
}

/** Backward-compat alias */
function requireAdmin() { return requireAuth("admin"); }
function requireConsumer() { return requireAuth("consumer"); }

/* ═══════════════════════════════════════════════════════════════
   1. DATE / TIME UTILITIES
═══════════════════════════════════════════════════════════════ */

/**
 * Format a Date / ISO-string → "DD-MM-YYYY | hh:mm AM/PM"
 * (single-column format as required)
 */
function formatDateTime(input) {
  const d = input instanceof Date ? input : new Date(input);
  const day = String(d.getDate()).padStart(2, "0");
  const mon = String(d.getMonth() + 1).padStart(2, "0");
  const yr = d.getFullYear();
  const hrs = d.getHours();
  const min = String(d.getMinutes()).padStart(2, "0");
  const ampm = hrs >= 12 ? "PM" : "AM";
  const h12 = String(hrs % 12 || 12).padStart(2, "0");
  return `${day}-${mon}-${yr} | ${h12}:${min} ${ampm}`;
}

/**
 * Format a date string "DD-MM-YYYY" with a time string
 * → "DD-MM-YYYY | hh:mm PM" (used for bill date-time column)
 */
function formatBillDateTime(dateStr, timeStr) {
  return `${dateStr} | ${timeStr}`;
}

/** Day name from a Date object */
function getDayName(date) {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[date.getDay()];
}

/** Simple en-IN currency formatter: 300.00 → "₹ 300.00" */
function formatINR(amount) {
  return "₹ " + Number(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/** Convert number to Indian words (up to crores) — used for bill */
function numberToWords(amount) {
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function inWords(n) {
    if (n < 20) return a[n];
    if (n < 100) return (b[Math.floor(n / 10)] + " " + a[n % 10]).trim();
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred " + inWords(n % 100);
    if (n < 100000) return inWords(Math.floor(n / 1000)) + " Thousand " + inWords(n % 1000);
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + " Lakh " + inWords(n % 100000);
    return inWords(Math.floor(n / 10000000)) + " Crore " + inWords(n % 10000000);
  }

  const n = Math.round(amount);
  const p = Math.round((amount - n) * 100);
  let words = inWords(n) + " Rupees";
  if (p > 0) words += " and " + inWords(p) + " Paise";
  return words.trim() + " Only";
}

/* ═══════════════════════════════════════════════════════════════
   2. DOM UTILITIES
═══════════════════════════════════════════════════════════════ */

/** Set textContent of element by ID (safe no-op if missing) */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/** Set innerHTML of element by ID */
function setHTML(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = value;
}

/** Toggle CSS class on element by ID */
function toggleClass(id, cls, force) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle(cls, force);
}

/** Show a styled alert box (type: 'error' | 'success' | 'info') */
function showAlert(containerId, msgId, message, type = "error") {
  const container = document.getElementById(containerId);
  const msgEl = document.getElementById(msgId);
  if (!container || !msgEl) return;
  container.className = `alert alert-${type}`;
  msgEl.textContent = message;
  container.classList.remove("hidden");
}

/** Hide alert box */
function hideAlert(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.classList.add("hidden");
}

/* ═══════════════════════════════════════════════════════════════
   3. FORM HELPERS
═══════════════════════════════════════════════════════════════ */

/** Serialize a form element into a plain key:value object */
function formToObject(formEl) {
  const fd = new FormData(formEl);
  const obj = {};
  fd.forEach((v, k) => { obj[k] = v.trim(); });
  return obj;
}

/**
 * Validate required fields — adds 'error' class to empties.
 * @returns {boolean} true if all fields are valid
 */
function validateRequired(fields) {
  let ok = true;
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!el.value.trim()) {
      el.classList.add("error");
      ok = false;
    } else {
      el.classList.remove("error");
    }
  });
  return ok;
}

/* ═══════════════════════════════════════════════════════════════
   4. CHART HELPERS
═══════════════════════════════════════════════════════════════ */

/**
 * Return a Chart.js base options object (dark-theme preset).
 * @param {boolean} legendVisible
 */
function darkChartOpts(legendVisible = false) {
  const FONT = { family: "'Inter', sans-serif", size: 9 };
  return {
    responsive: true,
    plugins: {
      legend: {
        display: legendVisible,
        labels: { color: "rgba(255,255,255,.65)", font: FONT, boxWidth: 12, padding: 14 }
      },
      tooltip: {
        backgroundColor: "rgba(17,24,39,.95)",
        titleFont: { ...FONT, weight: "700", size: 11 },
        bodyFont: FONT,
        padding: 10,
        cornerRadius: 8,
        borderColor: "rgba(255,255,255,.1)",
        borderWidth: 1
      }
    },
    scales: {
      x: {
        ticks: { font: FONT, color: "rgba(255,255,255,.4)", maxRotation: 45 },
        grid: { display: false }
      },
      y: {
        ticks: { font: FONT, color: "rgba(255,255,255,.4)" },
        grid: { color: "rgba(255,255,255,.06)" },
        beginAtZero: true
      }
    }
  };
}

/* ═══════════════════════════════════════════════════════════════
   5. QR PAYLOAD BUILDER
═══════════════════════════════════════════════════════════════ */

/**
 * Build a compact JSON string suitable for QR encoding.
 * When scanned, it reveals: consumer name, address, solar stats,
 * EB contribution, monthly total, date/time.
 */
function buildQRPayload(user, summary) {
  return JSON.stringify({
    system: "TNPDCL Solar Net Metering",
    billId: `TN-SOLAR-2026-03-${user.serviceNumber.slice(-4)}`,
    consumer: user.name,
    serviceNumber: user.serviceNumber,
    address: user.address,
    section: user.section,
    period: summary.period,
    generated: summary.totalGen + " kWh",
    used: summary.totalUsed + " kWh",
    exported: summary.totalExported + " kWh",
    ebCredit: formatINR(summary.totalAmount),
    tariff: formatINR(summary.tariff) + "/kWh",
    monthlyTotal: formatINR(summary.totalAmount),
    billedOn: summary.billedOn + " " + summary.billedTime,
    dueDate: summary.dueDate,
    verifyUrl: `https://tnpdcl.gov.in/solar/verify/${user.serviceNumber}`
  });
}

/* ═══════════════════════════════════════════════════════════════
   6. STORAGE HELPERS (extend for Firebase later)
═══════════════════════════════════════════════════════════════ */

const Store = {
  set(key, value) {
    try { localStorage.setItem("solar_" + key, JSON.stringify(value)); } catch (e) { /**/ }
  },
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem("solar_" + key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  remove(key) {
    localStorage.removeItem("solar_" + key);
  }
};

/* ═══════════════════════════════════════════════════════════════
   7. EXPORT / PRINT HELPERS
═══════════════════════════════════════════════════════════════ */

/** Trigger browser print dialog */
function printPage() {
  window.print();
}

/**
 * Export an array of objects to a CSV file and trigger download.
 * @param {Object[]} data
 * @param {string}   filename
 */
function exportCSV(data, filename = "solar_report.csv") {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(r => headers.map(h => `"${r[h]}"`).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export the SOLAR_DATA array as a formatted CSV.
 * Adds an EB Credit column (₹) computed on the fly.
 * @param {number} [tariff]
 */
function exportSolarCSV(tariff = 5.00) {
  const rows = SOLAR_DATA.map((r, i) => ({
    "#": i + 1,
    "Date": r.date,
    "Time": r.time,
    "Day": r.day,
    "Solar Generated (kWh)": r.gen,
    "Home Used (kWh)": r.used,
    "Exported to EB (kWh)": r.exported,
    "Remaining Balance": r.balance,
    "EB Credit (INR)": (r.exported * tariff).toFixed(2)
  }));
  exportCSV(rows, "solar_energy_report_may_2026.csv");
}

/* ═══════════════════════════════════════════════════════════════
   8. TOAST NOTIFICATIONS
═══════════════════════════════════════════════════════════════ */

/**
 * Show a lightweight floating toast message.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} duration  ms before auto-dismiss
 */
function showToast(message, type = "success", duration = 3500) {
  // Remove existing toast if any
  const existing = document.getElementById("__solar_toast__");
  if (existing) existing.remove();

  const colors = {
    success: { bg: "rgba(0,185,107,.97)", border: "#00b96b" },
    error: { bg: "rgba(239,68,68,.97)", border: "#ef4444" },
    info: { bg: "rgba(26,111,212,.97)", border: "#1a6fd4" },
    warning: { bg: "rgba(247,166,0,.97)", border: "#f7a600" }
  };
  const c = colors[type] || colors.success;

  const toast = document.createElement("div");
  toast.id = "__solar_toast__";
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    background: c.bg,
    border: `1px solid ${c.border}`,
    color: "#fff",
    padding: "12px 20px",
    borderRadius: "10px",
    fontSize: "13px",
    fontWeight: "600",
    boxShadow: "0 6px 24px rgba(0,0,0,.4)",
    zIndex: "9999",
    maxWidth: "320px",
    lineHeight: "1.5",
    opacity: "0",
    transform: "translateY(12px)",
    transition: "all .25s cubic-bezier(.4,0,.2,1)",
    fontFamily: "'Inter', sans-serif",
    cursor: "pointer"
  });
  toast.textContent = message;
  toast.onclick = () => toast.remove();
  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  // Auto dismiss
  setTimeout(() => {
    if (!toast.isConnected) return;
    toast.style.opacity = "0";
    toast.style.transform = "translateY(12px)";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ═══════════════════════════════════════════════════════════════
   9. AUTO-INIT — run when DOM is ready
═══════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  const isLogin = document.querySelector(".login-page") !== null;
  const isDashboard = document.querySelector(".app-shell") !== null;

  if (isLogin) {
    /* Nothing extra needed — login page is self-contained */
  }

  if (isDashboard) {
    /* Tooltips on stat cards */
    document.querySelectorAll(".stat-card").forEach(card => {
      card.setAttribute("title", "Click for detailed analytics →");
    });
  }
});

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((registration) => {
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    }).catch((err) => {
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}
