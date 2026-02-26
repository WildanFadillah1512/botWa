# 🤖 WhatsApp Bot - Auto Reply & Follow Up

Bot WhatsApp otomatis yang bisa membalas chat, follow-up client, menyimpan riwayat chat, dan backup data WA.

## ✨ Fitur

| Fitur | Deskripsi |
|-------|-----------|
| **Auto-Reply** | Balas chat otomatis berdasarkan keyword |
| **Follow-Up** | Kirim follow-up terjadwal ke client |
| **Chat Logger** | Simpan semua pesan real-time ke JSON |
| **Backup** | Backup kontak & riwayat chat yang sudah ada |
| **Session** | Tidak perlu scan QR ulang tiap restart |

## 📦 Prasyarat

- **Node.js** versi 18 atau lebih baru
- **Google Chrome** atau **Chromium** terinstall di komputer

## 🚀 Cara Install & Jalankan

```bash
# 1. Install dependencies
npm install

# 2. Jalankan bot
npm start
```

Saat pertama kali jalan, akan muncul **QR Code** di terminal. Scan dengan WhatsApp:
1. Buka WhatsApp di HP
2. Ketuk **⋮** (titik tiga) > **Perangkat Tertaut** > **Tautkan Perangkat**
3. Scan QR yang tampil di terminal

## 📁 Struktur Folder

```
botWA/
├── index.js            # Entry point utama
├── config.js           # Konfigurasi bot
├── package.json
├── data/
│   ├── replies.json      # Database keyword & jawaban
│   ├── followups.json    # Data follow-up client
│   ├── chatLogs.json     # Log chat real-time
│   ├── contacts.json     # Backup kontak
│   └── chatHistory.json  # Backup riwayat chat
└── modules/
    ├── autoReply.js      # Module auto-reply
    ├── followUp.js       # Module follow-up
    ├── chatLogger.js     # Module chat logger
    └── backup.js         # Module backup
```

## ⚙️ Konfigurasi

Edit `config.js` untuk menyesuaikan:

| Setting | Default | Deskripsi |
|---------|---------|-----------|
| `botName` | 'Bot Asisten' | Nama bot |
| `defaultReply` | (greeting) | Pesan jika tidak ada keyword cocok |
| `replyToGroups` | `false` | Balas pesan group? |
| `replyToSelf` | `false` | Balas pesan sendiri? |
| `followUpCron` | `'0 9 * * *'` | Jadwal follow-up (setiap hari jam 9) |
| `backup.messagesPerChat` | `50` | Jumlah pesan di-backup per chat |

## 📝 Mengatur Auto-Reply

Edit `data/replies.json` untuk menambah/mengubah keyword dan jawaban:

```json
{
  "rules": [
    {
      "keywords": ["harga", "price", "biaya"],
      "reply": "Daftar harga: ..."
    }
  ]
}
```

## 📋 Mengatur Follow-Up

Edit `data/followups.json` untuk menambah client yang akan di-follow-up:

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

- `{name}` akan otomatis diganti dengan nama client
- `day` = hari ke berapa setelah startDate pesan dikirim
- `status`: `active` (aktif) atau `done` (selesai)

## 💡 Tips

- **Restart bot**: Tekan `Ctrl+C` lalu jalankan `npm start` lagi
- **Reset session**: Hapus folder `.wwebjs_auth` jika ada masalah login
- **Tambah keyword**: Edit `data/replies.json`, bot akan load ulang saat restart
- **Data chat**: Semua data tersimpan di folder `data/`
