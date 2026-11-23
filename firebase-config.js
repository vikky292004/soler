// ═══════════════════════════════════════════════════════════════
//  firebase-config.js  —  Solar Monitoring System v2.1
//  ► Demo mode: LocalStorage auth (no Firebase SDK required)
//  ► To enable Firebase: set FIREBASE_ENABLED = true and fill
//    firebaseConfig with your project credentials from
//    https://console.firebase.google.com
// ═══════════════════════════════════════════════════════════════

"use strict";

const FIREBASE_ENABLED = true; // ← set true after adding real credentials

const firebaseConfig = {
    apiKey: "AIzaSyCNv3IefWwfCJl6Srhd39URxY6xSXDCrl8",
    authDomain: "solarproject-002.firebaseapp.com",
    databaseURL: "https://solarproject-002-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "solarproject-002",
    storageBucket: "solarproject-002.firebasestorage.app",
    messagingSenderId: "899184293151",
    appId: "1:899184293151:web:331dc2e32e2320eecfec2a",
    measurementId: "G-0S5L58JKY0"
};

// ── Initialise Firebase SDK only when credentials are real ──────
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDB = null; // Firestore
let firebaseRTDB = null; // Realtime Database

if (FIREBASE_ENABLED) {
    if (typeof firebase !== "undefined") {
        firebaseApp = firebase.initializeApp(firebaseConfig);
        if (typeof firebase.auth === "function") firebaseAuth = firebase.auth();
        if (typeof firebase.firestore === "function") firebaseDB = firebase.firestore();
        if (typeof firebase.database === "function") firebaseRTDB = firebase.database();
        console.log("[Firebase] Initialized successfully.");
    } else {
        console.error("[Firebase] SDK not loaded! Make sure you are connected to the internet and the Firebase CDN scripts are included in your HTML.");
        console.warn("[Firebase] Falling back to Demo / LocalStorage mode.");
    }
} else {
    console.info("[Firebase] Running in Demo / LocalStorage mode.");
}

// ═══════════════════════════════════════════════════════════════
//  DEMO USERS  — replace with real Firestore calls once Firebase
//  is configured.  Password is stored only in demo; real Firebase
//  uses hashed credentials via Firebase Auth.
// ═══════════════════════════════════════════════════════════════
const DEMO_USERS = [
    {
        username: "akaash",
        password: "solar123",
        name: "V. Akaash Vignesh",
        serviceNumber: "200041411025756",
        address: "No. 14, 5th Cross Street, Anna Nagar, Chennai – 600 040",
        section: "Anna Nagar Section, Chennai North Circle",
        email: "vikkyakaash@gmail.com",
        mobile: "+91 98765 43210",
        capacity: "5 kWp (Grid-Tied)",
        meterSerial: "EM20240803-SNM-CH",
        tariff: 5.00,          // ₹ per kWh exported
        role: "consumer"
    },
    {
        username: "selvam",
        password: "solar789",
        name: "Selvam Kumar",
        serviceNumber: "TN2225041900",
        address: "67, Raman Street, Pondy Bazaar, Chennai",
        section: "T. Nagar Section",
        email: "kumar.selvam@yahoo.com",
        mobile: "+91 99887 76655",
        capacity: "3 kWp",
        meterSerial: "MET-SEL-1900",
        tariff: 5.00,
        role: "consumer"
    },
    {
        username: "admin",
        password: "admin123",
        name: "TNPDCL Administrator",
        serviceNumber: "ADMIN-001",
        address: "TANGEDCO Head Office, 144 Anna Salai, Chennai – 600 002",
        section: "Admin Division – Solar Wing",
        email: "admin@solartrack-pro.com",
        mobile: "+91 44 2852 1111",
        capacity: "—",
        meterSerial: "—",
        tariff: 5.00,
        role: "admin"
    }
];

// ═══════════════════════════════════════════════════════════════
//  AUTH HELPERS
// ═══════════════════════════════════════════════════════════════



// ═══════════════════════════════════════════════════════════════
//  SOLAR DATA GENERATOR
//  Realistic simulated daily data for May 2026 (31 days).
//  Each row: date, day-of-week, generated (kWh), used (kWh),
//            exported (kWh), balance units.
// ═══════════════════════════════════════════════════════════════

/** 
 * Sample Solar Data — Dynamically updated to end on the current date for project demonstrations
 * Each row corresponds to a day in the last 7 days.
 */
const _baseData = [
  { gen: 18.42, used: 12.15, exported: 6.27, balance: 6.27 },
  { gen: 22.15, used: 10.40, exported: 11.75, balance: 11.75 },
  { gen: 15.80, used: 14.22, exported: 1.58, balance: 1.58 },
  { gen: 19.12, used: 11.05, exported: 8.07, balance: 8.07 },
  { gen: 20.45, used: 12.30, exported: 8.15, balance: 8.15 },
  { gen: 21.30, used: 13.15, exported: 8.15, balance: 8.15 },
  { gen: 17.85, used: 14.10, exported: 3.75, balance: 3.75 }
];

const SOLAR_DATA = _baseData.map((d, i) => {
    const dObj = new Date();
    dObj.setDate(dObj.getDate() - (6 - i));
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dd = String(dObj.getDate()).padStart(2, "0");
    const mm = String(dObj.getMonth() + 1).padStart(2, "0");
    const yyyy = dObj.getFullYear();
    return {
        date: `${dd}-${mm}-${yyyy}`,
        time: "01:24 PM",
        day: dayNames[dObj.getDay()],
        gen: d.gen,
        used: d.used,
        exported: d.exported,
        balance: d.balance,
        dateObj: dObj
    };
});

/**
 * Compute summary from SOLAR_DATA.
 * @param {number} [tariff] – optional per-kWh tariff override
 */
function getMonthlySummary(tariff = 5.00) {
    const totalGen = parseFloat(SOLAR_DATA.reduce((s, r) => s + r.gen, 0).toFixed(2));
    const totalUsed = parseFloat(SOLAR_DATA.reduce((s, r) => s + r.used, 0).toFixed(2));
    const totalExported = parseFloat(SOLAR_DATA.reduce((s, r) => s + r.exported, 0).toFixed(2));
    const totalAmount = parseFloat((totalExported * tariff).toFixed(2));

    const firstDate = SOLAR_DATA[0].date;
    const lastDate = SOLAR_DATA[SOLAR_DATA.length - 1].date;
    const lastTime = SOLAR_DATA[SOLAR_DATA.length - 1].time;

    // Generate DUE DATE (15 days from latest date)
    const dueDateObj = new Date(SOLAR_DATA[SOLAR_DATA.length - 1].dateObj);
    dueDateObj.setDate(dueDateObj.getDate() + 15);
    const d_dd = String(dueDateObj.getDate()).padStart(2, "0");
    const d_mm = String(dueDateObj.getMonth() + 1).padStart(2, "0");
    const dueDateStr = `${d_dd}-${d_mm}-${dueDateObj.getFullYear()}`;

    return {
        totalGen,
        totalUsed,
        totalExported,
        totalAmount,
        tariff,
        period: `${firstDate} to ${lastDate}`,
        billedOn: lastDate,
        billedTime: lastTime,
        dueDate: dueDateStr
    };
}
