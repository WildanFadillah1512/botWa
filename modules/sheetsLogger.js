const config = require('../config');

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx3fhySswW0tw5-kPsMcBiFW0kCgY8W4jJtc41twC-p6EdIUuF70V69Rn-1A8ph0byc/exec';

/**
 * Format Date to Indonesian format
 */
function getIndonesianDate(date) {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    const dayName = days[date.getDay()];
    const day = date.getDate().toString().padStart(2, '0');
    const monthName = months[date.getMonth()];
    const year = date.getFullYear();

    return `${dayName}, ${day} ${monthName} ${year}`;
}

/**
 * Format Time to HH.mm.ss
 */
function getFormattedTime(date) {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    const s = date.getSeconds().toString().padStart(2, '0');
    return `${h}.${m}.${s}`;
}

/**
 * Push new message to Google Sheets
 * @param {import('whatsapp-web.js').Message} msg 
 * @param {string} senderName 
 * @param {string} senderNumber - Nomor pengirim (customer), digunakan sebagai kunci pencarian di Sheet
 */
async function pushToSheets(msg, senderName, senderNumber) {
    try {
        const timestamp = msg.timestamp * 1000;
        const dateObj = new Date(timestamp);

        const waktu = getFormattedTime(dateObj); // HH.mm.ss
        const hari = getIndonesianDate(dateObj); // Kamis, 22 Januari 2026

        // Format for AppsScript parseWADate: [HH:MM, DD/MM/YYYY] SenderName: message
        const h = dateObj.getHours().toString().padStart(2, '0');
        const m = dateObj.getMinutes().toString().padStart(2, '0');
        const day = dateObj.getDate().toString().padStart(2, '0');
        const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        const year = dateObj.getFullYear();

        const chatFormatted = `[${h}:${m}, ${day}/${month}/${year}] ${senderName}: ${msg.body}`;

        // Format WA link — selalu gunakan nomor customer
        let cleanNumber = senderNumber.replace(/[^0-9]/g, '');
        if (cleanNumber.startsWith('0')) {
            cleanNumber = '62' + cleanNumber.substring(1);
        }
        const waLink = `https://wa.me/${cleanNumber}`;

        const payload = {
            data: {
                nama: senderName || cleanNumber,
                chat: chatFormatted,
                waktu: waktu,
                hari: hari,
                nomor: cleanNumber,
                domisili: "-",
                layanan: "-",
                source: "WhatsApp Bot",
                level: "Cold",
                status: "Valid",
                link: waLink
            }
        };

        console.log(`[SheetsLogger] 📤 Mengirim data ke Sheets... (nomor: +${cleanNumber}, dari: ${senderName})`);

        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            redirect: 'follow',
            body: JSON.stringify(payload),
            headers: {
                'Content-Type': 'text/plain'
            }
        });

        // Baca response sebagai text dulu untuk safety
        const responseText = await response.text();

        // Cek apakah response adalah JSON valid
        let result;
        try {
            result = JSON.parse(responseText);
        } catch (parseErr) {
            // Response bukan JSON — kemungkinan HTML error page dari Google
            console.error(`[SheetsLogger] ❌ Response bukan JSON (status ${response.status}):`);
            console.error(`[SheetsLogger]    ${responseText.substring(0, 300)}`);
            return;
        }

        if (result.status === 'BERHASIL') {
            console.log(`[SheetsLogger] ✅ ${result.pesan_server} (${senderName})`);
        } else {
            console.error(`[SheetsLogger] ❌ Gagal: ${result.error}`);
        }

    } catch (err) {
        console.error('[SheetsLogger] ❌ Error menghubungi Apps Script:', err.message);
    }
}

module.exports = {
    pushToSheets
};
