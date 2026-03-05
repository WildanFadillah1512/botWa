# 🤖 WhatsApp Bot — Suba Arch Studio

Bot WhatsApp otomatis untuk **Suba Arch Studio** yang dilengkapi AI (Gemini & Groq), auto-reply keyword, broadcast massal, follow-up terjadwal, integrasi Google Sheets, dan sistem takeover admin.

---

## ✨ Fitur Lengkap

| Fitur | Deskripsi |
|-------|-----------|
| **🧠 AI Auto-Reply** | Balas chat otomatis menggunakan **Gemini AI** (primary) dengan fallback ke **Groq AI**. Mendukung rotasi multi API key & riwayat percakapan per chat |
| **🔑 Keyword Auto-Reply** | Balas otomatis berdasarkan keyword dari `replies.json` (partial match, case-insensitive) |
| **📢 Broadcast Massal** | Kirim pesan massal ke banyak nomor sekaligus (manual, CSV, atau pilih dari kontak terakhir). Mendukung media & personalisasi `{nama}` |
| **📋 Follow-Up Terjadwal** | Dua mode: **Drip Campaign** (harian otomatis) & **Dynamic Follow-up** (tanggal & jam spesifik) dengan notifikasi admin saat berhasil terkirim |
| **⏸️ Admin Takeover** | Bot otomatis pause saat admin membalas manual, auto-resume setelah 10 menit. Resume manual dengan `/r` atau `/resume` |
| **📊 Google Sheets Logger** | Semua pesan (user & bot) otomatis dicatat ke Google Sheets via Apps Script |
| **📚 Google Sheets Knowledge Base** | AI membaca data dari Google Sheets sebagai knowledge base tambahan, auto-refresh setiap 30 menit |
| **🌐 Keep-Alive Server** | HTTP server + halaman QR Code di browser untuk deploy di **Render** / layanan cloud. Kompatibel dengan UptimeRobot |
| **🔄 Session Persistent** | Tidak perlu scan QR ulang setiap restart (menggunakan `LocalAuth`) |
| **� Phone Resolver** | Resolusi otomatis nomor telepon ke JID WhatsApp yang benar (mendukung format `@c.us` dan `@lid`) |
| **🔐 Logout & Ganti Nomor** | Logout via command `/logout` di WA atau via URL `/logout` di browser |
| **🛡️ Anti-Spam AI** | AI otomatis mengabaikan pesan filler (ok, sip, haha, emoji saja, dll.) |
| **🛡️ Anti-Double Reply** | Mencegah bot dan admin membalas bersamaan ke chat yang sama |
| **🐳 Docker Ready** | Dockerfile siap pakai untuk deploy di Render, Railway, atau VPS |

---

## 📦 Tech Stack & Dependencies

| Package | Fungsi |
|---------|--------|
| `whatsapp-web.js` | Library utama WhatsApp Web |
| `qrcode-terminal` | Menampilkan QR Code di terminal |
| `node-cron` | Penjadwalan follow-up (cron job) |
| `dotenv` | Memuat environment variables dari `.env` |

**Runtime:** Node.js v18+ & Chromium/Google Chrome

---

## 🚀 Cara Install & Jalankan

### Lokal

```bash
# 1. Clone repository
git clone <repo-url>
cd botWA

# 2. Install dependencies
npm install

# 3. Buat file .env (lihat bagian Konfigurasi .env)
cp .env.example .env

# 4. Jalankan bot
npm start
```

### Docker

```bash
# Build image
docker build -t bot-wa .

# Jalankan container
docker run -d -p 3000:3000 --name bot-wa bot-wa
```

### Deploy ke Render

1. Push ke GitHub
2. Buat **Web Service** baru di Render
3. Set environment variables (`GEMINI_API_KEYS`, `GROQ_API_KEYS`, `ADMIN_PHONE`)
4. Deploy — buka URL Render di browser untuk scan QR Code
5. (Opsional) Setup UptimeRobot untuk ping URL agar bot tidak sleep

---

## 📱 Scan QR Code

Saat pertama kali jalan:

1. **Via Browser** — Buka `http://localhost:3000` (lokal) atau URL Render. QR Code akan tampil di halaman web dengan auto-refresh setiap 10 detik.
2. **Via Terminal** — QR Code juga ditampilkan di terminal/console.
3. Buka WhatsApp di HP → **⋮** (titik tiga) → **Perangkat Tertaut** → **Tautkan Perangkat** → Scan QR

Setelah autentikasi berhasil, halaman web akan menampilkan status **"✅ Bot is Alive & Authenticated!"**

---

## 📁 Struktur Proyek

```
botWA/
├── index.js                  # Entry point utama + event handlers
├── config.js                 # Konfigurasi bot (env loader + settings)
├── package.json
├── Dockerfile                # Docker config untuk deploy cloud
├── .env                      # API Keys & Admin Phone (RAHASIA)
├── .gitignore
├── data/
│   ├── replies.json          # Database keyword & jawaban auto-reply
│   ├── followups.json        # Data follow-up (drip + dynamic)
│   └── pausedChats.json      # State chat yang sedang di-pause
└── modules/
    ├── ai.js                 # Modul AI (Gemini + Groq) + system prompt
    ├── autoReply.js          # Modul keyword auto-reply
    ├── broadcast.js          # Modul broadcast massal interaktif
    ├── followUp.js           # Modul follow-up (drip + dynamic + interaktif)
    ├── chatState.js          # Modul pause/resume (admin takeover)
    ├── phoneResolver.js      # Resolusi nomor telepon → JID WhatsApp
    ├── sheetsLogger.js       # Push pesan ke Google Sheets
    └── sheetsReader.js       # Baca knowledge base dari Google Sheets
```

---

## ⚙️ Konfigurasi

### File `.env`

```env
# Gemini API Keys (pisahkan dengan koma untuk rotasi otomatis)
GEMINI_API_KEYS=key1,key2,key3

# Groq API Keys (fallback, pisahkan dengan koma)
GROQ_API_KEYS=key1,key2,key3

# Nomor Admin (format 628xxx tanpa @c.us)
ADMIN_PHONE=6281234567890
```

### File `config.js`

| Setting | Default | Deskripsi |
|---------|---------|-----------|
| `botName` | `'Bot Asisten'` | Nama bot |
| `defaultReply` | *(greeting)* | Pesan default jika tidak ada keyword cocok |
| `replyToGroups` | `false` | Apakah bot membalas pesan di grup? |
| `replyToSelf` | `false` | Apakah bot membalas pesan dari diri sendiri? |
| `followUpCron` | `'0 9 * * *'` | Jadwal drip follow-up (setiap hari jam 09:00) |
| `ai.useAI` | `true` | Aktifkan/nonaktifkan AI reply |
| `adminPhone` | dari `.env` | Nomor admin untuk akses command |

---

## 🤖 Admin Commands

Semua command dikirim via **chat WhatsApp** dari nomor admin/nomor bot itu sendiri:

| Command | Fungsi |
|---------|--------|
| `/broadcast` | Mulai sesi broadcast interaktif |
| `/followup` | Mulai sesi follow-up interaktif |
| `/followup 628xxx 2026-03-01 14:00 Pesan` | Follow-up langsung (legacy format) |
| `/r` atau `/resume` | Resume bot di chat yang sedang di-pause |
| `/logout` | Logout session, restart bot, dan tampilkan QR baru |

---

## � Fitur Broadcast (Detail)

Ketik `/broadcast` di WhatsApp untuk memulai. Tersedia 3 metode input:

### 1️⃣ Daftar Nomor Manual
Masukkan nomor-nomor dipisahkan koma atau baris baru.

### 2️⃣ Upload File CSV
Kirim file `.csv` dengan kolom:
```
nomor,nama
6281234567890,Budi
6289876543210,Andi
```

### 3️⃣ Pilih dari Daftar Chat Terakhir
Bot menampilkan 50 kontak terbaru beserta nama. Pilih dengan nomor urut (mendukung range: `1, 3, 5-10`).

**Fitur tambahan:**
- Mendukung pengiriman **teks + media/gambar**
- Template `{nama}` otomatis diganti dengan nama penerima
- Konfirmasi sebelum kirim
- Jeda 3 detik antar pesan (anti-ban)
- Laporan hasil (berhasil/gagal) setelah selesai
- Ketik **batal** kapan saja untuk membatalkan

---

## 📋 Fitur Follow-Up (Detail)

### Mode 1: Drip Campaign (Otomatis Harian)

Edit `data/followups.json`:

```json
{
  "clients": [
    {
      "id": "followup_001",
      "phone": "6281234567890",
      "name": "Nama Client",
      "messages": [
        { "day": 1, "text": "Halo {name}! ..." },
        { "day": 3, "text": "Hai {name}! ..." }
      ],
      "status": "active",
      "currentStep": 0,
      "startDate": null,
      "lastFollowUp": null
    }
  ]
}
```

- `{name}` otomatis diganti dengan nama client
- `day` = hari ke berapa setelah `startDate`
- Dijalankan otomatis sesuai cron schedule (default: jam 09:00 setiap hari)

### Mode 2: Dynamic Follow-Up (Tanggal & Jam Spesifik)

Ketik `/followup` di WhatsApp untuk memulai sesi interaktif, atau gunakan format langsung:

```
/followup 6281234567890 2026-03-01 14:00 Halo, ini pesan follow-up!
```

- Dicek setiap **1 menit** oleh scheduler
- Admin mendapat **notifikasi otomatis** saat pesan berhasil terkirim

---

## ⏸️ Sistem Admin Takeover

Bot secara otomatis mendeteksi ketika admin membalas chat secara manual:

1. **Auto-Pause** — Bot langsung berhenti balas di chat tersebut saat admin mengirim pesan manual
2. **Auto-Resume** — Bot aktif kembali setelah **10 menit** admin tidak membalas di chat tersebut
3. **Manual Resume** — Ketik `/r` atau `/resume` di chat untuk mengaktifkan kembali bot secara langsung
4. **Anti-Double Reply** — Mencegah konflik jika admin dan AI membalas bersamaan
5. **Self-Chat Protection** — Bot tidak auto-pause di chat "Message Yourself"

---

## 🧠 Sistem AI

### Dual Provider + Multi-Key Rotation

```
User Message
    ↓
Keyword Match? → Ya → Kirim auto-reply
    ↓ Tidak
AI Enabled? → Ya → Gemini Key 1 → Key 2 → ... → Key N
    ↓                    ↓ Semua gagal
    ↓              Groq Key 1 → Key 2 → ... → Key N
    ↓                    ↓ Semua gagal
    ↓              (tidak kirim reply, hindari spam)
    ↓
AI Disabled → (tidak kirim reply)
```

**Fitur AI:**
- **Riwayat percakapan** per chat (max 30 pesan, in-memory)
- **System prompt** sangat detail — persona CS arsitektur (customizable)
- **Anti-spam** — AI mengembalikan `IGNORE_DO_NOT_REPLY` untuk pesan filler
- **Knowledge base** dari Google Sheets — auto-refresh setiap 30 menit
- **Model:** Gemini 3 Flash Preview (primary), Llama 3.3 70B via Groq (fallback)

---

## 📊 Integrasi Google Sheets

### Sheets Logger (Tulis)
Setiap pesan masuk dan balasan bot otomatis dicatat ke Google Sheets melalui **Google Apps Script** dengan data:
- Nama pengirim, Nomor, Hari, Waktu
- Isi chat (format WhatsApp)
- Link WhatsApp ke nomor customer

### Sheets Reader (Baca)
- Membaca data dari Google Sheets sebagai **knowledge base tambahan** untuk AI
- Auto-refresh setiap **30 menit**
- Data digunakan sebagai konteks tambahan di system prompt AI

---

## 🌐 Keep-Alive HTTP Server

Server HTTP berjalan di port `3000` (atau dari env `PORT`):

| Endpoint | Fungsi |
|----------|--------|
| `/` | Halaman status + QR Code (saat belum login) |
| `/logout` | Logout session & restart bot |

**Halaman menampilkan:**
- ⏳ Loading — saat Chromium belum siap
- 📱 QR Code — saat menunggu scan (auto-refresh 10 detik)
- ✅ Status OK — saat bot sudah aktif (+ link logout)

---

## 🔑 Mengatur Keyword Auto-Reply

Edit `data/replies.json`:

```json
{
  "rules": [
    {
      "keywords": ["harga", "price", "biaya"],
      "reply": "Daftar harga kami: ..."
    },
    {
      "keywords": ["alamat", "lokasi"],
      "reply": "Kantor kami berlokasi di ..."
    }
  ]
}
```

- Matching: **case-insensitive** & **partial match** (keyword hanya perlu ada di dalam pesan)
- Keyword dicek **sebelum** AI — jika cocok, AI tidak dipanggil

---

## 💡 Tips

- **Restart bot:** Tekan `Ctrl+C` lalu `npm start`
- **Reset session:** Hapus folder `.wwebjs_auth` dan `.wwebjs_cache`, atau gunakan command `/logout`
- **Tambah API key:** Tambahkan key baru di `.env` dipisahkan koma — bot otomatis merotasi
- **Data chat:** Tersimpan di folder `data/`
- **Log monitoring:** Semua aktivitas bot tercatat di console dengan emoji prefix untuk mudah dibaca
- **Anti-crash:** Bot memiliki proteksi `unhandledRejection` dan `uncaughtException` agar tidak crash

---

## 📄 Lisensi

Private — Suba Arch Studio
