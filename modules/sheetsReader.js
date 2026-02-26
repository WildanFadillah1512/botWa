const config = require('../config');
const ai = require('./ai');

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx3fhySswW0tw5-kPsMcBiFW0kCgY8W4jJtc41twC-p6EdIUuF70V69Rn-1A8ph0byc/exec';

// Interval refresh (30 menit)
const REFRESH_INTERVAL = 30 * 60 * 1000;

let lastFetchTime = 0;
let cachedData = null;

/**
 * Fetch data chat dari Google Sheets via Apps Script doGet()
 * @returns {Promise<Array|null>}
 */
async function fetchFromSheets() {
    try {
        console.log('[SheetsReader] 📥 Fetching chat data dari Google Sheets...');

        const url = `${SCRIPT_URL}?action=getChats&limit=50`;
        const response = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
        });

        const text = await response.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch (parseErr) {
            console.error('[SheetsReader] ❌ Response bukan JSON:', text.substring(0, 200));
            return null;
        }

        if (result.status === 'OK' && result.data) {
            cachedData = result.data;
            lastFetchTime = Date.now();
            console.log(`[SheetsReader] ✅ BERHASIL membaca Data Sheets! Total: ${result.data.length} chat records.`);
            return result.data;
        } else {
            console.error(`[SheetsReader] ❌ GAGAL membaca Data Sheets: ${result.error || 'Unknown error'}`);
            return null;
        }
    } catch (err) {
        console.error('[SheetsReader] ❌ Error fetch dari Sheets:', err.message);
        return null;
    }
}

/**
 * Bangun konteks string dari data Sheet untuk ditambahkan ke system prompt AI
 * @param {Array} data - Array of row objects dari Sheet
 * @returns {string}
 */
function buildContextFromData(data) {
    if (!data || data.length === 0) return '';

    let context = 'Berikut adalah KNOWLEDGE BASE dan TAMBAHAN DATA RESMI dari Suba Arch. Gunakan informasi ini sebagai pengetahuan tambahan untuk menjawab jika relevan:\n\n';

    // Gabungkan semua data mentah yang relevan (data sekarang adalah array of strings)
    for (const item of data) {
        if (!item || typeof item !== 'string' || item.trim() === '') continue;
        context += `- ${item.trim()}\n`;
    }

    // Hindari context terlalu besar (potong jika lebih dari 10000 karakter)
    if (context.length > 10000) {
        context = context.substring(0, 10000) + '\n... (terpotong karena terlalu panjang)';
    }

    return context;
}

/**
 * Update konteks AI dari data Sheets
 * Dipanggil saat init dan setiap REFRESH_INTERVAL
 */
async function refreshContext() {
    const data = await fetchFromSheets();
    if (data) {
        const context = buildContextFromData(data);
        ai.setSheetsContext(context);
        console.log(`[SheetsReader] 🧠 AI context updated (${context.length} chars)`);
    }
}

/**
 * Inisialisasi: fetch pertama kali dan set interval
 */
function init() {
    // Fetch pertama kali
    refreshContext();

    // Set interval untuk refresh berkala
    setInterval(() => {
        refreshContext();
    }, REFRESH_INTERVAL);

    console.log(`[SheetsReader] 🔄 Auto-refresh setiap ${REFRESH_INTERVAL / 60000} menit`);
}

module.exports = {
    init,
    refreshContext,
    fetchFromSheets,
};
