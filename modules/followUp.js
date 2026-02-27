const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const config = require('../config');
const { resolvePhoneToJid, scanRecentContacts } = require('./phoneResolver');

const FOLLOWUPS_PATH = path.join(config.dataDir, 'followups.json');

let followupData = null;
let client = null;

// In-memory state untuk sesi interaktif follow-up per admin
const followupSessions = {};

/**
 * Load data follow-up dari JSON
 */
function loadFollowups() {
    try {
        const raw = fs.readFileSync(FOLLOWUPS_PATH, 'utf-8');
        followupData = JSON.parse(raw);
        if (!followupData.dynamic) followupData.dynamic = [];
        console.log(`[FollowUp] ✅ Loaded ${followupData.clients?.length || 0} drip clients, ${followupData.dynamic?.length || 0} dynamic tasks`);
    } catch (err) {
        console.error('[FollowUp] ❌ Gagal load followups.json:', err.message);
        followupData = { clients: [], dynamic: [] };
    }
}

/**
 * Simpan data follow-up ke JSON
 */
function saveFollowups() {
    try {
        fs.writeFileSync(FOLLOWUPS_PATH, JSON.stringify(followupData, null, 2), 'utf-8');
    } catch (err) {
        console.error('[FollowUp] ❌ Gagal save followups.json:', err.message);
    }
}

/**
 * Hitung selisih hari antara dua tanggal
 */
function daysBetween(date1, date2) {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.floor(Math.abs(date2 - date1) / oneDay);
}

/**
 * Cek apakah admin sedang dalam sesi interaktif follow-up
 */
function isInSession(adminId) {
    return !!followupSessions[adminId];
}

/**
 * Proses follow-up untuk semua client yang aktif (drip campaign)
 */
async function processFollowups() {
    if (!client || !followupData) return;

    const now = new Date();
    let sent = 0;

    for (const cl of followupData.clients) {
        if (cl.status !== 'active') continue;

        if (!cl.startDate) {
            cl.startDate = now.toISOString();
            saveFollowups();
        }

        const startDate = new Date(cl.startDate);
        const daysElapsed = daysBetween(startDate, now);
        const currentStep = cl.currentStep || 0;

        if (currentStep >= cl.messages.length) {
            cl.status = 'done';
            saveFollowups();
            console.log(`[FollowUp] ✅ Client ${cl.name} - Semua follow-up selesai`);
            continue;
        }

        const nextMessage = cl.messages[currentStep];

        if (daysElapsed >= nextMessage.day) {
            try {
                // Gunakan phone resolver untuk mendapatkan JID yang benar
                const chatId = await resolvePhoneToJid(client, cl.phone);

                const text = nextMessage.text.replace(/\{name\}/g, cl.name);
                await client.sendMessage(chatId, text);

                cl.currentStep = currentStep + 1;
                cl.lastFollowUp = now.toISOString();
                saveFollowups();

                console.log(`[FollowUp] 📤 Sent follow-up step ${currentStep + 1} to ${cl.name}`);
                sent++;
            } catch (err) {
                console.error(`[FollowUp] ❌ Gagal kirim ke ${cl.name}:`, err.message);
            }
        }
    }

    if (sent > 0) {
        console.log(`[FollowUp] 📊 Total drip follow-up terkirim: ${sent}`);
    }
}

/**
 * Proses follow-up dinamis (jam & tanggal persis)
 */
async function processDynamicFollowups() {
    if (!client || !followupData || !followupData.dynamic || followupData.dynamic.length === 0) return;

    const now = new Date();
    let sent = 0;
    let modified = false;

    for (const task of followupData.dynamic) {
        if (task.status !== 'pending') continue;

        const targetTime = new Date(task.targetTime);
        if (now >= targetTime) {
            try {
                // Gunakan phone resolver untuk mendapatkan JID yang benar
                const chatId = await resolvePhoneToJid(client, task.phone);
                await client.sendMessage(chatId, task.message);

                task.status = 'done';
                task.sentAt = now.toISOString();
                modified = true;
                sent++;
                console.log(`[FollowUp] 📤 Dynamic message sent to ${task.phone}`);

                // Notify admin of success (using bot's own number/host number)
                try {
                    // client.info.wid._serialized is the connected bot's number (e.g., 628xxx@c.us)
                    const adminJid = client.info.wid._serialized;
                    await client.sendMessage(adminJid, `✅ *Follow-Up Sukses!*\n\nPesan berhasil dikirim ke: ${task.phone}\n⏳ Waktu Jadwal: ${new Date(task.targetTime).toLocaleString()}\n📝 Pesan: ${task.message}`);
                } catch (adminErr) {
                    console.error(`[FollowUp] ⚠️ Gagal notify admin: ${adminErr.message}`);
                }
            } catch (err) {
                console.error(`[FollowUp] ❌ Gagal kirim dynamic ke ${task.phone}:`, err.message);
            }
        }
    }

    if (modified) {
        saveFollowups();
        if (sent > 0) {
            console.log(`[FollowUp] 📊 Total dynamic follow-up terkirim: ${sent}`);
        }
    }
}

/**
 * Tambahkan pesan follow-up dinamis dari command
 */
function addDynamicFollowup(phone, dateObj, text) {
    if (!followupData) loadFollowups();
    if (!followupData.dynamic) followupData.dynamic = [];

    followupData.dynamic.push({
        id: `dyn_${Date.now()}`,
        phone: phone,
        targetTime: dateObj.toISOString(),
        message: text,
        status: 'pending',
        createdAt: new Date().toISOString()
    });

    saveFollowups();
    console.log(`[FollowUp] 🗓️ Jadwal baru ditambahkan untuk ${phone} pada ${dateObj.toLocaleString()}`);
}

/**
 * Handle alur interaktif follow-up
 * Mengembalikan true jika pesan ditangani oleh modul ini.
 */
async function handleFollowupInteractive(waClient, msg) {
    const chatState = require('./chatState');
    const adminId = msg.from;
    const text = msg.body ? msg.body.trim() : '';

    // Override msg.reply untuk otomatis me-mark sebagai pesan bot
    const originalReply = msg.reply.bind(msg);
    msg.reply = async (replyText) => {
        chatState.markAsBotMessage(replyText);
        return await originalReply(replyText);
    };

    // Deteksi pembatalan
    if (text.toLowerCase() === 'batal' && followupSessions[adminId]) {
        delete followupSessions[adminId];
        await msg.reply('❌ Sesi follow-up dibatalkan.');
        return true;
    }

    // Jika mulai baru: /followup tanpa parameter atau hanya /followup
    if (text === '/followup') {
        followupSessions[adminId] = { state: 'WAITING_FOR_MENU_CHOICE' };

        const menuText = `📋 *Menu Follow-Up*\nSilakan pilih metode:\n\n1️⃣ Input Manual (nomor + waktu + pesan)\n2️⃣ Pilih dari Daftar Chat Terakhir\n\n_Balas dengan angka *1* atau *2*._\n_Ketik *batal* kapan saja untuk membatalkan._`;
        await msg.reply(menuText);
        return true;
    }

    // Jika sedang dalam sesi
    const session = followupSessions[adminId];
    if (!session) return false;

    try {
        switch (session.state) {
            case 'WAITING_FOR_MENU_CHOICE':
                if (text === '1') {
                    session.state = 'WAITING_FOR_MANUAL_INPUT';
                    await msg.reply('Anda memilih *Input Manual*.\n\nMasukkan data dalam format:\n`nomor tanggal jam pesan`\n\nContoh:\n`6281234567890 2026-03-01 14:00 Halo, ini pesan follow-up!`');
                } else if (text === '2') {
                    await msg.reply('⏳ Mengambil daftar kontak, silakan tunggu...');

                    // Scan kontak terakhir dengan nama
                    const contacts = await scanRecentContacts(waClient, 50);

                    if (contacts.length === 0) {
                        await msg.reply('Tidak ada kontak ditemukan. Sesi dibatalkan.');
                        delete followupSessions[adminId];
                        return true;
                    }

                    session.contactList = contacts;
                    session.state = 'WAITING_FOR_CONTACT_SELECTION';

                    let replyText = `📋 *Daftar Kontak Terakhir*\n\n`;
                    for (let i = 0; i < contacts.length; i++) {
                        const c = contacts[i];
                        replyText += `${i + 1}. ${c.name} (${c.phone})\n`;
                    }
                    replyText += `\nSilakan balas dengan *nomor urut* kontak.\nContoh: 5`;
                    await msg.reply(replyText);
                } else {
                    await msg.reply('Pilihan tidak valid. Silakan balas *1* atau *2*.');
                }
                break;

            case 'WAITING_FOR_MANUAL_INPUT': {
                const parts = text.split(' ');
                if (parts.length >= 4) {
                    const phone = parts[0];
                    const dateStr = parts[1];
                    const timeStr = parts[2];
                    const message = parts.slice(3).join(' ');

                    const dateObj = new Date(`${dateStr}T${timeStr}:00`);
                    const now = new Date();

                    if (!isNaN(dateObj.getTime())) {
                        if (dateObj < now) {
                            await msg.reply(`⚠️ Waktu (${dateObj.toLocaleString()}) sudah terlewat!\nMasukkan waktu di masa depan.`);
                        } else {
                            addDynamicFollowup(phone, dateObj, message);
                            await msg.reply(`✅ Jadwal ditambahkan!\n👤 Target: ${phone}\n⏰ Waktu: ${dateObj.toLocaleString()}\n📝 Pesan: ${message}`);
                            delete followupSessions[adminId];
                        }
                    } else {
                        await msg.reply(`❌ Format waktu salah.\nGunakan: nomor YYYY-MM-DD HH:mm pesan\nContoh: 6281234567890 2026-03-01 14:00 Halo!`);
                    }
                } else {
                    await msg.reply(`❌ Format salah.\nGunakan: nomor YYYY-MM-DD HH:mm pesan\nContoh: 6281234567890 2026-03-01 14:00 Halo!`);
                }
                break;
            }

            case 'WAITING_FOR_CONTACT_SELECTION': {
                const idx = parseInt(text);
                if (isNaN(idx) || idx < 1 || idx > session.contactList.length) {
                    await msg.reply(`⚠️ Nomor urut tidak valid. Masukkan angka 1 - ${session.contactList.length}.`);
                    return true;
                }

                const selectedContact = session.contactList[idx - 1];
                session.selectedPhone = selectedContact.phone;
                session.selectedName = selectedContact.name;
                session.selectedJid = selectedContact.jid;
                session.state = 'WAITING_FOR_DATETIME';

                await msg.reply(`✅ Kontak dipilih: *${selectedContact.name}* (${selectedContact.phone})\n\nSekarang masukkan tanggal dan jam pengiriman.\nFormat: YYYY-MM-DD HH:mm\nContoh: 2026-03-01 14:00`);
                break;
            }

            case 'WAITING_FOR_DATETIME': {
                const dtParts = text.split(' ');
                if (dtParts.length < 2) {
                    await msg.reply('❌ Format salah. Gunakan: YYYY-MM-DD HH:mm\nContoh: 2026-03-01 14:00');
                    return true;
                }

                const dateObj = new Date(`${dtParts[0]}T${dtParts[1]}:00`);
                const now = new Date();

                if (isNaN(dateObj.getTime())) {
                    await msg.reply('❌ Format waktu tidak valid. Contoh: 2026-03-01 14:00');
                    return true;
                }

                if (dateObj < now) {
                    await msg.reply(`⚠️ Waktu (${dateObj.toLocaleString()}) sudah terlewat!`);
                    return true;
                }

                session.targetTime = dateObj;
                session.state = 'WAITING_FOR_MESSAGE';
                await msg.reply(`⏰ Waktu: *${dateObj.toLocaleString()}*\n\nSekarang, ketik pesan yang ingin dikirim sebagai follow-up.`);
                break;
            }

            case 'WAITING_FOR_MESSAGE': {
                if (!text) {
                    await msg.reply('Pesan tidak boleh kosong. Silakan ketik pesan.');
                    return true;
                }

                addDynamicFollowup(session.selectedPhone, session.targetTime, text);
                await msg.reply(`✅ *Follow-Up Dijadwalkan!*\n\n👤 Kontak: ${session.selectedName} (${session.selectedPhone})\n⏰ Waktu: ${session.targetTime.toLocaleString()}\n📝 Pesan: ${text}`);
                delete followupSessions[adminId];
                break;
            }
        }
    } catch (err) {
        console.error('[FollowUp Interactive Error]', err);
        await msg.reply('❌ Terjadi kesalahan. Sesi dibatalkan.');
        delete followupSessions[adminId];
    }

    return true;
}

/**
 * Inisialisasi follow-up scheduler
 */
function init(waClient) {
    client = waClient;
    loadFollowups();

    // Drip campaign harian
    cron.schedule(config.followUpCron, () => {
        console.log('[FollowUp] ⏰ Running scheduled drip follow-up check...');
        processFollowups();
    });

    // Dynamic tasks per menit
    cron.schedule('* * * * *', () => {
        processDynamicFollowups();
    });

    console.log(`[FollowUp] ⏰ Scheduler drip aktif: ${config.followUpCron}`);
    console.log(`[FollowUp] ⏰ Scheduler dynamic aktif: Setiap menit`);
}

module.exports = {
    init,
    processFollowups,
    processDynamicFollowups,
    addDynamicFollowup,
    loadFollowups,
    handleFollowupInteractive,
    isInSession,
};
