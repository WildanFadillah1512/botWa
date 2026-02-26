/**
 * Phone Resolver — Helper untuk resolve nomor telepon ke JID WhatsApp yang benar.
 * Menangani kasus dimana nomor menggunakan format @lid (bukan @c.us).
 */

// Cache: phone number -> resolved JID
const resolvedCache = new Map();

/**
 * Resolve nomor telepon ke JID yang benar (bisa @c.us atau @lid)
 * 
 * Strategi:
 * 1. Cek cache dulu
 * 2. Coba format standar phone@c.us dengan client.getNumberId()
 * 3. Jika gagal, cari dari daftar chat aktif
 * 
 * @param {import('whatsapp-web.js').Client} client 
 * @param {string} phone - Nomor telepon (format 628xxx, tanpa @c.us)
 * @returns {Promise<string|null>} JID yang bisa digunakan untuk sendMessage, atau null jika tidak ditemukan
 */
async function resolvePhoneToJid(client, phone) {
    // Bersihkan nomor
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
        cleanPhone = '62' + cleanPhone.substring(1);
    }
    if (cleanPhone.startsWith('+')) {
        cleanPhone = cleanPhone.substring(1);
    }

    // Cek cache
    if (resolvedCache.has(cleanPhone)) {
        return resolvedCache.get(cleanPhone);
    }

    // Strategi 1: Coba getNumberId (cara resmi wwebjs untuk cek nomor WA)
    try {
        const numberId = await client.getNumberId(cleanPhone);
        if (numberId) {
            const jid = numberId._serialized;
            resolvedCache.set(cleanPhone, jid);
            console.log(`[PhoneResolver] ✅ Resolved ${cleanPhone} → ${jid} (via getNumberId)`);
            return jid;
        }
    } catch (err) {
        // getNumberId bisa gagal, lanjut ke strategi berikutnya
        console.log(`[PhoneResolver] ⚠️ getNumberId gagal untuk ${cleanPhone}: ${err.message}`);
    }

    // Strategi 2: Cari dari daftar chat aktif
    try {
        const chats = await client.getChats();
        for (const chat of chats) {
            if (chat.isGroup) continue;

            const chatId = chat.id._serialized;
            const chatPhone = chat.id.user;

            // Cocokkan nomor telepon
            if (chatPhone === cleanPhone ||
                chatPhone === cleanPhone.replace(/^62/, '0') ||
                cleanPhone === chatPhone.replace(/^0/, '62')) {
                resolvedCache.set(cleanPhone, chatId);
                console.log(`[PhoneResolver] ✅ Resolved ${cleanPhone} → ${chatId} (via chat list)`);
                return chatId;
            }
        }
    } catch (err) {
        console.error(`[PhoneResolver] ❌ Error scanning chats: ${err.message}`);
    }

    // Strategi 3: Fallback ke format standar @c.us
    const fallbackJid = `${cleanPhone}@c.us`;
    console.log(`[PhoneResolver] ⚠️ Tidak ditemukan JID khusus untuk ${cleanPhone}, fallback ke ${fallbackJid}`);
    resolvedCache.set(cleanPhone, fallbackJid);
    return fallbackJid;
}

/**
 * Scan kontak dari daftar chat dan kembalikan info lengkap (nama + nomor + JID)
 * @param {import('whatsapp-web.js').Client} client 
 * @param {number} limit - Jumlah maksimum chat yang di-scan
 * @returns {Promise<Array<{jid: string, phone: string, name: string}>>}
 */
async function scanRecentContacts(client, limit = 50) {
    const results = [];

    try {
        const chats = await client.getChats();
        let count = 0;

        for (const chat of chats) {
            if (chat.isGroup) continue; // Skip group
            if (count >= limit) break;

            const chatId = chat.id._serialized;
            const phone = chat.id.user;

            // Ambil nama kontak dengan berbagai cara
            let contactName = chat.name || '';

            // Coba ambil dari kontak untuk mendapatkan pushname
            try {
                const contact = await client.getContactById(chatId);
                if (contact) {
                    contactName = contact.pushname || contact.name || chat.name || `User ${phone}`;
                }
            } catch {
                // Jika gagal ambil kontak, pakai chat.name
                contactName = chat.name || `User ${phone}`;
            }

            results.push({
                jid: chatId,
                phone: phone,
                name: contactName
            });

            // Cache sekalian
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            if (cleanPhone) {
                resolvedCache.set(cleanPhone, chatId);
            }

            count++;
        }
    } catch (err) {
        console.error(`[PhoneResolver] ❌ Error scanning contacts: ${err.message}`);
    }

    return results;
}

/**
 * Clear cache (berguna jika kontak berubah)
 */
function clearCache() {
    resolvedCache.clear();
    console.log('[PhoneResolver] 🗑️ Cache cleared');
}

module.exports = {
    resolvePhoneToJid,
    scanRecentContacts,
    clearCache,
};
