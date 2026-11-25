/* DentAgenda — portale pazienti: prenotazione online, i miei appuntamenti, assistente, istruzioni, anamnesi */
'use strict';

const Portal = {
  b: { step: 1 },
  pid: sessionStorage.getItem('dent_pid') || null,
  patient() { return this.pid ? P(this.pid) : null; },
  findByTel(tel) { const n = String(tel).replace(/\D/g, '').slice(-9); return n.length >= 6 ? DB().patients.find(p => String(p.tel).replace(/\D/g, '').slice(-9) === n) : null; },
  login() { const p = this.findByTel(val('l-tel')); if (!p) return toast('Numero non trovato. Prenota online per registrarti.'); this.pid = p.id; sessionStorage.setItem('dent_pid', p.id); App.refresh(); },
  logout() { this.pid = null; sessionStorage.removeItem('dent_pid'); App.refresh(); },
  loginBox(txt) {
    return `<div class="card narrow center"><h3>Accedi</h3><p class="muted">${txt}</p><div class="inline"><input id="l-tel" inputmode="tel" placeholder="Il tuo numero di cellulare" onkeydown="if(event.key==='Enter')Portal.login()"><button class="btn" onclick="Portal.login()">Entra</button></div>
      <p class="muted"><small>Demo: <a href="javascript:void 0" onclick="document.getElementById('l-tel').value='3330001111';Portal.login()">entra come paziente di prova</a>. Nella versione reale l'accesso avviene con un codice inviato via SMS.</small></p></div>`;
  },

  views: {
    'p-home'() {
      const s = DB().settings, p = this.patient(), nx = nextSlots('visita', todayISO(), 1)[0];
      const next = p && DB().appts.filter(a => a.patientId === p.id && a.date >= todayISO() && ATTIVI(a.status)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
      return `<section class="hero"><div><h1>${p ? 'Ciao ' + esc(p.nome) + ' 👋' : 'Il tuo sorriso, senza attese al telefono'}</h1>
        <p>Prenota in un minuto, gestisci i tuoi appuntamenti e chiedi all'assistente virtuale di ${esc(s.studioName)}, 24 ore su 24.</p>
        <div class="toolbar"><button class="btn big" onclick="App.go('p-prenota')">📅 Prenota una visita</button><button class="btn big light" onclick="App.go('p-assistente')">✨ Chiedi all'assistente</button></div>
        ${nx ? `<small>Primo posto disponibile: <b>${fmtHuman(nx.date)} alle ${nx.time}</b></small>` : ''}</div><div class="hero-tooth">🦷</div></section>
      ${next ? `<div class="card ai-card"><h3>Il tuo prossimo appuntamento</h3><p><b>${fmtLong(next.date)} alle ${next.time}</b> — ${esc(T(next.treatmentId).name)} con ${esc(O(next.operatorId).name)}</p><button class="btn ghost sm" onclick="App.go('p-appuntamenti')">Gestisci</button></div>` : ''}
      <div class="tiles">
        <button onclick="App.go('p-prenota')"><span>📅</span><b>Prenota online</b><small>Scegli giorno e ora liberi in tempo reale</small></button>
        <button onclick="App.go('p-appuntamenti')"><span>🗓️</span><b>I miei appuntamenti</b><small>Conferma, sposta o annulla</small></button>
        <button onclick="App.chatSend('paziente','Ho mal di denti')"><span>🚑</span><b>Ho un'urgenza</b><small>L'assistente valuta e ti trova un posto</small></button>
        <button onclick="App.go('p-info')"><span>📋</span><b>Dopo il trattamento</b><small>Cosa fare dopo estrazione, impianto, igiene…</small></button>
        <button onclick="App.go('p-anamnesi')"><span>🩺</span><b>Scheda anamnestica</b><small>Compilala da casa, risparmi tempo in sala d'attesa</small></button>
        <a href="${waLink(s.whatsapp, 'Buongiorno, vorrei informazioni')}" target="_blank" rel="noopener"><span>💬</span><b>WhatsApp</b><small>Scrivi alla segreteria</small></a>
      </div>
      <div class="grid2"><div class="card"><h3>Dove siamo</h3><p>${esc(s.address)}<br>📞 <a href="tel:${esc(s.phone.replace(/\s/g, ''))}">${esc(s.phone)}</a> · ✉️ ${esc(s.email)}</p><a class="chip" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}">🗺️ Indicazioni stradali</a></div>
        <div class="card"><h3>Orari</h3><p>${[1, 2, 3, 4, 5, 6, 0].map(g => `${GIORNI[g]}: <b>${s.openDays.includes(g) ? `${s.openFrom}–${s.lunchFrom} · ${s.lunchTo}–${s.openTo}` : 'chiuso'}</b>`).join('<br>')}</p></div></div>`;
    },

    'p-prenota'() {
      const b = this.b, steps = ['Trattamento', 'Giorno e ora', 'I tuoi dati', 'Fatto'];
      const head = `<div class="page-head"><div><h1>Prenota online</h1></div></div><div class="steps">${steps.map((s, i) => `<div class="${b.step === i + 1 ? 'on' : b.step > i + 1 ? 'done' : ''}"><i>${b.step > i + 1 ? '✓' : i + 1}</i>${s}</div>`).join('')}</div>`;
      if (b.step === 1) return head + `<div class="tiles">${DB().treatments.filter(t => t.online).map(t => `<button onclick="Portal.b={step:2,tr:'${t.id}'};App.refresh()"><span style="color:${t.color}">●</span><b>${esc(t.name)}</b><small>${t.dur} min · ${euro(t.price)}</small></button>`).join('')}</div>
        <p class="muted center">Non sai cosa scegliere? <a href="#p-assistente">Chiedi all'assistente virtuale</a> oppure prenota una <b>prima visita</b>.</p>`;
      const tr = T(b.tr);
      if (b.step === 2) {
        const days = []; for (let i = 0; days.length < 12 && i < 40; i++) { const d = addDays(todayISO(), i); if (isOpen(d)) days.push(d); }
        const slotsOf = d => { const m = new Map(); freeSlots(d, b.tr).sort((x, y) => y.score - x.score).forEach(s => { if (!m.has(s.time)) m.set(s.time, s); }); return [...m.values()].sort((x, y) => x.time.localeCompare(y.time)); };
        if (!b.date) b.date = days.find(d => slotsOf(d).length) || days[0];
        const sl = slotsOf(b.date), best = [...sl].sort((x, y) => y.score - x.score).slice(0, 3).filter(x => x.score > 0).map(x => x.time);
        const part = (l, f) => { const x = sl.filter(f); return x.length ? `<h4>${l}</h4><div class="slots">${x.map(s => `<button class="${best.includes(s.time) ? 'best' : ''}" onclick="Portal.pick('${b.tr}','${s.date}','${s.time}','${s.operatorId}')">${s.time}</button>`).join('')}</div>` : ''; };
        return head + `<div class="card"><h3>${esc(tr.name)} <small class="muted">· ${tr.dur} min · ${euro(tr.price)}</small> <button class="link-btn" onclick="Portal.b={step:1};App.refresh()">cambia</button></h3>
          <div class="days">${days.map(d => `<button class="${d === b.date ? 'on' : ''}" onclick="Portal.b.date='${d}';App.refresh()"><small>${GIORNI[fromISO(d).getDay()].slice(0, 3)}</small><b>${fromISO(d).getDate()}</b><small>${MESI[fromISO(d).getMonth()].slice(0, 3)}</small></button>`).join('')}</div>
          ${sl.length ? part('Mattina', s => s.time < '13:00') + part('Pomeriggio', s => s.time >= '13:00') + '<p class="muted"><small>⭐ = orari consigliati dall\'IA, che aiutano lo studio a ridurre le attese.</small></p>' : `<p class="muted">Nessun orario libero ${fmtHuman(b.date)}. Scegli un altro giorno.</p>`}</div>`;
      }
      if (b.step === 3) {
        const p = this.patient();
        return head + `<div class="card narrow"><div class="summary"><b>${esc(tr.name)}</b><br>${fmtLong(b.date)} alle <b>${b.time}</b> · ${esc(O(b.op).name)}<br><small>${esc(DB().settings.address)}</small></div>
          <div class="form">${p ? `<p class="full">Prenoti come <b>${esc(pName(p))}</b> (${esc(p.tel)}). <button class="link-btn" onclick="Portal.logout()">Non sei tu?</button></p>` : `
            <label>Nome<input id="b-nome" autocomplete="given-name"></label><label>Cognome<input id="b-cognome" autocomplete="family-name"></label>
            <label>Cellulare<input id="b-tel" inputmode="tel" autocomplete="tel"></label><label>Email (facoltativa)<input id="b-email" type="email" autocomplete="email"></label>`}
            <label class="full">Vuoi dirci qualcosa? (facoltativo)<textarea id="b-note" rows="2" placeholder="es. dolore a un dente, ansia dal dentista, esigenze particolari"></textarea></label>
            ${p ? '' : '<label class="full check"><input type="checkbox" id="b-priv"> Acconsento al trattamento dei dati personali per la gestione dell\'appuntamento (informativa privacy dello studio).</label>'}</div>
          <div class="toolbar"><button class="btn ghost" onclick="Portal.b.step=2;App.refresh()">‹ Indietro</button><span class="grow"></span><button class="btn big" onclick="Portal.confirm()">Conferma prenotazione</button></div></div>`;
      }
      const a = DB().appts.find(x => x.id === b.apptId);
      return head + `<div class="card narrow center"><div class="bigcheck">✓</div><h2>Richiesta inviata!</h2><p><b>${esc(tr.name)}</b><br>${fmtLong(b.date)} alle <b>${b.time}</b></p>
        <p class="muted">Lo studio confermerà a breve l'appuntamento con un messaggio. Il giorno prima riceverai un promemoria.</p>
        <div class="toolbar center">${a ? `<button class="btn" onclick="icsDownload(DB().appts.find(x=>x.id==='${a.id}'))">📆 Aggiungi al calendario</button>` : ''}<button class="btn ghost" onclick="App.go('p-appuntamenti')">I miei appuntamenti</button><button class="btn ghost" onclick="App.go('p-anamnesi')">Compila l'anamnesi</button></div></div>`;
    },

    'p-appuntamenti'() {
      const p = this.patient();
      if (!p) return `<div class="page-head"><div><h1>I miei appuntamenti</h1></div></div>` + this.loginBox('Inserisci il numero di cellulare che hai lasciato allo studio.');
      const all = apptsPatient(p.id), fut = all.filter(a => a.date >= todayISO() && ATTIVI(a.status)).reverse(), past = all.filter(a => a.date < todayISO() || !ATTIVI(a.status)).slice(0, 8), bal = balance(p.id);
      const recall = recallsDue().find(r => r.patient.id === p.id);
      return `<div class="page-head"><div><h1>Ciao ${esc(p.nome)}</h1><p class="muted">${esc(p.tel)} · <button class="link-btn" onclick="Portal.logout()">esci</button></p></div><div><button class="btn" onclick="Portal.b={step:1};App.go('p-prenota')">＋ Prenota</button></div></div>
        ${recall ? `<div class="card ai-card"><b>🪥 È ora dell'igiene!</b> ${recall.months ? `Sono passati ${recall.months} mesi dall'ultima seduta.` : 'Non hai ancora fatto una seduta di igiene con noi.'} <button class="chip" onclick="Portal.b={step:2,tr:'igiene'};App.go('p-prenota')">Prenota ora</button></div>` : ''}
        <div class="card"><h3>Prossimi appuntamenti</h3>${fut.length ? fut.map(a => `<div class="row top"><div class="grow"><b>${fmtLong(a.date)} alle ${a.time}</b><div class="sub">${esc(T(a.treatmentId).name)} · ${esc(O(a.operatorId).name)} · ${a.dur} min</div>
            <div class="chips">${a.status === 'attesa' ? `<button class="chip ok" onclick="Portal.setSt('${a.id}','confermato')">✓ Confermo la presenza</button>` : ''}<button class="chip" onclick="Portal.move('${a.id}')">↔ Sposta</button><button class="chip" onclick="Portal.cancel('${a.id}')">✕ Annulla</button><button class="chip" onclick="icsDownload(DB().appts.find(x=>x.id==='${a.id}'))">📆 Calendario</button></div></div>${badge(a.status)}</div>`).join('') : '<p class="muted">Nessun appuntamento in programma.</p>'}</div>
        <div class="grid2"><div class="card"><h3>Storico</h3>${past.length ? past.map(a => `<div class="row"><div class="time">${fmtDate(a.date)}</div><div class="grow">${esc(T(a.treatmentId).name)}</div>${badge(a.status)}</div>`).join('') : '<p class="muted">Ancora nessuna visita.</p>'}</div>
        <div class="card"><h3>Pagamenti</h3><p>${bal.open ? `Saldo da regolare: <b class="neg">${euro(bal.open)}</b>` : '✓ Sei in regola con i pagamenti.'}</p><p class="muted"><small>Le fatture sono valide per la detrazione fiscale del 19%.</small></p></div></div>`;
    },

    'p-assistente'() {
      return `<div class="page-head"><div><h1>✨ Assistente virtuale</h1><p class="muted">Risponde subito, a qualsiasi ora. Non sostituisce il parere del dentista.</p></div></div>
        ${App.chatHtml('paziente', ['Vorrei prenotare', 'Ho mal di denti', 'Mi si è rotto un dente', 'Quali sono gli orari?', "Quanto costa l'igiene?", "Cosa fare dopo un'estrazione?", 'Ho paura del dentista'])}`;
    },

    'p-info'() {
      const names = { estrazione: 'Dopo un\'estrazione', impianto: 'Dopo un impianto', otturazione: 'Dopo un\'otturazione', devitalizzazione: 'Dopo una devitalizzazione', igiene: 'Dopo l\'igiene professionale', sbiancamento: 'Dopo lo sbiancamento' };
      const faq = [['Ogni quanto fare l\'igiene?', 'In genere ogni 6 mesi; con gengive delicate o apparecchio anche ogni 3-4 mesi, secondo l\'indicazione dell\'igienista.'], ['A che età la prima visita dei bambini?', 'Intorno ai 3-4 anni, per familiarizzare con lo studio; prima se noti macchie o dolore.'], ['Posso venire in gravidanza?', 'Sì: controlli e igiene sono consigliati. Avvisaci sempre, soprattutto nel primo trimestre, così adattiamo trattamenti e farmaci.'], ['Come annullo un appuntamento?', 'Dalla sezione «I miei appuntamenti» o telefonando, possibilmente con 24 ore di anticipo: liberi il posto per un altro paziente.'], ['Quali pagamenti accettate?', 'Contanti, carte, bancomat e bonifico. Per i piani di cura più importanti sono possibili pagamenti dilazionati.']];
      return `<div class="page-head"><div><h1>Istruzioni e domande frequenti</h1></div></div>
        <div class="grid2"><div class="card"><h3>🩹 Dopo il trattamento</h3>${Object.entries(names).map(([k, n]) => `<details><summary>${n}</summary><ul>${POSTOP[k].map(x => `<li>${x}</li>`).join('')}</ul></details>`).join('')}<p class="muted"><small>Indicazioni generali: segui sempre quelle ricevute dal tuo dentista.</small></p></div>
        <div class="card"><h3>❓ Domande frequenti</h3>${faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}<button class="chip" onclick="App.go('p-assistente')">✨ Hai un'altra domanda? Chiedi all'assistente</button></div></div>`;
    },

    'p-anamnesi'() {
      const p = this.patient();
      if (!p) return `<div class="page-head"><div><h1>Scheda anamnestica</h1></div></div>` + this.loginBox('Accedi per compilare la scheda prima della visita.');
      const items = ['Ipertensione', 'Diabete', 'Malattie cardiache', 'Terapia anticoagulante', 'Osteoporosi (bifosfonati)', 'Gravidanza', 'Fumo', 'Bruxismo'];
      return `<div class="page-head"><div><h1>Scheda anamnestica</h1><p class="muted">Compilala con calma da casa: il dentista la troverà già nella tua cartella.</p></div></div>
        <div class="card narrow"><div class="form"><div class="full"><span class="lbl">Hai una di queste condizioni?</span><div class="chips">${items.map(x => `<label class="chip check"><input type="checkbox" class="an-c" value="${x}" ${norm(p.anamnesi).includes(norm(x)) ? 'checked' : ''}>${x}</label>`).join('')}</div></div>
          <label class="full">Allergie (farmaci, lattice, metalli…)<input id="an-all" value="${esc(p.allergie)}"></label>
          <label class="full">Farmaci che assumi e altre informazioni utili<textarea id="an-note" rows="3"></textarea></label></div>
          <div class="toolbar"><span class="grow"></span><button class="btn" onclick="Portal.saveAnam()">Invia allo studio</button></div>
          <p class="muted"><small>🔒 I dati sanitari sono visibili solo al personale dello studio.</small></p></div>`;
    },
  },

  pick(tr, date, time, op) { this.b = { step: 3, tr, date, time, op }; App.go('p-prenota'); },
  confirm() {
    const b = this.b; let p = this.patient();
    if (!isFree(b.date, b.time, T(b.tr).dur, b.op)) { toast('Questo orario è appena stato occupato: scegline un altro'); b.step = 2; return App.refresh(); }
    if (!p) {
      const nome = val('b-nome'), cognome = val('b-cognome'), tel = val('b-tel');
      if (!nome || !cognome) return toast('Inserisci nome e cognome');
      if (tel.replace(/\D/g, '').length < 8) return toast('Inserisci un numero di cellulare valido');
      if (!$('#b-priv').checked) return toast('Serve il consenso al trattamento dei dati');
      p = this.findByTel(tel);
      if (!p) { p = { id: uid(), nome, cognome, nascita: '', tel, email: val('b-email'), allergie: '', anamnesi: '', note: 'Registrato dal portale online', teeth: {}, privacy: true, createdAt: todayISO() }; DB().patients.push(p); }
      this.pid = p.id; sessionStorage.setItem('dent_pid', p.id);
    }
    const note = val('b-note');
    const a = createAppt({ patientId: p.id, treatmentId: b.tr, operatorId: b.op, date: b.date, time: b.time, status: 'richiesta', source: 'online', note: note ? 'Dal portale: ' + note : '' });
    if (b.moveId) { const old = DB().appts.find(x => x.id === b.moveId); if (old) { old.status = 'annullato'; old.note = (old.note + ' Spostato dal paziente.').trim(); Store.save(); } }
    this.b = { ...b, step: 4, apptId: a.id }; App.refresh();
  },
  setSt(id, st) { const a = DB().appts.find(x => x.id === id); if (a && a.patientId === this.pid) { a.status = st; Store.save(); App.refresh(); toast('Grazie, presenza confermata!'); } },
  cancel(id) { const a = DB().appts.find(x => x.id === id); if (!a || a.patientId !== this.pid) return; if (!confirm('Vuoi annullare questo appuntamento?')) return; a.status = 'annullato'; a.note = (a.note + ' Annullato dal paziente dal portale.').trim(); Store.save(); App.refresh(); toast('Appuntamento annullato'); },
  move(id) { const a = DB().appts.find(x => x.id === id); if (!a || a.patientId !== this.pid) return; this.b = { step: 2, tr: a.treatmentId, moveId: id }; App.go('p-prenota'); toast('Scegli il nuovo orario: quello vecchio verrà liberato alla conferma'); },
  saveAnam() {
    const p = this.patient(); if (!p) return;
    const c = $$('.an-c').filter(x => x.checked).map(x => x.value), note = val('an-note');
    p.anamnesi = [...c, note].filter(Boolean).join(', '); p.allergie = val('an-all'); p.anamnesiAt = todayISO();
    Store.save(); toast('Scheda inviata allo studio. Grazie!'); App.go('p-home');
  },
};
