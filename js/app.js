/* DentAgenda — applicazione: navigazione, dashboard, agenda, pazienti, chat */
'use strict';

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200); }
function modal(title, body, foot = '') {
  $('#modal').innerHTML = `<div class="modal-box"><div class="modal-head"><h3>${title}</h3><button class="x" onclick="closeModal()" aria-label="Chiudi">✕</button></div><div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  $('#modal').classList.add('open');
}
function closeModal() { $('#modal').classList.remove('open'); $('#modal').innerHTML = ''; }
const val = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
const badge = st => `<span class="badge" style="--c:${STATI[st].color}">${STATI[st].label}</span>`;
const opt = (v, l, sel) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`;

const NAV_STUDIO = [['dashboard', '🏠', 'Oggi'], ['agenda', '📅', 'Agenda'], ['pazienti', '👥', 'Pazienti'], ['comunicazioni', '💬', 'Comunicazioni'], ['attesa', '⏳', 'Lista d\'attesa'], ['cassa', '💶', 'Preventivi e cassa'], ['magazzino', '📦', 'Magazzino'], ['statistiche', '📊', 'Statistiche'], ['assistente', '✨', 'Assistente IA'], ['impostazioni', '⚙️', 'Impostazioni']];
const NAV_PAZ = [['p-home', '🏠', 'Benvenuto'], ['p-prenota', '📅', 'Prenota online'], ['p-appuntamenti', '🗓️', 'I miei appuntamenti'], ['p-assistente', '✨', 'Assistente virtuale'], ['p-info', '📋', 'Istruzioni e FAQ'], ['p-anamnesi', '🩺', 'Scheda anamnestica']];

const App = {
  view: 'dashboard', arg: null, agendaDate: todayISO(), agendaMode: 'giorno', ptab: 'panoramica', pq: '', tool: 'carie',
  chats: { studio: [], paziente: [] },

  init() {
    Store.load();
    window.addEventListener('hashchange', () => this.route());
    this.route();
  },
  go(view, arg) {
    const h = '#' + view + (arg ? '/' + arg : '');
    if (location.hash === h) this.route(); else location.hash = h;
    document.body.classList.remove('nav-open');
  },
  route() {
    const [v, a] = location.hash.replace(/^#/, '').split('/');
    this.view = v || 'dashboard'; this.arg = a || null;
    if (this.view === 'agenda' && a) this.agendaDate = a;
    this.render(); window.scrollTo(0, 0);
  },
  refresh() { const y = window.scrollY; this.render(); window.scrollTo(0, y); },
  render() {
    const paz = this.view.startsWith('p-');
    document.body.classList.toggle('portal', paz);
    $('#mode-studio').classList.toggle('on', !paz); $('#mode-paziente').classList.toggle('on', paz);
    $('#ai-pill').innerHTML = `✨ IA: ${esc(AI.label())}`;
    const cur = this.view === 'paziente' ? 'pazienti' : this.view;
    const nb = { comunicazioni: this.todoCount(), attesa: DB().waitlist.length, magazzino: DB().stock.filter(x => x.qty <= x.min).length };
    $('#nav').innerHTML = (paz ? NAV_PAZ : NAV_STUDIO).map(([id, ic, l]) => `<a href="#${id}" class="${cur === id ? 'on' : ''}"><span class="ic">${ic}</span><span>${l}</span>${nb[id] && !paz ? `<em>${nb[id]}</em>` : ''}</a>`).join('')
      + `<div class="nav-foot">${paz ? 'Stai vedendo ciò che vede il paziente dal sito dello studio.' : 'Dati dimostrativi salvati solo in questo browser.'}</div>`;
    const fn = paz ? Portal.views[this.view] : this.views[this.view];
    $('#view').innerHTML = fn ? fn.call(paz ? Portal : this, this.arg) : '<div class="card">Pagina non trovata.</div>';
    const log = $('.chat-log'); if (log) log.scrollTop = log.scrollHeight;
  },
  todoCount() { return DB().appts.filter(a => a.status === 'richiesta').length + apptsOf(addDays(todayISO(), 1)).filter(a => ATTIVI(a.status) && !a.reminderSent).length; },

  views: {
    /* ---------- OGGI ---------- */
    dashboard() {
      const today = todayISO(), ap = apptsOf(today), act = ap.filter(a => ATTIVI(a.status));
      const inc = DB().payments.filter(x => x.date === today).reduce((s, x) => s + x.amount, 0);
      const req = DB().appts.filter(a => a.status === 'richiesta').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      const s = DB().settings, cap = DB().operators.length * (t2m(s.openTo) - t2m(s.openFrom) - (t2m(s.lunchTo) - t2m(s.lunchFrom)));
      const occ = isOpen(today) ? Math.round(act.reduce((t, a) => t + a.dur, 0) / cap * 100) : 0;
      const kpi = (v, l, ic) => `<div class="kpi"><span class="kic">${ic}</span><div><b>${v}</b><small>${l}</small></div></div>`;
      const row = a => {
        const p = P(a.patientId), r = noShowRisk(a), pend = ['confermato', 'attesa'].includes(a.status);
        return `<div class="row ${a.status}">
          <div class="time">${a.time}<small>${a.dur}'</small></div>
          <div class="grow"><a href="#paziente/${a.patientId}"><b>${esc(pName(p))}</b></a> ${p && (p.allergie || p.anamnesi) ? `<span class="warn" title="${esc([p.allergie, p.anamnesi].filter(Boolean).join(' · '))}">⚠️</span>` : ''}
            <div class="sub"><i class="dot" style="background:${T(a.treatmentId).color}"></i>${esc(T(a.treatmentId).name)} · ${esc(O(a.operatorId).name)}</div></div>
          ${pend && r.level !== 'basso' ? `<span class="risk ${r.level}" title="${esc(r.why.join(', '))}">rischio ${r.score}%</span>` : ''}
          ${badge(a.status)}
          <div class="acts">
            ${pend ? `<button class="btn sm" onclick="App.setStatus('${a.id}','arrivato')">Arrivato</button><button class="btn sm ghost" onclick="App.setStatus('${a.id}','noshow')" title="Non presentato">✗</button>` : ''}
            ${a.status === 'arrivato' ? `<button class="btn sm ok" onclick="App.setStatus('${a.id}','completato')">Completa</button>` : ''}
            <button class="btn sm ghost" onclick="App.apptForm('${a.id}')">⋯</button>
          </div></div>`;
      };
      return `<div class="page-head"><div><h1>Buongiorno 👋</h1><p class="muted">${fmtLong(today)} · ${esc(s.studioName)}</p></div>
        <div><button class="btn" onclick="App.apptForm()">＋ Nuovo appuntamento</button></div></div>
      <div class="kpis">${kpi(act.length, 'appuntamenti oggi', '📅')}${kpi(ap.filter(a => a.status === 'arrivato').length, 'in sala d\'attesa', '🪑')}${kpi(occ + '%', 'agenda occupata', '📈')}${kpi(euro(inc), 'incassato oggi', '💶')}${kpi(req.length, 'richieste online', '📥')}</div>
      <div class="grid2">
        <div>
          <div class="card ai-card"><h3>✨ Briefing IA della giornata</h3><ul>${AI.briefing().map(x => `<li>${x}</li>`).join('')}</ul></div>
          <div class="card"><h3>Appuntamenti di oggi</h3>${ap.length ? ap.map(row).join('') : '<p class="muted">Nessun appuntamento oggi.</p>'}</div>
        </div>
        <div>
          <div class="card"><h3>📥 Richieste dal portale pazienti</h3>${req.length ? req.map(a => `<div class="row"><div class="grow"><b>${esc(pName(P(a.patientId)))}</b><div class="sub">${esc(T(a.treatmentId).name)} · ${fmtHuman(a.date)} ${a.time}</div>${a.note ? `<div class="sub">“${esc(a.note)}”</div>` : ''}</div><div class="acts"><button class="btn sm ok" onclick="App.approve('${a.id}')">Accetta</button><button class="btn sm ghost" onclick="App.setStatus('${a.id}','annullato')">Rifiuta</button></div></div>`).join('') : '<p class="muted">Nessuna richiesta in sospeso.</p>'}</div>
          <div class="card"><h3>Azioni rapide</h3><div class="quick">
            <button onclick="App.go('comunicazioni')">📨<span>Promemoria e richiami</span></button>
            <button onclick="App.go('assistente')">✨<span>Chiedi all'assistente</span></button>
            <button onclick="App.patientForm()">👤<span>Nuovo paziente</span></button>
            <button onclick="App.go('attesa')">⏳<span>Lista d'attesa</span></button>
          </div></div>
          <div class="card"><h3>Prossimi giorni</h3>${[1, 2, 3, 4].map(i => { const d = addDays(today, i); const n = apptsOf(d).filter(a => ATTIVI(a.status)).length; return `<a class="row link" href="#agenda/${d}"><div class="grow">${fmtLong(d)}</div><b>${isOpen(d) ? n + ' app.' : 'chiuso'}</b></a>`; }).join('')}</div>
        </div>
      </div>`;
    },

    /* ---------- AGENDA ---------- */
    agenda() {
      const d = this.agendaDate, wk = this.agendaMode === 'settimana';
      return `<div class="page-head"><div><h1>Agenda</h1><p class="muted">${fmtLong(d)} ${fromISO(d).getFullYear()}${d === todayISO() ? ' · oggi' : ''}</p></div>
        <div class="toolbar">
          <button class="btn ghost" onclick="App.go('agenda','${addDays(d, wk ? -7 : -1)}')">‹</button>
          <button class="btn ghost" onclick="App.go('agenda','${todayISO()}')">Oggi</button>
          <button class="btn ghost" onclick="App.go('agenda','${addDays(d, wk ? 7 : 1)}')">›</button>
          <input type="date" value="${d}" onchange="App.go('agenda',this.value)">
          <div class="seg"><button class="${wk ? '' : 'on'}" onclick="App.agendaMode='giorno';App.refresh()">Giorno</button><button class="${wk ? 'on' : ''}" onclick="App.agendaMode='settimana';App.refresh()">Settimana</button></div>
          <button class="btn" onclick="App.apptForm()">＋ Nuovo</button>
        </div></div>
        ${wk ? this.agendaWeek(d) : this.agendaDay(d)}`;
    },

    /* ---------- PAZIENTI ---------- */
    pazienti() {
      return `<div class="page-head"><div><h1>Pazienti</h1><p class="muted">${DB().patients.length} in anagrafica</p></div>
        <div class="toolbar"><input type="search" placeholder="Cerca nome, telefono…" value="${esc(this.pq)}" oninput="App.pq=this.value;App.plist()" autofocus><button class="btn" onclick="App.patientForm()">＋ Nuovo paziente</button></div></div>
        <div class="card nopad"><div id="plist">${this.plistHtml()}</div></div>`;
    },
    paziente(id) { return this.patientView(id); },

    /* ---------- ASSISTENTE ---------- */
    assistente() {
      return `<div class="page-head"><div><h1>✨ Assistente IA dello studio</h1><p class="muted">Scrivi come parleresti a una segretaria. Motore attivo: <b>${esc(AI.label())}</b></p></div></div>
        ${this.chatHtml('studio', ['Riepilogo di oggi', 'Primo slot libero per igiene', 'Prenota Giulia Rossi domani alle 10 per igiene', 'Promemoria per domani', 'Pazienti da richiamare', 'Rischio assenze oggi', 'Incassi del mese', 'Scorte'])}`;
    },
  },

  /* ---------- agenda: vista giorno ---------- */
  PX: 1.6,
  agendaDay(d) {
    const s = DB().settings, o0 = t2m(s.openFrom), o1 = t2m(s.openTo), PX = this.PX, H = (o1 - o0) * PX;
    if (!isOpen(d)) return `<div class="card center"><h3>Studio chiuso</h3><p class="muted">${fmtLong(d)} non è un giorno di apertura.</p></div>`;
    const all = apptsOf(d), off = all.filter(a => !ATTIVI(a.status));
    let hours = ''; for (let m = o0; m < o1; m += 60) hours += `<div class="hr" style="top:${(m - o0) * PX}px">${m2t(m)}</div>`;
    const now = d === todayISO() && nowMin() > o0 && nowMin() < o1 ? `<div class="nowline" style="top:${(nowMin() - o0) * PX}px"></div>` : '';
    const cols = DB().operators.map(o => {
      const aps = all.filter(a => a.operatorId === o.id && ATTIVI(a.status)).map(a => {
        const tr = T(a.treatmentId), p = P(a.patientId), h = Math.max(a.dur * PX - 2, 20);
        return `<div class="ap st-${a.status}" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${a.id}')" onclick="event.stopPropagation();App.apptForm('${a.id}')"
          style="top:${(t2m(a.time) - o0) * PX}px;height:${h}px;--c:${tr.color}" title="${esc(pName(p))} — ${esc(tr.name)} (${STATI[a.status].label})">
          <b>${a.time} ${esc(pName(p))}</b>${p && (p.allergie || p.anamnesi) ? ' ⚠️' : ''}${a.source === 'online' ? ' 🌐' : ''}${h > 34 ? `<span>${esc(tr.name)} · ${STATI[a.status].label}</span>` : ''}</div>`;
      }).join('');
      const lunch = s.lunchFrom ? `<div class="lunch" style="top:${(t2m(s.lunchFrom) - o0) * PX}px;height:${(t2m(s.lunchTo) - t2m(s.lunchFrom)) * PX}px">pausa</div>` : '';
      return `<div class="colwrap"><div class="colhead" style="--c:${o.color}"><b>${esc(o.name)}</b><small>${esc(o.role)}</small></div>
        <div class="col" style="height:${H}px" onclick="App.colClick(event,'${o.id}')" ondragover="event.preventDefault()" ondrop="App.colDrop(event,'${o.id}')">${lunch}${aps}${now}</div></div>`;
    }).join('');
    return `<div class="card nopad agenda"><div class="agenda-grid"><div class="hours" style="height:${H}px">${hours}</div>${cols}</div></div>
      <p class="muted hint">Clicca su uno spazio libero per creare un appuntamento · trascina un appuntamento per spostarlo · 🌐 = prenotato online · ⚠️ = allergie/patologie</p>
      ${off.length ? `<div class="card"><h3>Annullati / non presentati</h3>${off.map(a => `<div class="row"><div class="time">${a.time}</div><div class="grow">${esc(pName(P(a.patientId)))} — ${esc(T(a.treatmentId).name)}</div>${badge(a.status)}<button class="btn sm ghost" onclick="App.apptForm('${a.id}')">⋯</button></div>`).join('')}</div>` : ''}`;
  },
  agendaWeek(d) {
    const dow = (fromISO(d).getDay() + 6) % 7, mon = addDays(d, -dow);
    return `<div class="week">${[0, 1, 2, 3, 4, 5, 6].map(i => {
      const day = addDays(mon, i), ap = apptsOf(day).filter(a => ATTIVI(a.status));
      return `<div class="wday ${day === todayISO() ? 'today' : ''} ${isOpen(day) ? '' : 'closed'}"><a class="whead" href="#agenda/${day}" onclick="App.agendaMode='giorno'"><b>${GIORNI[fromISO(day).getDay()].slice(0, 3)} ${fromISO(day).getDate()}</b><small>${isOpen(day) ? ap.length + ' app.' : 'chiuso'}</small></a>
        ${ap.map(a => `<div class="wap" style="--c:${T(a.treatmentId).color}" onclick="App.apptForm('${a.id}')"><b>${a.time}</b> ${esc(P(a.patientId)?.cognome || '')}<small>${esc(T(a.treatmentId).name)}</small></div>`).join('')}</div>`;
    }).join('')}</div>`;
  },
  colTime(e) {
    const r = e.currentTarget.getBoundingClientRect(), s = DB().settings;
    return m2t(t2m(s.openFrom) + Math.floor((e.clientY - r.top) / this.PX / s.slot) * s.slot);
  },
  colClick(e, op) { this.apptForm(null, { date: this.agendaDate, time: this.colTime(e), operatorId: op }); },
  colDrop(e, op) {
    e.preventDefault(); const a = DB().appts.find(x => x.id === e.dataTransfer.getData('text/plain')); if (!a) return;
    const time = this.colTime(e);
    if (!isFree(this.agendaDate, time, a.dur, op, a.id)) return toast('Spazio non disponibile per questo appuntamento');
    a.time = time; a.operatorId = op; a.date = this.agendaDate; Store.save(); this.refresh(); toast(`Spostato alle ${time} con ${O(op).name}`);
  },

  /* ---------- appuntamento ---------- */
  apptForm(id, preset = {}) {
    const ex = id ? DB().appts.find(x => x.id === id) : null;
    let a = ex || { patientId: preset.patientId || '', treatmentId: preset.treatmentId, operatorId: preset.operatorId, date: preset.date || this.agendaDate, time: preset.time || '09:00', status: 'confermato', note: '' };
    if (!a.treatmentId) a.treatmentId = (DB().treatments.find(t => !a.operatorId || !t.ops || t.ops.includes(a.operatorId) && t.id !== 'visita') || T('controllo')).id;
    if (!a.operatorId) a.operatorId = (T(a.treatmentId).ops || [DB().operators[0].id])[0];
    const pats = [...DB().patients].sort((x, y) => x.cognome.localeCompare(y.cognome));
    const r = ex ? noShowRisk(ex) : null, p = ex && P(ex.patientId);
    this._preset = { ...preset, date: a.date, time: a.time, operatorId: a.operatorId, treatmentId: a.treatmentId };
    modal(ex ? 'Appuntamento' : 'Nuovo appuntamento', `
      ${p && (p.allergie || p.anamnesi) ? `<div class="alert">⚠️ ${esc([p.allergie && 'Allergia: ' + p.allergie, p.anamnesi].filter(Boolean).join(' · '))}</div>` : ''}
      <div class="form">
        <label class="full">Paziente<div class="inline"><select id="f-pat"><option value="">— scegli —</option>${pats.map(x => opt(x.id, `${x.cognome} ${x.nome}`, a.patientId)).join('')}</select><button class="btn ghost" onclick="App.patientForm(null,true)">＋ Nuovo</button></div></label>
        <label>Trattamento<select id="f-tr" onchange="App.trChange()">${DB().treatments.map(t => opt(t.id, `${t.name} (${t.dur}')`, a.treatmentId)).join('')}</select></label>
        <label>Operatore<select id="f-op">${DB().operators.map(o => opt(o.id, o.name, a.operatorId)).join('')}</select></label>
        <label>Data<input type="date" id="f-date" value="${a.date}"></label>
        <label>Ora<input type="time" id="f-time" step="900" value="${a.time}"></label>
        <label>Durata (min)<input type="number" id="f-dur" min="5" step="5" value="${a.dur || T(a.treatmentId).dur}"></label>
        <label>Stato<select id="f-st">${Object.entries(STATI).map(([k, v]) => opt(k, v.label, a.status)).join('')}</select></label>
        <label class="full">Note<textarea id="f-note" rows="2">${esc(a.note)}</textarea></label>
      </div>
      <div class="aibox"><button class="btn ghost sm" onclick="App.suggest()">✨ Suggerisci gli orari migliori</button><div id="sugg"></div></div>
      ${r ? `<p class="muted">Rischio assenza stimato: <span class="risk ${r.level}">${r.score}% ${r.level}</span> ${r.why.length ? '— ' + esc(r.why.join(', ')) : ''}</p>` : ''}
      ${ex ? `<div class="chips"><button class="chip" onclick="App.msgFor('promemoria','${ex.id}')">📨 Promemoria</button><button class="chip" onclick="App.msgFor('conferma','${ex.id}')">✅ Conferma</button><button class="chip" onclick="App.msgFor('postop','${ex.id}')">🩹 Istruzioni post-trattamento</button><button class="chip" onclick="closeModal();App.go('paziente','${ex.patientId}')">👤 Scheda paziente</button></div>` : ''}`,
      `${ex ? `<button class="btn danger" onclick="App.delAppt('${ex.id}')">Elimina</button>` : ''}<span class="grow"></span><button class="btn ghost" onclick="closeModal()">Chiudi</button><button class="btn" onclick="App.saveAppt('${id || ''}')">Salva</button>`);
  },
  trChange() { const t = T(val('f-tr')); $('#f-dur').value = t.dur; if (t.ops && !t.ops.includes(val('f-op'))) $('#f-op').value = t.ops[0]; },
  suggest() {
    const tr = val('f-tr'), sl = nextSlots(tr, val('f-date') < todayISO() ? todayISO() : val('f-date'), 6);
    $('#sugg').innerHTML = sl.length ? sl.map(s => `<button class="chip" onclick="document.getElementById('f-date').value='${s.date}';document.getElementById('f-time').value='${s.time}';document.getElementById('f-op').value='${s.operatorId}'">${fmtHuman(s.date)} ${s.time} · ${esc(O(s.operatorId).name.split(' ').pop())}</button>`).join('') + '<small class="muted">Orari scelti per ridurre i buchi in agenda.</small>' : '<small>Nessuno slot disponibile nei prossimi 30 giorni.</small>';
  },
  saveAppt(id) {
    const x = { patientId: val('f-pat'), treatmentId: val('f-tr'), operatorId: val('f-op'), date: val('f-date'), time: val('f-time'), dur: +val('f-dur') || 30, status: val('f-st'), note: val('f-note') };
    if (!x.patientId) return toast('Scegli il paziente');
    if (!x.date || !x.time) return toast('Indica data e ora');
    if (ATTIVI(x.status) && !isFree(x.date, x.time, x.dur, x.operatorId, id)) return toast('Orario non disponibile: occupato, in pausa o fuori orario');
    if (id) { const a = DB().appts.find(z => z.id === id); const was = a.status; Object.assign(a, x); Store.save(); closeModal(); this.refresh(); if (was !== 'completato' && x.status === 'completato') this.payForm(a.patientId, a.price ?? T(a.treatmentId).price, T(a.treatmentId).name); }
    else { createAppt(x); closeModal(); this.refresh(); }
    toast('Appuntamento salvato');
  },
  delAppt(id) { if (!confirm('Eliminare definitivamente questo appuntamento?')) return; DB().appts = DB().appts.filter(a => a.id !== id); Store.save(); closeModal(); this.refresh(); },
  setStatus(id, st) {
    const a = DB().appts.find(x => x.id === id); if (!a) return; a.status = st; Store.save(); this.refresh();
    if (st === 'completato') this.payForm(a.patientId, a.price ?? T(a.treatmentId).price, T(a.treatmentId).name);
    if (st === 'annullato' || st === 'noshow') { const w = DB().waitlist.find(x => !T(a.treatmentId).ops || (T(x.treatmentId).ops || []).includes(a.operatorId)); if (w && a.date >= todayISO()) toast(`💡 Si è liberato un posto: ${pName(P(w.patientId))} è in lista d'attesa`); }
  },
  approve(id) { const a = DB().appts.find(x => x.id === id); a.status = 'confermato'; Store.save(); this.refresh(); this.msgFor('conferma', id); },
  quickBook(pid, tr, date, time, op) {
    if (!isFree(date, time, T(tr).dur, op)) return toast('Lo slot non è più disponibile');
    const a = createAppt({ patientId: pid, treatmentId: tr, operatorId: op, date, time });
    DB().waitlist = DB().waitlist.filter(w => !(w.patientId === pid && w.treatmentId === tr)); Store.save();
    this.chatSay('studio', `✅ Prenotato: <b>${esc(pName(P(pid)))}</b> — ${esc(T(tr).name)} ${fmtHuman(date)} alle ${time}. <button class="chip" onclick="App.msgFor('conferma','${a.id}')">Invia conferma</button>`);
    toast('Appuntamento creato'); this.refresh();
  },

  /* ---------- messaggi ---------- */
  msgFor(kind, apptId) { const a = DB().appts.find(x => x.id === apptId); if (a) this.msg(kind, { patient: P(a.patientId), appt: a }); },
  msg(kind, ctx) {
    const p = ctx.patient; if (!p) return; this._msg = { kind, ctx };
    const titles = { promemoria: 'Promemoria appuntamento', conferma: 'Conferma appuntamento', richiamo: 'Richiamo igiene', postop: 'Istruzioni post-trattamento', auguri: 'Auguri di compleanno', noshow: 'Ricontatto dopo assenza', preventivo: 'Sollecito preventivo', recensione: 'Richiesta recensione', attesa: 'Posto disponibile', saldo: 'Promemoria saldo' };
    modal(`${titles[kind] || 'Messaggio'} — ${esc(pName(p))}`, `
      <textarea id="m-text" rows="8" class="msg">${esc(AI.message(kind, ctx))}</textarea>
      <div class="aibox"><span>✨ Riscrivi con IA:</span>
        ${['cordiale', 'formale', 'breve', 'rassicurante'].map(t => `<button class="chip" onclick="App.improve('${t}')">${t}</button>`).join('')}
        <small class="muted" id="m-hint">${AI.cloud() ? 'Il nome del paziente non viene inviato all\'IA.' : 'Il testo è generato dal motore locale. Per la riscrittura attiva un\'IA gratuita in Impostazioni.'}</small></div>`,
      `<button class="btn ghost" onclick="App.sendMsg('copy')">📋 Copia</button><span class="grow"></span>
       <button class="btn ghost" onclick="App.sendMsg('sms')">SMS</button><button class="btn ghost" onclick="App.sendMsg('mail')">Email</button><button class="btn wa" onclick="App.sendMsg('wa')">WhatsApp</button>`);
  },
  async improve(tone) {
    if (!AI.cloud()) return toast('Attiva un\'IA gratuita in Impostazioni per riscrivere i testi');
    const ta = $('#m-text'); $('#m-hint').textContent = 'Sto riscrivendo…';
    try { ta.value = await AI.improve(ta.value, tone, this._msg.ctx.patient); $('#m-hint').textContent = 'Fatto. Rileggi sempre prima di inviare.'; }
    catch (e) { $('#m-hint').textContent = 'IA non raggiungibile: ' + e.message; }
  },
  sendMsg(ch) {
    const { kind, ctx } = this._msg, p = ctx.patient, text = val('m-text');
    if (ch === 'copy') { navigator.clipboard?.writeText(text); toast('Testo copiato'); }
    if (ch === 'wa') window.open(waLink(p.tel, text), '_blank', 'noopener');
    if (ch === 'sms') location.href = `sms:${p.tel}?body=${encodeURIComponent(text)}`;
    if (ch === 'mail') location.href = `mailto:${p.email || ''}?subject=${encodeURIComponent(DB().settings.studioName)}&body=${encodeURIComponent(text)}`;
    DB().messages.push({ id: uid(), patientId: p.id, date: todayISO(), kind, channel: ch, text });
    if (ctx.appt && kind === 'promemoria') ctx.appt.reminderSent = true;
    Store.save(); closeModal(); this.refresh();
  },

  /* ---------- pazienti ---------- */
  plist() { $('#plist').innerHTML = this.plistHtml(); },
  plistHtml() {
    const q = norm(this.pq), today = todayISO();
    const list = DB().patients.filter(p => !q || norm(pName(p) + ' ' + p.cognome + ' ' + p.nome + ' ' + p.tel + ' ' + p.email).includes(q)).sort((a, b) => a.cognome.localeCompare(b.cognome));
    if (!list.length) return '<p class="muted pad">Nessun paziente trovato.</p>';
    return `<table><thead><tr><th>Paziente</th><th>Età</th><th>Telefono</th><th>Prossimo appuntamento</th><th>Saldo</th></tr></thead><tbody>${list.map(p => {
      const nx = DB().appts.filter(a => a.patientId === p.id && a.date >= today && ATTIVI(a.status)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0], b = balance(p.id);
      return `<tr onclick="App.go('paziente','${p.id}')"><td><b>${esc(p.cognome)} ${esc(p.nome)}</b> ${p.allergie || p.anamnesi ? '<span class="warn">⚠️</span>' : ''}</td><td>${age(p.nascita)}</td><td>${esc(p.tel)}</td><td>${nx ? `${fmtHuman(nx.date)} ${nx.time} · ${esc(T(nx.treatmentId).name)}` : '<span class="muted">—</span>'}</td><td>${b.open ? `<span class="neg">${euro(b.open)}</span>` : '<span class="muted">in regola</span>'}</td></tr>`;
    }).join('')}</tbody></table>`;
  },
  patientForm(id, backToAppt) {
    const p = id ? P(id) : { nome: '', cognome: '', nascita: '', tel: '', email: '', allergie: '', anamnesi: '', note: '' };
    modal(id ? 'Modifica paziente' : 'Nuovo paziente', `<div class="form">
      <label>Nome<input id="p-nome" value="${esc(p.nome)}"></label><label>Cognome<input id="p-cognome" value="${esc(p.cognome)}"></label>
      <label>Data di nascita<input type="date" id="p-nascita" value="${esc(p.nascita)}"></label><label>Telefono<input id="p-tel" inputmode="tel" value="${esc(p.tel)}"></label>
      <label class="full">Email<input id="p-email" type="email" value="${esc(p.email)}"></label>
      <label class="full">Allergie<input id="p-allergie" value="${esc(p.allergie)}" placeholder="es. penicillina, lattice"></label>
      <label class="full">Anamnesi / patologie / farmaci<textarea id="p-anamnesi" rows="2">${esc(p.anamnesi)}</textarea></label>
      <label class="full">Note di segreteria<textarea id="p-note" rows="2">${esc(p.note)}</textarea></label></div>`,
      `${id ? `<button class="btn danger" onclick="App.delPatient('${id}')">Elimina</button>` : ''}<span class="grow"></span><button class="btn ghost" onclick="closeModal()">Annulla</button><button class="btn" onclick="App.savePatient('${id || ''}',${!!backToAppt})">Salva</button>`);
  },
  savePatient(id, back) {
    const x = { nome: val('p-nome'), cognome: val('p-cognome'), nascita: val('p-nascita'), tel: val('p-tel'), email: val('p-email'), allergie: val('p-allergie'), anamnesi: val('p-anamnesi'), note: val('p-note') };
    if (!x.nome || !x.cognome) return toast('Nome e cognome sono obbligatori');
    let p; if (id) { p = P(id); Object.assign(p, x); } else { p = { id: uid(), teeth: {}, privacy: true, createdAt: todayISO(), ...x }; DB().patients.push(p); }
    Store.save(); closeModal();
    if (back) this.apptForm(null, { ...this._preset, patientId: p.id }); else this.go('paziente', p.id);
  },
  delPatient(id) {
    if (!confirm('Eliminare il paziente e tutti i suoi dati (appuntamenti, note, pagamenti)? L\'operazione non è reversibile.')) return;
    const d = DB(); d.patients = d.patients.filter(p => p.id !== id);
    for (const k of ['appts', 'payments', 'notes', 'waitlist', 'quotes', 'messages']) d[k] = d[k].filter(x => x.patientId !== id);
    Store.save(); closeModal(); this.go('pazienti');
  },
  patientView(id) {
    const p = P(id); if (!p) return '<div class="card">Paziente non trovato. <a href="#pazienti">Torna all\'elenco</a></div>';
    const tab = this.ptab, b = balance(id), ap = apptsPatient(id);
    const tabs = [['panoramica', 'Panoramica'], ['odontogramma', 'Odontogramma'], ['diario', 'Diario clinico'], ['appuntamenti', `Appuntamenti (${ap.length})`], ['economia', 'Preventivi e pagamenti']];
    let body = '';
    if (tab === 'panoramica') body = `<div class="grid2"><div class="card"><h3>Anagrafica</h3><dl>
        <dt>Data di nascita</dt><dd>${p.nascita ? fmtDate(p.nascita) + ` (${age(p.nascita)} anni)` : '—'}</dd><dt>Telefono</dt><dd>${esc(p.tel) || '—'}</dd><dt>Email</dt><dd>${esc(p.email) || '—'}</dd>
        <dt>Allergie</dt><dd>${esc(p.allergie) || 'nessuna segnalata'}</dd><dt>Anamnesi</dt><dd>${esc(p.anamnesi) || 'nulla da segnalare'}</dd><dt>Note</dt><dd>${esc(p.note) || '—'}</dd><dt>Paziente dal</dt><dd>${fmtDate(p.createdAt)}</dd></dl></div>
        <div class="card ai-card"><h3>✨ Riepilogo IA del paziente</h3><p id="psum" class="pre">${esc(AI.patientSummary(p))}</p>${AI.cloud() ? `<button class="btn ghost sm" onclick="App.deepSummary('${id}')">Approfondisci con IA generativa</button>` : ''}</div></div>`;
    if (tab === 'odontogramma') {
      const tooth = n => { const st = (p.teeth || {})[n] || 'sano'; return `<button class="tooth t-${st}" style="--c:${DENTI_STATI[st].color}" onclick="App.setTooth('${id}',${n})" title="${n} — ${DENTI_STATI[st].label}"><i></i>${n}</button>`; };
      const up = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28], lo = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
      body = `<div class="card"><h3>Odontogramma</h3><p class="muted">Scegli uno stato, poi clicca sui denti per applicarlo.</p>
        <div class="chips">${Object.entries(DENTI_STATI).map(([k, v]) => `<button class="chip tool ${this.tool === k ? 'on' : ''}" onclick="App.tool='${k}';App.refresh()"><i class="dot" style="background:${v.color}"></i>${v.label}</button>`).join('')}</div>
        <div class="odonto"><div class="arch"><small>Arcata superiore — destra ← → sinistra</small><div>${up.map(tooth).join('')}</div></div><div class="arch"><div>${lo.map(tooth).join('')}</div><small>Arcata inferiore</small></div></div></div>`;
    }
    if (tab === 'diario') {
      const notes = DB().notes.filter(n => n.patientId === id).sort((a, b) => b.date.localeCompare(a.date));
      body = `<div class="card"><h3>Nuova nota clinica</h3><textarea id="n-text" rows="4" placeholder="Scrivi o detta la nota: es. «ott. in composito su 36, anest. locale, ctrl a 6 mesi»"></textarea>
        <div class="toolbar"><button class="btn ghost" id="mic" onclick="Voice.toggle(document.getElementById('n-text'),this)">🎤 Detta</button><button class="btn ghost" onclick="App.tidy()">✨ Riordina con IA</button><span class="grow"></span><button class="btn" onclick="App.saveNote('${id}')">Salva nota</button></div></div>
        <div class="card"><h3>Storico</h3>${notes.length ? notes.map(n => `<div class="note"><div class="sub">${fmtDate(n.date)} · ${esc(O(n.operatorId).name)} <button class="link-btn" onclick="App.delNote('${n.id}')">elimina</button></div><p class="pre">${esc(n.text)}</p></div>`).join('') : '<p class="muted">Nessuna nota.</p>'}</div>`;
    }
    if (tab === 'appuntamenti') body = `<div class="card">${ap.length ? ap.map(a => `<div class="row"><div class="time">${fmtDate(a.date)}<small>${a.time}</small></div><div class="grow"><b>${esc(T(a.treatmentId).name)}</b><div class="sub">${esc(O(a.operatorId).name)}${a.note ? ' · ' + esc(a.note) : ''}</div></div>${badge(a.status)}<button class="btn sm ghost" onclick="App.apptForm('${a.id}')">⋯</button></div>`).join('') : '<p class="muted">Nessun appuntamento.</p>'}</div>`;
    if (tab === 'economia') {
      const pay = DB().payments.filter(x => x.patientId === id).sort((a, b) => b.date.localeCompare(a.date)), qs = DB().quotes.filter(q => q.patientId === id);
      body = `<div class="kpis"><div class="kpi"><div><b>${euro(b.due)}</b><small>prestazioni eseguite</small></div></div><div class="kpi"><div><b>${euro(b.paid)}</b><small>pagato</small></div></div><div class="kpi"><div><b class="${b.open ? 'neg' : ''}">${euro(b.open)}</b><small>saldo aperto</small></div></div></div>
        <div class="grid2"><div class="card"><h3>Pagamenti <button class="btn sm" onclick="App.payForm('${id}',${b.open})">＋ Registra</button></h3>${pay.length ? pay.map(x => `<div class="row"><div class="time">${fmtDate(x.date)}</div><div class="grow">${esc(x.desc)}<div class="sub">${esc(x.method)}</div></div><b>${euro(x.amount)}</b></div>`).join('') : '<p class="muted">Nessun pagamento.</p>'}
          ${b.open ? `<button class="chip" onclick="App.msg('saldo',{patient:P('${id}'),amount:${b.open}})">📨 Promemoria saldo</button>` : ''}</div>
        <div class="card"><h3>Preventivi <button class="btn sm" onclick="App.quoteForm(null,'${id}')">＋ Nuovo</button></h3>${qs.length ? qs.map(q => this.quoteRow(q)).join('') : '<p class="muted">Nessun preventivo.</p>'}</div></div>`;
    }
    return `<div class="page-head"><div><a class="back" href="#pazienti">‹ Pazienti</a><h1>${esc(pName(p))}</h1>
      <div class="chips">${p.allergie ? `<span class="chip static red">⚠️ Allergia: ${esc(p.allergie)}</span>` : ''}${p.anamnesi ? `<span class="chip static amber">🩺 ${esc(p.anamnesi)}</span>` : ''}${b.open ? `<span class="chip static amber">Saldo ${euro(b.open)}</span>` : ''}</div></div>
      <div class="toolbar"><a class="btn ghost" href="tel:${esc(p.tel)}">📞</a><a class="btn ghost" target="_blank" rel="noopener" href="${waLink(p.tel, '')}">💬</a><button class="btn ghost" onclick="App.patientForm('${id}')">Modifica</button><button class="btn" onclick="App.apptForm(null,{patientId:'${id}',date:todayISO()})">＋ Appuntamento</button></div></div>
      <div class="tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" onclick="App.ptab='${k}';App.refresh()">${l}</button>`).join('')}</div>${body}`;
  },
  setTooth(id, n) { const p = P(id); p.teeth = p.teeth || {}; if (this.tool === 'sano') delete p.teeth[n]; else p.teeth[n] = this.tool; Store.save(); this.refresh(); },
  async tidy() { const ta = $('#n-text'); if (!ta.value.trim()) return toast('Scrivi o detta prima la nota'); ta.disabled = true; ta.value = await AI.tidyNote(ta.value); ta.disabled = false; toast('Nota riordinata: controllala prima di salvare'); },
  saveNote(id) { const t = val('n-text'); if (!t) return toast('La nota è vuota'); DB().notes.push({ id: uid(), patientId: id, date: todayISO(), operatorId: DB().operators[0].id, text: t }); Store.save(); this.refresh(); },
  delNote(id) { if (!confirm('Eliminare la nota?')) return; DB().notes = DB().notes.filter(n => n.id !== id); Store.save(); this.refresh(); },
  async deepSummary(id) {
    const p = P(id), el = $('#psum'); el.textContent = 'Sto analizzando…';
    const data = AI.patientSummary(p).split(pName(p)).join('Il paziente') + '\nNote cliniche: ' + DB().notes.filter(n => n.patientId === id).map(n => n.date + ': ' + n.text).join(' | ');
    try { el.textContent = await AI.llm('Sei un assistente per odontoiatri. Dai dati forniti (anonimi) scrivi in italiano: 1) sintesi clinica in 3 righe, 2) punti di attenzione per la prossima seduta, 3) proposte organizzative (richiami, piano di cura da completare). Non inventare dati mancanti. Solo testo.', [{ role: 'user', content: data }], 500); }
    catch (e) { el.textContent = AI.patientSummary(p); toast('IA non raggiungibile: ' + e.message); }
  },

  /* ---------- chat ---------- */
  chatHtml(who, sugg) {
    const c = this.chats[who];
    if (!c.length) c.push({ role: 'assistant', html: who === 'studio' ? 'Ciao! Sono l\'assistente dello studio. ' + AI.help() : `Ciao! Sono l'assistente virtuale di ${esc(DB().settings.studioName)} 🦷<br>Posso aiutarti a prenotare, darti informazioni su orari e prezzi o orientarti se hai un problema. Come posso aiutarti?` });
    return `<div class="card chat"><div class="chat-log">${c.map(m => `<div class="bubble ${m.role}">${m.role === 'user' ? esc(m.text) : m.html}</div>`).join('')}${this._typing ? '<div class="bubble assistant typing">●●●</div>' : ''}</div>
      <div class="chips sugg">${sugg.map(s => `<button class="chip" onclick="App.chatSend('${who}','${s.replace(/'/g, '\\\'')}')">${esc(s)}</button>`).join('')}</div>
      <form class="chat-in" onsubmit="event.preventDefault();App.chatSend('${who}')"><input id="chat-q" placeholder="Scrivi un messaggio…" autocomplete="off"><button type="button" class="btn ghost" onclick="Voice.toggle(document.getElementById('chat-q'),this)" title="Detta">🎤</button><button class="btn">Invia</button></form></div>`;
  },
  onChat() { return this.view === 'assistente' || this.view === 'p-assistente'; },
  async chatSend(who, text) {
    text = text || val('chat-q'); if (!text) return;
    const c = this.chats[who], hist = c.filter(m => m.text || m.html).map(m => ({ role: m.role, content: m.text || m.html.replace(/<[^>]+>/g, ' ') }));
    c.push({ role: 'user', text }); this._typing = true;
    const target = who === 'studio' ? 'assistente' : 'p-assistente';
    if (this.view !== target) this.go(target); else this.refresh();
    let html; try { html = who === 'studio' ? await AI.studioAsk(text, hist) : await AI.patientAsk(text, Portal.patient(), hist); } catch (e) { html = 'Si è verificato un errore: ' + esc(e.message); }
    this._typing = false; c.push({ role: 'assistant', html }); if (this.onChat()) this.refresh();
    const i = $('#chat-q'); if (i) i.focus();
  },
  chatSay(who, html) { this.chats[who].push({ role: 'assistant', html }); if (this.onChat()) this.refresh(); },
};
