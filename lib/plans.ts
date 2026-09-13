export type PlanId = "starter" | "pro" | "business";
export const plans = [
  {
    id: "starter" as const,
    name: "Starter",
    description: "Fondasi yang tepat untuk toko pertama Anda.",
    price: 99000,
    outlets: 1,
    members: 2,
    messages: 200,
    highlight: "Mulai dengan yang penting",
    features: [
      "Kasir & pencatatan transaksi",
      "Inventori dan pengingat stok",
      "Laporan penjualan inti",
      "Asisten AI operasional",
    ],
  },
  {
    id: "pro" as const,
    name: "Pro",
    description: "Lebih banyak ruang untuk usaha yang berkembang.",
    price: 249000,
    outlets: 3,
    members: 5,
    messages: 1000,
    highlight: "Untuk usaha yang berkembang",
    features: [
      "Semua fitur Starter",
      "Perbandingan kinerja antaroutlet",
      "Kolaborasi tim lebih luas",
      "Kapasitas AI lebih besar",
    ],
  },
  {
    id: "business" as const,
    name: "Business",
    description: "Satukan operasional seluruh cabang Anda.",
    price: 699000,
    outlets: 10,
    members: 20,
    messages: 5000,
    highlight: "Siap untuk banyak cabang",
    features: [
      "Semua fitur Pro",
      "Konsolidasi hingga 10 outlet",
      "Koordinasi hingga 20 anggota",
      "5.000 pesan AI per bulan",
    ],
  },
];
export type Plan = (typeof plans)[number];
export const demoSubscription = {
  plan: "Pro",
  status: "Trial",
  startsAt: "1 September 2026",
  endsAt: "14 September 2026",
  activeOutlets: 2,
  activeMembers: 3,
  aiLimit: 100,
};
export function planNeedsAdjustment(plan: Plan) {
  return (
    plan.outlets < demoSubscription.activeOutlets ||
    plan.members < demoSubscription.activeMembers
  );
}
export const planFaqs = [
  {
    question: "Apa yang termasuk dalam trial?",
    answer:
      "Trial 14 hari menggunakan kapasitas paket Pro: hingga 3 outlet dan 5 anggota, dengan 100 pesan AI total selama trial.",
  },
  {
    question: "Bagaimana cara mengaktifkan paket?",
    answer:
      "Pilih paket, isi identitas pembayar, lalu selesaikan checkout di Mayar. Webhook Mayar memverifikasi pembayaran dan mengaktifkan periode langganan secara otomatis.",
  },
  {
    question: "Apa yang terjadi jika pesan AI habis?",
    answer:
      "Satu permintaan yang berhasil dijawab dihitung sebagai satu pesan. Saat kuota habis, AI berhenti menerima pertanyaan baru. Fitur kasir tetap dapat digunakan pada langganan aktif. Kuota paket berbayar mengikuti periode bulanan; kuota trial berlaku total selama 14 hari.",
  },
  {
    question: "Bisakah saya pindah ke paket yang lebih kecil?",
    answer:
      "Downgrade direncanakan berlaku di akhir periode. Jumlah outlet dan anggota aktif perlu sesuai dengan batas paket baru terlebih dahulu. Data tidak dihapus otomatis. Jika batas belum terpenuhi, perubahan paket ditunda sampai Anda melakukan penyesuaian.",
  },
  {
    question: "Apakah tersedia paket tahunan atau biaya tambahan AI?",
    answer:
      "Belum. Saat ini checkout Mayar menagihkan paket bulanan sesuai harga yang tertera. Paket tahunan dan pembelian kuota AI tambahan belum tersedia.",
  },
];
