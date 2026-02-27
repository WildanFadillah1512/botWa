const path = require('path');
const fs = require('fs');

// ========== ROBUST .ENV LOADER ==========
const envPath = path.join(__dirname, '.env');
console.log(`[Config] 📁 Lokasi .env: ${envPath}`);

if (fs.existsSync(envPath)) {
  console.log('[Config] ✅ File .env DITEMUKAN');

  // Coba dotenv dulu
  require('dotenv').config({ path: envPath });

  // Cek apakah dotenv berhasil load
  if (!process.env.GEMINI_API_KEYS) {
    console.log('[Config] ⚠️ dotenv gagal load GEMINI_API_KEYS, mencoba manual parser...');

    // Manual parser — handles BOM, encoding issues, extra whitespace
    let raw = fs.readFileSync(envPath, 'utf-8');

    // Strip BOM (Byte Order Mark) yang sering muncul di file Windows
    raw = raw.replace(/^\uFEFF/, '');
    // Strip karakter null/invisible lainnya
    raw = raw.replace(/\0/g, '');

    console.log(`[Config] 📄 .env raw length: ${raw.length} chars`);

    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip komentar dan baris kosong
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;

      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1).trim();
      // Hapus quotes jika ada
      if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (key) {
        process.env[key] = value;
        console.log(`[Config] 🔧 Manual set: ${key} = ${value.substring(0, 15)}...`);
      }
    }
  } else {
    console.log('[Config] ✅ dotenv berhasil memuat env vars');
  }
} else {
  console.error('[Config] ❌ File .env TIDAK DITEMUKAN!');
  require('dotenv').config();
}
// ==========================================

module.exports = {
  // Nama bot
  botName: 'Bot Asisten',

  // Pesan default jika tidak ada keyword yang cocok
  defaultReply: 'Halo! Terima kasih sudah menghubungi kami. 😊\nSaat ini pesan Anda sedang kami proses.\nKetik *menu* untuk melihat daftar layanan kami.',

  // Apakah bot membalas pesan dari group?
  replyToGroups: false,

  // Apakah bot membalas pesan dari diri sendiri?
  replyToSelf: false,

  // Paths
  dataDir: path.join(__dirname, 'data'),
  sessionDir: path.join(__dirname, '.wwebjs_auth'),

  // Follow-up cron schedule (default: setiap hari jam 09:00)
  followUpCron: '0 9 * * *',

  // AI Settings — API Keys diambil dari environment variables
  ai: {
    useAI: true,
    geminiApiKeys: (process.env.GEMINI_API_KEYS || '').split(',').filter(k => k.trim()),
    groqApiKeys: (process.env.GROQ_API_KEYS || '').split(',').filter(k => k.trim()),
  },

  // Nomor Admin (dari env var, fallback ke placeholder)
  adminPhone: process.env.ADMIN_PHONE || '628123456789',

  // Logging
  logTimestamp: true,
};
