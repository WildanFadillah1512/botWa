const { MessageMedia } = require('whatsapp-web.js');
const { resolvePhoneToJid, scanRecentContacts } = require('./phoneResolver');

// In-memory state holding the interactive broadcast session per admin number
const broadcastSessions = {};

/**
 * Handle pembatalan sesi
 */
function cancelSession(msg) {
    if (msg.body && msg.body.trim().toLowerCase() === 'batal') {
        if (broadcastSessions[msg.from]) {
            delete broadcastSessions[msg.from];
            msg.reply('❌ Sesi broadcast dibatalkan.');
            return true;
        }
    }
    return false;
}

/**
 * Parse CSV dari teks, mendukung comma maupun semicolon
 */
function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) return [];

    const headerLine = lines[0];
    const separator = headerLine.includes(';') ? ';' : ',';

    const headers = headerLine.split(separator).map(h => h.trim().toLowerCase());
    const phoneIdx = headers.findIndex(h => h === 'nomor' || h === 'phone' || h === 'no' || h === 'telepon');
    const nameIdx = headers.findIndex(h => h === 'nama' || h === 'name');

    if (phoneIdx === -1) return [];

    const results = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(separator).map(c => c.trim());
        let phone = cols[phoneIdx];
        if (!phone) continue;

        phone = phone.replace(/\D/g, '');
        if (phone.startsWith('0')) {
            phone = '62' + phone.substring(1);
        }

        const name = (nameIdx !== -1 && cols[nameIdx]) ? cols[nameIdx] : '';
        results.push({ phone, name });
    }

    return results;
}

/**
 * Helper delay
 */
const delay = ms => new Promise(res => setTimeout(res, ms));

/**
 * Cek apakah user sedang dalam sesi interaktif
 */
function isInSession(adminId) {
    return !!broadcastSessions[adminId];
}

/**
 * Handle alur interaktif broadcast
 */
async function handleBroadcastInteractive(client, msg) {
    const adminId = msg.from;
    const text = msg.body ? msg.body.trim() : '';

    // Deteksi perintah pembatalan
    if (cancelSession(msg)) return true;

    // Jika mulai baru
    if (text.startsWith('/broadcast')) {
        broadcastSessions[adminId] = { state: 'WAITING_FOR_MENU_CHOICE' };

        const menuText = `📢 *Menu Broadcast*\nSilakan pilih metode broadcast:\n\n1️⃣ Masukkan Daftar Nomor Manual\n2️⃣ Upload File CSV\n3️⃣ Pilih dari Daftar Chat Terakhir\n\n_Balas dengan angka *1*, *2*, atau *3*._\n_Ketik *batal* kapan saja untuk membatalkan._`;
        await msg.reply(menuText);
        return true;
    }

    // Jika sedang dalam sesi
    const session = broadcastSessions[adminId];
    if (!session) return false;

    try {
        switch (session.state) {
            case 'WAITING_FOR_MENU_CHOICE':
                if (text === '1') {
                    session.state = 'WAITING_FOR_NUMBERS_MANUAL';
                    await msg.reply('Anda memilih *Daftar Nomor Manual*.\n\nMasukkan nomor-nomor tujuan yang dipisahkan dengan koma atau baris baru.\nContoh: 6281234, 6285678');
                } else if (text === '2') {
                    session.state = 'WAITING_FOR_CSV_FILE';
                    await msg.reply('Anda memilih *Upload CSV*.\n\nSilakan kirimkan file .csv Anda ke sini.\n_Pastikan memiliki kolom "nomor" atau "phone". Boleh juga ada kolom "nama"._');
                } else if (text === '3') {
                    await msg.reply('⏳ Mengambil daftar kontak terbaru (termasuk nama), silakan tunggu...');

                    // Gunakan scanRecentContacts untuk mendapatkan nama kontak yang benar
                    const contacts = await scanRecentContacts(client, 50);

                    if (contacts.length === 0) {
                        await msg.reply('Tidak ada kontak individual ditemukan. Sesi dibatalkan.');
                        delete broadcastSessions[adminId];
                        return true;
                    }

                    session.chatList = contacts;
                    session.state = 'WAITING_FOR_CHAT_SELECTION';

                    let replyText = `📋 *Daftar 50 Kontak Terakhir*\n\n`;
                    for (let i = 0; i < contacts.length; i++) {
                        const c = contacts[i];
                        replyText += `${i + 1}. ${c.name} (${c.phone})\n`;
                    }

                    replyText += `\nSilakan balas dengan *nomor urut* kontak yang ingin Anda kirimi pesan.\nContoh: 1, 3, 5-10`;
                    await msg.reply(replyText);
                } else {
                    await msg.reply('Pilihan tidak valid. Silakan balas 1, 2, atau 3.');
                }
                break;

            case 'WAITING_FOR_NUMBERS_MANUAL': {
                let rawNumbers = text.replace(/\n/g, ',').split(',');
                let targets = [];
                for (let num of rawNumbers) {
                    num = num.trim().replace(/\D/g, '');
                    if (num) {
                        if (num.startsWith('0')) num = '62' + num.substring(1);
                        targets.push({ phone: num, name: '' });
                    }
                }

                if (targets.length === 0) {
                    await msg.reply('⚠️ Tidak ada nomor valid yang ditemukan. Coba lagi atau ketik batal.');
                    return true;
                }

                session.targets = targets;
                session.state = 'WAITING_FOR_MESSAGE';
                await msg.reply(`✅ Ditemukan *${targets.length} nomor* tujuan.\n\nSekarang, silakan ketik pesan yang ingin di-broadcast.`);
                break;
            }

            case 'WAITING_FOR_CSV_FILE': {
                if (!msg.hasMedia) {
                    await msg.reply('⚠️ Tolong kirimkan file dokumen CSV. Coba lagi atau ketik batal.');
                    return true;
                }

                const media = await msg.downloadMedia();
                if (!media || !media.filename || !media.filename.endsWith('.csv')) {
                    await msg.reply('⚠️ Harap pastikan file berekstensi .csv. Coba lagi atau ketik batal.');
                    return true;
                }

                const csvText = Buffer.from(media.data, 'base64').toString('utf-8');
                const csvTargets = parseCSV(csvText);

                if (csvTargets.length === 0) {
                    await msg.reply('⚠️ Gagal membaca data CSV atau kolom "nomor" tidak ditemukan. Pastikan format benar.');
                    return true;
                }

                session.targets = csvTargets;
                session.state = 'WAITING_FOR_MESSAGE';
                await msg.reply(`✅ Ditemukan *${csvTargets.length} kontak* dari CSV.\n\nSekarang, silakan ketik pesan broadcast.\n💡 _Tips: Anda bisa menggunakan kata kunci *{nama}* di dalam pesan yang akan otomatis diganti dengan nama di CSV._`);
                break;
            }

            case 'WAITING_FOR_CHAT_SELECTION': {
                const chatListSaved = session.chatList;
                const selectedIndexes = new Set();

                const parts = text.split(',');
                for (let p of parts) {
                    p = p.trim();
                    if (p.includes('-')) {
                        const [start, end] = p.split('-').map(Number);
                        if (!isNaN(start) && !isNaN(end)) {
                            for (let i = start; i <= end; i++) {
                                if (i > 0 && i <= chatListSaved.length) selectedIndexes.add(i);
                            }
                        }
                    } else {
                        const num = Number(p);
                        if (!isNaN(num) && num > 0 && num <= chatListSaved.length) {
                            selectedIndexes.add(num);
                        }
                    }
                }

                if (selectedIndexes.size === 0) {
                    await msg.reply('⚠️ Tidak ada nomor urut valid yang dipilih. Coba balas dengan contoh: 1, 2, 4-6');
                    return true;
                }

                let chatTargets = [];
                selectedIndexes.forEach(idx => {
                    const ct = chatListSaved[idx - 1];
                    chatTargets.push({ phone: ct.phone, name: ct.name, jid: ct.jid });
                });

                session.targets = chatTargets;
                session.state = 'WAITING_FOR_MESSAGE';
                await msg.reply(`✅ Anda memilih *${chatTargets.length} kontak*.\n\nSekarang, silakan ketik pesan broadcast.\n💡 _Tips: Gunakan kata kunci *{nama}* yang akan diganti otomatis._`);
                break;
            }

            case 'WAITING_FOR_MESSAGE': {
                if (!text && !msg.hasMedia) {
                    await msg.reply('Pesan kosong. Ketik pesan teks atau sisipkan media dengan caption.');
                    return true;
                }

                session.broadcastMessageText = text;
                if (msg.hasMedia) {
                    session.broadcastMedia = await msg.downloadMedia();
                }

                session.state = 'CONFIRMATION';
                let confMsg = `⚠️ *Konfirmasi Broadcast*\n\nAnda akan mengirim pesan ini ke *${session.targets.length}* nomor.\n`;
                if (session.broadcastMedia) {
                    confMsg += `[Terdapat Media/Gambar]\nPreview Teks:\n${text}\n\n`;
                } else {
                    confMsg += `Preview Pesan:\n${text}\n\n`;
                }
                confMsg += `Balas *y* untuk MENGIRIM, atau *batal* untuk membatalkan.`;

                await msg.reply(confMsg);
                break;
            }

            case 'CONFIRMATION': {
                if (text.toLowerCase() !== 'y' && text.toLowerCase() !== 'ya') {
                    await msg.reply('Pilihan tidak dikenali. Ketik *y* untuk lanjut atau *batal*.');
                    return true;
                }

                // Mulai eksekusi
                const targetsToSend = session.targets;
                const templateText = session.broadcastMessageText;
                const mediaToSend = session.broadcastMedia;
                delete broadcastSessions[adminId];

                await msg.reply(`🚀 Mulai mengirim broadcast ke ${targetsToSend.length} kontak... (Jeda 3 detik per pesan)`);

                let success = 0;
                let fail = 0;

                for (let i = 0; i < targetsToSend.length; i++) {
                    const target = targetsToSend[i];

                    // Gunakan phone resolver untuk mendapatkan JID yang benar
                    // Jika sudah ada jid dari scan kontak, gunakan langsung
                    let targetId;
                    if (target.jid) {
                        targetId = target.jid;
                    } else {
                        targetId = await resolvePhoneToJid(client, target.phone);
                    }

                    // Replace nama
                    let finalMsg = templateText;
                    if (finalMsg.includes('{nama}')) {
                        finalMsg = finalMsg.replace(/{nama}/g, target.name || 'Kak');
                    }

                    try {
                        if (mediaToSend) {
                            await client.sendMessage(targetId, mediaToSend, { caption: finalMsg });
                        } else {
                            if (finalMsg) {
                                await client.sendMessage(targetId, finalMsg);
                            }
                        }
                        success++;
                        console.log(`[Broadcast] ✅ Terkirim ke ${target.name || target.phone} (${targetId})`);
                    } catch (err) {
                        fail++;
                        console.error(`[Broadcast] ❌ Gagal kirim ke ${target.phone}:`, err.message);
                    }

                    // Delay 3 detik kecuali pesan terakhir
                    if (i < targetsToSend.length - 1) {
                        await delay(3000);
                    }
                }

                // Kirim laporan ke admin — gunakan resolver juga
                try {
                    const adminJid = await resolvePhoneToJid(client, adminId.split('@')[0]);
                    await client.sendMessage(adminJid, `✅ *Broadcast Selesai!*\n\nBerhasil: ${success}\nGagal: ${fail}`);
                } catch {
                    await client.sendMessage(adminId, `✅ *Broadcast Selesai!*\n\nBerhasil: ${success}\nGagal: ${fail}`);
                }
                break;
            }
        }

    } catch (err) {
        console.error('[Broadcast Error]', err);
        await msg.reply('❌ Terjadi kesalahan saat memproses sesi broadcast. Sesi dibatalkan.');
        delete broadcastSessions[adminId];
    }

    return true;
}

module.exports = {
    handleBroadcastInteractive,
    isInSession
};
