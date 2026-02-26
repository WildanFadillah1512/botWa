const fs = require('fs');
const path = require('path');
const config = require('../config');

const REPLIES_PATH = path.join(config.dataDir, 'replies.json');

let rulesData = null;

/**
 * Load rules dari replies.json
 */
function loadRules() {
    try {
        const raw = fs.readFileSync(REPLIES_PATH, 'utf-8');
        rulesData = JSON.parse(raw);
        console.log(`[AutoReply] ✅ Loaded ${rulesData.rules.length} rules`);
    } catch (err) {
        console.error('[AutoReply] ❌ Gagal load replies.json:', err.message);
        rulesData = { rules: [] };
    }
}

/**
 * Reload rules (bisa dipanggil jika data berubah)
 */
function reloadRules() {
    loadRules();
}

/**
 * Cari reply yang cocok berdasarkan pesan masuk
 * Menggunakan case-insensitive partial matching
 * @param {string} message - Pesan masuk dari user
 * @returns {string|null} - Reply text atau null jika tidak ada yang cocok
 */
function findReply(message) {
    if (!rulesData || !rulesData.rules) return null;

    const lowerMessage = message.toLowerCase().trim();

    for (const rule of rulesData.rules) {
        for (const keyword of rule.keywords) {
            const lowerKeyword = keyword.toLowerCase();
            // Cek apakah keyword ada di dalam pesan (partial match)
            if (lowerMessage.includes(lowerKeyword)) {
                return rule.reply;
            }
        }
    }

    return null;
}

/**
 * Handle pesan masuk - cari dan kirim reply yang sesuai
 * @param {import('whatsapp-web.js').Message} msg
 * @returns {Promise<boolean>} - true jika reply dikirim
 */
async function handleMessage(msg) {
    const body = msg.body;
    if (!body || body.trim() === '') return false;

    const reply = findReply(body);

    if (reply) {
        await msg.reply(reply);
        console.log(`[AutoReply] 📤 Replied to "${body.substring(0, 30)}..." with matched keyword`);
        return true;
    }

    return false;
}

/**
 * Ambil daftar aturan (rules) yang sedang dimuat
 * @returns {Array} Array of rule objects
 */
function getRules() {
    return rulesData && rulesData.rules ? rulesData.rules : [];
}

// Load rules saat module di-import
loadRules();

module.exports = {
    handleMessage,
    findReply,
    reloadRules,
    getRules,
};
