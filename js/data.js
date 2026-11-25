/* DentAgenda — dati, archivio locale e funzioni di utilità
   Tutti i dati restano nel browser (localStorage). Nessun server. */
'use strict';

const DB_KEY = 'dentagenda_v1';

/* ---------- utilità ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayISO = () => toISO(new Date());
const addDays = (iso, n) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const diffDays = (a, b) => Math.round((fromISO(a) - fromISO(b)) / 864e5);
const t2m = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const m2t = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const euro = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const fmtDate = iso => { const d = fromISO(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const fmtLong = iso => { const d = fromISO(iso); return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`; };
const fmtHuman = iso => {
  const n = diffDays(iso, todayISO());
  if (n === 0) return 'oggi'; if (n === 1) return 'domani'; if (n === -1) return 'ieri';
  return fmtLong(iso);
};
const age = iso => { if (!iso) return ''; const b = fromISO(iso), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const STATI = {
  richiesta: { label: 'Richiesta online', color: '#a855f7' },
  attesa: { label: 'Da confermare', color: '#f59e0b' },
  confermato: { label: 'Confermato', color: '#0ea5e9' },
  arrivato: { label: 'In sala d\'attesa', color: '#14b8a6' },
  completato: { label: 'Completato', color: '#22c55e' },
  annullato: { label: 'Annullato', color: '#94a3b8' },
  noshow: { label: 'Non presentato', color: '#ef4444' },
};
const ATTIVI = s => s !== 'annullato' && s !== 'noshow';

const DENTI_STATI = {
  sano: { label: 'Sano', color: '#ffffff' },
  carie: { label: 'Carie', color: '#ef4444' },
  otturazione: { label: 'Otturazione', color: '#3b82f6' },
  devitalizzato: { label: 'Devitalizzato', color: '#a855f7' },
  corona: { label: 'Corona', color: '#f59e0b' },
  impianto: { label: 'Impianto', color: '#14b8a6' },
  estrarre: { label: 'Da estrarre', color: '#f97316' },
  mancante: { label: 'Mancante', color: '#475569' },
};

/* ---------- archivio ---------- */
const Store = {
  d: null,
  load() {
    try { this.d = JSON.parse(localStorage.getItem(DB_KEY)); } catch (e) { this.d = null; }
    if (!this.d || !this.d.patients) { this.d = seed(); this.save(); }
    return this.d;
  },
  save() { try { localStorage.setItem(DB_KEY, JSON.stringify(this.d)); } catch (e) { console.warn('Salvataggio non riuscito', e); } },
  reset() { this.d = seed(); this.save(); },
};
const DB = () => Store.d;
const P = id => DB().patients.find(p => p.id === id);
const T = id => DB().treatments.find(t => t.id === id) || { name: '—', dur: 30, price: 0, color: '#94a3b8' };
const O = id => DB().operators.find(o => o.id === id) || { name: '—', color: '#94a3b8' };
const pName = p => p ? `${p.nome} ${p.cognome}` : 'Paziente rimosso';
const apptsOf = (date) => DB().appts.filter(a => a.date === date).sort((a, b) => a.time.localeCompare(b.time));
const apptsPatient = pid => DB().appts.filter(a => a.patientId === pid).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

/* ---------- logica agenda ---------- */
function isOpen(iso) { return DB().settings.openDays.includes(fromISO(iso).getDay()); }

function isFree(date, time, dur, opId, ignoreId) {
  const s = DB().settings, a0 = t2m(time), a1 = a0 + dur;
  if (!isOpen(date)) return false;
  if (a0 < t2m(s.openFrom) || a1 > t2m(s.openTo)) return false;
  if (s.lunchFrom && a0 < t2m(s.lunchTo) && a1 > t2m(s.lunchFrom)) return false;
  return !DB().appts.some(a => a.id !== ignoreId && a.date === date && a.operatorId === opId && ATTIVI(a.status)
    && a0 < t2m(a.time) + a.dur && a1 > t2m(a.time));
}

/* Slot liberi in una data per un trattamento. Ogni slot ha un punteggio "IA":
   premia gli orari attaccati ad altri appuntamenti (meno buchi in agenda). */
function freeSlots(date, treatmentId, opId) {
  const s = DB().settings, tr = T(treatmentId), out = [];
  if (!isOpen(date)) return out;
  const ops = DB().operators.filter(o => (!opId || o.id === opId) && (!tr.ops || tr.ops.includes(o.id)));
  const today = date === todayISO(), nm = nowMin();
  for (const o of ops) {
    const day = DB().appts.filter(a => a.date === date && a.operatorId === o.id && ATTIVI(a.status));
    for (let m = t2m(s.openFrom); m + tr.dur <= t2m(s.openTo); m += s.slot) {
      if (today && m < nm + 30) continue;
      const time = m2t(m);
      if (!isFree(date, time, tr.dur, o.id)) continue;
      let score = 0;
      if (day.some(a => t2m(a.time) + a.dur === m)) score += 2;
      if (day.some(a => t2m(a.time) === m + tr.dur)) score += 2;
      if (m === t2m(s.openFrom) || m === t2m(s.lunchTo)) score += 1;
      out.push({ date, time, operatorId: o.id, score });
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

/* Prossimi slot consigliati su più giorni */
function nextSlots(treatmentId, fromDate, max = 6, opId) {
  const res = [];
  for (let i = 0; i < 30 && res.length < max; i++) {
    const day = freeSlots(addDays(fromDate || todayISO(), i), treatmentId, opId);
    const seen = new Set();
    const best = day.sort((a, b) => b.score - a.score || a.time.localeCompare(b.time))
      .filter(x => !seen.has(x.time) && seen.add(x.time)).slice(0, 2)
      .sort((a, b) => a.time.localeCompare(b.time));
    res.push(...best);
  }
  return res.slice(0, max);
}

/* Stima del rischio di mancata presentazione (0-100) con spiegazione */
function noShowRisk(a) {
  const hist = DB().appts.filter(x => x.patientId === a.patientId && x.id !== a.id && (x.date < a.date));
  const ns = hist.filter(x => x.status === 'noshow').length;
  const ann = hist.filter(x => x.status === 'annullato').length;
  const ok = hist.filter(x => x.status === 'completato').length;
  let r = 8; const why = [];
  if (ns) { r += Math.min(45, ns * 22); why.push(`${ns} mancata/e presentazione/i in passato`); }
  if (ann > 1) { r += 10; why.push(`${ann} annullamenti`); }
  if (!hist.length) { r += 12; why.push('paziente nuovo'); }
  if (ok >= 4 && !ns) { r -= 5; }
  if (a.status === 'attesa' || a.status === 'richiesta') { r += 15; why.push('non ancora confermato'); }
  if (!a.reminderSent) { r += 8; why.push('promemoria non inviato'); }
  const m = t2m(a.time); if (m < 9 * 60 + 30 || m >= 18 * 60) { r += 5; why.push('orario scomodo'); }
  r = Math.max(2, Math.min(95, r));
  return { score: r, level: r >= 45 ? 'alto' : r >= 25 ? 'medio' : 'basso', why };
}

/* Pazienti da richiamare per igiene (oltre 6 mesi) */
function recallsDue() {
  const today = todayISO(), out = [];
  for (const p of DB().patients) {
    const ap = DB().appts.filter(a => a.patientId === p.id);
    if (ap.some(a => a.date >= today && ATTIVI(a.status) && a.treatmentId === 'igiene')) continue;
    const last = ap.filter(a => a.treatmentId === 'igiene' && a.status === 'completato').map(a => a.date).sort().pop();
    const months = last ? Math.floor(diffDays(today, last) / 30) : null;
    if (!last || months >= 6) out.push({ patient: p, last, months });
  }
  return out.sort((a, b) => (b.months ?? 99) - (a.months ?? 99));
}

function balance(pid) {
  const due = DB().appts.filter(a => a.patientId === pid && a.status === 'completato').reduce((s, a) => s + (a.price ?? T(a.treatmentId).price), 0);
  const paid = DB().payments.filter(x => x.patientId === pid).reduce((s, x) => s + x.amount, 0);
  return { due, paid, open: Math.max(0, due - paid) };
}

function waLink(tel, text) {
  let n = String(tel || '').replace(/\D/g, ''); if (n.length <= 10) n = '39' + n;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

function icsDownload(a) {
  const s = DB().settings, tr = T(a.treatmentId);
  const dt = (date, min) => date.replace(/-/g, '') + 'T' + m2t(min).replace(':', '') + '00';
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DentAgenda//IT', 'BEGIN:VEVENT', `UID:${a.id}@dentagenda`,
    `DTSTART:${dt(a.date, t2m(a.time))}`, `DTEND:${dt(a.date, t2m(a.time) + a.dur)}`,
    `SUMMARY:${tr.name} - ${s.studioName}`, `LOCATION:${s.address}`, 'BEGIN:VALARM', 'TRIGGER:-PT24H', 'ACTION:DISPLAY', 'DESCRIPTION:Promemoria appuntamento', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const l = document.createElement('a'); l.href = url; l.download = 'appuntamento.ics'; l.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- dati dimostrativi ---------- */
function seed() {
  let sd = 20261125; const rnd = () => { sd |= 0; sd = sd + 0x6D2B79F5 | 0; let t = Math.imul(sd ^ sd >>> 15, 1 | sd); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const today = todayISO();
  const settings = {
    studioName: 'Studio Dentistico Sorriso', address: 'Via Roma 24, 95100 Catania', phone: '095 123 4567', whatsapp: '3331234567',
    email: 'info@studiosorriso.example', openDays: [1, 2, 3, 4, 5, 6], openFrom: '09:00', openTo: '19:00', lunchFrom: '13:00', lunchTo: '14:30', slot: 15,
    ai: { provider: 'local', key: '', model: '' },
  };
  const operators = [
    { id: 'dr1', name: 'Dott. Marco Bianchi', role: 'Odontoiatra', color: '#0d9488' },
    { id: 'dr2', name: 'Dott.ssa Laura Conti', role: 'Ortodonzia e conservativa', color: '#6366f1' },
    { id: 'ig1', name: 'Sara Greco', role: 'Igienista dentale', color: '#f59e0b' },
  ];
  const D = ['dr1', 'dr2'];
  const treatments = [
    { id: 'visita', name: 'Prima visita', dur: 30, price: 50, color: '#0ea5e9', ops: D, online: true },
    { id: 'controllo', name: 'Visita di controllo', dur: 15, price: 30, color: '#38bdf8', ops: D, online: true },
    { id: 'igiene', name: 'Igiene professionale', dur: 45, price: 80, color: '#f59e0b', ops: ['ig1'], online: true },
    { id: 'otturazione', name: 'Otturazione', dur: 45, price: 120, color: '#3b82f6', ops: D },
    { id: 'devitalizzazione', name: 'Devitalizzazione', dur: 60, price: 250, color: '#a855f7', ops: ['dr1'] },
    { id: 'estrazione', name: 'Estrazione', dur: 30, price: 100, color: '#f97316', ops: ['dr1'] },
    { id: 'sbiancamento', name: 'Sbiancamento', dur: 60, price: 250, color: '#ec4899', ops: ['ig1'], online: true },
    { id: 'impianto', name: 'Impianto', dur: 90, price: 1200, color: '#14b8a6', ops: ['dr1'] },
    { id: 'corona', name: 'Corona in ceramica', dur: 60, price: 600, color: '#eab308', ops: D },
    { id: 'ortodonzia', name: 'Controllo ortodontico', dur: 15, price: 60, color: '#6366f1', ops: ['dr2'], online: true },
    { id: 'rx', name: 'Radiografia panoramica', dur: 15, price: 40, color: '#64748b', ops: D },
    { id: 'bambini', name: 'Visita pediatrica', dur: 30, price: 40, color: '#84cc16', ops: ['dr2'], online: true },
    { id: 'urgenza', name: 'Urgenza', dur: 30, price: 70, color: '#ef4444', ops: D, online: true },
  ];
  const nomi = ['Giulia', 'Luca', 'Francesca', 'Alessandro', 'Chiara', 'Matteo', 'Sara', 'Davide', 'Elena', 'Andrea', 'Martina', 'Simone', 'Valentina', 'Giorgio', 'Paola', 'Roberto', 'Anna', 'Stefano', 'Federica', 'Antonio', 'Silvia', 'Marco', 'Laura', 'Giuseppe', 'Rosa', 'Pietro'];
  const cognomi = ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Costa', 'Giordano', 'Mancini', 'Rizzo', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana', 'Santoro', 'Mariani', 'Rinaldi', 'Caruso', 'Ferrara', 'Galli', 'Leone'];
  const allergie = ['', '', '', '', '', '', '', '', '', 'Penicillina', 'Lattice', '', '', 'Anestetici locali (articaina)', '', '', 'Nichel', ''];
  const anam = ['', '', '', '', '', 'Ipertensione in terapia', '', '', '', 'Diabete tipo 2', '', '', 'Terapia anticoagulante', '', '', 'Fumatore', '', '', 'Bruxismo notturno', ''];
  const patients = Array.from({ length: 78 }, (_, i) => {
    const n = nomi[i % 26], cg = cognomi[(i + 5 * Math.floor(i / 26)) % 26];
    const teeth = {}; const st = ['carie', 'otturazione', 'otturazione', 'corona', 'devitalizzato', 'mancante', 'impianto', 'estrarre'];
    const k = Math.floor(rnd() * 5); for (let j = 0; j < k; j++) teeth[pick([16, 17, 26, 27, 36, 37, 46, 47, 14, 24, 35, 45, 11, 21, 18, 48])] = pick(st);
    const y = 1950 + Math.floor(rnd() * 60), bm = 1 + Math.floor(rnd() * 12), bd = 1 + Math.floor(rnd() * 28);
    return {
      id: 'p' + (i + 1), nome: n, cognome: cg, nascita: `${y}-${pad(bm)}-${pad(bd)}`,
      tel: '3' + String(300000000 + Math.floor(rnd() * 99999999)), email: `${norm(n)}.${norm(cg)}@email.example`,
      allergie: pick(allergie), anamnesi: pick(anam), note: '', teeth, privacy: true, createdAt: addDays(today, -Math.floor(rnd() * 700) - 30),
    };
  });
  // un paziente compie gli anni oggi (per mostrare gli auguri automatici)
  const t = new Date(); patients[4].nascita = `1988-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  patients[0].tel = '3330001111'; // paziente demo per il portale

  const appts = [], payments = [], notes = [];
  const common = ['controllo', 'otturazione', 'visita', 'otturazione', 'controllo', 'estrazione', 'devitalizzazione', 'corona', 'rx', 'ortodonzia', 'ortodonzia', 'impianto', 'bambini'];
  const nm = nowMin();
  for (let off = -50; off <= 12; off++) {
    const date = addDays(today, off); if (!settings.openDays.includes(fromISO(date).getDay())) continue;
    const sat = fromISO(date).getDay() === 6;
    for (const o of operators) {
      let m = t2m('09:00') + pick([0, 0, 15, 30]);
      const end = sat ? t2m('13:00') : t2m('19:00');
      while (m < end) {
        const pool = o.id === 'ig1' ? ['igiene', 'igiene', 'igiene', 'sbiancamento'] : common.filter(id => treatments.find(x => x.id === id).ops.includes(o.id));
        const trId = pick(pool), tr = treatments.find(x => x.id === trId);
        if (m < t2m('14:30') && m + tr.dur > t2m('13:00')) { m = t2m('14:30'); continue; }
        if (m + tr.dur > end) break;
        if (rnd() < (off > 3 ? 0.45 : 0.72)) {
          const p = pick(o.id === 'ig1' ? patients.slice(0, 52) : patients); let status;
          if (off < 0) { const r = rnd(); status = r < 0.86 ? 'completato' : r < 0.93 ? 'noshow' : 'annullato'; }
          else if (off === 0) status = m + tr.dur <= nm ? 'completato' : m <= nm + 20 ? 'arrivato' : 'confermato';
          else status = rnd() < 0.6 ? 'confermato' : 'attesa';
          if (!appts.some(a => a.date === date && a.patientId === p.id)) {
            const a = { id: uid(), patientId: p.id, operatorId: o.id, treatmentId: tr.id, date, time: m2t(m), dur: tr.dur, price: tr.price, status, note: '', reminderSent: off <= 1 && rnd() < 0.7, source: 'studio' };
            appts.push(a);
            if (status === 'completato' && rnd() < 0.94) payments.push({ id: uid(), patientId: p.id, date, amount: tr.price, method: pick(['Carta', 'Contanti', 'Carta', 'Bonifico']), desc: tr.name });
          }
        }
        m += tr.dur + pick([0, 0, 15, 15, 30, 45]);
      }
    }
  }
  // igiene "storica" per alcuni pazienti: genera i richiami
  patients.forEach((p, i) => {
    if (i >= 52 && i % 3 !== 0) appts.push({ id: uid(), patientId: p.id, operatorId: 'ig1', treatmentId: 'igiene', date: addDays(today, -(200 + Math.floor(rnd() * 200))), time: '10:00', dur: 45, price: 80, status: 'completato', note: '', reminderSent: true, source: 'studio' });
  });
  // un paio di richieste dal portale pazienti
  const req = nextSlotsSeed(appts, settings, addDays(today, 2));
  appts.push({ id: uid(), patientId: 'p3', operatorId: 'dr1', treatmentId: 'visita', date: req.date, time: req.time, dur: 30, price: 50, status: 'richiesta', note: 'Richiesta dal portale: dolore al molare in basso a destra', reminderSent: false, source: 'online' });

  notes.push({ id: uid(), patientId: 'p1', date: addDays(today, -20), operatorId: 'dr1', text: 'Otturazione in composito su 36, anestesia locale senza complicazioni. Consigliato controllo a 6 mesi.' });
  notes.push({ id: uid(), patientId: 'p1', date: addDays(today, -160), operatorId: 'ig1', text: 'Igiene professionale. Lieve gengivite nel settore inferiore, istruzioni di igiene orale e uso dello scovolino.' });

  const stock = [
    { id: uid(), name: 'Guanti in nitrile M (conf. 100)', qty: 14, min: 10, unit: 'conf.' },
    { id: uid(), name: 'Mascherine chirurgiche (conf. 50)', qty: 6, min: 8, unit: 'conf.' },
    { id: uid(), name: 'Anestetico articaina 1:100.000', qty: 35, min: 20, unit: 'fiale' },
    { id: uid(), name: 'Composito A2', qty: 3, min: 4, unit: 'siringhe' },
    { id: uid(), name: 'Aspirasaliva monouso', qty: 400, min: 200, unit: 'pz' },
    { id: uid(), name: 'Buste per sterilizzazione', qty: 150, min: 100, unit: 'pz' },
    { id: uid(), name: 'Pasta per profilassi', qty: 2, min: 3, unit: 'vasetti' },
  ];
  const waitlist = [
    { id: uid(), patientId: 'p7', treatmentId: 'igiene', pref: 'Pomeriggio, dopo le 16', createdAt: addDays(today, -3) },
    { id: uid(), patientId: 'p12', treatmentId: 'otturazione', pref: 'Il prima possibile', createdAt: addDays(today, -1) },
  ];
  const quotes = [
    { id: uid(), patientId: 'p2', date: addDays(today, -6), status: 'inviato', items: [{ treatmentId: 'impianto', tooth: '36', price: 1200 }, { treatmentId: 'corona', tooth: '36', price: 600 }, { treatmentId: 'rx', tooth: '', price: 40 }] },
    { id: uid(), patientId: 'p9', date: addDays(today, -15), status: 'accettato', items: [{ treatmentId: 'devitalizzazione', tooth: '46', price: 250 }, { treatmentId: 'corona', tooth: '46', price: 600 }] },
  ];
  return { settings, operators, treatments, patients, appts, payments, notes, stock, waitlist, quotes, messages: [], version: 1 };
}
function nextSlotsSeed(appts, s, from) {
  for (let i = 0; i < 10; i++) {
    const date = addDays(from, i); if (!s.openDays.includes(fromISO(date).getDay())) continue;
    for (let m = t2m('09:00'); m < t2m('12:30'); m += 15)
      if (!appts.some(a => a.date === date && a.operatorId === 'dr1' && m < t2m(a.time) + a.dur && m + 30 > t2m(a.time))) return { date, time: m2t(m) };
  }
  return { date: from, time: '09:00' };
}
