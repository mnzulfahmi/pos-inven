# Menyiapkan pembayaran Mayar

Integrasi ini membuat invoice Mayar dari halaman **Paket & langganan**, mengarahkan pembayar ke checkout Mayar, lalu mengaktifkan paket setelah webhook pembayaran diverifikasi kembali ke API Mayar.

## 1. Siapkan lingkungan sandbox

Dapatkan API key dari dashboard Mayar pada **Integration → API Key**. Simpan nilai berikut di `.env.local`; jangan menaruh kunci asli di source control.

```dotenv
MAYAR_API_KEY=your-sandbox-api-key
MAYAR_API_URL=https://api.mayar.club
MAYAR_WEBHOOK_SECRET=use-a-long-random-secret
INSFORGE_URL=https://uqx4uvkx.ap-southeast.insforge.app
INSFORGE_API_KEY=your-insforge-project-admin-key
NEXT_PUBLIC_APP_URL=https://your-public-test-domain.example
```

`NEXT_PUBLIC_APP_URL` harus berupa URL publik agar Mayar dapat mengembalikan pembayar ke halaman langganan. `MAYAR_WEBHOOK_SECRET` menjadi bagian dari URL webhook, sehingga gunakan nilai acak yang panjang dan jangan membagikannya.

Setelah mengubah `.env.local`, mulai ulang server Next.js.

## 2. Daftarkan webhook

Jalankan perintah berikut dengan URL publik aplikasi dan secret yang sama seperti `.env.local`:

```bash
npx -y mayar@latest --sandbox webhook register https://your-public-test-domain.example/api/webhooks/mayar/your-long-random-secret
```

Periksa konfigurasi Mayar tanpa menampilkan API key:

```bash
npx -y mayar@latest --sandbox whoami
npx -y mayar@latest --sandbox webhook list
```

## 3. Uji alur pembayaran

1. Masuk sebagai pemilik usaha.
2. Buka **Paket & langganan**, pilih paket, lalu isi identitas pembayar.
3. Klik **Bayar dengan Mayar** dan selesaikan pembayaran sandbox.
4. Kembali ke **Pengaturan → Langganan**. Invoice akan berubah menjadi **Lunas** dan paket aktif setelah webhook diterima.
5. Jika status masih menunggu, periksa webhook Mayar dan log route `/api/webhooks/mayar/[secret]`.

Checkout memakai idempotency key untuk mencegah invoice lokal ganda. Webhook tidak mempercayai nominal dari payload: server mengambil ulang invoice dari Mayar, memeriksa status dan jumlah, lalu mengaktifkan paket melalui operasi database atomik.

## 4. Pindah ke produksi

Gunakan API key produksi, ubah `MAYAR_API_URL` menjadi `https://api.mayar.id`, buat secret webhook baru, dan daftarkan ulang webhook tanpa flag `--sandbox`.

```bash
npx -y mayar@latest webhook register https://your-domain.example/api/webhooks/mayar/your-production-secret
```

Lakukan satu pembayaran bernilai kecil atau metode pengujian yang disediakan akun Mayar sebelum membuka checkout untuk pelanggan.
