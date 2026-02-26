require('dotenv').config();
const path = require('path');

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
