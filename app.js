/* =========================================================
   ARUS — logika aplikasi
   Tidak ada data rahasia di file ini. URL server & kunci
   disimpan di HP-mu (localStorage) saat setup pertama kali.
   ========================================================= */
'use strict';
(() => {
  const VERSION = '1.0.0';
  const LS = { cfg: 'arus.cfg', cache: 'arus.cache', outbox: 'arus.outbox', prefs: 'arus.prefs', demo: 'arus.demo' };

  const DEF_OUT = ['Makan & Minum', 'Transportasi', 'Belanja', 'Tagihan & Utilitas', 'Pulsa & Internet', 'Kesehatan', 'Hiburan', 'Pendidikan', 'Rumah Tangga', 'Sedekah & Donasi', 'Cicilan', 'Lainnya'];
  const DEF_IN = ['Gaji', 'Bonus', 'Usaha / Freelance', 'Investasi', 'Hadiah', 'Transfer Masuk', 'Lainnya'];
  const DEF_SUMBER = ['BCA', 'BRI', 'SEABANK', 'KROM', 'ALLO BANK', 'CASH', 'Lainnya'];

  /* ------------------------- penyimpanan ------------------------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* penuh / diblokir */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* */ } },
  };

  /* ---------------------------- state ---------------------------- */
  const cache = store.get(LS.cache, null);
  const S = {
    cfg: store.get(LS.cfg, null),            // { mode: 'live'|'demo', url, key }
    tx: cache ? cache.tx : [],
    meta: cache ? cache.meta : null,
    syncedAt: cache ? cache.syncedAt : null,
    outbox: store.get(LS.outbox, []),
    prefs: Object.assign({ sumber: '', custom: { pemasukan: [], pengeluaran: [] } }, store.get(LS.prefs, {})),
    view: 'home',
    period: { key: 'month', from: '', to: '' },
    hist: { q: '', jenis: 'all', kategori: '', sumber: '', from: '', to: '', limit: 60 },
    trend: 'daily',
    loading: false,
    syncing: false,
    syncError: null,
    flushing: false,
  };

  /* ---------------------------- util ----------------------------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NF = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
  const rp = (n) => 'Rp ' + NF.format(Math.round(n || 0));
  const rpSigned = (n, jenis) => (jenis === 'pemasukan' ? '+' : '−') + rp(n);
  const short = (n) => {
    const a = Math.abs(n);
    const f = (v, u) => (Math.round(v * 10) / 10).toString().replace('.', ',') + ' ' + u;
    if (a >= 1e9) return f(n / 1e9, 'M');
    if (a >= 1e6) return f(n / 1e6, 'jt');
    if (a >= 1e3) return f(n / 1e3, 'rb');
    return NF.format(n);
  };
  const pct = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',') + '%';
  const uid = () => 'TRX-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYMD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseYMD(s); d.setDate(d.getDate() + n); return ymd(d); };
  const today = () => ymd(new Date());
  const diffDays = (a, b) => Math.round((parseYMD(b) - parseYMD(a)) / 864e5);
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const dLong = (s) => { const d = parseYMD(s); return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`; };
  const dMed = (s) => { const d = parseYMD(s); return `${d.getDate()} ${BLN[d.getMonth()]} ${d.getFullYear()}`; };
  const dShort = (s) => { const d = parseYMD(s); return `${d.getDate()} ${BLN[d.getMonth()]}`; };
  const dDay = (s) => {
    const t = today();
    if (s === t) return 'Hari ini';
    if (s === addDays(t, -1)) return 'Kemarin';
    const d = parseYMD(s);
    return `${HARI[d.getDay()]}, ${d.getDate()} ${BLN[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`;
  };
  const timeAgo = (iso) => {
    if (!iso) return 'belum pernah';
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 45) return 'baru saja';
    if (s < 3600) return Math.round(s / 60) + ' menit lalu';
    if (s < 86400) return Math.round(s / 3600) + ' jam lalu';
    return Math.round(s / 86400) + ' hari lalu';
  };

  const EMOJI = [
    [/makan|minum|kuliner|jajan|resto|kopi|cafe|food/i, '🍜'], [/transport|bensin|bbm|parkir|tol|ojek|grab|gojek|kendaraan/i, '🚗'],
    [/belanja|shopping|groceries|sembako|pasar/i, '🛍️'], [/tagihan|listrik|air|pdam|utilitas|pln/i, '🧾'],
    [/pulsa|internet|data|wifi|langganan|subscription/i, '📶'], [/sehat|obat|dokter|medis|klinik|rumah sakit/i, '💊'],
    [/hiburan|nonton|film|game|rekreasi|liburan|wisata/i, '🎬'], [/pendidikan|sekolah|kursus|buku|kuliah/i, '📚'],
    [/rumah|kontrakan|kos|sewa|perabot/i, '🏠'], [/sedekah|donasi|zakat|infaq|amal/i, '🤲'], [/cicil|kredit|utang|hutang|pinjam|paylater/i, '💳'],
    [/gaji|salary|upah/i, '💼'], [/bonus|thr|insentif/i, '🎁'], [/usaha|freelance|jualan|bisnis|proyek|project/i, '💻'],
    [/invest|saham|reksa|dividen|bunga|crypto|emas/i, '📈'], [/hadiah|kado|gift/i, '🎉'], [/transfer|refund|kembali/i, '🔁'],
    [/anak|bayi|keluarga|orang tua/i, '👨‍👩‍👧'], [/pakaian|baju|fashion/i, '👕'], [/hewan|kucing|anjing|pet/i, '🐾'], [/olahraga|gym|fitness/i, '🏋️'],
    [/tabung|saving/i, '🐷'], [/pajak/i, '🏛️'],
  ];
  const emoji = (k) => { for (const [re, e] of EMOJI) if (re.test(k || '')) return e; return '🏷️'; };

  const IC = {
    up: '<svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M17 7 7 17M15 17H7V9"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    filter: '<svg viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.9-3M4 5v4h4M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M12 8v5M12 16.5v.01"/></svg>',
    info: '<svg viewBox="0 0 24 24"><path d="M12 11v6M12 7.5v.01"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    logo: '<svg viewBox="0 0 24 24"><path d="M3 15c3-5 6-5 9 0s6 5 9 0"/><path d="M3 9c3-5 6-5 9 0s6 5 9 0" opacity=".55"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  };

  const emptyArt = (kind) => `
    <svg class="empty-art" viewBox="0 0 120 100" aria-hidden="true">
      <defs><linearGradient id="eg${kind}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f6bff"/><stop offset="1" stop-color="#9d5cf6"/></linearGradient></defs>
      <circle cx="60" cy="52" r="40" fill="#eef1ff"/>
      <circle cx="94" cy="20" r="6" fill="#e3d4ff"/><circle cx="20" cy="78" r="4" fill="#c9f3f7"/>
      <rect x="36" y="30" width="48" height="44" rx="12" fill="#fff" stroke="#e1e5f5"/>
      <rect x="44" y="40" width="22" height="5" rx="2.5" fill="url(#eg${kind})"/>
      <rect x="44" y="51" width="32" height="4" rx="2" fill="#e6e9f5"/><rect x="44" y="60" width="26" height="4" rx="2" fill="#e6e9f5"/>
      <circle cx="82" cy="70" r="11" fill="url(#eg${kind})"/><path d="M82 65v10M77 70h10" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
    </svg>`;

  /* ------------------------------ API ------------------------------ */
  class ApiError extends Error {
    constructor(msg, code, network) { super(msg); this.code = code; this.network = !!network; }
  }

  async function api(action, payload) {
    if (!S.cfg) throw new ApiError('Belum terhubung.', 'NO_CFG');
    if (S.cfg.mode === 'demo') return demoApi(action, payload);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    let res;
    try {
      res = await fetch(S.cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ key: S.cfg.key, action, payload: payload || {} }),
        redirect: 'follow',
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new ApiError(navigator.onLine === false ? 'Tidak ada koneksi internet.' : 'Server tidak bisa dihubungi. Periksa koneksi.', 'NETWORK', true);
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) {
      throw new ApiError('Respon server tidak dikenali. Pastikan deployment Apps Script diatur "Siapa saja" dan URL berakhiran /exec.', 'DEPLOY');
    }
    if (!data.ok) throw new ApiError(data.error || 'Gagal.', data.code || 'SERVER_ERROR');
    return data;
  }

  /* --------------------------- mode demo --------------------------- */
  function demoSeed() {
    const rows = [];
    const t = today();
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const notes = {
      'Makan & Minum': ['Makan siang', 'Kopi susu', 'Nasi padang', 'Sarapan bubur', 'Martabak'],
      'Transportasi': ['Bensin motor', 'Grab ke kantor', 'Parkir', 'KRL'],
      'Belanja': ['Belanja bulanan', 'Sabun & sampo', 'Sayur & lauk'],
      'Pulsa & Internet': ['Paket data', 'WiFi rumah'],
      'Hiburan': ['Nonton bioskop', 'Langganan musik'],
      'Kesehatan': ['Vitamin', 'Obat flu'],
    };
    for (let i = 75; i >= 0; i--) {
      const d = addDays(t, -i);
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const kat = pick(['Makan & Minum', 'Makan & Minum', 'Makan & Minum', 'Transportasi', 'Transportasi', 'Belanja', 'Pulsa & Internet', 'Hiburan', 'Kesehatan']);
        const base = { 'Makan & Minum': 35000, 'Transportasi': 28000, 'Belanja': 160000, 'Pulsa & Internet': 90000, 'Hiburan': 75000, 'Kesehatan': 60000 }[kat];
        rows.push({ id: uid() + i + k, jenis: 'pengeluaran', tanggal: d, nominal: Math.round((base * (0.5 + rnd())) / 500) * 500, kategori: kat, catatan: pick(notes[kat]), sumber: pick(['CASH', 'BCA', 'SEABANK', 'KROM', 'CASH']) });
      }
      const day = parseYMD(d).getDate();
      if (day === 1) rows.push({ id: uid() + 'g' + i, jenis: 'pemasukan', tanggal: d, nominal: 8500000, kategori: 'Gaji', catatan: 'Gaji bulanan', sumber: 'BCA' });
      if (day === 3) rows.push({ id: uid() + 't' + i, jenis: 'pengeluaran', tanggal: d, nominal: 1450000, kategori: 'Rumah Tangga', catatan: 'Bayar kos', sumber: 'BCA' });
      if (day === 10) rows.push({ id: uid() + 'l' + i, jenis: 'pengeluaran', tanggal: d, nominal: 385000, kategori: 'Tagihan & Utilitas', catatan: 'Listrik & air', sumber: 'BRI' });
      if (day === 18) rows.push({ id: uid() + 'f' + i, jenis: 'pemasukan', tanggal: d, nominal: 1750000, kategori: 'Usaha / Freelance', catatan: 'Desain logo klien', sumber: 'SEABANK' });
      if (day === 25) rows.push({ id: uid() + 'c' + i, jenis: 'pengeluaran', tanggal: d, nominal: 950000, kategori: 'Cicilan', catatan: 'Cicilan HP', sumber: 'ALLO BANK' });
    }
    return rows;
  }

  async function demoApi(action, p) {
    await new Promise((r) => setTimeout(r, 350));
    let rows = store.get(LS.demo, null);
    if (!rows) { rows = demoSeed(); store.set(LS.demo, rows); }
    const meta = { spreadsheet: 'Mode Demo (data contoh)', zonaWaktu: 'Asia/Jakarta', kategori: { pemasukan: DEF_IN, pengeluaran: DEF_OUT }, sumber: DEF_SUMBER, struktur: {} };
    if (action === 'ping') return { ok: true, spreadsheet: meta.spreadsheet };
    if (action === 'list') return { ok: true, transaksi: rows, meta, serverTime: new Date().toISOString() };
    if (action === 'add') {
      if (!(p.tx.nominal > 0)) throw new ApiError('Nominal harus lebih dari 0.', 'VALIDATION');
      if (!rows.some((r) => r.id === p.tx.id)) rows.push(Object.assign({}, p.tx));
      store.set(LS.demo, rows);
      return { ok: true, tx: p.tx };
    }
    if (action === 'update') {
      const i = rows.findIndex((r) => r.id === p.tx.id);
      if (i < 0) throw new ApiError('Transaksi tidak ditemukan.', 'NOT_FOUND');
      rows[i] = Object.assign({}, p.tx);
      store.set(LS.demo, rows);
      return { ok: true, tx: p.tx };
    }
    if (action === 'delete') {
      store.set(LS.demo, rows.filter((r) => r.id !== p.id));
      return { ok: true, id: p.id };
    }
    throw new ApiError('Aksi tidak dikenal.', 'BAD_REQUEST');
  }

  /* --------------------- sinkronisasi & antrean --------------------- */
  function persist() {
    store.set(LS.cache, { tx: S.tx.filter((t) => !t._local), meta: S.meta, syncedAt: S.syncedAt });
    store.set(LS.outbox, S.outbox);
  }

  /** Terapkan perubahan yang belum terkirim ke daftar transaksi. */
  function applyOutbox(list) {
    let out = list.slice();
    for (const op of S.outbox) {
      if (op.action === 'add') {
        if (!out.some((t) => t.id === op.payload.tx.id)) out.push(Object.assign({}, op.payload.tx, { _pending: true }));
      } else if (op.action === 'update') {
        out = out.map((t) => (t.id === op.payload.tx.id ? Object.assign({}, op.payload.tx, { _pending: true, baris: t.baris }) : t));
      } else if (op.action === 'delete') {
        out = out.filter((t) => t.id !== op.payload.id);
      }
    }
    return out;
  }

  async function loadAll(opts = {}) {
    if (!S.cfg || S.syncing) return;
    S.syncing = true;
    if (!S.tx.length && !S.syncedAt) S.loading = true;
    renderSync();
    try {
      const data = await api('list');
      S.meta = data.meta;
      S.tx = applyOutbox(data.transaksi);
      S.syncedAt = new Date().toISOString();
      S.syncError = null;
      persist();
      if (opts.toast) toast('ok', 'Data terbaru sudah dimuat');
    } catch (e) {
      S.syncError = e.message;
      if (opts.toast || !S.syncedAt) toast(e.network ? 'warn' : 'err', e.message);
    } finally {
      S.syncing = false;
      S.loading = false;
      render();
    }
  }

  function enqueue(action, payload) {
    S.outbox.push({ action, payload, at: Date.now() });
    persist();
    return flush();
  }

  const KEEP_CODES = ['NETWORK', 'DEPLOY', 'AUTH', 'NO_KEY', 'LOCKED', 'BUSY', 'SERVER_ERROR', 'CONFIG', 'STRUCTURE', 'NO_CFG'];

  /** Kirim antrean satu per satu. Mengembalikan hasil untuk operasi terakhir. */
  async function flush() {
    if (S.flushing) return { queued: true };
    S.flushing = true;
    renderSync();
    let last = { ok: true };
    try {
      while (S.outbox.length) {
        const op = S.outbox[0];
        try {
          const res = await api(op.action, op.payload);
          S.outbox.shift();
          if (op.action !== 'delete' && res.tx) {
            S.tx = S.tx.map((t) => (t.id === res.tx.id ? Object.assign({}, t, res.tx, { _pending: false }) : t));
          }
          persist();
          last = { ok: true, res };
        } catch (e) {
          if (KEEP_CODES.includes(e.code)) {
            // Simpan di HP, kirim ulang nanti. Data tidak hilang.
            S.syncError = e.message;
            last = { ok: false, queued: true, error: e };
            break;
          }
          // Ditolak server (mis. validasi) → buang operasi & muat ulang data asli.
          S.outbox.shift();
          persist();
          last = { ok: false, error: e };
          toast('err', 'Gagal disimpan: ' + e.message);
          setTimeout(() => loadAll(), 50);
        }
      }
    } finally {
      S.flushing = false;
      if (!S.outbox.length) S.syncError = null;
      render();
    }
    return last;
  }

  /* --------------------------- turunan data --------------------------- */
  function periodRange(p = S.period) {
    const t = today();
    if (p.key === 'today') return { from: t, to: t, label: 'Hari ini', prev: 'kemarin' };
    if (p.key === 'week') {
      const dow = (parseYMD(t).getDay() + 6) % 7;
      const from = addDays(t, -dow);
      return { from, to: addDays(from, 6), label: 'Minggu ini', prev: 'minggu lalu' };
    }
    if (p.key === 'custom' && p.from && p.to) return { from: p.from, to: p.to, label: `${dShort(p.from)} – ${dShort(p.to)}`, prev: 'periode sebelumnya' };
    const d = parseYMD(t);
    return { from: ymd(new Date(d.getFullYear(), d.getMonth(), 1)), to: ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)), label: 'Bulan ini', prev: 'bulan lalu' };
  }

  /** Periode pembanding dengan panjang yang setara (adil untuk periode yang sedang berjalan). */
  function prevRange(r, key = S.period.key) {
    const t = today();
    const end = r.to > t && r.from <= t ? t : r.to;
    let len = diffDays(r.from, end) + 1;
    let from;
    if (key === 'month') {
      const d = parseYMD(r.from);
      from = ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1));
      const pEnd = ymd(new Date(d.getFullYear(), d.getMonth(), 0));
      const to = addDays(from, len - 1);
      return { from, to: to > pEnd ? pEnd : to, days: len };
    }
    if (key === 'week') from = addDays(r.from, -7);
    else if (key === 'today') from = addDays(r.from, -1);
    else { len = diffDays(r.from, r.to) + 1; from = addDays(r.from, -len); }
    return { from, to: addDays(from, len - 1), days: len };
  }

  const inRange = (t, r) => t.tanggal >= r.from && t.tanggal <= r.to;
  function sum(list) {
    let inc = 0, exp = 0;
    for (const t of list) { if (t.jenis === 'pemasukan') inc += t.nominal; else exp += t.nominal; }
    return { inc, exp, net: inc - exp };
  }
  function byCat(list, jenis = 'pengeluaran') {
    const m = new Map();
    for (const t of list) if (t.jenis === jenis) m.set(t.kategori || 'Lainnya', (m.get(t.kategori || 'Lainnya') || 0) + t.nominal);
    return [...m.entries()].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
  }
  const sortTx = (list) => list.slice().sort((a, b) => (b.tanggal.localeCompare(a.tanggal)) || ((b.baris || 1e9) - (a.baris || 1e9)) || (b.id > a.id ? 1 : -1));

  function categories(jenis) {
    const fromMeta = S.meta && S.meta.kategori ? S.meta.kategori[jenis] || [] : [];
    const base = fromMeta.length ? fromMeta : (jenis === 'pemasukan' ? DEF_IN : DEF_OUT);
    const all = [...new Set([...base, ...(S.prefs.custom[jenis] || []), ...S.tx.filter((t) => t.jenis === jenis && t.kategori).map((t) => t.kategori)])];
    const freq = new Map();
    const recent = S.tx.filter((t) => t.jenis === jenis && t.tanggal >= addDays(today(), -60));
    for (const t of recent) freq.set(t.kategori, (freq.get(t.kategori) || 0) + 1);
    return all.map((k, i) => ({ k, i, f: freq.get(k) || 0 }))
      .sort((a, b) => (a.k === 'Lainnya') - (b.k === 'Lainnya') || b.f - a.f || a.i - b.i)
      .map((x) => x.k);
  }
  function sumberList() {
    const base = S.meta && S.meta.sumber && S.meta.sumber.length ? S.meta.sumber : DEF_SUMBER;
    return [...new Set(base)];
  }

  function insights(list, r) {
    const out = [];
    const s = sum(list);
    const t = today();
    const end = r.to > t && r.from <= t ? t : r.to;
    const days = Math.max(1, diffDays(r.from, end) + 1);
    const cats = byCat(list);
    const pr = prevRange(r);
    const prevList = S.tx.filter((x) => inRange(x, pr));
    const ps = sum(prevList);

    if (cats.length) {
      out.push({ k: '🏆 Pengeluaran terbesar', v: cats[0].k, d: `${rp(cats[0].v)} · ${pct((cats[0].v / s.exp) * 100)} dari total` });
    }
    if (s.exp > 0) out.push({ k: '📅 Rata-rata harian', v: rp(s.exp / days), d: `per hari, dari ${days} hari` });
    if (s.exp > 0 || ps.exp > 0) {
      const label = r.prev === 'periode sebelumnya' ? 'periode sebelumnya' : `periode yang sama ${r.prev}`;
      if (ps.exp > 0) {
        const ch = ((s.exp - ps.exp) / ps.exp) * 100;
        const up = ch >= 0;
        out.push({
          k: '📊 Dibanding ' + r.prev,
          v: `<span class="${up ? 'trend-up' : 'trend-down'}" style="color:${up ? 'var(--out-ink)' : 'var(--in-ink)'}">${up ? IC.up : IC.down}${up ? 'Naik' : 'Turun'} ${pct(Math.abs(ch))}</span>`,
          d: `Pengeluaran ${rp(s.exp)} vs ${rp(ps.exp)} (${label})`,
          html: true,
        });
      } else {
        out.push({ k: '📊 Dibanding ' + r.prev, v: 'Belum ada data', d: `Tidak ada pengeluaran pada ${label}` });
      }
    }
    if (s.inc > 0) {
      const rate = (s.net / s.inc) * 100;
      out.push({ k: '💰 Rasio tabungan', v: rate >= 0 ? pct(rate) : 'Defisit', d: rate >= 0 ? `${rp(s.net)} pemasukan tersisa` : `Pengeluaran melebihi pemasukan ${rp(-s.net)}` });
    }
    if (days > 1 && s.exp > 0) {
      const byDay = new Map();
      for (const x of list) if (x.jenis === 'pengeluaran') byDay.set(x.tanggal, (byDay.get(x.tanggal) || 0) + x.nominal);
      const top = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) out.push({ k: '🔥 Hari paling boros', v: dDay(top[0]), d: rp(top[1]) });
    }
    return out;
  }

  /* ------------------------------ chart ------------------------------ */
  function niceMax(m) {
    if (m <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(m)));
    for (const s of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m <= s * p) return s * p;
    return 10 * p;
  }

  /** Grafik batang SVG ringan. buckets: [{label, tip}], series: [{name, color, values}] */
  function barChart(id, buckets, series, h = 190) {
    const W = 340, H = h, L = 44, R = 4, T = 12, B = 26;
    const all = series.flatMap((s) => s.values);
    const max = niceMax(Math.max(0, ...all));
    const n = buckets.length;
    const gw = (W - L - R) / n;
    const sn = series.length;
    const gap = sn > 1 ? 2 : 0;
    const bw = Math.max(2, Math.min(sn > 1 ? 12 : 16, (gw * 0.7 - gap * (sn - 1)) / sn));
    const y = (v) => T + (H - T - B) * (1 - v / max);
    let g = '';
    for (let i = 0; i <= 2; i++) {
      const v = (max / 2) * i;
      const yy = y(v);
      g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/>`;
      g += `<text class="axis" x="${L - 8}" y="${yy + 3.5}" text-anchor="end">${i === 0 ? '0' : short(v)}</text>`;
    }
    const every = Math.ceil(n / 7);
    let bars = '';
    buckets.forEach((b, i) => {
      const cx = L + gw * i + gw / 2;
      const groupW = bw * sn + gap * (sn - 1);
      series.forEach((s, j) => {
        const v = s.values[i];
        if (!v) return;
        const x = cx - groupW / 2 + j * (bw + gap);
        const top = y(v), base = y(0);
        const hgt = Math.max(1.5, base - top);
        const r = Math.min(4, bw / 2, hgt);
        const t = base - hgt;
        bars += `<path class="bar" data-i="${i}" fill="${s.color}" d="M${x},${base}V${t + r}Q${x},${t} ${x + r},${t}H${x + bw - r}Q${x + bw},${t} ${x + bw},${t + r}V${base}Z"/>`;
      });
      if (i % every === 0 || n <= 8) g += `<text class="axis" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(b.label)}</text>`;
    });
    const data = encodeURIComponent(JSON.stringify({ b: buckets.map((b) => b.tip), s: series.map((s) => ({ n: s.name, c: s.color, v: s.values })), L, R, W, n }));
    return `<div class="chart" id="${id}" data-chart="${data}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik">${g}${bars}</svg><div class="tip"></div></div>`;
  }

  function bindCharts() {
    $$('.chart').forEach((el) => {
      const d = JSON.parse(decodeURIComponent(el.dataset.chart));
      const svg = $('svg', el);
      const tip = $('.tip', el);
      const show = (ev) => {
        const rect = svg.getBoundingClientRect();
        const x = ((ev.clientX - rect.left) / rect.width) * d.W;
        const i = Math.floor((x - d.L) / ((d.W - d.L - d.R) / d.n));
        if (i < 0 || i >= d.n) return hide();
        el.classList.add('focus');
        $$('.bar', el).forEach((b) => b.classList.toggle('hl', +b.dataset.i === i));
        tip.innerHTML = `<b>${esc(d.b[i])}</b>` + d.s.map((s) => `<div class="r"><span><i class="sw" style="background:${s.c}"></i>${esc(s.n)}</span><span class="num">${rp(s.v[i] || 0)}</span></div>`).join('');
        const cx = ((d.L + ((d.W - d.L - d.R) / d.n) * (i + 0.5)) / d.W) * rect.width;
        const tw = tip.offsetWidth || 140;
        tip.style.left = Math.min(Math.max(cx, tw / 2), rect.width - tw / 2) + 'px';
        tip.style.top = '6px';
        tip.classList.add('show');
      };
      const hide = () => { el.classList.remove('focus'); tip.classList.remove('show'); };
      el.addEventListener('pointerdown', show);
      el.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) show(e); });
      el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
      el._hide = hide;
    });
  }
  // Di layar sentuh, tooltip tetap tampil sampai pengguna mengetuk di luar grafik.
  document.addEventListener('pointerdown', (e) => {
    $$('.chart').forEach((c) => { if (!c.contains(e.target) && c._hide) c._hide(); });
  });

  function catBars(rows, total, jenis = 'pengeluaran', limit = 99, clickable = true) {
    if (!rows.length) return '';
    const max = rows[0].v;
    return rows.slice(0, limit).map((r) => `
      <${clickable ? 'button' : 'div'} class="cat-row" ${clickable ? `data-act="cat-filter" data-cat="${esc(r.k)}"` : ''}>
        <div class="cat-name"><span>${emoji(r.k)}</span><span>${esc(r.k)}</span></div>
        <div class="cat-val num">${rp(r.v)}<small>${pct((r.v / total) * 100)}</small></div>
        <div class="cat-track"><div class="cat-fill ${jenis === 'pemasukan' ? 'in' : ''}" style="width:${Math.max(2, (r.v / max) * 100)}%"></div></div>
      </${clickable ? 'button' : 'div'}>`).join('');
  }

  /* ------------------------------ render ------------------------------ */
  function render() {
    const view = $('#view');
    const nav = $('#nav');
    if (!S.cfg) {
      nav.classList.add('hidden');
      view.className = 'view no-nav';
      view.innerHTML = viewSetup();
      return;
    }
    nav.classList.remove('hidden');
    view.className = 'view';
    $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.nav === S.view));
    if (S.view === 'home') view.innerHTML = viewHome();
    else if (S.view === 'history') { view.innerHTML = viewHistory(); renderHistList(); }
    else if (S.view === 'stats') view.innerHTML = viewStats();
    else if (S.view === 'settings') view.innerHTML = viewSettings();
    placeSegIndicators();
    bindCharts();
  }

  function go(v) {
    if (S.view === v) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    S.view = v;
    render();
    window.scrollTo(0, 0);
  }

  function syncState() {
    if (S.cfg && S.cfg.mode === 'demo') return { cls: 'demo', text: 'Mode demo' };
    if (S.syncing || S.flushing) return { cls: 'syncing', text: 'Menyinkron…' };
    if (S.outbox.length) return { cls: 'pending', text: `${S.outbox.length} menunggu` };
    if (S.syncError) return { cls: 'error', text: 'Offline' };
    return { cls: '', text: 'Tersinkron' };
  }
  function syncPill() {
    const s = syncState();
    return `<button class="sync-pill glass ${s.cls}" data-act="sync" aria-label="Sinkronkan">${s.cls === 'syncing' ? IC.refresh : '<span class="dot"></span>'}<span>${s.text}</span></button>`;
  }
  function renderSync() {
    const el = $('.sync-pill');
    if (el) el.outerHTML = syncPill();
  }

  function periodSeg() {
    const opts = [['today', 'Hari ini'], ['week', 'Minggu ini'], ['month', 'Bulan ini'], ['custom', S.period.key === 'custom' ? 'Custom ✓' : 'Custom']];
    return `<div class="seg" data-seg="period">${opts.map(([k, l]) => `<button class="${S.period.key === k ? 'on' : ''}" data-act="period" data-k="${k}">${l}</button>`).join('')}<span class="ind"></span></div>`;
  }

  function placeSegIndicators() {
    $$('.seg').forEach((seg) => {
      const on = $('button.on', seg);
      const ind = $('.ind', seg);
      if (!on || !ind) return;
      ind.style.width = on.offsetWidth + 'px';
      ind.style.transform = `translateX(${on.offsetLeft - 4}px)`;
      ind.style.left = '4px';
    });
  }

  function txItem(t) {
    const title = t.catatan || t.kategori || (t.jenis === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran');
    const sub = [t.catatan ? t.kategori : '', t.sumber].filter(Boolean).join(' · ') || dShort(t.tanggal);
    const cls = t.jenis === 'pemasukan' ? 'in' : 'out';
    return `<button class="tx" data-act="detail" data-id="${esc(t.id)}">
      <div class="tx-ic ${cls}">${emoji(t.kategori)}</div>
      <div class="tx-main"><div class="tx-t">${esc(title)}</div>
        <div class="tx-s">${t._pending ? `<span class="badge-pending">${IC.clock}Belum terkirim</span>` : ''}<span>${esc(sub)}</span></div></div>
      <div class="tx-a num ${cls}">${rpSigned(t.nominal, t.jenis)}</div>
    </button>`;
  }

  function skeletonHome() {
    return `<div class="sk" style="height:190px;border-radius:26px"></div>
      <div class="card"><div class="sk" style="height:18px;width:50%"></div><div class="sk" style="height:12px;margin-top:16px"></div><div class="sk" style="height:12px;margin-top:12px;width:80%"></div></div>
      <div class="card">${'<div style="display:flex;gap:12px;align-items:center;margin:10px 0"><div class="sk" style="width:42px;height:42px;border-radius:14px"></div><div style="flex:1"><div class="sk" style="height:12px;width:60%"></div><div class="sk" style="height:10px;width:40%;margin-top:8px"></div></div></div>'.repeat(3)}</div>`;
  }

  function demoBanner() {
    return S.cfg.mode === 'demo' ? `<div class="banner">✨ Mode demo: data contoh, tidak tersimpan ke spreadsheet.<button data-act="to-setup">Hubungkan</button></div>` : '';
  }

  function viewHome() {
    const r = periodRange();
    const list = S.tx.filter((t) => inRange(t, r));
    const s = sum(list);
    const pr = prevRange(r);
    const ps = sum(S.tx.filter((t) => inRange(t, pr)));
    const all = sum(S.tx);
    const change = (cur, prev) => {
      if (!prev) return `<div class="d">${cur ? 'Belum ada pembanding' : '—'}</div>`;
      const ch = ((cur - prev) / prev) * 100;
      return `<div class="d">${ch >= 0 ? '▲' : '▼'} ${pct(Math.abs(ch))} vs ${r.prev}</div>`;
    };
    const now = new Date();
    const h = now.getHours();
    const greet = h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam';
    const cats = byCat(list);
    const recent = sortTx(S.tx).slice(0, 5);
    const ins = insights(list, r);

    let body;
    if (S.loading) body = skeletonHome();
    else {
      body = `
      <section class="hero">
        <div class="hero-label"><span>Saldo bersih · ${esc(r.label)}</span></div>
        <div class="hero-amount num">${s.net < 0 ? '−' : ''}${rp(Math.abs(s.net))}</div>
        <div class="hero-sub">${r.from === r.to ? dLong(r.from) : `${dMed(r.from)} – ${dMed(r.to)}`}</div>
        <div class="hero-split">
          <div class="hero-box"><div class="k"><i>${IC.down}</i>Pemasukan</div><div class="v num">${rp(s.inc)}</div>${change(s.inc, ps.inc)}</div>
          <div class="hero-box"><div class="k"><i>${IC.up}</i>Pengeluaran</div><div class="v num">${rp(s.exp)}</div>${change(s.exp, ps.exp)}</div>
        </div>
      </section>
      ${ins.length ? `<div class="insights">${ins.map((i) => `<div class="insight"><div class="ik">${i.k}</div><div class="iv">${i.html ? i.v : esc(i.v)}</div><div class="id">${esc(i.d)}</div></div>`).join('')}</div>` : ''}
      <section class="card">
        <div class="card-h"><div><div class="card-t">Pengeluaran per kategori</div><div class="card-s">${esc(r.label)}</div></div>${cats.length ? '<button class="link" data-nav="stats">Analitik</button>' : ''}</div>
        ${cats.length ? catBars(cats, s.exp, 'pengeluaran', 4) : `<div class="empty" style="padding:8px 0 4px"><p style="margin:0 auto">Belum ada pengeluaran di periode ini.</p></div>`}
      </section>
      <section class="card">
        <div class="card-h"><div class="card-t">Transaksi terbaru</div>${recent.length ? '<button class="link" data-nav="history">Lihat semua</button>' : ''}</div>
        ${recent.length ? `<div class="tx-list">${recent.map(txItem).join('')}</div>` : `<div class="empty">${emptyArt('h')}<h3>Belum ada transaksi</h3><p>Catat pemasukan atau pengeluaran pertamamu. Cuma butuh beberapa detik.</p><button class="btn btn-primary" data-act="add" style="width:auto">${IC.plus}Tambah transaksi</button></div>`}
      </section>
      <div class="foot">Total sepanjang waktu: <b class="num">${all.net < 0 ? '−' : ''}${rp(Math.abs(all.net))}</b> · sinkron ${timeAgo(S.syncedAt)}</div>`;
    }
    return `${demoBanner()}
      <header class="topbar">
        <div><p class="eyebrow">${dLong(today())}</p><h1 class="title">${greet} 👋</h1></div>
        ${syncPill()}
      </header>
      ${periodSeg()}
      ${body}`;
  }

  function viewStats() {
    const r = periodRange();
    const list = S.tx.filter((t) => inRange(t, r));
    const s = sum(list);
    const cats = byCat(list);
    const catsIn = byCat(list, 'pemasukan');
    const ins = insights(list, r);
    const t = today();

    let chart = '';
    if (S.trend === 'daily') {
      let from = r.from, to = r.to;
      let len = diffDays(from, to) + 1;
      if (len < 7) { from = addDays(to, -6); len = 7; }
      if (len > 92) { from = addDays(to, -91); len = 92; }
      const buckets = [], vals = [];
      const m = new Map();
      for (const x of S.tx) if (x.jenis === 'pengeluaran' && x.tanggal >= from && x.tanggal <= to) m.set(x.tanggal, (m.get(x.tanggal) || 0) + x.nominal);
      for (let i = 0; i < len; i++) {
        const d = addDays(from, i);
        buckets.push({ label: len <= 7 ? HARI[parseYMD(d).getDay()].slice(0, 3) : String(parseYMD(d).getDate()), tip: dDay(d) });
        vals.push(m.get(d) || 0);
      }
      const total = vals.reduce((a, b) => a + b, 0);
      chart = total ? barChart('ch-daily', buckets, [{ name: 'Pengeluaran', color: 'var(--out)', values: vals }]) +
        `<div class="card-s" style="margin-top:8px">${dMed(from)} – ${dMed(to)} · ketuk batang untuk detail</div>`
        : `<div class="empty" style="padding:14px 0"><p style="margin:0 auto">Belum ada pengeluaran di rentang ini.</p></div>`;
    } else {
      const d = parseYMD(t);
      const buckets = [], inc = [], exp = [];
      for (let i = 5; i >= 0; i--) {
        const m0 = new Date(d.getFullYear(), d.getMonth() - i, 1);
        const key = `${m0.getFullYear()}-${pad(m0.getMonth() + 1)}`;
        buckets.push({ label: BLN[m0.getMonth()], tip: `${BULAN[m0.getMonth()]} ${m0.getFullYear()}` });
        const ls = S.tx.filter((x) => x.tanggal.startsWith(key));
        const ss = sum(ls);
        inc.push(ss.inc); exp.push(ss.exp);
      }
      chart = `<div class="legend"><span><i style="background:var(--in)"></i>Pemasukan</span><span><i style="background:var(--out)"></i>Pengeluaran</span></div>` +
        barChart('ch-monthly', buckets, [{ name: 'Pemasukan', color: 'var(--in)', values: inc }, { name: 'Pengeluaran', color: 'var(--out)', values: exp }]) +
        `<div class="card-s" style="margin-top:8px">6 bulan terakhir · ketuk batang untuk detail</div>`;
    }

    const maxIE = Math.max(s.inc, s.exp, 1);
    const verdict = s.inc === 0 && s.exp === 0 ? 'Belum ada transaksi di periode ini.'
      : s.net >= 0 ? `Kamu menyisihkan <b>${rp(s.net)}</b>${s.inc ? ` (${pct((s.net / s.inc) * 100)} dari pemasukan)` : ''}. Pertahankan! ✨`
        : `Pengeluaran melebihi pemasukan sebesar <b>${rp(-s.net)}</b>. Cek kategori terbesar di bawah.`;

    return `${demoBanner()}
      <header class="topbar"><div><p class="eyebrow">Analitik</p><h1 class="title">Ke mana uangmu?</h1></div>${syncPill()}</header>
      ${periodSeg()}
      <section class="card" style="margin-top:0">
        <div class="card-h"><div><div class="card-t">Pemasukan vs pengeluaran</div><div class="card-s">${esc(r.label)}</div></div></div>
        <div class="compare">
          <div class="compare-row"><div class="top"><span>Pemasukan</span><b class="num">${rp(s.inc)}</b></div><div class="track"><div class="fill" style="width:${(s.inc / maxIE) * 100}%;background:var(--in)"></div></div></div>
          <div class="compare-row"><div class="top"><span>Pengeluaran</span><b class="num">${rp(s.exp)}</b></div><div class="track"><div class="fill" style="width:${(s.exp / maxIE) * 100}%;background:var(--out)"></div></div></div>
        </div>
        <div class="note">${verdict}</div>
      </section>
      <section class="card">
        <div class="card-h"><div class="card-t">Tren</div></div>
        <div class="seg" data-seg="trend" style="margin-bottom:14px">
          <button class="${S.trend === 'daily' ? 'on' : ''}" data-act="trend" data-k="daily">Harian</button>
          <button class="${S.trend === 'monthly' ? 'on' : ''}" data-act="trend" data-k="monthly">Bulanan</button><span class="ind"></span>
        </div>
        ${chart}
      </section>
      <section class="card">
        <div class="card-h"><div><div class="card-t">Pengeluaran per kategori</div><div class="card-s">${cats.length ? `${cats.length} kategori · ketuk untuk lihat transaksinya` : esc(r.label)}</div></div></div>
        ${cats.length ? catBars(cats, s.exp) : `<div class="empty" style="padding:8px 0"><p style="margin:0 auto">Belum ada pengeluaran.</p></div>`}
      </section>
      ${catsIn.length ? `<section class="card"><div class="card-h"><div class="card-t">Sumber pemasukan</div></div>${catBars(catsIn, s.inc, 'pemasukan', 99, false)}</section>` : ''}
      ${ins.length ? `<section style="margin-top:16px"><div class="card-t" style="margin:0 4px">Insight</div><div class="insight-list">${ins.map((i) => `<div class="insight"><div class="ik">${i.k}</div><div class="iv">${i.html ? i.v : esc(i.v)}</div><div class="id">${esc(i.d)}</div></div>`).join('')}</div></section>` : ''}`;
  }

  /* ----------------------------- riwayat ----------------------------- */
  function histFiltered() {
    const h = S.hist;
    const q = h.q.trim().toLowerCase();
    const qNum = q.replace(/[^0-9]/g, '');
    return sortTx(S.tx.filter((t) => {
      if (h.jenis !== 'all' && t.jenis !== h.jenis) return false;
      if (h.kategori && t.kategori !== h.kategori) return false;
      if (h.sumber && t.sumber !== h.sumber) return false;
      if (h.from && t.tanggal < h.from) return false;
      if (h.to && t.tanggal > h.to) return false;
      if (q) {
        const hay = `${t.catatan} ${t.kategori} ${t.sumber} ${dMed(t.tanggal)}`.toLowerCase();
        if (!hay.includes(q) && !(qNum.length >= 3 && String(Math.round(t.nominal)).includes(qNum))) return false;
      }
      return true;
    }));
  }

  function viewHistory() {
    const h = S.hist;
    const active = [];
    if (h.kategori) active.push(['kategori', `${emoji(h.kategori)} ${h.kategori}`]);
    if (h.sumber) active.push(['sumber', h.sumber]);
    if (h.from || h.to) active.push(['tanggal', `${h.from ? dShort(h.from) : '…'} – ${h.to ? dShort(h.to) : '…'}`]);
    return `${demoBanner()}
      <header class="topbar"><div><p class="eyebrow">Semua catatan</p><h1 class="title">Riwayat</h1></div>${syncPill()}</header>
      <label class="search glass"><span class="sr-only">Cari</span>${IC.search}<input id="q" type="search" placeholder="Cari catatan, kategori, nominal…" value="${esc(h.q)}" autocomplete="off" enterkeyhint="search">${h.q ? `<button class="clear" data-act="q-clear" aria-label="Hapus pencarian">${IC.x}</button>` : ''}</label>
      <div class="chips">
        ${[['all', 'Semua'], ['pengeluaran', 'Pengeluaran'], ['pemasukan', 'Pemasukan']].map(([k, l]) => `<button class="chip ${h.jenis === k ? 'on' : ''}" data-act="h-jenis" data-k="${k}">${l}</button>`).join('')}
        <button class="chip accent" data-act="h-filter">${IC.filter}Filter${active.length ? ` (${active.length})` : ''}</button>
        ${active.map(([k, l]) => `<button class="chip" data-act="h-unset" data-k="${k}">${esc(l)}<svg class="x" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`).join('')}
      </div>
      <div id="hist-list"></div>`;
  }

  function renderHistList() {
    const el = $('#hist-list');
    if (!el) return;
    if (S.loading) { el.innerHTML = `<div class="card">${'<div class="sk" style="height:46px;margin:10px 0"></div>'.repeat(5)}</div>`; return; }
    const list = histFiltered();
    const s = sum(list);
    if (!list.length) {
      const filtered = S.hist.q || S.hist.jenis !== 'all' || S.hist.kategori || S.hist.sumber || S.hist.from || S.hist.to;
      el.innerHTML = `<div class="empty">${emptyArt('r')}<h3>${filtered ? 'Tidak ada yang cocok' : 'Belum ada transaksi'}</h3><p>${filtered ? 'Coba kata kunci lain atau hapus filter.' : 'Transaksi yang kamu catat akan muncul di sini.'}</p>${filtered ? '<button class="btn btn-soft btn-sm" data-act="h-reset" style="width:auto">Hapus semua filter</button>' : ''}</div>`;
      return;
    }
    const shown = list.slice(0, S.hist.limit);
    const groups = new Map();
    for (const t of shown) { if (!groups.has(t.tanggal)) groups.set(t.tanggal, []); groups.get(t.tanggal).push(t); }
    el.innerHTML = `<div class="summary-line"><span><b>${list.length}</b> transaksi</span><span>Masuk <b class="num" style="color:var(--in-ink)">${rp(s.inc)}</b></span><span>Keluar <b class="num">${rp(s.exp)}</b></span></div>` +
      [...groups.entries()].map(([d, items]) => {
        const ds = sum(items);
        return `<div class="tx-group"><div class="tx-day"><span>${dDay(d)}</span><span class="num">${ds.exp ? '−' + short(ds.exp) : ''}${ds.inc && ds.exp ? ' · ' : ''}${ds.inc ? '+' + short(ds.inc) : ''}</span></div><div class="tx-list">${items.map(txItem).join('')}</div></div>`;
      }).join('') +
      (list.length > shown.length ? `<button class="more" data-act="h-more">Muat lebih banyak (${list.length - shown.length} lagi)</button>` : '');
  }

  /* ---------------------------- pengaturan ---------------------------- */
  function viewSettings() {
    const live = S.cfg.mode !== 'demo';
    const st = S.meta && S.meta.struktur ? S.meta.struktur : {};
    const label = { tanggal: 'Tanggal', nominal: 'Nominal', kategori: 'Kategori', catatan: 'Catatan', sumber: 'Sumber dana', id: 'ID' };
    const mapping = Object.keys(st).map((j) => `
      <div style="margin-top:12px"><div style="font-weight:700;font-size:13.5px;margin-bottom:6px">Sheet "${esc(st[j].sheet)}" · header baris ${st[j].barisHeader}</div>
      <div class="map-list">${Object.keys(label).map((f) => `<div><span>${label[f]}</span><b>${esc(st[j].kolom[f] || '—')}</b></div>`).join('')}</div></div>`).join('');
    return `
      <header class="topbar"><div><p class="eyebrow">Arus v${VERSION}</p><h1 class="title">Pengaturan</h1></div>${syncPill()}</header>
      ${demoBanner()}
      <section class="card" style="margin-top:0">
        <div class="card-t" style="margin-bottom:6px">Koneksi</div>
        <div class="set-row"><span>Spreadsheet</span><b>${esc(S.meta ? S.meta.spreadsheet : '—')}</b></div>
        <div class="set-row"><span>Sinkron terakhir</span><b>${timeAgo(S.syncedAt)}</b></div>
        <div class="set-row"><span>Belum terkirim</span><b>${S.outbox.length} transaksi</b></div>
        <div class="set-row"><span>Total transaksi</span><b>${S.tx.length}</b></div>
        ${S.syncError ? `<div class="note" style="background:#fff0f0;color:#b42318">${esc(S.syncError)}</div>` : ''}
        <div class="btn-row" style="margin-top:14px">
          <button class="btn btn-soft btn-sm" data-act="sync">${IC.refresh}Sinkronkan</button>
          <button class="btn btn-ghost btn-sm" data-act="test">${IC.check}Tes koneksi</button>
        </div>
      </section>
      ${live && mapping ? `<section class="card"><div class="card-t">Kolom yang terdeteksi</div><div class="card-s">Aplikasi menulis hanya ke kolom ini. Kolom lain di sheet-mu tidak disentuh.</div>${mapping}</section>` : ''}
      <section class="card">
        <div class="card-t" style="margin-bottom:12px">Perangkat ini</div>
        <div class="stack">
          <button class="btn btn-ghost btn-sm" data-act="to-setup">${IC.edit}Ubah URL / kunci rahasia</button>
          <button class="btn btn-danger btn-sm" data-act="logout">${IC.trash}Putuskan dari HP ini</button>
        </div>
        <p class="hint">Memutuskan hanya menghapus data dari HP ini. Spreadsheet-mu tetap aman.</p>
      </section>
      <section class="card">
        <div class="card-t" style="margin-bottom:6px">Tips cepat</div>
        <ul class="steps">
          <li>Ketuk tombol + di tengah bawah dari layar mana pun untuk mencatat.</li>
          <li>Tanpa sinyal? Tetap catat. Transaksi dikirim otomatis saat online.</li>
          <li>Ketuk transaksi untuk mengubah atau menghapusnya.</li>
        </ul>
      </section>
      <div class="foot">Arus · data tersimpan di Google Sheets milikmu</div>`;
  }

  /* ------------------------------ setup ------------------------------ */
  function viewSetup() {
    const c = S.cfg || store.get('arus.lastcfg', {}) || {};
    return `<div class="setup">
      <div class="logo">${IC.logo}</div>
      <h1>Arus</h1>
      <p class="lead">Catat keuangan dalam hitungan detik, langsung ke Google Sheets milikmu.</p>
      <section class="card" style="margin-top:0">
        <div class="card-t">Hubungkan spreadsheet</div>
        <div class="card-s" style="margin-bottom:16px">Salin dari Apps Script (lihat panduan setup, langkah 2 dan 3).</div>
        <div class="field"><label class="label" for="s-url">URL Aplikasi Web</label>
          <input id="s-url" class="input" type="url" inputmode="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(c.mode === 'live' ? c.url : '')}"></div>
        <div class="field"><label class="label" for="s-key">Kunci rahasia</label>
          <div class="input-wrap"><input id="s-key" class="input" type="password" autocomplete="off" placeholder="arus-…" value="${esc(c.mode === 'live' ? c.key : '')}" style="padding-right:50px">
          <button class="eye" data-act="toggle-key" aria-label="Tampilkan kunci">${IC.eye}</button></div>
          <div class="err-msg" id="s-err"></div></div>
        <button class="btn btn-primary" data-act="connect" id="s-btn">Hubungkan</button>
      </section>
      <div class="or">atau</div>
      <button class="btn btn-ghost" data-act="demo">✨ Coba dulu dengan data contoh</button>
      <p class="foot">Kunci rahasia hanya disimpan di HP ini dan dipakai untuk membuka akses ke spreadsheet-mu.</p>
    </div>`;
  }

  async function connect() {
    const url = $('#s-url').value.trim();
    const key = $('#s-key').value.trim();
    const err = $('#s-err');
    err.textContent = '';
    if (!/^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[\w-]+\/exec\/?$/.test(url)) {
      err.textContent = /\/dev\/?$/.test(url) ? 'Gunakan URL yang berakhiran /exec, bukan /dev.' : 'URL tidak valid. Harus diawali https://script.google.com/macros/s/ dan berakhiran /exec.';
      return;
    }
    if (key.length < 10) { err.textContent = 'Kunci rahasia belum diisi dengan benar.'; return; }
    const btn = $('#s-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Menghubungkan…';
    const prev = S.cfg;
    S.cfg = { mode: 'live', url, key };
    try {
      const r = await api('ping');
      if (prev && prev.mode === 'demo') { S.tx = []; S.meta = null; S.syncedAt = null; S.outbox = []; }
      store.set(LS.cfg, S.cfg);
      store.set('arus.lastcfg', S.cfg);
      S.view = 'home';
      toast('ok', `Terhubung ke "${r.spreadsheet}"`);
      S.loading = !S.tx.length;
      render();
      await flush();
      await loadAll();
    } catch (e) {
      S.cfg = prev;
      err.textContent = e.message;
      btn.disabled = false;
      btn.textContent = 'Hubungkan';
    }
  }

  /* ------------------------------ lapisan ------------------------------ */
  const layers = [];
  function openLayer(html, kind = 'sheet') {
    const el = document.createElement('div');
    el.className = 'layer';
    el.innerHTML = `<div class="backdrop" data-act="close"></div>${kind === 'sheet' ? `<div class="sheet" role="dialog" aria-modal="true">${html}</div>` : `<div class="dialog" role="alertdialog" aria-modal="true">${html}</div>`}`;
    $('#layers').appendChild(el);
    layers.push(el);
    try { history.pushState({ layer: layers.length }, ''); } catch (e) { useHistory = false; }
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
    return el;
  }
  let afterClose = null;
  let useHistory = true; // tombol "kembali" HP menutup sheet; dimatikan jika browser memblokir
  function closeLayer(then) {
    if (!layers.length) { if (then) then(); return; }
    if (useHistory) { afterClose = then || null; history.back(); } else { removeTopLayer(); if (then) then(); }
  }
  function closeAllLayers(then) {
    if (!layers.length) { if (then) then(); return; }
    if (useHistory) { afterClose = then || null; history.go(-layers.length); } else { while (layers.length) removeTopLayer(); if (then) then(); }
  }
  function removeTopLayer() {
    const el = layers.pop();
    if (!el) return;
    el.classList.remove('open');
    setTimeout(() => el.remove(), 380);
  }
  window.addEventListener('popstate', (e) => {
    const target = (e.state && e.state.layer) || 0;
    while (layers.length > target) removeTopLayer();
    if (afterClose) { const fn = afterClose; afterClose = null; fn(); }
  });
  const topLayer = () => layers[layers.length - 1];

  /* -------------------------- form transaksi -------------------------- */
  let F = null; // state form aktif

  function openForm(tx) {
    const edit = !!tx;
    F = edit
      ? { id: tx.id, jenis: tx.jenis, nominal: tx.nominal, kategori: tx.kategori, sumber: tx.sumber, tanggal: tx.tanggal, catatan: tx.catatan, edit: true }
      : { id: null, jenis: 'pengeluaran', nominal: 0, kategori: '', sumber: S.prefs.sumber || '', tanggal: today(), catatan: '', edit: false };
    const el = openLayer(`
      <div class="sheet-grab"></div>
      <div class="sheet-h"><h2>${edit ? 'Ubah transaksi' : 'Tambah transaksi'}</h2><button class="icon-btn" data-act="close" aria-label="Tutup">${IC.x}</button></div>
      <div class="sheet-b" id="form-body"></div>
      <div class="sheet-f"><button class="btn btn-primary" id="f-save" data-act="save"></button></div>`);
    renderForm(true);
    const inp = $('#f-amt', el);
    if (!edit) inp.focus({ preventScroll: true });
  }

  function renderForm(first) {
    const el = topLayer();
    if (!el || !F) return;
    const body = $('#form-body', el);
    const amt = first ? (F.nominal ? NF.format(F.nominal) : '') : $('#f-amt', el).value;
    const note = first ? F.catatan : $('#f-note', el).value;
    const cls = F.jenis === 'pemasukan' ? 'in' : 'out';
    const cats = categories(F.jenis);
    if (F.kategori && !cats.includes(F.kategori)) cats.unshift(F.kategori);
    const sumber = sumberList();
    if (F.sumber && !sumber.includes(F.sumber)) sumber.push(F.sumber);
    const t = today(), y = addDays(t, -1);
    const isOther = F.tanggal !== t && F.tanggal !== y;
    body.innerHTML = `
      <div class="seg type" data-seg="type">
        <button class="${F.jenis === 'pengeluaran' ? 'on' : ''}" data-act="f-jenis" data-k="pengeluaran">Pengeluaran</button>
        <button class="${F.jenis === 'pemasukan' ? 'on' : ''}" data-act="f-jenis" data-k="pemasukan">Pemasukan</button>
        <span class="ind ${cls}"></span>
      </div>
      <div class="field">
        <label class="label" for="f-amt">Nominal</label>
        <div class="amount" id="f-amt-wrap"><span class="cur">Rp</span><input id="f-amt" inputmode="numeric" pattern="[0-9.]*" autocomplete="off" placeholder="0" value="${esc(amt)}" enterkeyhint="done" aria-describedby="f-amt-err"></div>
        <div class="quick">${[10000, 20000, 50000, 100000].map((v) => `<button data-act="f-quick" data-v="${v}">+${short(v)}</button>`).join('')}<button data-act="f-000">000</button></div>
        <div class="err-msg" id="f-amt-err"></div>
      </div>
      <div class="field">
        <div class="label"><span>Kategori</span></div>
        <div class="cat-grid" id="f-cats">
          ${cats.map((k) => `<button class="cchip ${F.kategori === k ? 'on ' + cls : ''}" data-act="f-cat" data-k="${esc(k)}"><span class="e">${emoji(k)}</span>${esc(k)}</button>`).join('')}
          <button class="cchip add" data-act="f-newcat">${IC.plus.replace('<svg', '<svg width="16" height="16" style="fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round"')}Baru</button>
        </div>
        <div class="err-msg" id="f-cat-err"></div>
      </div>
      <div class="field">
        <div class="label"><span>Sumber dana</span><small>opsional</small></div>
        <div class="pills">${sumber.map((s) => `<button class="pill ${F.sumber === s ? 'on' : ''}" data-act="f-sumber" data-k="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      </div>
      <div class="field">
        <div class="label"><span>Tanggal</span></div>
        <div class="date-row">
          <button class="chip ${F.tanggal === t ? 'on' : ''}" data-act="f-date" data-k="${t}">Hari ini</button>
          <button class="chip ${F.tanggal === y ? 'on' : ''}" data-act="f-date" data-k="${y}">Kemarin</button>
          <label class="chip date-pick ${isOther ? 'on' : ''}">${IC.cal}<span>${isOther ? dMed(F.tanggal) : 'Pilih tanggal'}</span><input type="date" id="f-date" value="${F.tanggal}" aria-label="Pilih tanggal"></label>
        </div>
      </div>
      <div class="field" style="margin-bottom:6px">
        <label class="label" for="f-note"><span>Catatan</span><small>opsional</small></label>
        <input id="f-note" class="input" maxlength="300" placeholder="${F.jenis === 'pemasukan' ? 'Contoh: gaji bulan ini' : 'Contoh: makan siang bareng tim'}" value="${esc(note)}" enterkeyhint="done">
      </div>`;
    const save = $('#f-save', el);
    save.className = `btn btn-primary ${cls}`;
    save.innerHTML = `${IC.check}${F.edit ? 'Simpan perubahan' : `Simpan ${F.jenis}`}`;
    placeSegIndicators();

    const amtEl = $('#f-amt', el);
    amtEl.addEventListener('input', () => {
      const digits = amtEl.value.replace(/[^0-9]/g, '').replace(/^0+/, '').slice(0, 13);
      amtEl.value = digits ? NF.format(Number(digits)) : '';
      $('#f-amt-wrap', el).classList.remove('err');
      $('#f-amt-err', el).textContent = '';
    });
    amtEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); amtEl.blur(); } });
    $('#f-note', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveForm(); } });
    $('#f-date', el).addEventListener('change', (e) => { if (e.target.value) { F.tanggal = e.target.value; renderForm(); } });
  }

  const amountValue = () => Number(($('#f-amt', topLayer()).value || '').replace(/[^0-9]/g, '')) || 0;

  async function saveForm() {
    const el = topLayer();
    if (!el || !F) return;
    const nominal = amountValue();
    let bad = false;
    if (!nominal || nominal <= 0) {
      $('#f-amt-wrap', el).classList.remove('err'); void el.offsetWidth;
      $('#f-amt-wrap', el).classList.add('err');
      $('#f-amt-err', el).textContent = nominal === 0 && $('#f-amt', el).value ? 'Nominal harus lebih dari 0.' : 'Nominal wajib diisi.';
      bad = true;
    }
    if (!F.kategori) {
      const g = $('#f-cats', el);
      g.classList.remove('err'); void g.offsetWidth; g.classList.add('err');
      $('#f-cat-err', el).textContent = 'Pilih salah satu kategori.';
      bad = true;
    }
    if (bad) {
      if (navigator.vibrate) navigator.vibrate(30);
      if (!nominal) $('#f-amt', el).focus();
      return;
    }

    const tx = {
      id: F.id || uid(),
      jenis: F.jenis,
      nominal,
      tanggal: F.tanggal,
      kategori: F.kategori,
      sumber: F.sumber || '',
      catatan: $('#f-note', el).value.trim().slice(0, 300),
    };
    S.prefs.sumber = tx.sumber || S.prefs.sumber;
    store.set(LS.prefs, S.prefs);

    // Tampilkan langsung (optimis), lalu kirim ke spreadsheet.
    const old = S.tx.find((t) => t.id === tx.id);
    if (F.edit) S.tx = S.tx.map((t) => (t.id === tx.id ? Object.assign({}, tx, { _pending: true, baris: t.baris }) : t));
    else S.tx = [Object.assign({}, tx, { _pending: true })].concat(S.tx);
    const wasEdit = F.edit;
    F = null;
    closeLayer();
    render();
    if (navigator.vibrate) navigator.vibrate(12);

    const res = await enqueue(wasEdit ? 'update' : 'add', { tx });
    if (res.ok) toast('ok', wasEdit ? 'Perubahan tersimpan ke Google Sheets' : `${tx.jenis === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'} ${rp(tx.nominal)} tersimpan`);
    else if (res.queued && res.error) toast('warn', res.error.network ? 'Tersimpan di HP. Akan dikirim otomatis saat online.' : `Belum terkirim: ${res.error.message}`);
    else if (res.queued) toast('info', 'Tersimpan di HP, sedang dikirim…');
    else if (old) { /* sudah ditangani di flush */ }
  }

  /* --------------------------- detail & hapus --------------------------- */
  function openDetail(id) {
    const t = S.tx.find((x) => x.id === id);
    if (!t) return;
    const cls = t.jenis === 'pemasukan' ? 'in' : 'out';
    openLayer(`
      <div class="sheet-grab"></div>
      <div class="sheet-h"><h2>Detail transaksi</h2><button class="icon-btn" data-act="close" aria-label="Tutup">${IC.x}</button></div>
      <div class="sheet-b">
        <div class="detail-amt"><div class="ic tx-ic ${cls}">${emoji(t.kategori)}</div><div class="v num ${cls}">${rpSigned(t.nominal, t.jenis)}</div><div class="s">${t.jenis === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'}${t._pending ? ' · belum terkirim' : ''}</div></div>
        <div class="kv">
          <div><span>Kategori</span><b>${esc(t.kategori || '—')}</b></div>
          <div><span>Tanggal</span><b>${dLong(t.tanggal)}</b></div>
          <div><span>Sumber dana</span><b>${esc(t.sumber || '—')}</b></div>
          <div><span>Catatan</span><b>${esc(t.catatan || '—')}</b></div>
          ${t.baris && S.cfg.mode !== 'demo' ? `<div><span>Lokasi</span><b>Sheet ${t.jenis === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'}, baris ${t.baris}</b></div>` : ''}
        </div>
      </div>
      <div class="sheet-f"><div class="btn-row"><button class="btn btn-danger" data-act="ask-del" data-id="${esc(t.id)}">${IC.trash}Hapus</button><button class="btn btn-primary" data-act="edit" data-id="${esc(t.id)}">${IC.edit}Ubah</button></div></div>`);
  }

  function askDelete(id) {
    const t = S.tx.find((x) => x.id === id);
    if (!t) return;
    openLayer(`
      <div class="d-ic">${IC.trash}</div>
      <h3>Hapus transaksi ini?</h3>
      <p>${esc(t.catatan || t.kategori)} · <b class="num">${rp(t.nominal)}</b><br>Baris di Google Sheets juga akan dihapus dan tidak bisa dikembalikan.</p>
      <div class="btn-row"><button class="btn btn-ghost btn-sm" data-act="close">Batal</button><button class="btn btn-danger-solid btn-sm" data-act="do-del" data-id="${esc(t.id)}">Ya, hapus</button></div>`, 'dialog');
  }

  async function doDelete(id) {
    const t = S.tx.find((x) => x.id === id);
    // tutup dialog + sheet detail
    closeAllLayers();
    S.tx = S.tx.filter((x) => x.id !== id);
    render();
    const res = await enqueue('delete', { id });
    if (res.ok) toast('ok', 'Transaksi dihapus');
    else if (res.queued && res.error) toast('warn', res.error.network ? 'Akan dihapus dari spreadsheet saat online.' : `Belum terhapus: ${res.error.message}`);
    else if (!res.ok && t) { /* flush memuat ulang data */ }
  }

  /* --------------------------- filter riwayat --------------------------- */
  function openHistFilter() {
    const h = S.hist;
    const cats = [...new Set([...categories('pengeluaran'), ...categories('pemasukan')])];
    openLayer(`
      <div class="sheet-grab"></div>
      <div class="sheet-h"><h2>Filter riwayat</h2><button class="icon-btn" data-act="close" aria-label="Tutup">${IC.x}</button></div>
      <div class="sheet-b">
        <div class="field"><label class="label" for="hf-cat">Kategori</label>
          <select id="hf-cat" class="input"><option value="">Semua kategori</option>${cats.map((k) => `<option ${h.kategori === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
        <div class="field"><label class="label" for="hf-src">Sumber dana</label>
          <select id="hf-src" class="input"><option value="">Semua sumber</option>${sumberList().map((k) => `<option ${h.sumber === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
        <div class="field"><div class="label">Rentang tanggal</div>
          <div class="two"><input id="hf-from" class="input" type="date" value="${h.from}" aria-label="Dari tanggal"><input id="hf-to" class="input" type="date" value="${h.to}" aria-label="Sampai tanggal"></div></div>
      </div>
      <div class="sheet-f"><div class="btn-row"><button class="btn btn-ghost" data-act="hf-reset">Reset</button><button class="btn btn-primary" data-act="hf-apply">Terapkan</button></div></div>`);
  }

  function openCustomPeriod() {
    const r = periodRange();
    openLayer(`
      <div class="sheet-grab"></div>
      <div class="sheet-h"><h2>Periode custom</h2><button class="icon-btn" data-act="close" aria-label="Tutup">${IC.x}</button></div>
      <div class="sheet-b">
        <div class="two"><div class="field"><label class="label" for="cp-from">Dari</label><input id="cp-from" class="input" type="date" value="${S.period.from || r.from}"></div>
        <div class="field"><label class="label" for="cp-to">Sampai</label><input id="cp-to" class="input" type="date" value="${S.period.to || r.to}"></div></div>
        <div class="chips" style="margin-top:0">
          <button class="chip" data-act="cp-preset" data-k="30">30 hari terakhir</button>
          <button class="chip" data-act="cp-preset" data-k="lastmonth">Bulan lalu</button>
          <button class="chip" data-act="cp-preset" data-k="90">3 bulan terakhir</button>
          <button class="chip" data-act="cp-preset" data-k="year">Tahun ini</button>
        </div>
        <div class="err-msg" id="cp-err"></div>
      </div>
      <div class="sheet-f"><button class="btn btn-primary" data-act="cp-apply">Terapkan periode</button></div>`);
  }

  /* ------------------------------ toast ------------------------------ */
  function toast(type, msg) {
    const icon = { ok: IC.check, err: IC.alert, info: IC.info, warn: IC.alert }[type];
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.setAttribute('role', type === 'err' ? 'alert' : 'status');
    el.innerHTML = `<i>${icon}</i><span>${esc(msg)}</span>`;
    const box = $('#toasts');
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, type === 'err' ? 5000 : 2800);
  }

  /* ------------------------------ events ------------------------------ */
  document.addEventListener('click', async (e) => {
    const navBtn = e.target.closest('[data-nav]');
    if (navBtn) { go(navBtn.dataset.nav); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    const k = a.dataset.k;
    const L = topLayer();

    switch (act) {
      case 'add': openForm(); break;
      case 'close': closeLayer(); break;
      case 'sync':
        if (S.cfg && S.cfg.mode === 'demo') { toast('info', 'Mode demo tidak terhubung ke spreadsheet.'); break; }
        await flush(); await loadAll({ toast: true }); break;
      case 'test':
        try { const r = await api('ping'); toast('ok', `Koneksi OK · ${r.spreadsheet}`); } catch (err) { toast('err', err.message); }
        break;
      case 'period':
        if (k === 'custom') { openCustomPeriod(); break; }
        S.period = { key: k, from: '', to: '' }; render(); break;
      case 'trend': S.trend = k; render(); break;
      case 'cat-filter':
        S.hist = Object.assign({}, S.hist, { kategori: a.dataset.cat, jenis: 'all', q: '', from: periodRange().from, to: periodRange().to, limit: 60 });
        go('history'); break;

      // form
      case 'f-jenis':
        if (F.jenis !== k) { F.jenis = k; F.kategori = ''; renderForm(); }
        break;
      case 'f-cat':
        F.kategori = a.dataset.k;
        $$('.cchip', L).forEach((c) => c.classList.remove('on', 'in', 'out'));
        a.classList.add('on', F.jenis === 'pemasukan' ? 'in' : 'out');
        $('#f-cat-err', L).textContent = '';
        break;
      case 'f-newcat': {
        a.outerHTML = `<span class="cchip add"><input id="f-newcat" maxlength="40" placeholder="Nama kategori" enterkeyhint="done"></span>`;
        const inp = $('#f-newcat', L);
        inp.focus();
        const commit = () => {
          const v = inp.value.trim();
          if (v) {
            const list = S.prefs.custom[F.jenis] || (S.prefs.custom[F.jenis] = []);
            if (!list.includes(v)) list.push(v);
            store.set(LS.prefs, S.prefs);
            F.kategori = v;
          }
          renderForm();
        };
        inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } });
        inp.addEventListener('blur', commit, { once: true });
        break;
      }
      case 'f-sumber':
        F.sumber = F.sumber === k ? '' : k;
        $$('.pill', L).forEach((p) => p.classList.toggle('on', p.dataset.k === F.sumber));
        break;
      case 'f-date': F.tanggal = k; renderForm(); break;
      case 'f-quick': {
        const inp = $('#f-amt', L);
        const v = amountValue() + Number(a.dataset.v);
        inp.value = NF.format(v);
        inp.dispatchEvent(new Event('input'));
        break;
      }
      case 'f-000': {
        const inp = $('#f-amt', L);
        const v = amountValue();
        if (v && v < 1e10) { inp.value = NF.format(v * 1000); inp.dispatchEvent(new Event('input')); }
        break;
      }
      case 'save': saveForm(); break;

      // detail
      case 'detail': openDetail(a.dataset.id); break;
      case 'edit': {
        const t = S.tx.find((x) => x.id === a.dataset.id);
        closeLayer(() => setTimeout(() => openForm(t), 30));
        break;
      }
      case 'ask-del': askDelete(a.dataset.id); break;
      case 'do-del': doDelete(a.dataset.id); break;

      // riwayat
      case 'h-jenis': S.hist.jenis = k; S.hist.limit = 60; render(); break;
      case 'h-filter': openHistFilter(); break;
      case 'h-unset':
        if (k === 'tanggal') { S.hist.from = ''; S.hist.to = ''; } else S.hist[k] = '';
        render(); break;
      case 'h-reset': S.hist = { q: '', jenis: 'all', kategori: '', sumber: '', from: '', to: '', limit: 60 }; render(); break;
      case 'h-more': S.hist.limit += 100; renderHistList(); break;
      case 'q-clear': S.hist.q = ''; render(); break;
      case 'hf-reset':
        Object.assign(S.hist, { kategori: '', sumber: '', from: '', to: '' }); closeLayer(); render(); break;
      case 'hf-apply': {
        const from = $('#hf-from', L).value, to = $('#hf-to', L).value;
        Object.assign(S.hist, { kategori: $('#hf-cat', L).value, sumber: $('#hf-src', L).value, from: from && to && from > to ? to : from, to: from && to && from > to ? from : to, limit: 60 });
        closeLayer(); render(); break;
      }

      // periode custom
      case 'cp-preset': {
        const t = today(); const d = parseYMD(t);
        let from = t, to = t;
        if (k === '30') from = addDays(t, -29);
        if (k === '90') from = addDays(t, -89);
        if (k === 'year') from = `${d.getFullYear()}-01-01`;
        if (k === 'lastmonth') { from = ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)); to = ymd(new Date(d.getFullYear(), d.getMonth(), 0)); }
        $('#cp-from', L).value = from; $('#cp-to', L).value = to;
        break;
      }
      case 'cp-apply': {
        const from = $('#cp-from', L).value, to = $('#cp-to', L).value;
        if (!from || !to) { $('#cp-err', L).textContent = 'Isi kedua tanggal.'; break; }
        if (from > to) { $('#cp-err', L).textContent = 'Tanggal "Dari" harus sebelum "Sampai".'; break; }
        S.period = { key: 'custom', from, to };
        closeLayer(); render(); break;
      }

      // setup & pengaturan
      case 'toggle-key': { const i = $('#s-key'); i.type = i.type === 'password' ? 'text' : 'password'; break; }
      case 'connect': connect(); break;
      case 'demo':
        S.cfg = { mode: 'demo' };
        store.set(LS.cfg, S.cfg);
        S.tx = []; S.meta = null; S.syncedAt = null; S.loading = true; S.view = 'home';
        render();
        await loadAll();
        toast('info', 'Mode demo aktif. Silakan coba semua fitur!');
        break;
      case 'to-setup':
        if (S.cfg && S.cfg.mode === 'live') store.set('arus.lastcfg', S.cfg);
        S.cfg = null; render(); break;
      case 'logout':
        openLayer(`
          <div class="d-ic">${IC.trash}</div>
          <h3>Putuskan dari HP ini?</h3>
          <p>${S.outbox.length ? `<b>${S.outbox.length} transaksi belum terkirim akan hilang.</b><br>` : ''}Data di Google Sheets tetap aman. Kamu perlu memasukkan URL dan kunci lagi untuk menghubungkan.</p>
          <div class="btn-row"><button class="btn btn-ghost btn-sm" data-act="close">Batal</button><button class="btn btn-danger-solid btn-sm" data-act="do-logout">Putuskan</button></div>`, 'dialog');
        break;
      case 'do-logout':
        closeAllLayers();
        [LS.cfg, LS.cache, LS.outbox, LS.demo, 'arus.lastcfg'].forEach(store.del);
        S.cfg = null; S.tx = []; S.meta = null; S.outbox = []; S.syncedAt = null;
        render(); toast('info', 'HP ini sudah diputuskan.'); break;
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'q') {
      S.hist.q = e.target.value; S.hist.limit = 60;
      renderHistList();
    }
  });

  window.addEventListener('resize', placeSegIndicators);
  window.addEventListener('online', () => { if (S.cfg) flush().then(() => loadAll()); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !S.cfg) return;
    if (S.outbox.length) flush();
    if (!S.syncedAt || Date.now() - new Date(S.syncedAt).getTime() > 60000) loadAll();
  });

  /* ------------------------------ mulai ------------------------------ */
  if (window.ARUS_PREVIEW && !S.cfg) S.cfg = { mode: 'demo' }; // halaman pratinjau langsung masuk mode demo
  if (S.cfg && S.cfg.mode === 'demo') S.loading = !S.tx.length;
  if (S.cfg && !S.tx.length && !S.syncedAt) S.loading = true;
  if (S.tx.length) S.tx = applyOutbox(S.tx);
  render();
  if (S.cfg) flush().then(() => loadAll());

  if ('serviceWorker' in navigator && location.protocol === 'https:' && window.self === window.top) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  // Jalan pintas: buka app dengan …/#tambah untuk langsung ke form
  if (S.cfg && location.hash === '#tambah') { history.replaceState(null, '', location.pathname); setTimeout(() => openForm(), 300); }
})();
