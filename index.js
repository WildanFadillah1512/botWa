const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const autoReply = require('./modules/autoReply');
const followUp = require('./modules/followUp');
const ai = require('./modules/ai');
const chatState = require('./modules/chatState');
const sheetsLogger = require('./modules/sheetsLogger');
const sheetsReader = require('./modules/sheetsReader');
const http = require('http');

// =============================================
//   🌐 KEEP-ALIVE SERVER (UNTUK RENDER)
// =============================================
// Render butuh aplikasi untuk "listen" di suatu port agar deploy sukses
// Server ini juga dipakai untuk di-ping oleh UptimeRobot agar bot tidak tidur/sleep
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot WhatsApp Suba Arch is Alive!\n');
}).listen(PORT, () => {
    console.log(`[Server] 🌐 Keep-Alive Server berjalan di port ${PORT}`);
});

// =============================================
//   🤖 WhatsApp Bot - Auto Reply & Follow Up
// =============================================

console.log('='.repeat(50));
console.log(`  🤖 ${config.botName}`);
console.log('  WhatsApp Bot - Auto Reply & Follow Up');
console.log('='.repeat(50));
console.log('');

// Inisialisasi WhatsApp Client dengan Local Auth (session tersimpan)
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: config.sessionDir,
    }),
    puppeteer: {
        headless: true,
        // Gunakan Chromium dari system (Docker) jika env var di-set
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--disable-gpu',
            '--disable-extensions',
            '--single-process',       // Hemat memory di server
            '--no-zygote',            // Hemat memory di server
        ],
    },
});

// ============ EVENT HANDLERS ============

/**
 * Event: QR Code - tampilkan di terminal untuk di-scan
 */
client.on('qr', (qr) => {
    console.log('[Bot] 📱 Scan QR Code berikut dengan WhatsApp Anda:');
    console.log('');
    qrcode.generate(qr, { small: true });
    console.log('');
    console.log('[Bot] ⏳ Menunggu scan...');
});

/**
 * Event: Authenticated - berhasil login
 */
client.on('authenticated', () => {
    console.log('[Bot] ✅ Autentikasi berhasil!');
});

/**
 * Event: Authentication failure
 */
client.on('auth_failure', (err) => {
    console.error('[Bot] ❌ Autentikasi gagal:', err);
    console.log('[Bot] 💡 Coba hapus folder .wwebjs_auth dan jalankan ulang.');
});

/**
 * Event: Ready - bot siap digunakan
 */
client.on('ready', async () => {
    console.log('');
    console.log('[Bot] 🎉 Bot sudah aktif dan siap digunakan!');
    console.log(`[Bot] 📱 Terhubung sebagai: ${client.info.pushname}`);
    console.log(`[Bot] 📞 Nomor: ${client.info.wid.user}`);
    console.log('');



    // Inisialisasi follow-up scheduler
    followUp.init(client);

    // Inisialisasi Google Sheets learning (fetch chat context)
    sheetsReader.init();

    console.log('');
    console.log('[Bot] 🟢 Semua sistem aktif! Menunggu pesan masuk...');
    console.log('');
});

/**
 * Event: Pesan masuk
 */
client.on('message', async (msg) => {
    try {
        // Skip semua pesan yang diawali dengan '/' (dianggap command)
        if (msg.body && msg.body.startsWith('/')) {
            return;
        }

        // Skip pesan dari diri sendiri jika diatur
        if (msg.fromMe && !config.replyToSelf) return;

        // Skip status broadcast (story/status WA)
        if (msg.from === 'status@broadcast') return;

        // Skip pesan dari group jika diatur
        const chat = await msg.getChat();
        if (chat.isGroup && !config.replyToGroups) return;


        if (!msg.body || msg.body.trim() === '') return;

        // Push User Message to Google Sheets
        const contact = await msg.getContact();
        const senderName = contact.pushname || contact.name || `User ${contact.number}`;
        const senderNumber = contact.number;
        sheetsLogger.pushToSheets(msg, senderName, senderNumber);

        // --- TAKEOVER CHECK ---
        const chatId = chat.id._serialized;
        if (chatState.isPaused(chatId)) {
            // Chat sedang diambil alih oleh admin, bot diam saja
            console.log(`[Bot] ⏸️ Chat ${chatId} sedang di-pause, pesan diabaikan.`);
            return;
        }

        // 2. Coba auto-reply (keyword match)
        const replied = await autoReply.handleMessage(msg);

        // 3. Jika tidak ada keyword yang match, gunakan AI
        if (!replied) {
            if (config.ai.useAI) {
                const aiReply = await ai.generateReply(msg.body, chatId);

                if (aiReply) {
                    // Cek instruksi anti-spam dari prompt AI
                    if (aiReply.trim() === 'IGNORE_DO_NOT_REPLY') {
                        console.log(`[Bot] 🛑 Pesan spam/filler dari ${msg.from} diabaikan oleh AI.`);
                        return; // Jangan balas apa-apa
                    }

                    // Tandai bahwa ini pesan bot agar tidak men-trigger auto pause
                    chatState.markAsBotMessage(aiReply);
                    await msg.reply(aiReply);
                    console.log(`[Bot] 🤖 AI reply sent to ${msg.from}`);

                    // Push AI Reply to Google Sheets
                    // Membentuk objek tiruan message untuk bot
                    const botMsg = {
                        timestamp: Math.floor(Date.now() / 1000),
                        body: aiReply
                    };
                    sheetsLogger.pushToSheets(botMsg, "Suba Arch Studio", senderNumber);
                }
                // Jika AI error, kita tidak kirim default reply agar tidak spam 
                // saat AI gangguan.
            }
        }
    } catch (err) {
        console.error('[Bot] ❌ Error handling message:', err.message);
    }
});

/**
 * Event: Pesan keluar (dari kita) atau pesan masuk juga ter-trigger di sini
 */
client.on('message_create', async (msg) => {
    try {
        if (msg.fromMe) {
            if (msg.body) {
                const chat = await msg.getChat();
                const chatId = chat.id._serialized;
                const text = msg.body.trim();

                // Deteksi command /r untuk resume
                if (text === '/r' || text === '/resume') {
                    chatState.resumeChat(chatId);
                    return;
                }

                // ============ JANGAN PAUSE CHAT PRIBADI ADMIN ============
                // Jika chat ini adalah "Message Yourself" (chat ke diri sendiri),
                // JANGAN auto-pause. Admin sering chat dgn diri sendiri utk test.
                const botNumber = client.info.wid.user; // e.g. '6283857379353'
                const chatPhone = chat.id.user; // phone dari chatId
                const isSelfChat = (chatPhone === botNumber);

                // Deteksi bot message vs human message
                const isBotPrefix = chatState.isRecentBotMessage(text) || text.startsWith('✅ *Follow-Up Sukses!*');

                // ABORT PAUSE jika:
                // 1. Pesan diawali '/' (command admin)
                // 2. Pesan dikenali sebagai bot message
                // 3. Chat adalah "Message Yourself" (self-chat admin)
                if (!text.startsWith('/') && !isBotPrefix && !isSelfChat) {
                    const isKnownAutoReply = (autoReply.getRules ? autoReply.getRules().some(r => r.reply === text) : false) || text.includes('Format salah');

                    if (!isKnownAutoReply) {
                        if (!chatState.isPaused(chatId)) {
                            chatState.pauseChat(chatId);
                        }
                    }
                }
            }
        }

        // Cek admin command (bisa dari bot sendiri atau dari nomor admin eksternal)
        const isAdmin = msg.fromMe || (config.adminPhone && msg.from === `${config.adminPhone}@c.us`);

        // Routing ke modul broadcast
        const broadcast = require('./modules/broadcast');
        if (isAdmin && msg.body) {
            if (msg.body.startsWith('/broadcast') || broadcast.isInSession(msg.from)) {
                const handled = await broadcast.handleBroadcastInteractive(client, msg);
                if (handled) return;
            }
        }

        // Routing ke modul follow-up interaktif
        if (isAdmin && msg.body) {
            const bodyTrimmed = msg.body.trim();
            // /followup tanpa parameter → tampilkan menu interaktif
            // /followup dengan parameter → legacy direct command
            if (bodyTrimmed === '/followup' || followUp.isInSession(msg.from)) {
                const handled = await followUp.handleFollowupInteractive(client, msg);
                if (handled) return;
            }
        }

        // Legacy /followup command (dengan parameter langsung)
        if (isAdmin && msg.body && msg.body.startsWith('/followup ')) {
            const parts = msg.body.split(' ');
            if (parts.length >= 5) {
                const phone = parts[1];
                const dateStr = parts[2];
                const timeStr = parts[3];
                const text = parts.slice(4).join(' ');

                const dateObj = new Date(`${dateStr}T${timeStr}:00`);
                const now = new Date();

                if (!isNaN(dateObj.getTime())) {
                    if (dateObj < now) {
                        await msg.reply(`⚠️ Waktu yang Anda masukkan (${dateObj.toLocaleString()}) sudah terlewat!\n\nSilakan masukkan waktu di masa depan.`);
                    } else {
                        followUp.addDynamicFollowup(phone, dateObj, text);
                        await msg.reply(`✅ Jadwal ditambahkan!\n👤 Target: ${phone}\n⏰ Waktu: ${dateObj.toLocaleString()}\n📝 Pesan: ${text}`);
                    }
                } else {
                    await msg.reply(`❌ Format waktu salah.\nGunakan format: YYYY-MM-DD HH:mm\nContoh: 2026-02-25 14:18`);
                }
            } else if (parts.length === 4) {
                const phone = parts[1];
                const dateStr = parts[2];
                const timeStr = parts[3];
                await msg.reply(`❌ Teks pesan tidak boleh kosong!\n\nSilakan coba lagi:\n/followup ${phone} ${dateStr} ${timeStr} Halo, ini pesan untuk Anda!`);
            } else {
                await msg.reply(`❌ Format salah.\n\nContoh:\n/followup 6281234567 2026-02-25 14:18 Halo ini pesan dari bot!`);
            }
            return;
        }

    } catch (err) {
        console.error('[Bot] Error in message_create:', err.message);
    }
});

/**
 * Event: Disconnected
 */
client.on('disconnected', (reason) => {
    console.log('[Bot] 🔴 Bot terputus:', reason);
    console.log('[Bot] 💡 Jalankan ulang dengan: npm start');
});

// ============ GRACEFUL SHUTDOWN ============

process.on('SIGINT', async () => {
    console.log('');
    console.log('[Bot] 🛑 Shutting down...');
    try {
        await client.destroy();
    } catch {
        // ignore
    }
    process.exit(0);
});

// ============ START BOT ============

console.log('[Bot] 🔄 Menghubungkan ke WhatsApp...');
client.initialize();
