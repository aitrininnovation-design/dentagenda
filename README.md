# 🦷 DentAgenda — agenda intelligente per studi dentistici (demo)

Agenda con strumenti di intelligenza artificiale pensata per semplificare il lavoro dello studio **e** la vita dei pazienti.
È una web app statica: nessun server, nessuna installazione, nessun costo. Si pubblica gratis con GitHub Pages.

> **Versione dimostrativa.** I dati sono finti e vengono salvati solo nel browser di chi la prova (localStorage).

## Cosa c'è dentro

### Area Studio
- **Oggi** — indicatori della giornata, briefing IA (rischi di assenza, allergie da ricordare, promemoria da inviare, scorte), richieste online da approvare.
- **Agenda** — vista giorno per operatore/poltrona e vista settimana; clic per creare, trascinamento per spostare, stati (da confermare, confermato, in sala d'attesa, completato, non presentato…).
- **Slot intelligenti** — l'IA propone gli orari che riducono i buchi in agenda.
- **Rischio assenza** — stima per ogni appuntamento, con la spiegazione.
- **Pazienti** — anagrafica, allergie e anamnesi in evidenza, **odontogramma** interattivo, diario clinico con **dettatura vocale** e riordino IA, storico, preventivi e pagamenti, riepilogo IA del paziente.
- **Comunicazioni** — promemoria, conferme, richiami di igiene (oltre 6 mesi), auguri, ricontatto dopo assenza, solleciti preventivo e saldo, richiesta recensione: testo pronto, invio con un clic via **WhatsApp, SMS o email**.
- **Lista d'attesa** — con proposta automatica dei primi posti liberi.
- **Preventivi e cassa** — preventivi (anche a partire dall'odontogramma), stampa/PDF, pagamenti, crediti aperti.
- **Magazzino** — scorte minime e ordine suggerito.
- **Statistiche** — incassi, occupazione, assenze, trattamenti, con suggerimenti dell'IA.
- **Assistente IA** — si scrive (o si detta) in italiano: «prenota Giulia Rossi domani alle 10 per igiene», «primo slot libero per otturazione», «promemoria per domani», «incassi del mese»…

### Portale Pazienti
- **Prenotazione online** in 3 passaggi con orari liberi in tempo reale (arriva allo studio come richiesta da approvare).
- **I miei appuntamenti** — conferma presenza, sposta, annulla, aggiungi al calendario (.ics).
- **Assistente virtuale 24/7** — orari, prezzi, indicazioni, prenotazione in chat e **triage dei sintomi** (emergenza / urgenza / da controllare) con primi posti disponibili.
- **Istruzioni post-trattamento e FAQ**.
- **Scheda anamnestica** compilabile da casa, che arriva nella cartella dello studio.

## L'intelligenza artificiale (gratuita)

| Livello | Cosa fa | Costo | Dati |
|---|---|---|---|
| **Motore locale** (sempre attivo) | capisce le richieste in italiano, prenota, cerca slot, prepara i messaggi, triage, riepiloghi, rischio assenze | gratis | non escono dal browser |
| **IA generativa** (facoltativa) | risposte a domande libere, riscrittura dei messaggi in vari toni, riordino delle note cliniche | piano gratuito | il testo va al fornitore scelto |

Per attivare l'IA generativa: **Impostazioni → Intelligenza artificiale**, scegli il fornitore e incolla una chiave gratuita:
- Google Gemini — <https://aistudio.google.com/apikey>
- Groq — <https://console.groq.com/keys>
- OpenRouter (modelli `:free`) — <https://openrouter.ai/keys>

La chiave resta solo nel browser e non finisce mai nel repository. Il nome del modello è modificabile dalle impostazioni se il fornitore lo cambia.
La dettatura vocale usa il riconoscimento integrato di Chrome/Edge.

## Provarla in locale

Basta aprire `index.html` nel browser. In alternativa: `node .claude/serve.js` e poi <http://localhost:8765>.

## Pubblicarla con GitHub Pages

1. Crea un repository su GitHub (es. `dentagenda`) e carica questi file:
   ```
   git remote add origin https://github.com/TUO-UTENTE/dentagenda.git
   git push -u origin main
   ```
2. Nel repository: **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**.
3. Dopo un minuto la demo è online su `https://TUO-UTENTE.github.io/dentagenda/`.

Link utili da dare allo studio: `…/#dashboard` (area studio) e `…/#p-home` (portale pazienti).

## Limiti della demo e passi successivi

- **Nessun accesso protetto e nessun database condiviso**: ogni browser ha i propri dati. Studio e portale "si parlano" solo se aperti nello stesso browser (perfetto per una dimostrazione).
- I messaggi WhatsApp/SMS/email si aprono precompilati ma li invia la persona: per l'invio automatico serve un servizio dedicato (es. WhatsApp Business API).
- Per l'uso reale con dati sanitari servono: backend con autenticazione, database cifrato in UE, backup, registro degli accessi, informative e nomina dei responsabili del trattamento (GDPR), eventuale fatturazione elettronica / Sistema Tessera Sanitaria.
- Le indicazioni dell'assistente ai pazienti sono orientative e non sostituiscono il parere del dentista.

## Struttura

```
index.html        pagina unica
css/style.css     grafica
js/data.js        archivio locale, dati demo, logica agenda (slot, rischio assenze, richiami)
js/ai.js          motore IA locale, collegamento alle IA gratuite, messaggi, triage, dettatura
js/app.js         navigazione, oggi, agenda, pazienti, chat
js/app2.js        comunicazioni, lista d'attesa, cassa, magazzino, statistiche, impostazioni
js/portal.js      portale pazienti
```
