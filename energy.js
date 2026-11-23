/* ═══════════════════════════════════════════════════════════════
   energy.js  —  SolarTrack Pro v2.2
   Daily Energy Calculation Engine
   ► 10 kWh max generation cap per day
   ► Auto-calculate: used, sold to EB, imported from EB
   ► localStorage persistence (daily + monthly)
   ► Simulated / user-override daily data
═══════════════════════════════════════════════════════════════ */

"use strict";

const ENERGY = {
    MAX_GEN: 10,          // Maximum kWh generated per day
    TARIFF: 5.00,         // ₹ per kWh (default, overridable from settings)

    // ── Key helpers ──
    _key(username, date) {
        return `solar_energy_${username}_${date}`;
    },
    _todayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },
    _monthStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    },

    // ── Tariff from settings ──
    getTariff(username) {
        try {
            const s = JSON.parse(localStorage.getItem('solar_settings_' + username) || '{}');
            return parseFloat(s.tariff) || this.TARIFF;
        } catch (e) { return this.TARIFF; }
    },

    // ── Core calculation formula ──
    // generated = capped at 10 kWh
    // sold      = max(0, generated - used)
    // imported  = max(0, used - generated)
    // savings   = sold * tariff (₹ credit from EB)
    // net_bill  = imported * tariff (₹ owed to EB)
    calculate(generated_raw, used_raw, tariff) {
        const generated = Math.min(parseFloat(generated_raw) || 0, this.MAX_GEN);
        const used = Math.max(0, parseFloat(used_raw) || 0);
        const sold = Math.max(0, +(generated - used).toFixed(3));
        const imported = Math.max(0, +(used - generated).toFixed(3));
        const savings = +(sold * tariff).toFixed(2);
        const net_bill = +(imported * tariff).toFixed(2);
        const co2_saved = +(generated * 0.82).toFixed(2); // 0.82 kg CO₂ per kWh
        return { generated, used, sold, imported, savings, net_bill, co2_saved, tariff };
    },

    // ── Simulate today's generation (random 5–10 kWh, seeded by date) ──
    simulateGeneration(dateStr) {
        // Seed: use date chars as seed for deterministic daily value
        const seed = dateStr.split('-').reduce((a, b) => a + parseInt(b), 0);
        const pseudo = ((seed * 9301 + 49297) % 233280) / 233280;
        return +(5 + pseudo * 5).toFixed(2); // 5.00 – 10.00 kWh
    },

    // ── Simulate used (70–95% of generated for realistic home use) ──
    simulateUsed(generated, dateStr) {
        const seed = dateStr.split('-').reduce((a, b) => a + parseInt(b) * 3, 0);
        const pseudo = ((seed * 6521 + 11037) % 233280) / 233280;
        const ratio = 0.50 + pseudo * 0.50; // 50–100% of generated
        return +Math.min(used => used, (generated + 2) * ratio, 14).toFixed(2);
    },

    // ── Save a day's record ──
    saveDay(username, dateStr, record) {
        localStorage.setItem(this._key(username, dateStr), JSON.stringify({ ...record, date: dateStr, savedAt: Date.now() }));
    },

    // ── Load a day's record (generate if missing) ──
    getDay(username, dateStr, opt = {}) {
        const raw = localStorage.getItem(this._key(username, dateStr));
        if (raw) {
            try { return JSON.parse(raw); } catch (e) { }
        }
        // Auto-generate simulated data for this date
        const tariff = this.getTariff(username);
        const gen = opt.generated !== undefined ? opt.generated : this.simulateGeneration(dateStr);
        const used = opt.used !== undefined ? opt.used : +(gen * (0.55 + Math.random() * 0.45)).toFixed(2);
        const rec = this.calculate(gen, used, tariff);
        this.saveDay(username, dateStr, rec);
        return { ...rec, date: dateStr };
    },

    // ── Get today's record ──
    getToday(username, opt = {}) {
        return this.getDay(username, this._todayStr(), opt);
    },

    // ── Get records for the last N days ──
    getLastNDays(username, n = 27) {
        const days = [];
        const now = new Date();
        for (let i = n - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            days.push(this.getDay(username, ds));
        }
        return days;
    },

    // ── Monthly summary ──
    getMonthSummary(username, monthStr) {
        // monthStr = 'YYYY-MM'
        const [year, month] = monthStr.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();
        let totalGen = 0, totalUsed = 0, totalSold = 0, totalImported = 0, totalSavings = 0, totalBill = 0, totalCO2 = 0;
        const daily = [];
        for (let d = 1; d <= daysInMonth; d++) {
            const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const rec = this.getDay(username, ds);
            totalGen += rec.generated;
            totalUsed += rec.used;
            totalSold += rec.sold;
            totalImported += rec.imported;
            totalSavings += rec.savings;
            totalBill += rec.net_bill;
            totalCO2 += rec.co2_saved;
            daily.push(rec);
        }
        return {
            month: monthStr,
            totalGen: +totalGen.toFixed(2),
            totalUsed: +totalUsed.toFixed(2),
            totalSold: +totalSold.toFixed(2),
            totalImported: +totalImported.toFixed(2),
            totalSavings: +totalSavings.toFixed(2),
            totalBill: +totalBill.toFixed(2),
            totalCO2: +totalCO2.toFixed(2),
            netPayable: +Math.max(0, totalBill - totalSavings).toFixed(2),
            daily
        };
    },

    // ── Override today's used (for user input simulation) ──
    setTodayUsed(username, used_kwh) {
        const dateStr = this._todayStr();
        const tariff = this.getTariff(username);
        const existing = this.getDay(username, dateStr);
        const rec = this.calculate(existing.generated, used_kwh, tariff);
        this.saveDay(username, dateStr, rec);
        return { ...rec, date: dateStr };
    },

    // ── Format helpers ──
    fmt(v, dec = 2) { return (+v).toFixed(dec); },
    fmtINR(v) { return '₹' + (+v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
};
