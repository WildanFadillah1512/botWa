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
const fs = require('fs');
const path = require('path');

// =============================================
//   🌐 KEEP-ALIVE SERVER (UNTUK RENDER)
// =============================================
let currentQR = '';
let isAuthenticated = false;

// Render butuh aplikasi untuk "listen" di suatu port agar deploy sukses
// Server ini juga dipakai untuk di-ping oleh UptimeRobot agar bot tidak tidur/sleep
const PORT = process.env.PORT || 3000;
http.createServer(async (req, res) => {
    // ========== ENDPOINT: /logout ==========
    // Buka URL ini di browser untuk logout & reset session
    // Setelah ini, bot akan restart dan muncul QR baru untuk nomor baru
    if (req.url === '/logout') {
        console.log('[Server] 🔄 Logout request diterima via HTTP...');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body style="font-family: Arial; text-align: center; margin-top: 50px;"><h1>🔄 Logout berhasil!</h1><p>Session dihapus. Bot akan restart dan menampilkan QR baru.</p><p>Refresh halaman utama dalam 30-60 detik untuk scan QR nomor baru.</p></body></html>');
        // Gunakan destroy() bukan logout() untuk menghindari crash Puppeteer
        try {
            await client.destroy();
            console.log('[Server] ✅ client.destroy() berhasil');
        } catch (err) {
            console.log('[Server] ⚠️ client.destroy() gagal (tidak masalah):', err.message);
        }
        // Hapus SELURUH folder .wwebjs_auth + .wwebjs_cache agar benar-benar bersih
        try {
            fs.rmSync(config.sessionDir, { recursive: true, force: true });
            console.log('[Server] 🗑️ Seluruh .wwebjs_auth dihapus');
        } catch (err) {
            console.log('[Server] ⚠️ Gagal hapus auth folder:', err.message);
        }
        try {
            fs.rmSync(path.join(__dirname, '.wwebjs_cache'), { recursive: true, force: true });
            console.log('[Server] 🗑️ Seluruh .wwebjs_cache dihapus');
        } catch (err) {
            console.log('[Server] ⚠️ Gagal hapus cache folder:', err.message);
        }
        // Restart process — Render akan auto-restart container
        console.log('[Server] 🔄 Restarting process...');
        setTimeout(() => process.exit(0), 1000);
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    if (isAuthenticated) {
        res.end('<html><body style="font-family: Arial; text-align: center; margin-top: 50px;"><h1>✅ Bot WhatsApp Suba Arch is Alive & Authenticated!</h1><br><p><a href="/logout" style="color: red;">🔴 Klik di sini untuk Logout & Ganti Nomor</a></p></body></html>');
    } else if (currentQR) {
        res.end(`
            <html>
            <head>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
                <meta http-equiv="refresh" content="10"> 
            </head>
            <body style="font-family: Arial; text-align: center; margin-top: 50px; background-color: #f0f2f5;">
                <h2>📱 Scan QR Code untuk Login WhatsApp Bot</h2>
                <div id="qrcode" style="display: inline-block; padding: 20px; background: white; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);"></div>
                <script>
                    new QRCode(document.getElementById("qrcode"), {
                        text: "${currentQR}",
                        width: 300,
                        height: 300,
                        colorDark : "#000000",
                        colorLight : "#ffffff",
                        correctLevel : QRCode.CorrectLevel.L
                    });
                </script>
                <p style="color: #666; margin-top: 20px;">Halaman ini otomatis refresh setiap 10 detik.<br>Setelah di-scan dari HP, tunggu beberapa saat sampai muncul notif berhasil.</p>
            </body>
            </html>
        `);
    } else {
        res.end('<html><head><meta http-equiv="refresh" content="3"></head><body style="font-family: Arial; text-align: center; margin-top: 50px;"><h2>⏳ Menunggu Chromium berjalan untuk men-generate QR Code...</h2><p>Tunggu sekitar 1-2 menit...</p></body></html>');
    }
}).listen(PORT, '0.0.0.0', () => {
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
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
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
            '--memory-pressure-off',
            '--disable-site-isolation-trials',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
        ],
    },
});

// ============ EVENT HANDLERS ============

/**
 * Event: QR Code - tampilkan di terminal untuk di-scan
 */
client.on('qr', (qr) => {
    currentQR = qr;
    console.log('====================================================');
    console.log('[Bot] 📱 QR Code baru di-generate!');
    console.log('[Bot] 🌐 BUKA URL RENDER DI BROWSER UNTUK SCAN QR CODE');
    console.log('       (Kenyataan Terminal/Logs sering memotong QR)');
    console.log('====================================================');
    console.log('');
    qrcode.generate(qr, { small: true }); // Tetap diprint untuk lokal
    console.log('');
    console.log('[Bot] ⏳ Menunggu scan...');
});

/**
 * Event: Authenticated - berhasil login
 */
client.on('authenticated', () => {
    isAuthenticated = true;
    currentQR = '';
    console.log('[Bot] ✅ Autentikasi berhasil!');
});

/**
 * Event: Authentication failure
 * Otomatis hapus session dan restart agar muncul QR baru
 */
client.on('auth_failure', (err) => {
    console.error('[Bot] ❌ Autentikasi gagal:', err);
    console.log('[Bot] 🗑️ Menghapus session + cache data dan restart...');
    try {
        fs.rmSync(config.sessionDir, { recursive: true, force: true });
        console.log('[Bot] 🗑️ .wwebjs_auth dihapus');
    } catch (e) {
        console.log('[Bot] ⚠️ Gagal hapus session:', e.message);
    }
    try {
        fs.rmSync(path.join(__dirname, '.wwebjs_cache'), { recursive: true, force: true });
        console.log('[Bot] 🗑️ .wwebjs_cache dihapus');
    } catch (e) {
        console.log('[Bot] ⚠️ Gagal hapus cache:', e.message);
    }
    // Restart — Render auto-restart
    setTimeout(() => process.exit(1), 2000);
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
                // Catat waktu kapan pesan user masuk
                const userMessageTime = Date.now();

                const aiReply = await ai.generateReply(msg.body, chatId);

                if (aiReply) {
                    // Cek instruksi anti-spam dari prompt AI
                    if (aiReply.trim() === 'IGNORE_DO_NOT_REPLY') {
                        console.log(`[Bot] 🛑 Pesan spam/filler dari ${msg.from} diabaikan oleh AI.`);
                        return; // Jangan balas apa-apa
                    }

                    // --- ANTI DOUBLE REPLY CHECK ---
                    // Cek apakah admin membalas manual SELAMA rentang waktu AI sedang "berpikir" (mencari jawaban AI)
                    const lastPauseTime = chatState.getLastPauseTime(chatId);
                    if (lastPauseTime > userMessageTime) {
                        console.log(`[Bot] 🛑 Admin membalas manual saat AI sedang berpikir. Pesan AI dibatalkan agar tidak double-reply ke ${msg.from}.`);
                        return;
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

                // ========== COMMAND: /logout ==========
                // Logout session agar bisa ganti nomor
                if (text === '/logout') {
                    await msg.reply('🔄 Logout dan reset session...\nBot akan restart dalam beberapa detik.\nBuka URL Render untuk scan QR nomor baru.');
                    console.log('[Bot] 🔄 Logout command received via WhatsApp');
                    try {
                        await client.destroy();
                    } catch (err) {
                        console.log('[Bot] ⚠️ client.destroy() error:', err.message);
                    }
                    try {
                        fs.rmSync(config.sessionDir, { recursive: true, force: true });
                        console.log('[Bot] 🗑️ Seluruh .wwebjs_auth dihapus');
                    } catch (err) {
                        console.log('[Bot] ⚠️ Gagal hapus auth:', err.message);
                    }
                    try {
                        fs.rmSync(path.join(__dirname, '.wwebjs_cache'), { recursive: true, force: true });
                        console.log('[Bot] 🗑️ Seluruh .wwebjs_cache dihapus');
                    } catch (err) {
                        console.log('[Bot] ⚠️ Gagal hapus cache:', err.message);
                    }
                    setTimeout(() => process.exit(0), 1000);
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
                        // Always update pause time to prevent auto-resume while admin is actively chatting
                        chatState.pauseChat(chatId);
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
    isAuthenticated = false;
    currentQR = '';

    // Jika disconnect karena LOGOUT, hapus session + cache agar QR baru bersih
    if (reason === 'LOGOUT') {
        console.log('[Bot] 🗑️ Disconnect karena LOGOUT — membersihkan session + cache...');
        try { fs.rmSync(config.sessionDir, { recursive: true, force: true }); } catch (e) { }
        try { fs.rmSync(path.join(__dirname, '.wwebjs_cache'), { recursive: true, force: true }); } catch (e) { }
        console.log('[Bot] ✅ Session + cache dihapus');
    } else {
        // Untuk disconnect lain (network issue, dll) — session tetap disimpan untuk auto-reconnect
        console.log('[Bot] 🔄 Restart process untuk reconnect (session tetap disimpan)...');
    }
    setTimeout(() => process.exit(0), 3000);
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

// ============ CRASH PROTECTION ============
// Mencegah process crash karena error Puppeteer yang tidak tertangkap
process.on('unhandledRejection', (reason) => {
    console.error('[Bot] ⚠️ Unhandled Rejection:', reason?.message || reason);
    // Jangan restart — hanya log. Biar bot tetap jalan.
});
process.on('uncaughtException', (err) => {
    console.error('[Bot] ⚠️ Uncaught Exception:', err.message);
    // Hanya log, jangan restart otomatis agar tidak restart loop
    // Restart hanya terjadi dari /logout, disconnect, atau auth_failure
});

// ============ STARTUP CLEANUP ============
// Cek apakah session folder ada tapi corrupt/kosong → hapus agar fresh start
try {
    const sessionPath = path.join(config.sessionDir, 'session', 'Default');
    if (fs.existsSync(config.sessionDir) && !fs.existsSync(sessionPath)) {
        console.log('[Bot] ⚠️ Session folder ada tapi tidak lengkap, menghapus...');
        fs.rmSync(config.sessionDir, { recursive: true, force: true });
        try { fs.rmSync(path.join(__dirname, '.wwebjs_cache'), { recursive: true, force: true }); } catch (e) { }
        console.log('[Bot] 🗑️ Stale session dihapus, akan generate QR baru');
    }
} catch (err) {
    console.log('[Bot] ⚠️ Startup cleanup error (diabaikan):', err.message);
}

// ============ START BOT ============

console.log('[Bot] 🔄 Menghubungkan ke WhatsApp...');
client.initialize();
