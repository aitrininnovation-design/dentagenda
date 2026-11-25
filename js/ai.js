/* DentAgenda — strumenti IA
   1) Motore locale (gratuito, offline, nessun dato esce dal browser): capisce richieste in italiano,
      prenota, cerca slot, genera messaggi, fa triage e riepiloghi.
   2) IA generativa opzionale e gratuita (Gemini / Groq / OpenRouter, con chiave gratuita)
      per risposte libere e riscrittura dei testi. Si configura in Impostazioni. */
'use strict';

const AI_PROVIDERS = {
  local: { label: 'Solo motore locale (offline, nessuna chiave)', needsKey: false },
  gemini: { label: 'Google Gemini (chiave gratuita da aistudio.google.com)', needsKey: true, model: 'gemini-2.5-flash' },
  groq: { label: 'Groq (chiave gratuita da console.groq.com)', needsKey: true, url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' },
  openrouter: { label: 'OpenRouter (modelli gratuiti, chiave da openrouter.ai)', needsKey: true, url: 'https://openrouter.ai/api/v1/chat/completions', model: 'meta-llama/llama-3.3-70b-instruct:free' },
};

const SINONIMI = {
  igiene: ['igiene', 'pulizia', 'detartrasi', 'ablazione', 'tartaro'],
  otturazione: ['otturazione', 'carie', 'otturare'],
  devitalizzazione: ['devitalizzazione', 'devitalizzare', 'canalare', 'endodonzia'],
  estrazione: ['estrazione', 'estrarre', 'togliere il dente', 'dente del giudizio'],
  sbiancamento: ['sbiancamento', 'sbiancare', 'denti bianchi'],
  impianto: ['impianto', 'implantologia'],
  corona: ['corona', 'capsula'],
  ortodonzia: ['ortodon', 'apparecchio', 'allineatori'],
  rx: ['radiografia', 'panoramica', 'lastra'],
  bambini: ['bambin', 'pediatric', 'figlio', 'figlia'],
  urgenza: ['urgenza', 'urgente', 'emergenza'],
  controllo: ['controllo', 'check'],
  visita: ['prima visita', 'visita'],
};

const POSTOP = {
  estrazione: ['Mordi la garza per 30 minuti; non sciacquare per 24 ore.', 'Ghiaccio sulla guancia a intervalli di 10 minuti nelle prime ore.', 'Cibi morbidi e freddi il primo giorno; niente fumo e alcol per 48 ore.', 'Non toccare la zona con lingua o dita; spazzola gli altri denti normalmente.', 'Chiamaci se il sanguinamento non si ferma o compare febbre.'],
  impianto: ['Ghiaccio a intervalli nelle prime 6 ore; dormi con la testa sollevata.', 'Dieta morbida e tiepida per 3-4 giorni; non masticare sul lato operato.', 'Assumi i farmaci esattamente come prescritto dal dentista.', 'Niente fumo: rallenta la guarigione e mette a rischio l\'impianto.', 'Sciacqui con collutorio alla clorexidina dal giorno successivo, se indicato.'],
  igiene: ['Una lieve sensibilità per 1-2 giorni è normale.', 'Evita cibi e bevande coloranti (caffè, tè, vino rosso) per 24 ore.', 'Usa spazzolino morbido e filo o scovolino ogni giorno.', 'Prossima seduta consigliata tra 6 mesi.'],
  sbiancamento: ['Per 48 ore "dieta bianca": niente caffè, tè, vino rosso, sughi, fumo.', 'La sensibilità al freddo è temporanea: usa un dentifricio desensibilizzante.', 'Evita bevande molto fredde o molto calde per 2 giorni.'],
  otturazione: ['Aspetta la fine dell\'anestesia prima di mangiare, per non morderti.', 'Una leggera sensibilità al caldo/freddo può durare qualche giorno.', 'Se senti il dente "alto" quando chiudi, chiamaci per una regolazione.'],
  devitalizzazione: ['Il dente può essere indolenzito per alcuni giorni: è normale.', 'Evita di masticare cibi duri su quel lato fino alla ricostruzione definitiva.', 'Assumi l\'antidolorifico solo se necessario e secondo indicazione.', 'Contattaci in caso di gonfiore o dolore intenso.'],
};

const AI = {
  cfg() { return DB().settings.ai || { provider: 'local' }; },
  cloud() { const c = this.cfg(), p = AI_PROVIDERS[c.provider]; return !!p && c.provider !== 'local' && (!p.needsKey || !!c.key); },
  label() { return this.cloud() ? AI_PROVIDERS[this.cfg().provider].label.split(' (')[0] : 'Motore locale'; },

  /* ---------- chiamata all'IA generativa ---------- */
  async llm(system, messages, maxTokens = 700) {
    const c = this.cfg(), p = AI_PROVIDERS[c.provider]; if (!this.cloud()) throw new Error('IA cloud non configurata');
    const model = c.model || p.model;
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 30000);
    try {
      if (c.provider === 'gemini') {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key },
          body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: maxTokens, temperature: 0.5 } }),
        });
        const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'Errore ' + r.status);
        return (j.candidates?.[0]?.content?.parts || []).map(x => x.text).join('').trim();
      }
      const headers = { 'Content-Type': 'application/json' }; if (c.key) headers.Authorization = 'Bearer ' + c.key;
      const r = await fetch(p.url, { method: 'POST', signal: ctl.signal, headers, body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages], max_tokens: maxTokens, temperature: 0.5 }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'Errore ' + r.status);
      return (j.choices?.[0]?.message?.content || '').trim();
    } finally { clearTimeout(to); }
  },

  /* ---------- comprensione del testo (locale) ---------- */
  parseDate(text) {
    const t = norm(text), today = todayISO();
    if (/\bdopodomani\b/.test(t)) return addDays(today, 2);
    if (/\bdomani\b/.test(t)) return addDays(today, 1);
    if (/\b(oggi|stamattina|stasera|pomeriggio di oggi)/.test(t)) return today;
    if (/\bieri\b/.test(t)) return addDays(today, -1);
    let m = t.match(/\b(?:tra|fra)\s+(\d+)\s+giorn/); if (m) return addDays(today, +m[1]);
    m = t.match(/\b(?:tra|fra)\s+(\d+|una|due|tre)\s+settiman/); if (m) return addDays(today, 7 * ({ una: 1, due: 2, tre: 3 }[m[1]] || +m[1]));
    m = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
    if (m) { let y = m[3] ? +m[3] : new Date().getFullYear(); if (y < 100) y += 2000; let iso = `${y}-${pad(+m[2])}-${pad(+m[1])}`; if (!m[3] && iso < today) iso = `${y + 1}-${pad(+m[2])}-${pad(+m[1])}`; return iso; }
    m = t.match(new RegExp('\\b(\\d{1,2})\\s+(' + MESI.join('|') + ')'));
    if (m) { const y = new Date().getFullYear(); let iso = `${y}-${pad(MESI.indexOf(m[2]) + 1)}-${pad(+m[1])}`; if (iso < today) iso = `${y + 1}${iso.slice(4)}`; return iso; }
    for (let i = 0; i < 7; i++) if (new RegExp('\\b' + norm(GIORNI[i]) + '\\b').test(t)) {
      let n = (i - new Date().getDay() + 7) % 7; if (n === 0) n = 7; if (/prossim/.test(t) && n < 3) n += 7; return addDays(today, n);
    }
    if (/prossima settimana|settimana prossima/.test(t)) return addDays(today, 7);
    return null;
  },
  parseTime(text) {
    const t = norm(text);
    let m = t.match(/\b(?:alle|all'|ore|h)\s*(\d{1,2})(?:[:.,](\d{2}))?/) || t.match(/\b(\d{1,2})[:.](\d{2})\b/);
    if (!m) return null;
    let h = +m[1]; const mi = +(m[2] || 0); if (h > 23 || mi > 59) return null;
    if (h < 8 || (/pomeriggio|sera/.test(t) && h < 12)) h += 12;
    return `${pad(h)}:${pad(mi)}`;
  },
  findPatients(text) {
    const w = norm(text).split(/[^a-z0-9]+/);
    return DB().patients.map(p => ({ p, s: (w.includes(norm(p.cognome)) ? 2 : 0) + (w.includes(norm(p.nome)) ? 1 : 0) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  },
  findPatient(text) {
    const r = this.findPatients(text); if (!r.length) return null;
    if (r.length === 1 || r[0].s > r[1].s) return r[0].p;
    return null;
  },
  findTreatment(text) {
    const t = norm(text);
    for (const [id, keys] of Object.entries(SINONIMI)) if (keys.some(k => t.includes(k)) && DB().treatments.some(x => x.id === id)) return T(id);
    return DB().treatments.find(x => t.includes(norm(x.name))) || null;
  },

  /* ---------- messaggi ai pazienti ---------- */
  message(kind, x = {}) {
    const s = DB().settings, p = x.patient, a = x.appt, n = p ? p.nome : '{nome}';
    const quando = a ? `${fmtLong(a.date)} alle ${a.time}` : '';
    const tr = a ? T(a.treatmentId).name.toLowerCase() : '';
    switch (kind) {
      case 'promemoria': return `Gentile ${n}, le ricordiamo l'appuntamento per ${tr} di ${quando} presso ${s.studioName}, ${s.address}. Risponda SÌ per confermare oppure ci chiami allo ${s.phone} per spostarlo. Grazie!`;
      case 'conferma': return `Gentile ${n}, il suo appuntamento per ${tr} è confermato per ${quando}. La aspettiamo in ${s.address}. ${s.studioName}`;
      case 'richiamo': return `Gentile ${n}, ${x.months ? `sono passati ${x.months} mesi dall'ultima seduta di igiene` : 'è il momento giusto per una seduta di igiene e controllo'}. Prevenire è il modo migliore per mantenere il sorriso in salute: vuole che le riserviamo un appuntamento? Può rispondere a questo messaggio o chiamarci allo ${s.phone}. ${s.studioName}`;
      case 'postop': { const k = a && POSTOP[a.treatmentId] ? a.treatmentId : 'estrazione'; return `Gentile ${n}, ecco le indicazioni dopo il trattamento di oggi:\n` + POSTOP[k].map(r => '• ' + r).join('\n') + `\nPer qualsiasi dubbio siamo allo ${s.phone}. ${s.studioName}`; }
      case 'auguri': return `Tanti auguri di buon compleanno, ${n}! 🎂 Tutto lo staff di ${s.studioName} le augura una giornata piena di sorrisi.`;
      case 'noshow': return `Gentile ${n}, oggi non l'abbiamo vista all'appuntamento${a ? ' delle ' + a.time : ''}. Speriamo vada tutto bene! Ci contatti allo ${s.phone} per fissare una nuova data. ${s.studioName}`;
      case 'preventivo': return `Gentile ${n}, le ricordiamo il preventivo che le abbiamo preparato${x.total ? ' (' + euro(x.total) + ')' : ''}. Siamo a disposizione per chiarimenti e per valutare insieme pagamenti dilazionati. ${s.studioName} — ${s.phone}`;
      case 'recensione': return `Gentile ${n}, grazie per averci scelto! Se si è trovato/a bene, una breve recensione su Google ci aiuterebbe molto. Grazie di cuore dallo staff di ${s.studioName}.`;
      case 'attesa': return `Gentile ${n}, si è liberato un posto${x.slot ? ' ' + fmtLong(x.slot.date) + ' alle ' + x.slot.time : ''} per ${x.treatment ? x.treatment.name.toLowerCase() : 'il suo trattamento'}. Lo vuole? Risponda entro oggi e glielo riserviamo. ${s.studioName}`;
      case 'saldo': return `Gentile ${n}, dai nostri registri risulta un saldo aperto di ${euro(x.amount)}. Può regolarlo al prossimo appuntamento o con bonifico. Per qualsiasi chiarimento: ${s.phone}. ${s.studioName}`;
    }
    return '';
  },
  /* Riscrittura con IA generativa. Il nome del paziente NON viene inviato: è sostituito da {nome}. */
  async improve(text, tone, patient) {
    const safe = patient ? text.split(patient.nome).join('{nome}').split(patient.cognome).join('') : text;
    const out = await this.llm('Sei l\'assistente di segreteria di uno studio dentistico italiano. Riscrivi il messaggio per il paziente con tono ' + tone + ', adatto a WhatsApp/SMS, massimo 420 caratteri. Mantieni data, ora, indirizzo, telefono e il segnaposto {nome} esattamente come sono. Rispondi solo con il testo del messaggio.', [{ role: 'user', content: safe }], 350);
    return patient ? out.split('{nome}').join(patient.nome) : out;
  },

  /* ---------- riepiloghi ---------- */
  briefing(date = todayISO()) {
    const ap = apptsOf(date).filter(a => ATTIVI(a.status)), s = [];
    if (!isOpen(date)) return ['Oggi lo studio è chiuso.'];
    const prev = ap.reduce((t, a) => t + (a.price ?? T(a.treatmentId).price), 0);
    s.push(`<b>${ap.length} appuntamenti</b> in agenda, incasso previsto <b>${euro(prev)}</b>.`);
    const first = ap.find(a => a.status !== 'completato'); if (first) s.push(`Prossimo: <b>${esc(pName(P(first.patientId)))}</b> alle ${first.time} (${esc(T(first.treatmentId).name)}).`);
    const risk = ap.filter(a => a.status !== 'completato' && a.status !== 'arrivato' && noShowRisk(a).level === 'alto');
    if (risk.length) s.push(`⚠️ <b>${risk.length}</b> a rischio assenza: ${risk.map(a => esc(pName(P(a.patientId))) + ' (' + a.time + ')').join(', ')}. Conviene una telefonata.`);
    const all = ap.filter(a => { const p = P(a.patientId); return a.status !== 'completato' && p && (p.allergie || p.anamnesi); }).slice(0, 5);
    if (all.length) s.push(`🩺 Attenzione clinica: ${all.map(a => { const p = P(a.patientId); return esc(pName(p)) + ' — ' + esc([p.allergie && 'allergia ' + p.allergie, p.anamnesi].filter(Boolean).join(', ')); }).join('; ')}.`);
    const req = DB().appts.filter(a => a.status === 'richiesta').length; if (req) s.push(`📥 <b>${req}</b> richiesta/e online da approvare.`);
    const dom = apptsOf(addDays(date, 1)).filter(a => ATTIVI(a.status) && !a.reminderSent).length; if (dom) s.push(`📨 <b>${dom}</b> promemoria da inviare per domani.`);
    const low = DB().stock.filter(x => x.qty <= x.min); if (low.length) s.push(`📦 Scorte in esaurimento: ${low.map(x => esc(x.name)).join(', ')}.`);
    const free = DB().operators.map(o => { const used = ap.filter(a => a.operatorId === o.id).reduce((t, a) => t + a.dur, 0); return { o, used }; }).sort((a, b) => a.used - b.used)[0];
    if (free && DB().waitlist.length) s.push(`💡 ${esc(free.o.name)} ha ancora spazio oggi: ci sono <b>${DB().waitlist.length}</b> pazienti in lista d'attesa da proporre.`);
    const bday = DB().patients.filter(p => p.nascita && p.nascita.slice(5) === date.slice(5)); if (bday.length) s.push(`🎂 Compleanno di ${bday.map(p => esc(pName(p))).join(', ')}: invia gli auguri dalla sezione Comunicazioni.`);
    return s;
  },
  patientSummary(p) {
    const ap = apptsPatient(p.id), done = ap.filter(a => a.status === 'completato'), fut = ap.filter(a => a.date >= todayISO() && ATTIVI(a.status)).reverse();
    const b = balance(p.id), ns = ap.filter(a => a.status === 'noshow').length, L = [];
    L.push(`${pName(p)}, ${age(p.nascita)} anni, paziente dal ${fmtDate(p.createdAt)}.`);
    L.push(p.allergie || p.anamnesi ? `⚠️ Da ricordare: ${[p.allergie && 'allergia a ' + p.allergie, p.anamnesi].filter(Boolean).join('; ')}.` : 'Nessuna allergia o patologia segnalata.');
    const teeth = Object.entries(p.teeth || {}).filter(([, v]) => v !== 'sano');
    if (teeth.length) L.push('Odontogramma: ' + teeth.map(([k, v]) => `${k} ${DENTI_STATI[v].label.toLowerCase()}`).join(', ') + '.');
    const todo = teeth.filter(([, v]) => v === 'carie' || v === 'estrarre'); if (todo.length) L.push(`Da trattare: ${todo.map(([k, v]) => k + ' (' + DENTI_STATI[v].label.toLowerCase() + ')').join(', ')}.`);
    if (done.length) { const cnt = {}; done.forEach(a => cnt[T(a.treatmentId).name] = (cnt[T(a.treatmentId).name] || 0) + 1); L.push(`${done.length} sedute completate (${Object.entries(cnt).map(([k, v]) => v + '× ' + k.toLowerCase()).join(', ')}). Ultima visita: ${fmtDate(done[0].date)}.`); }
    L.push(fut.length ? `Prossimo appuntamento: ${fmtLong(fut[0].date)} alle ${fut[0].time} (${T(fut[0].treatmentId).name.toLowerCase()}).` : 'Nessun appuntamento futuro in agenda.');
    const lastIg = done.find(a => a.treatmentId === 'igiene'); if (!lastIg || diffDays(todayISO(), lastIg.date) > 180) L.push('Igiene da richiamare (oltre 6 mesi o mai eseguita).');
    if (ns) L.push(`Affidabilità: ${ns} mancata/e presentazione/i.`);
    L.push(b.open > 0 ? `Saldo aperto: ${euro(b.open)}.` : 'Pagamenti in regola.');
    return L.join('\n');
  },
  /* Riordina una nota clinica dettata. Con IA cloud produce formato strutturato; in locale ripulisce il testo. */
  async tidyNote(text) {
    if (this.cloud()) {
      try { return await this.llm('Sei un assistente per odontoiatri. Riordina la nota clinica dettata in italiano corretto e sintetico, con le voci: Motivo, Esame obiettivo, Trattamento eseguito, Indicazioni. Non inventare nulla che non sia nel testo; ometti le voci senza contenuto. Solo testo, niente markdown.', [{ role: 'user', content: text }], 400); } catch (e) { toast('IA cloud non raggiungibile, uso il motore locale'); }
    }
    const ab = { 'ott\\.': 'otturazione', 'devit\\.': 'devitalizzazione', 'anest\\.': 'anestesia', 'rx': 'radiografia', 'pz': 'paziente', 'ctrl': 'controllo', 'estr\\.': 'estrazione' };
    let t = ' ' + text.trim() + ' ';
    for (const [k, v] of Object.entries(ab)) t = t.replace(new RegExp('(\\s)' + k + '(?=\\s|[,.;])', 'gi'), '$1' + v);
    t = t.trim().replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').replace(/(^|[.!?]\s+)([a-zà-ù])/g, (m, a, b) => a + b.toUpperCase());
    if (!/[.!?]$/.test(t)) t += '.';
    return t;
  },

  /* ---------- triage sintomi (portale pazienti) ---------- */
  triage(text) {
    const t = norm(text);
    const has = (...k) => k.some(x => t.includes(x));
    if (has('respirare', 'deglutire', 'ingoiare', 'emorragia', 'non si ferma', 'svenut', 'trauma al viso', 'incidente') || (has('gonfi') && has('febbre', 'occhio', 'collo')))
      return { level: 'rosso', title: 'Possibile emergenza', text: 'Gonfiore con febbre o difficoltà a deglutire/respirare, sanguinamento che non si ferma o un trauma importante richiedono assistenza immediata. Chiama subito lo studio; se è chiuso o i sintomi sono gravi rivolgiti al Pronto Soccorso o chiama il 112/118.' };
    if (has('caduto il dente', 'dente caduto', 'dente rotto', 'rotto un dente', 'spezzat', 'scheggiat', 'avulsion', 'botta', 'ascesso', 'pus', 'gonfi', 'dolore forte', 'fortissimo', 'non dormo', 'non riesco a dormire', 'insopportabile', 'pulsa'))
      return { level: 'arancione', title: 'Urgenza: visita entro 24 ore', text: 'Dai sintomi sembra opportuno vederti presto. Nel frattempo: non applicare calore, puoi assumere l\'antidolorifico che usi abitualmente seguendo il foglietto illustrativo, e se un dente è caduto per un trauma conservalo nel latte o nella saliva e vieni subito.' };
    if (has('male', 'mal di', 'dolore', 'duole', 'fastidio', 'sensibil', 'otturazione saltata', 'saltata', 'sanguin', 'gengiv', 'afta', 'capsula', 'staccat', 'apparecchio'))
      return { level: 'giallo', title: 'Da controllare nei prossimi giorni', text: 'Non sembra un\'emergenza, ma è bene farsi vedere. Mantieni una buona igiene, evita cibi molto caldi, freddi o duri sulla zona e prenota una visita.' };
    return null;
  },

  /* ---------- assistente dello studio ---------- */
  async studioAsk(q, history = []) {
    const t = norm(q), today = todayISO();
    const date = this.parseDate(q), time = this.parseTime(q), pat = this.findPatient(q), tr = this.findTreatment(q);
    const many = this.findPatients(q);
    const btn = (label, js) => `<button class="chip" onclick="${js}">${label}</button>`;

    // prenotazione
    if (/\b(prenota|fissa|inserisci|metti|aggiungi|segna)/.test(t) && (pat || many.length || tr)) {
      if (!pat) return many.length > 1 ? `Ho trovato più pazienti: ${many.slice(0, 4).map(x => esc(pName(x.p))).join(', ')}. Scrivi nome e cognome completi.` : 'Per quale paziente? Scrivi nome e cognome (deve essere già in anagrafica, oppure creane uno nuovo dalla sezione Pazienti).';
      const trt = tr || T('controllo');
      if (date && time) {
        const slot = freeSlots(date, trt.id).find(s => s.time === time);
        if (slot) { const a = createAppt({ patientId: pat.id, treatmentId: trt.id, operatorId: slot.operatorId, date, time, status: 'confermato' }); App.refresh(); return `✅ Fatto. <b>${esc(pName(pat))}</b> — ${esc(trt.name)} ${fmtHuman(date)} alle ${time} con ${esc(O(a.operatorId).name)}.<br>${btn('Apri in agenda', `App.go('agenda','${date}')`)} ${btn('Invia conferma WhatsApp', `App.msgFor('conferma','${a.id}')`)}`; }
        const alt = freeSlots(date, trt.id).sort((a, b) => Math.abs(t2m(a.time) - t2m(time)) - Math.abs(t2m(b.time) - t2m(time))).slice(0, 4);
        return `Alle ${time} di ${fmtHuman(date)} non c'è posto per ${esc(trt.name.toLowerCase())} (${trt.dur} min). ` + (alt.length ? 'Orari più vicini:<br>' + alt.map(s => btn(`${s.time} · ${esc(O(s.operatorId).name)}`, `App.quickBook('${pat.id}','${trt.id}','${s.date}','${s.time}','${s.operatorId}')`)).join(' ') : 'Quel giorno è pieno o lo studio è chiuso.');
      }
      const sl = date ? freeSlots(date, trt.id).sort((a, b) => b.score - a.score).slice(0, 5).sort((a, b) => a.time.localeCompare(b.time)) : nextSlots(trt.id, today, 5);
      return sl.length ? `Slot consigliati per <b>${esc(pName(pat))}</b> — ${esc(trt.name)}:<br>` + sl.map(s => btn(`${fmtHuman(s.date)} ${s.time} · ${esc(O(s.operatorId).name.split(' ').pop())}`, `App.quickBook('${pat.id}','${trt.id}','${s.date}','${s.time}','${s.operatorId}')`)).join(' ') : 'Non trovo slot liberi in quel periodo.';
    }
    // slot liberi
    if (/\b(slot|liber[oi]|disponibil|posto|buco|buchi|quando posso)/.test(t)) {
      const trt = tr || T('controllo');
      const sl = date ? freeSlots(date, trt.id) : nextSlots(trt.id, today, 8);
      if (!sl.length) return `Nessuno slot libero per ${esc(trt.name.toLowerCase())} ${date ? fmtHuman(date) : 'nei prossimi giorni'}.`;
      const uniq = []; sl.forEach(s => { if (!uniq.some(u => u.date === s.date && u.time === s.time)) uniq.push(s); });
      return `Slot liberi per <b>${esc(trt.name)}</b> (${trt.dur} min)${date ? ' ' + fmtHuman(date) : ''}:<br>` + uniq.slice(0, 14).map(s => `<span class="chip static">${date ? '' : fmtHuman(s.date) + ' '}${s.time}</span>`).join(' ') + (pat ? '' : '<br><small>Per prenotare scrivi ad es. «prenota Rossi domani alle 10 per igiene».</small>');
    }
    // annulla
    if (/\b(annulla|cancella|disdici)/.test(t) && pat) {
      const a = DB().appts.filter(x => x.patientId === pat.id && x.date >= today && ATTIVI(x.status) && (!date || x.date === date)).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time))[0];
      if (!a) return `Non trovo appuntamenti futuri per ${esc(pName(pat))}.`;
      return `Vuoi annullare l'appuntamento di <b>${esc(pName(pat))}</b> di ${fmtHuman(a.date)} alle ${a.time} (${esc(T(a.treatmentId).name)})?<br>${btn('Sì, annulla', `App.setStatus('${a.id}','annullato');App.chatSay('studio','Appuntamento annullato. Controllo la lista d\\'attesa per riempire il buco.')`)}`;
    }
    // agenda del giorno
    if (/\b(agenda|appuntament|giornata|programma|chi viene|chi c'e)/.test(t) && !pat) {
      const d = date || today, ap = apptsOf(d).filter(a => ATTIVI(a.status));
      if (!ap.length) return `Nessun appuntamento ${fmtHuman(d)}.`;
      return `<b>Agenda di ${fmtHuman(d)}</b> — ${ap.length} appuntamenti:<br>` + ap.map(a => `${a.time} · ${esc(pName(P(a.patientId)))} — ${esc(T(a.treatmentId).name)} <small>(${esc(O(a.operatorId).name.split(' ').pop())}, ${STATI[a.status].label.toLowerCase()})</small>`).join('<br>') + `<br>${btn('Apri agenda', `App.go('agenda','${d}')`)}`;
    }
    // briefing
    if (/\b(riepilogo|riassunto|briefing|situazione|come va|buongiorno)/.test(t) && !pat) return '<b>Riepilogo di oggi</b><br>• ' + this.briefing().join('<br>• ');
    // richiami
    if (/\b(richiam|igiene scadut|da richiamare)/.test(t)) { const r = recallsDue(); return `<b>${r.length} pazienti da richiamare</b> per igiene:<br>` + r.slice(0, 8).map(x => `${esc(pName(x.patient))} — ${x.months ? x.months + ' mesi fa' : 'mai fatta'}`).join('<br>') + `<br>${btn('Apri Comunicazioni', "App.go('comunicazioni')")}`; }
    // promemoria
    if (/\b(promemoria|reminder|ricorda)/.test(t)) { const d = date || addDays(today, 1); const ap = apptsOf(d).filter(a => ATTIVI(a.status) && !a.reminderSent); return ap.length ? `${ap.length} promemoria da inviare per ${fmtHuman(d)}:<br>` + ap.map(a => `${a.time} ${esc(pName(P(a.patientId)))} ${btn('WhatsApp', `App.msgFor('promemoria','${a.id}')`)}`).join('<br>') : `Tutti i promemoria per ${fmtHuman(d)} sono già stati inviati.`; }
    // incassi
    if (/\b(incass|fatturat|guadagn|entrate|soldi)/.test(t)) {
      const mo = today.slice(0, 7), pm = DB().payments; const m = pm.filter(x => x.date.startsWith(mo)).reduce((s, x) => s + x.amount, 0), og = pm.filter(x => x.date === today).reduce((s, x) => s + x.amount, 0);
      const open = DB().patients.map(p => balance(p.id).open).reduce((a, b) => a + b, 0);
      return `Incassi di oggi: <b>${euro(og)}</b><br>Incassi del mese: <b>${euro(m)}</b><br>Crediti verso pazienti: <b>${euro(open)}</b><br>${btn('Apri statistiche', "App.go('statistiche')")}`;
    }
    // rischio no-show
    if (/\b(rischio|no.?show|assenz|non si present|buca)/.test(t)) { const d = date || today; const ap = apptsOf(d).filter(a => ['confermato', 'attesa', 'richiesta'].includes(a.status)).map(a => ({ a, r: noShowRisk(a) })).sort((x, y) => y.r.score - x.r.score).slice(0, 6); return ap.length ? `<b>Rischio assenza ${fmtHuman(d)}</b>:<br>` + ap.map(x => `${x.a.time} ${esc(pName(P(x.a.patientId)))} — <b>${x.r.score}%</b> <small>${esc(x.r.why.join(', '))}</small>`).join('<br>') : 'Nessun appuntamento da valutare.'; }
    // magazzino
    if (/\b(scort|magazzin|ordin|material)/.test(t)) { const low = DB().stock.filter(x => x.qty <= x.min); return low.length ? '<b>Da riordinare:</b><br>' + low.map(x => `${esc(x.name)} — ${x.qty} ${esc(x.unit)} (minimo ${x.min})`).join('<br>') : 'Tutte le scorte sono sopra la soglia minima.'; }
    // lista d'attesa
    if (/lista d.?attesa/.test(t)) return DB().waitlist.length ? '<b>Lista d\'attesa:</b><br>' + DB().waitlist.map(w => `${esc(pName(P(w.patientId)))} — ${esc(T(w.treatmentId).name)} <small>(${esc(w.pref)})</small>`).join('<br>') : 'La lista d\'attesa è vuota.';
    // scheda paziente
    if (pat) return `<b>${esc(pName(pat))}</b> · ${esc(pat.tel)}<br>` + esc(this.patientSummary(pat)).replace(/\n/g, '<br>') + `<br>${btn('Apri scheda', `App.go('paziente','${pat.id}')`)}`;
    if (many.length > 1) return 'Quale paziente? ' + many.slice(0, 5).map(x => btn(esc(pName(x.p)), `App.go('paziente','${x.p.id}')`)).join(' ');

    // domanda libera → IA generativa se configurata
    if (this.cloud()) {
      try {
        const ctx = `Oggi è ${fmtLong(today)} ${today}. Studio: ${DB().settings.studioName}. Orari ${DB().settings.openFrom}-${DB().settings.openTo}. Appuntamenti oggi: ${apptsOf(today).filter(a => ATTIVI(a.status)).length}. Listino: ${DB().treatments.map(x => `${x.name} ${x.price}€ ${x.dur}min`).join('; ')}.`;
        const out = await this.llm('Sei l\'assistente gestionale di uno studio dentistico italiano. Rispondi in italiano, in modo breve e pratico. Aiuti la segreteria e i dentisti con organizzazione, comunicazione ai pazienti, testi, procedure. Non fare diagnosi definitive. Contesto: ' + ctx, [...history.slice(-6), { role: 'user', content: q }]);
        return esc(out).replace(/\n/g, '<br>');
      } catch (e) { return `⚠️ L'IA generativa non ha risposto (${esc(e.message)}). Controlla la configurazione in Impostazioni.<br>` + this.help(); }
    }
    return 'Non ho capito la richiesta. ' + this.help();
  },
  help() {
    return 'Posso aiutarti così:<br>• «prenota Giulia Rossi domani alle 10 per igiene»<br>• «primo slot libero per otturazione»<br>• «agenda di giovedì»<br>• «annulla l\'appuntamento di Luca Russo»<br>• «chi è Giulia Rossi»<br>• «promemoria per domani» · «pazienti da richiamare»<br>• «incassi del mese» · «rischio assenze oggi» · «scorte»<br><small>Per domande libere e riscrittura dei testi attiva un\'IA gratuita in Impostazioni.</small>';
  },

  /* ---------- assistente dei pazienti ---------- */
  async patientAsk(q, patient, history = []) {
    const t = norm(q), s = DB().settings, today = todayISO();
    const btn = (label, js) => `<button class="chip" onclick="${js}">${label}</button>`;
    const tri = this.triage(q);
    if (tri) {
      const col = { rosso: '#dc2626', arancione: '#ea580c', giallo: '#ca8a04' }[tri.level];
      const sl = tri.level !== 'giallo' ? nextSlots('urgenza', today, 3) : nextSlots('visita', today, 3);
      const trId = tri.level !== 'giallo' ? 'urgenza' : 'visita';
      return `<div class="triage" style="border-color:${col}"><b style="color:${col}">${tri.title}</b><br>${tri.text}</div>` +
        `<a class="chip" href="tel:${esc(s.phone.replace(/\s/g, ''))}">📞 Chiama ${esc(s.phone)}</a> ` +
        (tri.level !== 'rosso' && sl.length ? '<br>Primi posti disponibili:<br>' + sl.map(x => btn(`${fmtHuman(x.date)} ${x.time}`, `Portal.pick('${trId}','${x.date}','${x.time}','${x.operatorId}')`)).join(' ') : '') +
        '<br><small>Queste indicazioni sono orientative e non sostituiscono la valutazione del dentista.</small>';
    }
    if (/\b(prenot|appuntamento|fissare|visita|posto|disponibil)/.test(t) && !/\b(annull|disdi|spost|miei|mio)/.test(t)) {
      const tr = this.findTreatment(q), date = this.parseDate(q);
      if (!tr) return 'Volentieri! Per quale motivo vuoi venire?<br>' + DB().treatments.filter(x => x.online).map(x => btn(esc(x.name), `App.chatSend('paziente','Vorrei prenotare ${esc(x.name).toLowerCase()}')`)).join(' ');
      if (!tr.online) return `Per ${esc(tr.name.toLowerCase())} serve prima una valutazione del dentista: prenota una visita e definiremo insieme il piano di cura.<br>${btn('Prenota una visita', "App.chatSend('paziente','Vorrei prenotare una prima visita')")}`;
      const sl = date ? freeSlots(date, tr.id).filter((x, i, a) => a.findIndex(y => y.time === x.time) === i).slice(0, 8) : nextSlots(tr.id, today, 6);
      return sl.length ? `Ecco i primi orari per <b>${esc(tr.name)}</b> (${tr.dur} min, ${euro(tr.price)}). Tocca per prenotare:<br>` + sl.map(x => btn(`${fmtHuman(x.date)} ${x.time}`, `Portal.pick('${tr.id}','${x.date}','${x.time}','${x.operatorId}')`)).join(' ') : `Non ci sono posti ${date ? fmtHuman(date) : 'a breve'}. Prova un altro giorno o chiamaci allo ${esc(s.phone)}.`;
    }
    if (/\b(miei appuntamenti|mio appuntamento|quando ho|prossimo appuntamento|annull|disdi|spost)/.test(t)) {
      if (!patient) return `Per vedere o modificare i tuoi appuntamenti accedi con il tuo numero di telefono.<br>${btn('Accedi', "App.go('p-appuntamenti')")}`;
      const ap = DB().appts.filter(a => a.patientId === patient.id && a.date >= today && ATTIVI(a.status));
      return ap.length ? 'I tuoi prossimi appuntamenti:<br>' + ap.map(a => `• ${fmtLong(a.date)} alle ${a.time} — ${esc(T(a.treatmentId).name)}`).join('<br>') + `<br>${btn('Gestisci (conferma, sposta, annulla)', "App.go('p-appuntamenti')")}` : `Non hai appuntamenti in programma. ${btn('Prenota ora', "App.go('p-prenota')")}`;
    }
    if (/\b(orari|aperti|aperto|apertura|chiusi|chiusura|quando siete)/.test(t)) return `Siamo aperti ${s.openDays.map(d => GIORNI[d]).join(', ')}, dalle ${s.openFrom} alle ${s.lunchFrom} e dalle ${s.lunchTo} alle ${s.openTo}.`;
    if (/\b(dove|indirizzo|come arriv|parchegg|sede)/.test(t)) return `Ci trovi in <b>${esc(s.address)}</b>.<br><a class="chip" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}">🗺️ Apri in Google Maps</a>`;
    if (/\b(telefono|numero|chiamar|contatt|email|whatsapp)/.test(t)) return `Telefono: <b>${esc(s.phone)}</b><br>Email: ${esc(s.email)}<br><a class="chip" target="_blank" rel="noopener" href="${waLink(s.whatsapp, 'Buongiorno, vorrei informazioni')}">💬 Scrivici su WhatsApp</a>`;
    if (/\b(prezz|cost|quanto|tariff|listino)/.test(t)) { const tr = this.findTreatment(q); return tr ? `${esc(tr.name)}: <b>${euro(tr.price)}</b> (durata circa ${tr.dur} minuti). Il preventivo definitivo viene fatto dopo la visita.` : '<b>Listino indicativo</b><br>' + DB().treatments.map(x => `${esc(x.name)}: ${euro(x.price)}`).join('<br>') + '<br><small>Il preventivo definitivo viene fatto dopo la visita.</small>'; }
    if (/\b(pagament|rate|finanziament|carta|bancomat|assicurazion|convenzion)/.test(t)) return 'Accettiamo contanti, carte, bancomat e bonifico. Per i piani di cura più importanti è possibile concordare pagamenti dilazionati. Rilasciamo fattura valida per la detrazione fiscale del 19%.';
    if (/\b(dopo|post|cosa devo fare|posso mangiare|istruzioni)/.test(t)) { const tr = this.findTreatment(q); const k = tr && POSTOP[tr.id] ? tr.id : null; return k ? `<b>Dopo ${esc(tr.name.toLowerCase())}</b><br>` + POSTOP[k].map(x => '• ' + x).join('<br>') : `Trovi tutte le indicazioni nella sezione dedicata. ${btn('Istruzioni post-trattamento', "App.go('p-info')")}`; }
    if (/\b(paura|ansia|terror|fobia|agitat)/.test(t)) return 'È più comune di quanto pensi, e siamo abituati ad accompagnare i pazienti ansiosi. Ti spieghiamo ogni passaggio, lavoriamo con anestesia efficace e possiamo fermarci in qualsiasi momento. Segnalalo quando prenoti: riserveremo più tempo per te. 💙';
    if (/\b(ciao|salve|buongiorno|buonasera|hey)/.test(t)) return `Ciao${patient ? ' ' + esc(patient.nome) : ''}! Sono l'assistente virtuale di ${esc(s.studioName)}. Posso aiutarti a prenotare, darti informazioni su orari e prezzi, o orientarti se hai un problema ai denti.`;
    if (/\b(grazie|perfetto|ottimo)/.test(t)) return 'Di nulla! Se ti serve altro sono qui. 😊';
    if (this.cloud()) {
      try {
        const out = await this.llm(`Sei l'assistente virtuale di ${s.studioName}, studio dentistico in ${s.address}, tel ${s.phone}. Orari: ${s.openFrom}-${s.lunchFrom} e ${s.lunchTo}-${s.openTo}, chiuso la domenica. Listino: ${DB().treatments.map(x => `${x.name} ${x.price}€`).join('; ')}. Rispondi in italiano, cordiale, massimo 90 parole. Dai informazioni generali di igiene e salute orale; NON fare diagnosi e NON prescrivere farmaci: per sintomi invita a prenotare una visita o chiamare lo studio, e in caso di emergenza il 112. Per prenotare invita a usare il pulsante "Prenota".`, [...history.slice(-6), { role: 'user', content: q }], 300);
        return esc(out).replace(/\n/g, '<br>');
      } catch (e) { /* ricade sulla risposta locale */ }
    }
    return `Non sono sicuro di aver capito. Posso aiutarti con:<br>${btn('Prenotare', "App.chatSend('paziente','Vorrei prenotare')")} ${btn('Orari', "App.chatSend('paziente','Quali sono gli orari?')")} ${btn('Prezzi', "App.chatSend('paziente','Quanto costa?')")} ${btn('Ho mal di denti', "App.chatSend('paziente','Ho mal di denti')")}<br>Oppure chiamaci allo ${esc(s.phone)}.`;
  },
};

/* Crea un appuntamento (usato da agenda, assistente e portale) */
function createAppt(x) {
  const tr = T(x.treatmentId);
  const a = { id: uid(), patientId: x.patientId, operatorId: x.operatorId, treatmentId: x.treatmentId, date: x.date, time: x.time, dur: x.dur || tr.dur, price: x.price ?? tr.price, status: x.status || 'confermato', note: x.note || '', reminderSent: false, source: x.source || 'studio' };
  DB().appts.push(a); Store.save(); return a;
}

/* Dettatura vocale (gratuita, integrata nel browser: Chrome/Edge) */
const Voice = {
  rec: null,
  supported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); },
  toggle(target, btn) {
    if (!this.supported()) return toast('Dettatura non disponibile in questo browser: usa Chrome o Edge');
    if (this.rec) { this.rec.stop(); return; }
    const R = window.SpeechRecognition || window.webkitSpeechRecognition, r = new R();
    r.lang = 'it-IT'; r.continuous = true; r.interimResults = false;
    r.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) target.value = (target.value + ' ' + e.results[i][0].transcript).trim(); };
    r.onend = () => { this.rec = null; btn && btn.classList.remove('rec'); };
    r.onerror = e => { toast('Microfono: ' + e.error); };
    r.start(); this.rec = r; btn && btn.classList.add('rec');
  },
};
