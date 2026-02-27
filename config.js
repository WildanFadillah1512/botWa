const path = require('path');
const fs = require('fs');

// Gunakan path EKSPLISIT ke .env agar selalu ketemu di device manapun
const envPath = path.join(__dirname, '.env');
const envExists = fs.existsSync(envPath);

console.log(`[Config] 📁 Lokasi .env: ${envPath}`);
console.log(`[Config] ${envExists ? '✅ File .env DITEMUKAN' : '❌ File .env TIDAK DITEMUKAN!'}`);

if (envExists) {
  require('dotenv').config({ path: envPath });
  console.log('[Config] ✅ dotenv berhasil dimuat dari path eksplisit');
} else {
  // Fallback: coba default (process.cwd)
  require('dotenv').config();
  console.log('[Config] ⚠️ Mencoba dotenv dari default cwd:', process.cwd());
}

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
