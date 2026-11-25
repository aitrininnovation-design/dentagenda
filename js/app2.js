/* DentAgenda — comunicazioni, lista d'attesa, cassa, magazzino, statistiche, impostazioni */
'use strict';

Object.assign(App.views, {
  /* ---------- COMUNICAZIONI ---------- */
  comunicazioni() {
    const today = todayISO(), tom = addDays(today, 1), d = DB();
    const sec = (title, sub, rows) => `<div class="card"><h3>${title}</h3><p class="muted">${sub}</p>${rows.length ? rows.join('') : '<p class="muted">✓ Niente da fare.</p>'}</div>`;
    const row = (p, sub, btn) => `<div class="row"><div class="grow"><a href="#paziente/${p.id}"><b>${esc(pName(p))}</b></a><div class="sub">${sub}</div></div><div class="acts">${btn}</div></div>`;
    const rem = apptsOf(tom).filter(a => ATTIVI(a.status) && !a.reminderSent && P(a.patientId));
    const req = d.appts.filter(a => a.status === 'richiesta' && P(a.patientId));
    const rec = recallsDue().slice(0, 12);
    const bday = d.patients.filter(p => p.nascita && p.nascita.slice(5) === today.slice(5));
    const ns = d.appts.filter(a => a.status === 'noshow' && diffDays(today, a.date) <= 7 && P(a.patientId) && !d.appts.some(x => x.patientId === a.patientId && x.date >= today && ATTIVI(x.status)));
    const deb = d.patients.map(p => ({ p, b: balance(p.id).open })).filter(x => x.b > 0).sort((a, b) => b.b - a.b).slice(0, 8);
    const rev = apptsOf(today).filter(a => a.status === 'completato' && P(a.patientId));
    const qs = d.quotes.filter(q => q.status === 'inviato' && P(q.patientId));
    const sent = d.messages.slice(-8).reverse();
    return `<div class="page-head"><div><h1>Comunicazioni</h1><p class="muted">L'IA prepara il messaggio giusto per ogni paziente: tu controlli e invii con un clic via WhatsApp, SMS o email.</p></div></div>
    <div class="grid2"><div>
      ${sec('📥 Richieste online da approvare', 'Prenotazioni arrivate dal portale pazienti.', req.map(a => row(P(a.patientId), `${esc(T(a.treatmentId).name)} · ${fmtHuman(a.date)} ${a.time}${a.note ? ' · “' + esc(a.note) + '”' : ''}`, `<button class="btn sm ok" onclick="App.approve('${a.id}')">Accetta e conferma</button><button class="btn sm ghost" onclick="App.setStatus('${a.id}','annullato')">Rifiuta</button>`)))}
      ${sec(`📨 Promemoria per domani <button class="btn sm ghost" onclick="App.allReminded()">Segna tutti inviati</button>`, `Appuntamenti di ${fmtLong(tom)} non ancora ricordati. I promemoria riducono le assenze.`, rem.map(a => { const r = noShowRisk(a); return row(P(a.patientId), `${a.time} · ${esc(T(a.treatmentId).name)} · <span class="risk ${r.level}">rischio ${r.score}%</span>`, `<button class="btn sm" onclick="App.msgFor('promemoria','${a.id}')">Prepara</button>`); }))}
      ${sec('🪥 Richiami igiene', 'Pazienti senza seduta di igiene da oltre 6 mesi e senza appuntamento futuro.', rec.map(x => row(x.patient, x.months ? `ultima igiene ${x.months} mesi fa` : 'nessuna igiene registrata', `<button class="btn sm" onclick="App.msg('richiamo',{patient:P('${x.patient.id}'),months:${x.months || 0}})">Prepara</button>`)))}
    </div><div>
      ${sec('🎂 Compleanni di oggi', 'Un piccolo gesto che fidelizza.', bday.map(p => row(p, `compie ${age(p.nascita)} anni`, `<button class="btn sm" onclick="App.msg('auguri',{patient:P('${p.id}')})">Auguri</button>`)))}
      ${sec('🚫 Assenze da ricontattare', 'Non presentati negli ultimi 7 giorni, senza nuovo appuntamento.', ns.map(a => row(P(a.patientId), `${fmtDate(a.date)} ${a.time} · ${esc(T(a.treatmentId).name)}`, `<button class="btn sm" onclick="App.msgFor('noshow','${a.id}')">Prepara</button>`)))}
      ${sec('📄 Preventivi in attesa di risposta', 'Un sollecito gentile aumenta le accettazioni.', qs.map(q => { const tot = q.items.reduce((s, i) => s + i.price, 0); return row(P(q.patientId), `${fmtDate(q.date)} · ${euro(tot)}`, `<button class="btn sm" onclick="App.msg('preventivo',{patient:P('${q.patientId}'),total:${tot}})">Sollecita</button>`); }))}
      ${sec('💶 Saldi aperti', 'Pazienti con prestazioni non ancora saldate.', deb.map(x => row(x.p, `saldo ${euro(x.b)}`, `<button class="btn sm" onclick="App.msg('saldo',{patient:P('${x.p.id}'),amount:${x.b}})">Prepara</button>`)))}
      ${sec('⭐ Richiedi una recensione', 'Pazienti che hanno completato una seduta oggi.', rev.map(a => row(P(a.patientId), esc(T(a.treatmentId).name), `<button class="btn sm ghost" onclick="App.msg('recensione',{patient:P('${a.patientId}')})">Chiedi</button>`)))}
      ${sent.length ? `<div class="card"><h3>Ultimi messaggi preparati</h3>${sent.map(m => `<div class="row"><div class="grow">${esc(pName(P(m.patientId)))}<div class="sub">${esc(m.kind)} · ${esc(m.channel)} · ${fmtDate(m.date)}</div></div></div>`).join('')}</div>` : ''}
    </div></div>`;
  },

  /* ---------- LISTA D'ATTESA ---------- */
  attesa() {
    const w = DB().waitlist;
    return `<div class="page-head"><div><h1>Lista d'attesa</h1><p class="muted">Quando si libera un posto, l'IA propone gli orari migliori per ogni paziente in lista.</p></div><div><button class="btn" onclick="App.waitForm()">＋ Aggiungi</button></div></div>
      <div class="card">${w.length ? w.map(x => {
      const p = P(x.patientId), sl = nextSlots(x.treatmentId, todayISO(), 4);
      return `<div class="row top"><div class="grow"><a href="#paziente/${x.patientId}"><b>${esc(pName(p))}</b></a><div class="sub">${esc(T(x.treatmentId).name)} · preferenza: ${esc(x.pref || '—')} · in lista dal ${fmtDate(x.createdAt)}</div>
        <div class="chips">✨ ${sl.map(s => `<button class="chip" onclick="App.quickBook('${x.patientId}','${x.treatmentId}','${s.date}','${s.time}','${s.operatorId}')">${fmtHuman(s.date)} ${s.time}</button>`).join('') || '<small>nessuno slot</small>'}</div></div>
        <div class="acts">${sl[0] ? `<button class="btn sm ghost" onclick="App.msg('attesa',{patient:P('${x.patientId}'),treatment:T('${x.treatmentId}'),slot:{date:'${sl[0].date}',time:'${sl[0].time}'}})">📨 Proponi</button>` : ''}<button class="btn sm ghost" onclick="App.delWait('${x.id}')">Rimuovi</button></div></div>`;
    }).join('') : '<p class="muted">Nessun paziente in lista d\'attesa.</p>'}</div>`;
  },

  /* ---------- CASSA ---------- */
  cassa() {
    const d = DB(), today = todayISO(), mo = today.slice(0, 7);
    const pay = [...d.payments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25);
    const sum = f => d.payments.filter(f).reduce((s, x) => s + x.amount, 0);
    const open = d.patients.reduce((s, p) => s + balance(p.id).open, 0);
    return `<div class="page-head"><div><h1>Preventivi e cassa</h1></div><div class="toolbar"><button class="btn ghost" onclick="App.payForm()">＋ Pagamento</button><button class="btn" onclick="App.quoteForm()">＋ Preventivo</button></div></div>
      <div class="kpis"><div class="kpi"><span class="kic">💶</span><div><b>${euro(sum(x => x.date === today))}</b><small>incassato oggi</small></div></div><div class="kpi"><span class="kic">📆</span><div><b>${euro(sum(x => x.date.startsWith(mo)))}</b><small>incassato nel mese</small></div></div><div class="kpi"><span class="kic">⏳</span><div><b class="neg">${euro(open)}</b><small>crediti da incassare</small></div></div><div class="kpi"><span class="kic">📄</span><div><b>${d.quotes.filter(q => q.status === 'inviato').length}</b><small>preventivi in attesa</small></div></div></div>
      <div class="grid2"><div class="card"><h3>Preventivi</h3>${d.quotes.length ? [...d.quotes].reverse().map(q => App.quoteRow(q, true)).join('') : '<p class="muted">Nessun preventivo.</p>'}</div>
      <div class="card"><h3>Ultimi pagamenti</h3>${pay.map(x => `<div class="row"><div class="time">${fmtDate(x.date)}</div><div class="grow">${esc(pName(P(x.patientId)))}<div class="sub">${esc(x.desc)} · ${esc(x.method)}</div></div><b>${euro(x.amount)}</b></div>`).join('')}</div></div>`;
  },

  /* ---------- MAGAZZINO ---------- */
  magazzino() {
    const st = DB().stock, low = st.filter(x => x.qty <= x.min);
    return `<div class="page-head"><div><h1>Magazzino</h1><p class="muted">${low.length ? `<b class="neg">${low.length} articoli sotto la scorta minima</b>` : 'Tutte le scorte sono a posto'}</p></div><div class="toolbar">${low.length ? '<button class="btn ghost" onclick="App.orderList()">✨ Genera ordine</button>' : ''}<button class="btn" onclick="App.stockForm()">＋ Articolo</button></div></div>
      <div class="card nopad"><table><thead><tr><th>Articolo</th><th>Quantità</th><th>Scorta minima</th><th></th></tr></thead><tbody>${st.map(x => `<tr class="${x.qty <= x.min ? 'lowrow' : ''}"><td><b>${esc(x.name)}</b> ${x.qty <= x.min ? '<span class="badge" style="--c:#ef4444">da riordinare</span>' : ''}</td>
        <td><div class="stepper"><button onclick="App.stockQty('${x.id}',-1)">−</button><b>${x.qty}</b><button onclick="App.stockQty('${x.id}',1)">＋</button> <small>${esc(x.unit)}</small></div></td><td>${x.min}</td><td><button class="link-btn" onclick="App.stockForm('${x.id}')">modifica</button></td></tr>`).join('')}</tbody></table></div>`;
  },

  /* ---------- STATISTICHE ---------- */
  statistiche() {
    const d = DB(), today = todayISO(), s = d.settings;
    const inR = (x, a, b) => { const n = diffDays(today, x); return n >= a && n < b; };
    const rev = (a, b) => d.payments.filter(x => inR(x.date, a, b)).reduce((t, x) => t + x.amount, 0);
    const ap30 = d.appts.filter(a => inR(a.date, 0, 30) && a.date <= today);
    const done = ap30.filter(a => a.status === 'completato'), ns = ap30.filter(a => a.status === 'noshow'), ann = ap30.filter(a => a.status === 'annullato');
    const r30 = rev(0, 30), rPrev = rev(30, 60), delta = rPrev ? Math.round((r30 - rPrev) / rPrev * 100) : 0;
    const nsRate = done.length + ns.length ? Math.round(ns.length / (done.length + ns.length) * 100) : 0;
    let openDays = 0; for (let i = 0; i < 30; i++) if (isOpen(addDays(today, -i))) openDays++;
    const cap = openDays * d.operators.length * (t2m(s.openTo) - t2m(s.openFrom) - (t2m(s.lunchTo) - t2m(s.lunchFrom)));
    const occ = Math.round([...done, ...ns].reduce((t, a) => t + a.dur, 0) / cap * 100);
    const weeks = [7, 6, 5, 4, 3, 2, 1, 0].map(w => ({ l: w ? `-${w} sett.` : 'questa', v: rev(w * 7, w * 7 + 7) }));
    const bars = (rows, fmt = x => x) => { const mx = Math.max(1, ...rows.map(r => r.v)); return rows.map(r => `<div class="hbar"><span>${esc(r.l)}</span><div><i style="width:${r.v / mx * 100}%;background:${r.c || 'var(--brand)'}"></i></div><b>${fmt(r.v)}</b></div>`).join(''); };
    const byTr = {}; done.forEach(a => { byTr[a.treatmentId] = (byTr[a.treatmentId] || 0) + (a.price ?? T(a.treatmentId).price); });
    const trRows = Object.entries(byTr).map(([k, v]) => ({ l: T(k).name, v, c: T(k).color })).sort((a, b) => b.v - a.v).slice(0, 7);
    const opRows = d.operators.map(o => ({ l: o.name, v: done.filter(a => a.operatorId === o.id).length, c: o.color }));
    const dow = [1, 2, 3, 4, 5, 6].map(g => ({ l: GIORNI[g], v: ap30.filter(a => fromISO(a.date).getDay() === g && ATTIVI(a.status)).length }));
    const mxW = Math.max(1, ...weeks.map(w => w.v));
    const tips = [];
    if (nsRate >= 6) tips.push(`Il tasso di assenza è del <b>${nsRate}%</b> (${ns.length} sedute perse, circa ${euro(ns.reduce((t, a) => t + (a.price ?? 0), 0))}). Invia sempre il promemoria il giorno prima e telefona ai pazienti con rischio alto.`);
    else tips.push(`Tasso di assenza contenuto (<b>${nsRate}%</b>): i promemoria stanno funzionando.`);
    const best = [...dow].sort((a, b) => b.v - a.v)[0], worst = [...dow].sort((a, b) => a.v - b.v)[0];
    tips.push(`Il giorno più pieno è <b>${best.l}</b>, il più scarico <b>${worst.l}</b>: proponi ${worst.l} ai pazienti in lista d'attesa e per i richiami di igiene.`);
    if (occ < 65) tips.push(`L'agenda è occupata al <b>${occ}%</b>: ci sono margini. ${recallsDue().length} pazienti sono da richiamare per l'igiene.`);
    if (trRows[0]) tips.push(`Il trattamento che genera più valore è <b>${esc(trRows[0].l)}</b> (${euro(trRows[0].v)} in 30 giorni).`);
    const open = d.patients.reduce((t, p) => t + balance(p.id).open, 0); if (open > 0) tips.push(`Ci sono <b>${euro(open)}</b> di crediti aperti: invia i promemoria di saldo dalla sezione Comunicazioni.`);
    if (delta) tips.push(`Incassi ${delta > 0 ? 'in crescita' : 'in calo'} del <b>${Math.abs(delta)}%</b> rispetto ai 30 giorni precedenti.`);
    return `<div class="page-head"><div><h1>Statistiche</h1><p class="muted">Ultimi 30 giorni</p></div></div>
      <div class="kpis"><div class="kpi"><span class="kic">💶</span><div><b>${euro(r30)}</b><small>incassi ${delta ? `<span class="${delta > 0 ? 'pos' : 'neg'}">${delta > 0 ? '+' : ''}${delta}%</span>` : ''}</small></div></div>
        <div class="kpi"><span class="kic">✅</span><div><b>${done.length}</b><small>sedute completate</small></div></div><div class="kpi"><span class="kic">📈</span><div><b>${occ}%</b><small>occupazione agenda</small></div></div>
        <div class="kpi"><span class="kic">🚫</span><div><b>${nsRate}%</b><small>assenze (${ns.length}) · ${ann.length} annullati</small></div></div><div class="kpi"><span class="kic">🆕</span><div><b>${d.patients.filter(p => inR(p.createdAt, 0, 30)).length}</b><small>nuovi pazienti</small></div></div></div>
      <div class="card ai-card"><h3>✨ Cosa suggerisce l'IA</h3><ul>${tips.map(t => `<li>${t}</li>`).join('')}</ul></div>
      <div class="grid2"><div class="card"><h3>Incassi per settimana</h3><div class="vbars">${weeks.map(w => `<div><b>${w.v ? Math.round(w.v) : ''}</b><i style="height:${w.v / mxW * 100}%"></i><span>${w.l}</span></div>`).join('')}</div></div>
        <div class="card"><h3>Valore per trattamento</h3>${bars(trRows, euro)}</div>
        <div class="card"><h3>Sedute per operatore</h3>${bars(opRows)}</div>
        <div class="card"><h3>Appuntamenti per giorno della settimana</h3>${bars(dow)}</div></div>`;
  },

  /* ---------- IMPOSTAZIONI ---------- */
  impostazioni() {
    const s = DB().settings, ai = s.ai, pr = AI_PROVIDERS[ai.provider] || AI_PROVIDERS.local;
    return `<div class="page-head"><div><h1>Impostazioni</h1></div></div>
    <div class="grid2"><div>
      <div class="card ai-card"><h3>✨ Intelligenza artificiale</h3>
        <p class="muted">Il <b>motore locale</b> è sempre attivo, gratuito e non invia dati a nessuno: prenota, cerca slot, prepara messaggi, fa triage e riepiloghi. Puoi aggiungere un'<b>IA generativa gratuita</b> per le domande libere e per riscrivere i testi.</p>
        <div class="form"><label class="full">Fornitore<select id="s-prov" onchange="App.saveAI(true)">${Object.entries(AI_PROVIDERS).map(([k, v]) => opt(k, v.label, ai.provider)).join('')}</select></label>
        ${pr.needsKey ? `<label class="full">Chiave API (resta solo in questo browser)<input id="s-key" type="password" value="${esc(ai.key)}" placeholder="incolla qui la chiave gratuita" autocomplete="off"></label>` : ''}
        ${ai.provider !== 'local' ? `<label class="full">Modello<input id="s-model" value="${esc(ai.model)}" placeholder="${esc(pr.model)} (predefinito)"></label>` : ''}</div>
        <div class="toolbar"><button class="btn" onclick="App.saveAI()">Salva</button>${ai.provider !== 'local' ? '<button class="btn ghost" onclick="App.testAI()">Prova la connessione</button>' : ''}<span id="s-test" class="muted"></span></div>
        ${ai.provider !== 'local' ? '<div class="alert">🔒 Con un\'IA esterna il testo delle richieste viene inviato al fornitore scelto. L\'app non invia mai nomi, telefoni o cartelle dei pazienti: i messaggi usano il segnaposto {nome} e i riepiloghi sono anonimi. Prima dell\'uso reale con dati sanitari serve comunque una valutazione privacy (GDPR).</div>' : ''}</div>
      <div class="card"><h3>Dati dello studio</h3><div class="form">
        <label class="full">Nome<input id="s-name" value="${esc(s.studioName)}"></label><label class="full">Indirizzo<input id="s-addr" value="${esc(s.address)}"></label>
        <label>Telefono<input id="s-phone" value="${esc(s.phone)}"></label><label>WhatsApp<input id="s-wa" value="${esc(s.whatsapp)}"></label><label class="full">Email<input id="s-email" value="${esc(s.email)}"></label>
        <label>Apertura<input type="time" id="s-from" value="${s.openFrom}"></label><label>Chiusura<input type="time" id="s-to" value="${s.openTo}"></label>
        <label>Inizio pausa<input type="time" id="s-l1" value="${s.lunchFrom}"></label><label>Fine pausa<input type="time" id="s-l2" value="${s.lunchTo}"></label>
        <div class="full"><span class="lbl">Giorni di apertura</span><div class="chips">${[1, 2, 3, 4, 5, 6, 0].map(g => `<label class="chip check"><input type="checkbox" class="s-day" value="${g}" ${s.openDays.includes(g) ? 'checked' : ''}>${GIORNI[g].slice(0, 3)}</label>`).join('')}</div></div></div>
        <div class="toolbar"><button class="btn" onclick="App.saveStudio()">Salva</button></div></div>
      <div class="card"><h3>Backup e dati</h3><p class="muted">Tutti i dati sono salvati solo in questo browser. Esporta un backup per conservarli o spostarli.</p>
        <div class="toolbar"><button class="btn ghost" onclick="App.exportData()">⬇️ Esporta backup</button><label class="btn ghost">⬆️ Importa<input type="file" accept=".json" hidden onchange="App.importData(this)"></label><button class="btn danger" onclick="App.resetDemo()">Ripristina dati demo</button></div></div>
    </div><div>
      <div class="card"><h3>Listino e durate</h3><table class="edit"><thead><tr><th>Trattamento</th><th>Min</th><th>Prezzo €</th><th title="Prenotabile dal portale pazienti">Online</th></tr></thead><tbody>${DB().treatments.map(t => `<tr><td><i class="dot" style="background:${t.color}"></i><input value="${esc(t.name)}" onchange="App.setTr('${t.id}','name',this.value)"></td><td><input type="number" step="5" min="5" value="${t.dur}" onchange="App.setTr('${t.id}','dur',+this.value)"></td><td><input type="number" min="0" value="${t.price}" onchange="App.setTr('${t.id}','price',+this.value)"></td><td><input type="checkbox" ${t.online ? 'checked' : ''} onchange="App.setTr('${t.id}','online',this.checked)"></td></tr>`).join('')}</tbody></table></div>
      <div class="card"><h3>Operatori</h3><table class="edit"><tbody>${DB().operators.map(o => `<tr><td><i class="dot" style="background:${o.color}"></i><input value="${esc(o.name)}" onchange="App.setOp('${o.id}','name',this.value)"></td><td><input value="${esc(o.role)}" onchange="App.setOp('${o.id}','role',this.value)"></td></tr>`).join('')}</tbody></table></div>
    </div></div>`;
  },
});

Object.assign(App, {
  allReminded() { apptsOf(addDays(todayISO(), 1)).forEach(a => a.reminderSent = true); Store.save(); this.refresh(); toast('Promemoria segnati come inviati'); },

  /* lista d'attesa */
  waitForm() {
    const pats = [...DB().patients].sort((x, y) => x.cognome.localeCompare(y.cognome));
    modal('Aggiungi alla lista d\'attesa', `<div class="form"><label class="full">Paziente<select id="w-pat">${pats.map(x => opt(x.id, `${x.cognome} ${x.nome}`)).join('')}</select></label>
      <label class="full">Trattamento<select id="w-tr">${DB().treatments.map(t => opt(t.id, t.name)).join('')}</select></label><label class="full">Preferenze<input id="w-pref" placeholder="es. mattina, dopo le 17, il prima possibile"></label></div>`,
      `<span class="grow"></span><button class="btn" onclick="DB().waitlist.push({id:uid(),patientId:val('w-pat'),treatmentId:val('w-tr'),pref:val('w-pref'),createdAt:todayISO()});Store.save();closeModal();App.refresh()">Aggiungi</button>`);
  },
  delWait(id) { DB().waitlist = DB().waitlist.filter(w => w.id !== id); Store.save(); this.refresh(); },

  /* pagamenti */
  payForm(pid, amount, desc) {
    const pats = [...DB().patients].sort((x, y) => x.cognome.localeCompare(y.cognome));
    modal('Registra pagamento', `<div class="form"><label class="full">Paziente<select id="y-pat">${pats.map(x => opt(x.id, `${x.cognome} ${x.nome}`, pid)).join('')}</select></label>
      <label>Importo €<input type="number" id="y-amt" min="0" step="0.01" value="${amount || ''}"></label><label>Metodo<select id="y-met">${['Carta', 'Contanti', 'Bonifico', 'Assegno', 'Finanziamento'].map(m => opt(m, m)).join('')}</select></label>
      <label class="full">Descrizione<input id="y-desc" value="${esc(desc || 'Acconto')}"></label></div>`,
      `<button class="btn ghost" onclick="closeModal()">Non ora</button><span class="grow"></span><button class="btn" onclick="App.savePay()">Registra</button>`);
  },
  savePay() { const amt = +val('y-amt'); if (!(amt > 0)) return toast('Inserisci un importo valido'); DB().payments.push({ id: uid(), patientId: val('y-pat'), date: todayISO(), amount: amt, method: val('y-met'), desc: val('y-desc') }); Store.save(); closeModal(); this.refresh(); toast('Pagamento registrato'); },

  /* preventivi */
  quoteRow(q, withName) {
    const tot = q.items.reduce((s, i) => s + i.price, 0), col = { bozza: '#94a3b8', inviato: '#f59e0b', accettato: '#22c55e', rifiutato: '#ef4444' }[q.status];
    return `<div class="row"><div class="grow">${withName ? `<b>${esc(pName(P(q.patientId)))}</b>` : ''}<div class="sub">${fmtDate(q.date)} · ${q.items.map(i => esc(T(i.treatmentId).name) + (i.tooth ? ' (' + esc(i.tooth) + ')' : '')).join(', ')}</div></div><b>${euro(tot)}</b><span class="badge" style="--c:${col}">${q.status}</span><button class="btn sm ghost" onclick="App.quoteForm('${q.id}')">Apri</button></div>`;
  },
  quoteForm(id, pid) {
    const q = id ? DB().quotes.find(x => x.id === id) : null;
    this._q = q ? JSON.parse(JSON.stringify(q)) : { id: null, patientId: pid || DB().patients[0].id, date: todayISO(), status: 'bozza', items: [{ treatmentId: 'otturazione', tooth: '', price: T('otturazione').price }] };
    this.quoteRender();
  },
  quoteRender() {
    const q = this._q, pats = [...DB().patients].sort((x, y) => x.cognome.localeCompare(y.cognome)), tot = q.items.reduce((s, i) => s + (+i.price || 0), 0);
    const p = P(q.patientId), teeth = p ? Object.entries(p.teeth || {}).filter(([, v]) => v === 'carie' || v === 'estrarre' || v === 'mancante') : [];
    modal(q.id ? 'Preventivo' : 'Nuovo preventivo', `<div class="form"><label>Paziente<select onchange="App._q.patientId=this.value;App.quoteRender()">${pats.map(x => opt(x.id, `${x.cognome} ${x.nome}`, q.patientId)).join('')}</select></label>
      <label>Stato<select onchange="App._q.status=this.value">${['bozza', 'inviato', 'accettato', 'rifiutato'].map(s => opt(s, s, q.status)).join('')}</select></label></div>
      ${teeth.length ? `<div class="aibox">✨ Dall'odontogramma: ${teeth.map(([n, v]) => `<button class="chip" onclick="App.quoteAdd('${v === 'carie' ? 'otturazione' : v === 'estrarre' ? 'estrazione' : 'impianto'}','${n}')">${n} ${DENTI_STATI[v].label.toLowerCase()} → aggiungi ${v === 'carie' ? 'otturazione' : v === 'estrarre' ? 'estrazione' : 'impianto'}</button>`).join('')}</div>` : ''}
      <table class="edit"><thead><tr><th>Trattamento</th><th>Dente</th><th>Prezzo €</th><th></th></tr></thead><tbody>${q.items.map((it, i) => `<tr><td><select onchange="App._q.items[${i}].treatmentId=this.value;App._q.items[${i}].price=T(this.value).price;App.quoteRender()">${DB().treatments.map(t => opt(t.id, t.name, it.treatmentId)).join('')}</select></td>
        <td><input value="${esc(it.tooth)}" size="3" onchange="App._q.items[${i}].tooth=this.value"></td><td><input type="number" value="${it.price}" onchange="App._q.items[${i}].price=+this.value;App.quoteRender()"></td><td><button class="link-btn" onclick="App._q.items.splice(${i},1);App.quoteRender()">✕</button></td></tr>`).join('')}</tbody></table>
      <div class="toolbar"><button class="btn ghost sm" onclick="App.quoteAdd('controllo','')">＋ Riga</button><span class="grow"></span><b class="total">Totale ${euro(tot)}</b></div>`,
      `${q.id ? `<button class="btn danger" onclick="DB().quotes=DB().quotes.filter(x=>x.id!=='${q.id}');Store.save();closeModal();App.refresh()">Elimina</button>` : ''}<span class="grow"></span><button class="btn ghost" onclick="App.quotePrint()">🖨️ Stampa / PDF</button><button class="btn" onclick="App.quoteSave()">Salva</button>`);
  },
  quoteAdd(tr, tooth) { this._q.items.push({ treatmentId: tr, tooth, price: T(tr).price }); this.quoteRender(); },
  quoteSave() { const q = this._q; if (!q.items.length) return toast('Aggiungi almeno una riga'); if (q.id) Object.assign(DB().quotes.find(x => x.id === q.id), q); else { q.id = uid(); DB().quotes.push(q); } Store.save(); closeModal(); this.refresh(); toast('Preventivo salvato'); },
  quotePrint() {
    const q = this._q, s = DB().settings, p = P(q.patientId), tot = q.items.reduce((t, i) => t + (+i.price || 0), 0);
    const w = window.open('', '_blank'); if (!w) return toast('Consenti i popup per stampare');
    w.document.write(`<html><head><meta charset="utf-8"><title>Preventivo</title><style>body{font-family:system-ui,Arial;margin:40px;color:#111}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin:24px 0}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}td:last-child,th:last-child{text-align:right}.tot{font-size:18px;text-align:right}small{color:#666}</style></head><body>
      <h1>🦷 ${esc(s.studioName)}</h1><small>${esc(s.address)} · ${esc(s.phone)} · ${esc(s.email)}</small><h2>Preventivo di cura</h2><p>Paziente: <b>${esc(pName(p))}</b><br>Data: ${fmtDate(q.date)}</p>
      <table><tr><th>Trattamento</th><th>Dente</th><th>Importo</th></tr>${q.items.map(i => `<tr><td>${esc(T(i.treatmentId).name)}</td><td>${esc(i.tooth)}</td><td>${euro(i.price)}</td></tr>`).join('')}</table>
      <p class="tot">Totale: <b>${euro(tot)}</b></p><small>Preventivo valido 90 giorni. Prestazioni sanitarie esenti IVA ai sensi dell'art. 10 DPR 633/72. Spesa detraibile al 19%.</small><p style="margin-top:60px">Firma per accettazione ______________________</p></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  },

  /* magazzino */
  stockQty(id, n) { const x = DB().stock.find(s => s.id === id); x.qty = Math.max(0, x.qty + n); Store.save(); this.refresh(); },
  stockForm(id) {
    const x = id ? DB().stock.find(s => s.id === id) : { name: '', qty: 0, min: 1, unit: 'pz' };
    modal(id ? 'Modifica articolo' : 'Nuovo articolo', `<div class="form"><label class="full">Nome<input id="k-name" value="${esc(x.name)}"></label><label>Quantità<input type="number" id="k-qty" value="${x.qty}"></label><label>Scorta minima<input type="number" id="k-min" value="${x.min}"></label><label>Unità<input id="k-unit" value="${esc(x.unit)}"></label></div>`,
      `${id ? `<button class="btn danger" onclick="DB().stock=DB().stock.filter(s=>s.id!=='${id}');Store.save();closeModal();App.refresh()">Elimina</button>` : ''}<span class="grow"></span><button class="btn" onclick="App.stockSave('${id || ''}')">Salva</button>`);
  },
  stockSave(id) { const v = { name: val('k-name'), qty: +val('k-qty') || 0, min: +val('k-min') || 0, unit: val('k-unit') || 'pz' }; if (!v.name) return toast('Inserisci il nome'); if (id) Object.assign(DB().stock.find(s => s.id === id), v); else DB().stock.push({ id: uid(), ...v }); Store.save(); closeModal(); this.refresh(); },
  orderList() {
    const low = DB().stock.filter(x => x.qty <= x.min), s = DB().settings;
    const txt = `Buongiorno,\nvorremmo ordinare il seguente materiale per ${s.studioName}:\n\n` + low.map(x => `• ${x.name}: ${Math.max(x.min * 2 - x.qty, 1)} ${x.unit}`).join('\n') + `\n\nConsegna in ${s.address}.\nGrazie, cordiali saluti.`;
    modal('✨ Ordine suggerito', `<p class="muted">Quantità calcolate per riportare ogni articolo al doppio della scorta minima.</p><textarea id="o-text" rows="10" class="msg">${esc(txt)}</textarea>`, `<span class="grow"></span><button class="btn ghost" onclick="navigator.clipboard.writeText(val('o-text'));toast('Copiato')">📋 Copia</button><button class="btn" onclick="location.href='mailto:?subject=Ordine materiale&body='+encodeURIComponent(val('o-text'))">Invia per email</button>`);
  },

  /* impostazioni */
  saveAI(silent) {
    const ai = DB().settings.ai, prev = ai.provider; ai.provider = val('s-prov');
    if (prev === ai.provider) { if ($('#s-key')) ai.key = val('s-key'); if ($('#s-model')) ai.model = val('s-model'); } else { ai.key = ''; ai.model = ''; }
    Store.save(); this.refresh(); if (!silent) toast('Impostazioni IA salvate');
  },
  async testAI() {
    this.saveAI(true); const el = $('#s-test'); el.textContent = 'Provo…';
    try { const r = await AI.llm('Rispondi in italiano con una sola frase breve.', [{ role: 'user', content: 'Saluta lo staff di uno studio dentistico.' }], 60); el.textContent = '✅ ' + r.slice(0, 120); }
    catch (e) { el.textContent = '❌ ' + e.message; }
  },
  saveStudio() {
    const s = DB().settings; Object.assign(s, { studioName: val('s-name'), address: val('s-addr'), phone: val('s-phone'), whatsapp: val('s-wa'), email: val('s-email'), openFrom: val('s-from'), openTo: val('s-to'), lunchFrom: val('s-l1'), lunchTo: val('s-l2') });
    s.openDays = $$('.s-day').filter(c => c.checked).map(c => +c.value); Store.save(); this.refresh(); toast('Dati dello studio salvati');
  },
  setTr(id, k, v) { DB().treatments.find(t => t.id === id)[k] = v; Store.save(); },
  setOp(id, k, v) { DB().operators.find(o => o.id === id)[k] = v; Store.save(); },
  exportData() {
    const copy = JSON.parse(JSON.stringify(DB())); copy.settings.ai.key = '';
    const url = URL.createObjectURL(new Blob([JSON.stringify(copy, null, 1)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `dentagenda-backup-${todayISO()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
  importData(inp) {
    const f = inp.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => { try { const j = JSON.parse(r.result); if (!j.patients || !j.appts || !j.settings) throw 0; if (!confirm('Sostituire tutti i dati attuali con quelli del backup?')) return; Store.d = j; Store.save(); this.refresh(); toast('Backup importato'); } catch (e) { toast('File non valido'); } };
    r.readAsText(f);
  },
  resetDemo() { if (!confirm('Cancellare tutti i dati attuali e ricaricare i dati dimostrativi?')) return; Store.reset(); this.chats = { studio: [], paziente: [] }; this.refresh(); toast('Dati demo ripristinati'); },
});
