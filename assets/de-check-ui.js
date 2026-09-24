// Gehaltsabrechnung prüfen – Oberfläche: Formular → DECheck.check → Abriss und Buchungen.
(function () {
  'use strict';
  const form = document.querySelector('form[data-tool="decheck"]');
  const out = document.getElementById('result');
  const stubEl = document.getElementById('stub');
  if (!form || !out || !stubEl || !window.DECheck) return;
  const D = window.DECheck;
  const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const money = (n) => eur.format(Math.abs(n) < 0.005 ? 0 : n);
  const signed = (n) => (n > 0.005 ? '+' : n < -0.005 ? '−' : '') + money(Math.abs(n));
  // „4.000“ und „4000,50“ und „401.83“: Komma ist Dezimaltrenner; Punkt nur Tausender, wenn genau drei Ziffern folgen.
  const num = (s) => {
    let v = String(s ?? '').replace(/[€\s]/g, '');
    if (v === '') return '';
    if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
    return Number(v);
  };
  const val = (k) => (form.elements[k] ? (form.elements[k].type === 'checkbox' ? form.elements[k].checked : form.elements[k].value) : '');
  const row = (label, value, cls) => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row"><span>${label}</span></th><td><span>${value}</span></td></tr>`;
  const ledger = (caption, rows) => `<table class="ledger ledger-2"><caption>${caption}</caption><tbody>${rows}</tbody></table>`;
  const stub = (label, figure, per, meta) => `<p class="stub-label">${label}<span class="stub-per"> / ${per}</span></p>
<output class="stub-figure${figure.length > 13 ? ' long' : ''}">${figure}</output>${meta ? `<p class="stub-meta">${meta}</p>` : ''}`;
  const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI' };

  function render(r) {
    const k = ROMAN[r.stkl];
    let s, verdict = '';
    if (Math.abs(r.lstDiff) > 1) {
      s = stub(r.lstDiff > 0 ? 'Lohnsteuer zu hoch' : 'Lohnsteuer zu niedrig', signed(r.lstDiff), 'Monat',
        `<span class="pair">Erwartet (StKl ${k}): <b>${money(r.exp.lst)}</b></span> · <span class="pair">Abgezogen: <b>${money(r.lines[0].deducted)}</b></span>`);
      verdict = r.stklHits.length
        ? `<p class="slip-note slip-warn">Der Abzug entspricht <b>Steuerklasse ${r.stklHits.map((h) => ROMAN[h]).join(' oder ')}</b>, nicht ${k}. Entweder gilt in den ELStAM eine andere Steuerklasse als angenommen, oder ein Freibetrag/Hinzurechnungsbetrag ist eingetragen. Prüfen Sie Ihre ELStAM in „Mein ELSTER“ und fragen Sie die Lohnbuchhaltung.</p>`
        : `<p class="slip-note slip-warn">Keine Steuerklasse ergibt ${money(r.lines[0].deducted)} bei ${money(r.brutto)}. Übliche Gründe: eingetragener Freibetrag, Einmalzahlung im Monat (sonstiger Bezug), Nachberechnung eines Vormonats. Lassen Sie sich die Berechnung zeigen.</p>`;
    } else if (r.current) {
      const c = r.current;
      s = c.settlement > 0
        ? stub('Nachzahlung zu erwarten', '−' + money(c.settlement), 'Jahr', `<span class="pair">Steuerklassen ${c.label}</span> · <span class="pair">Abrechnung für StKl ${k} korrekt</span>`)
        : stub('Erstattung zu erwarten', '+' + money(-c.settlement), 'Jahr', `<span class="pair">Steuerklassen ${c.label}</span> · <span class="pair">Abrechnung für StKl ${k} korrekt</span>`);
      verdict = c.settlement > 0
        ? `<p class="slip-note slip-warn">Ihre Lohnsteuer ist für Steuerklasse ${k} richtig — aber die Kombination ${c.label} behält übers Jahr ${money(c.settlement)} zu wenig ein. Das Finanzamt fordert den Betrag mit dem Steuerbescheid nach (Abgabepflicht bei III/V). Legen Sie den Betrag monatlich zurück oder wechseln Sie zu IV/IV mit Faktor.</p>`
        : `<p class="slip-note">Mit ${c.label} zahlen Sie übers Jahr ${money(-c.settlement)} zu viel Lohnsteuer und bekommen sie erst mit dem Steuerbescheid zurück. Der Faktor gleicht das monatlich aus.</p>`;
    } else {
      s = stub('Abrechnung stimmt', money(0), 'Abweichung', `<span class="pair">Lohnsteuer StKl ${k}: <b>${money(r.exp.lst)}</b></span> · <span class="pair">Netto erwartet: <b>${money(r.exp.net)}</b></span>`);
      verdict = `<p class="slip-note">Lohnsteuer${r.lines.some((l) => l.deducted != null && l.key !== 'lst') ? ' und Sozialversicherung' : ''} entsprechen Steuerklasse ${k} bei ${money(r.brutto)} brutto. Prüfen Sie zusätzlich, ob die Steuerklasse selbst zu Ihrer Situation passt (Vergleich unten für Ehepaare).</p>`;
    }

    // Buchung: Posten erwartet / laut Abrechnung / Differenz
    const cells = r.lines.filter((l) => l.key === 'lst' || l.deducted != null || (l.key === 'kist' && r.kirche) || l.key === 'rv' || l.key === 'kv' || l.key === 'pv' || l.key === 'av');
    let grid = `<div class="scroll"><table class="ledger ledger-grid"><caption>Abzüge im Vergleich · Steuerklasse ${k}</caption><thead><tr><th scope="col">Posten</th><th scope="col">Erwartet</th><th scope="col">Abrechnung</th><th scope="col">Differenz</th></tr></thead><tbody>`;
    cells.forEach((l) => {
      grid += `<tr${l.diff != null && Math.abs(l.diff) > 1 ? ' class="gross"' : ''}><th scope="row">${l.label}</th><td>${money(l.expected)}</td><td>${l.deducted == null ? '—' : money(l.deducted)}</td><td>${l.diff == null ? '—' : signed(l.diff)}</td></tr>`;
    });
    grid += `<tr class="total"><th scope="row">Netto erwartet</th><td>${money(r.exp.net)}</td><td>—</td><td>${r.totalDiff ? signed(-r.totalDiff) : '—'}</td></tr></tbody></table></div>`;
    let detail = verdict + grid;
    if (r.zusatzHit != null) detail += `<p class="slip-note slip-warn">Der KV-Beitrag passt zu einem Zusatzbeitrag von <b>${String(r.zusatzHit).replace('.', ',')} %</b> statt ${String(val('zusatz')).replace('.', ',')} %. Prüfen Sie den Satz Ihrer Krankenkasse — Sie haben ein Sonderkündigungsrecht, wenn er erhöht wurde.</p>`;

    // Ehepaare: Steuerklassenwahl
    if (r.pair) {
      let rows = '';
      r.pair.combos.forEach((c) => {
        const cur = r.current && c === r.current;
        rows += row(`${c.label}${cur ? ' (aktuell)' : ''}${c.factor < 1 ? ` · Faktor ${c.factor.toFixed(3).replace('.', ',')}` : ''} — Netto beide`, money(c.netTotal) + ' / Monat', cur ? 'gross' : '')
          + row('&nbsp;&nbsp;Steuerbescheid', c.settlement > 0 ? `Nachzahlung ${money(c.settlement)}` : c.settlement < 0 ? `Erstattung ${money(-c.settlement)}` : 'ausgeglichen', 'info');
      });
      rows += row('Gemeinsame Einkommensteuer (Splitting)', money(r.pair.jointTax) + ' / Jahr', 'total');
      detail += `<div class="ply" role="group" aria-label="Steuerklassenwahl"><table class="ledger ledger-2"><caption>Ehepaar · Steuerklassen im Vergleich</caption><tbody>${rows}</tbody></table></div>`
        + '<p class="slip-note">Die Jahressteuer ist bei jeder Kombination gleich — nur Zeitpunkt und Verteilung ändern sich. III/V zahlt sich aus, wenn der Partner in III bald Elterngeld, Krankengeld oder Arbeitslosengeld bezieht (Bemessung nach Netto; Wechsel bei Elterngeld mindestens 7 Monate vor dem Mutterschutz). Bei III/V und beim Faktor besteht Abgabepflicht für die Steuererklärung. Schätzung nur mit Arbeitslohn und Pauschbeträgen, ohne Soli und Kirchensteuer.</p>';
    } else if (r.married) {
      detail += '<p class="slip-note">Verheiratet? Tragen Sie unter „Weitere Angaben“ das Brutto Ihres Partners ein, um Nachzahlung oder Erstattung je Steuerklassenwahl zu sehen.</p>';
    }
    return { stub: s, detail };
  }

  let interacted = false;
  function update(ev) {
    try {
      const r = D.check({
        brutto: num(val('brutto')), stkl: Number(val('stkl')), lst: num(val('lst')), land: val('land'), kirche: val('kirche') === '1',
        kinder: Number(val('kinder')) || 0, zusatz: num(val('zusatz')) === '' ? 2.9 : num(val('zusatz')),
        soli: num(val('soli')), kist: num(val('kist')), rv: num(val('rv')), av: num(val('av')), kv: num(val('kv')), pv: num(val('pv')),
        partnerBrutto: num(val('partnerBrutto')), partnerStkl: Number(val('partnerStkl')) || 0,
      });
      const v = render(r);
      stubEl.innerHTML = v.stub;
      out.innerHTML = v.detail;
      if (ev && !interacted) { interacted = true; if (window.track) window.track('calc'); }
    } catch (err) { out.innerHTML = '<p class="slip-note">Bitte Eingaben prüfen.</p>'; }
  }
  try {
    new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { if (form.elements[k]) form.elements[k].value = v; });
  } catch (e) { /* ungültiger Hash: ignorieren */ }
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => { e.preventDefault(); update(e); });
  update();
})();
