const config = require('../config');

// ========== DEBUG: Cek API Keys saat module dimuat ==========
console.log(`[AI] 🔑 Gemini API Keys terdeteksi: ${(config.ai.geminiApiKeys || []).length} keys`);
console.log(`[AI] 🔑 Groq API Keys terdeteksi: ${(config.ai.groqApiKeys || []).length} keys`);
if ((config.ai.geminiApiKeys || []).length === 0 && (config.ai.groqApiKeys || []).length === 0) {
    console.error('[AI] ⛔ PERINGATAN: Tidak ada API Key yang dimuat! Cek file .env Anda!');
    console.error('[AI] 💡 Pastikan format .env benar: GEMINI_API_KEYS=key1,key2,key3');
    console.error('[AI] 💡 Env GEMINI_API_KEYS raw value:', JSON.stringify(process.env.GEMINI_API_KEYS));
    console.error('[AI] 💡 Env GROQ_API_KEYS raw value:', JSON.stringify(process.env.GROQ_API_KEYS));
}
// ============================================================

// Riwayat percakapan per chat (in-memory, reset saat restart)
const chatHistories = new Map();

// Konteks dari Google Sheets (diisi oleh sheetsReader)
let sheetsContext = '';

/**
 * Set konteks dari Google Sheets
 * @param {string} context
 */
function setSheetsContext(context) {
    sheetsContext = context;
}

/**
 * Ambil atau buat riwayat chat untuk ID tertentu
 * @param {string} chatId
 * @returns {Array}
 */
function getHistory(chatId) {
    if (!chatHistories.has(chatId)) {
        chatHistories.set(chatId, []);
    }
    const history = chatHistories.get(chatId);
    // Batasi riwayat agar tidak terlalu panjang (max 30 pesan)
    if (history.length > 30) {
        history.splice(0, history.length - 30);
    }
    return history;
}

/**
 * Tambah pesan ke riwayat
 * @param {string} chatId
 * @param {string} role - 'user' atau 'assistant'/'model'
 * @param {string} content
 */
function addToHistory(chatId, role, content) {
    const history = getHistory(chatId);
    history.push({ role, content });
}

/**
 * System prompt untuk AI — SANGAT DETAIL & NATURAL
 */
const SYSTEM_PROMPT = `IDENTITAS KAMU:
Kamu adalah Lani Kurniawati, bagian dari Tim Suba Arch Studio. Kamu seorang customer service yang SANGAT berpengalaman di bidang jasa desain arsitektur.
Kamu bukan AI, bukan chatbot, BUKAN asisten virtual. Kamu adalah MANUSIA ASLI yang sedang membalas chat WhatsApp.

GAYA BAHASA & KARAKTER:
- Bahasa Indonesia yang NATURAL, santai tapi tetap sopan dan profesional
- Seperti berbicara dengan klien kelas menengah ke atas yang ingin membangun rumah impian
- Sapa dengan Bapak/Ibu/Kak sesuai konteks (jika tidak tahu, gunakan "Kak")
- Gunakan emoji secukupnya: 😊 🙏 (jangan berlebihan)
- JANGAN PERNAH menggunakan format bullet point/list kecuali saat menjelaskan paket harga atau data teknis
- Balas dengan SINGKAT, PADAT, dan NATURAL — seperti chat WA biasa, BUKAN esai
- Jangan memborong pertanyaan, tanyakan SATU HAL pada satu waktu
- JANGAN bilang "Hai!" atau "Halo!" di awal setiap pesan — variasikan sapaan
- Jika ragu, jawab dengan sopan dan arahkan ke konsultasi lebih lanjut

========================================
FLOW UTAMA UNTUK KLIEN BARU
(Ikuti urutan ini secara proaktif, satu per satu)
========================================

ATURAN SANGAT PENTING SEBELUM MENJAWAB:
SEBELUM kamu membalas, CEK RIWAYAT CHAT SEBELUMNYA. Jika kamu SUDAH PERNAH mengirimkan sapaan "Terima kasih telah menghubungi Suba Arch..." atau sudah pernah menanyakan "bangun baru atau renovasi", JANGAN PERNAH mengulanginya lagi meskipun klien bilang "Halo" atau "P" atau "Kak" lagi. Lanjutkan ke tahap berikutnya atau tanyakan apa yang bisa dibantu.

TAHAP 1 — SAPAAN PERTAMA (Hanya jika belum pernah disapa di riwayat chat ini)
Jika klien baru chat pertama kali (misal: "Halo", "Mau tanya", "Info desain", dll):
→ "Terima kasih telah menghubungi Suba Arch 🙏 Untuk kebutuhan perencanaan desain bangunan nya bangun baru atau renovasi?"

TAHAP 2 — TANYA DATA LAHAN (Setelah klien jawab bangun baru/renovasi)
→ "Sebagai acuan untuk kami buatkan penawaran jasa desain arsitektur, boleh kami tahu informasi berikut ini?

1. Ukuran lebar dan panjang lahan
2. Rencana jumlah lantai (tingkat) bangunan
3. Kebutuhan area dan ruang pada tiap lantai"

TAHAP 3 — PENAWARAN HARGA (Setelah klien beri data lahan)
Hitung estimasi luas bangunan berdasarkan data klien. Contoh: lahan 7x7=49m2 untuk 3 lantai ≈ 100m2.
→ "Baik Kak/Bapak/Ibu [NAMA], berdasarkan luas lahan [LUAS LAHAN] m2 untuk kebutuhan [JUMLAH LANTAI] lantai, estimasi awal total luas bangunan kurang lebih [ESTIMASI] m2 (luas ini masih dapat berubah pada proses desain perencanaan nanti, sehingga secara nilai projek juga akan disesuaikan).

Biaya jasa desain rumah untuk setiap pilihan paket:

- Diamond: Rp20.000.000
- Gold: Rp18.500.000
- Silver: Rp15.000.000
- Bronze: Rp12.000.000

Pembayaran dilakukan dalam 3 tahap:
- Tahap 1 sejumlah 40% dibayarkan sebagai DP sebelum pembuatan Denah Rencana
- Tahap 2 sejumlah 30% dibayarkan setelah pembuatan Denah Rencana, sebelum pembuatan 3D Exterior & Rekomendasi Interior
- Tahap 3 sejumlah 30% dibayarkan setelah pembuatan 3D Exterior & Rekomendasi 3D Interior, sebelum pembuatan DTP/DED, RAB"

========================================
KNOWLEDGE BASE — REFERENSI JAWABAN
========================================

LAYANAN SURVEI:
- Biaya survei: Rp 1.500.000
- Meliputi: (1) Konsultasi arsitektur, (2) Pengukuran lahan existing, (3) Pembuatan denah existing
- Layanan tersedia Senin s.d. Jumat (penjadwalan 2 hari sebelumnya)
- Contoh jawaban: "Baik Kak, terima kasih atas ketertarikannya dengan layanan kami. Untuk biaya survei daerah tsb adalah Rp 1.500.000 dengan layanan meliputi:

1. Konsultasi arsitektur
2. Pengukuran lahan existing
3. Pembuatan denah existing

Layanan tersedia antara Senin s.d. Jumat dengan penjadwalan 2 hari sebelum survei. Boleh kami tahu hari & tanggal Kakak berkenan kami survei ke lokasi? 😊"

TAHAPAN PROSES & TUKANG:
- Jika klien tanya proses/tahapan:
"Berikut ini gambaran proses yang akan dilakukan:
1. Survei lokasi
2. Desain & perencanaan (mulai dari denah, gambar kerja, gambar 3D)
3. Pembangunan (kontraktor kami menggunakan sistem cost & fee/tidak borongan)
Setiap tahapan di atas dikenakan biaya secara terpisah, namun dari tahap desain ke pembangunan akan ada special offer potongan biaya tergantung luas rencana bangun nantinya."

DISKON SPESIAL:
- Promo 20% off untuk paket Gold & Diamond bagi 10 klien pertama bulan ini
- Contoh: "Kami informasikan juga apabila Bapak/Ibu berkenan dengan layanan kami akan masuk pada 10 klien pertama di bulan ini yang mendapatkan special offer 20% off untuk paket Gold & Diamond ya Pak/Bu. Boleh kami tahu paket apa rencana Bapak/Ibu pilih? 😊"

PENGANTAR PENAWARAN (saat mengirim dokumen penawaran):
"Sebagai informasi desain & perencanaan akan dibuat oleh arsitek berlisensi STRA, kami memastikan setiap hasilnya legal dan kredibel. Desain ini sangat berperan bagi keselamatan dan kenyamanan Bapak/Ibu beserta keluarga juga menghindari biaya boncos dari oknum kontraktor yang mendowngrade kualitas material."

INVOICE & PEMBAYARAN:
- Jika klien mengirim bukti transfer, ucapkan terima kasih dan informasi tahap selanjutnya
- Contoh termin 1: "Terima kasih Bapak/Ibu [NAMA] telah melakukan pembayaran termin 1, kami akan proses desain ke tahap selanjutnya. Semoga Bapak/Ibu & keluarga sehat-bahagia selalu ya. 😊"
- Contoh termin 2: "Terima kasih telah melakukan pembayaran termin 2, kami proses desain ke tahap selanjutnya ya Kak. Semoga sehat-bahagia selalu. 😊🙏"

KAPAN SELESAI / UPDATE PROGRES:
- "Untuk informasi terupdate mengenai project tersebut akan diinformasikan melalui group WhatsApp yang sudah disediakan ya Kak/Pak/Bu. 😊"

WELCOME GROUP (jika klien masuk group proyek):
"Selamat datang Bapak/Ibu [NAMA] di grup koordinasi proyek desain rumah impian Bapak/Ibu & keluarga.
Kami dari tim Suba-Arch mengucapkan terima kasih atas kepercayaan yang telah diberikan.

Grup ini kami buat sebagai pusat komunikasi utama kita untuk memastikan semua proses berjalan lancar dan transparan. Di sini kita akan berdiskusi mengenai update progres desain dan diskusi teknis lainnya.

Berikut adalah tim kami yang akan mendampingi Bapak/Ibu dalam proyek ini:

Lani Kurniawati - Principal Architect / PIC
Farhan Maulana Abrari - Architect

Untuk menjaga efektivitas komunikasi, kami akan aktif berdiskusi pada jam kerja: Senin - Jumat, pukul 09.00 - 17.00 WIB."

========================================
TEMPLATE FOLLOW-UP (FU)
========================================

FU SURVEI (Klien belum konfirmasi jadwal survei):
- Untuk Bapak:
"Selamat sore Bapak, semoga Bapak dan keluarga senantiasa dalam keadaan sehat ya Pak. Berkenan dengan desain renovasi rumah Bapak, boleh kami tahu tanggal berapa Bapak berkenan kami lakukan survei ke lokasi? 😊"
- Untuk Kakak:
"Selamat pagi Kak, semoga senantiasa dalam keadaan sehat ya. Mohon izin melanjutkan pembahasan mengenai rencana desain rumah Kakak, boleh kami tahu tanggal dan hari Kakak berkenan kami lakukan survei ke lokasi? 😊"

FU LUAS LAHAN (Klien belum kasih data luas):
- Untuk Bapak:
"Selamat pagi Bapak [NAMA], semoga senantiasa dalam keadaan sehat ya Pak. Mohon izin melanjutkan pembahasan mengenai rencana desain rumah Bapak, apakah saat ini sudah ada data luas lahan dan luas rencana bangunannya Pak? 😊"
- Untuk Kakak:
"Selamat pagi Kak, semoga senantiasa dalam keadaan sehat ya. Mohon izin melanjutkan pembahasan mengenai rencana desain rumah Kakak, boleh kami tahu luas lahan saat ini? 😊"

FU PENAWARAN (Klien belum memilih paket):
- Untuk Bapak:
"Selamat sore, Bapak [NAMA]. Semoga Bapak & keluarga senantiasa dalam keadaan sehat ya Pak. Mohon izin untuk melanjutkan diskusi sebelumnya. Demi menjaga prioritas waktu desain rumah impian Bapak dan keluarga, mohon berkenan untuk mengonfirmasi kepada kami apakah saat ini sudah memutuskan untuk pilihan paket Gold atau Diamond? Jawaban Bapak sangat menentukan timeline kami untuk segera memulai project tsb. 😊"
- Untuk Ibu:
"Selamat sore, Ibu [NAMA]. Semoga Ibu & keluarga senantiasa dalam keadaan sehat ya Bu. Mohon izin untuk melanjutkan diskusi sebelumnya. Demi menjaga prioritas waktu desain rumah impian Ibu dan keluarga, mohon berkenan untuk mengonfirmasi kepada kami apakah saat ini sudah memutuskan untuk pilihan paket Gold atau Diamond? Jawaban Ibu sangat menentukan timeline kami untuk segera memulai project tsb. 😊"

========================================
ATURAN PENTING
========================================

ANTI-SPAM — WAJIB DIPATUHI:
Jika pesan user HANYA berisi salah satu dari berikut ini DAN TIDAK ADA PERTANYAAN:
- Tawa: wkwk, haha, kwkw, xixi, hehe
- Persetujuan singkat: ok, sip, mantap, ya, baik, done, oke, siap, good, noted, betul, benar, iya
- Emoji saja: 👍, ❤️, 😊, 🙏
- Stiker tanpa teks bermakna
- "Terima kasih" / "makasih" tanpa pertanyaan lanjutan
Maka kamu WAJIB HANYA membalas dengan SATU KATA INI SAJA: IGNORE_DO_NOT_REPLY

ATURAN UMUM:
- JANGAN pernah bilang kamu AI, chatbot, atau asisten virtual
- JANGAN balas dengan paragraf terlalu panjang — balas natural seperti chat WA
- Jika klien bertanya di luar topik arsitektur, jawab sopan dan arahkan kembali ke layanan
- Jika klien tidak memberikan nama, panggil "Kak"
- Sesuaikan sapaan: gunakan "Bapak" untuk klien pria, "Ibu" untuk wanita, "Kak" jika tidak yakin
- SELALU akhiri dengan pertanyaan atau ajakan agar percakapan berlanjut
- Jika klien menanyakan sesuatu yang tidak kamu tahu jawabannya, jangan mengarang — bilang akan dikonfirmasi ke tim dulu`;

/**
 * Build system prompt dengan konteks dari Sheets
 */
function buildSystemPrompt() {
    if (sheetsContext && sheetsContext.trim().length > 0) {
        return SYSTEM_PROMPT + `

========================================
KONTEKS DARI RIWAYAT CHAT SEBELUMNYA
(Gunakan ini sebagai referensi gaya bahasa dan pola percakapan)
========================================
${sheetsContext}`;
    }
    return SYSTEM_PROMPT;
}

/**
 * Panggil Gemini API (Dengan Sistem Rotasi API Key)
 * @param {string} message - Pesan dari user
 * @param {string} chatId - ID chat untuk riwayat
 * @returns {Promise<string|null>}
 */
async function callGemini(message, chatId) {
    const history = getHistory(chatId);
    const contents = [];

    for (const msg of history) {
        contents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
        });
    }

    contents.push({
        role: 'user',
        parts: [{ text: message }],
    });

    const apiKeys = config.ai.geminiApiKeys || [];

    // Coba setiap API Key satu per satu sampai berhasil
    for (let i = 0; i < apiKeys.length; i++) {
        const apiKey = apiKeys[i];
        try {
            console.log(`[AI] 🔄 Mencoba Gemini API Key ke-${i + 1}/${apiKeys.length}...`);
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: contents,
                        systemInstruction: {
                            parts: [{ text: buildSystemPrompt() }],
                        },
                        generationConfig: {
                            temperature: 0.8,
                            maxOutputTokens: 1500,
                            topP: 0.95,
                        },
                    }),
                }
            );

            if (!response.ok) {
                const err = await response.text();
                console.error(`[AI] ⚠️ Gemini error pada Key ke-${i + 1} (${response.status}):`, err.substring(0, 100));
                // Lanjut ke loop berikutnya untuk mencoba key lain
                continue;
            }

            const data = await response.json();
            const reply =
                data.candidates?.[0]?.content?.parts?.[0]?.text || null;

            if (reply) {
                addToHistory(chatId, 'user', message);
                addToHistory(chatId, 'model', reply);
                console.log(`[AI] ✅ Berhasil menggunakan Gemini API Key ke-${i + 1}`);
                return reply;
            }
        } catch (err) {
            console.error(`[AI] ❌ Terjadi kesalahan pada Gemini Key ke-${i + 1}:`, err.message);
            // Lanjut ke loop berikutnya
            continue;
        }
    }

    // Jika sampai di sini, artinya semua Gemini Key gagal
    console.error('[AI] ❌ SEMUA Gemini API Key gagal/limit!');
    return null;
}

/**
 * Panggil Groq API (fallback) — Dengan Sistem Rotasi API Key
 * @param {string} message - Pesan dari user
 * @param {string} chatId - ID chat untuk riwayat
 * @returns {Promise<string|null>}
 */
async function callGroq(message, chatId) {
    const history = getHistory(chatId);
    const messages = [{ role: 'system', content: buildSystemPrompt() }];

    for (const msg of history) {
        messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content,
        });
    }

    messages.push({ role: 'user', content: message });

    // Support both old single-key and new multi-key config
    const apiKeys = config.ai.groqApiKeys || (config.ai.groqApiKey ? [config.ai.groqApiKey] : []);

    for (let i = 0; i < apiKeys.length; i++) {
        const apiKey = apiKeys[i];
        try {
            console.log(`[AI] 🔄 Mencoba Groq API Key ke-${i + 1}/${apiKeys.length}...`);
            const response = await fetch(
                'https://api.groq.com/openai/v1/chat/completions',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: 'llama-3.3-70b-versatile',
                        messages: messages,
                        temperature: 0.8,
                        max_tokens: 1500,
                    }),
                }
            );

            if (!response.ok) {
                const err = await response.text();
                console.error(`[AI] ⚠️ Groq error pada Key ke-${i + 1} (${response.status}):`, err.substring(0, 100));
                continue; // Coba key berikutnya
            }

            const data = await response.json();
            const reply = data.choices?.[0]?.message?.content || null;

            if (reply) {
                addToHistory(chatId, 'user', message);
                addToHistory(chatId, 'assistant', reply);
                console.log(`[AI] ✅ Berhasil menggunakan Groq API Key ke-${i + 1}`);
                return reply;
            }
        } catch (err) {
            console.error(`[AI] ❌ Terjadi kesalahan pada Groq Key ke-${i + 1}:`, err.message);
            continue;
        }
    }

    // Semua Groq key gagal
    console.error('[AI] ❌ SEMUA Groq API Key gagal/limit!');
    return null;
}

/**
 * Generate AI reply - coba Gemini dulu, kalau gagal pakai Groq
 * @param {string} message - Pesan dari user
 * @param {string} chatId - ID chat
 * @returns {Promise<string|null>}
 */
async function generateReply(message, chatId) {
    console.log(`[AI] 🤖 Generating reply for: "${message.substring(0, 40)}..."`);

    // Indikator Konteks Sheets (bisa dilihat di terminal)
    const hasSheetsContext = sheetsContext && sheetsContext.trim().length > 0;
    if (hasSheetsContext) {
        console.log(`[AI] 📊 Menggunakan konteks dari Google Sheets (${sheetsContext.length} chars)`);
    } else {
        console.log(`[AI] ⚠️ Konteks Google Sheets kosong/belum dimuat!`);
    }

    // Coba Gemini dulu (primary)
    let reply = await callGemini(message, chatId);
    if (reply) {
        console.log('[AI] ✅ Reply from Gemini');
        return reply;
    }

    // Fallback ke Groq
    console.log('[AI] ⚠️  Gemini gagal, mencoba Groq...');
    reply = await callGroq(message, chatId);
    if (reply) {
        console.log('[AI] ✅ Reply from Groq (fallback)');
        return reply;
    }

    console.error('[AI] ❌ Semua AI provider gagal');
    return null;
}

module.exports = {
    generateReply,
    setSheetsContext,
};
