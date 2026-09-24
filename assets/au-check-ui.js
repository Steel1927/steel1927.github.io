// Australia super check UI: form → AUCheck.check → payslip stub and ledgers.
(function () {
  'use strict';
  const form = document.querySelector('form[data-tool="aucheck"]');
  const out = document.getElementById('result');
  const stubEl = document.getElementById('stub');
  if (!form || !out || !stubEl || !window.AUCheck) return;
  const A = window.AUCheck;
  const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
  const aud2 = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
  const money = (n, cents) => (cents ? aud2 : aud).format(Math.abs(n) < 0.005 ? 0 : n);
  const signed = (n, cents) => (n > 0.005 ? '+' : n < -0.005 ? '−' : '') + money(Math.abs(n), cents);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (s) => { const v = String(s ?? '').replace(/[$,\s]/g, ''); return v === '' ? '' : Number(v); };
  const val = (k) => (form.elements[k] ? (form.elements[k].type === 'checkbox' ? form.elements[k].checked : form.elements[k].value) : '');
  const row = (label, value, cls) => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row"><span>${label}</span></th><td><span>${value}</span></td></tr>`;
  const ledger = (caption, rows) => `<table class="ledger ledger-2"><caption>${caption}</caption><tbody>${rows}</tbody></table>`;
  const stub = (label, figure, per, meta) => `<p class="stub-label">${label}<span class="stub-per"> / ${per}</span></p>
<output class="stub-figure${figure.length > 13 ? ' long' : ''}">${figure}</output>${meta ? `<p class="stub-meta">${meta}</p>` : ''}`;
  const PER = { weekly: 'week', fortnightly: 'fortnight', monthly: 'month', quarterly: 'quarter' };

  function render(r) {
    const per = PER[r.frequency] || 'fortnight';
    let s, verdict = '';
    if (r.paid && r.paid.unpaid > 1) {
      s = stub('Super not received last quarter', '−' + money(r.paid.unpaid, true), 'quarter',
        `<span class="pair">On payslips: <b>${money(r.paid.accrued, true)}</b></span> · <span class="pair">In your fund: <b>${money(r.paid.received, true)}</b></span>`);
      verdict = `<p class="slip-note slip-warn">Payslips show super <em>accrued</em>, not paid. From 1 July 2026 (Payday Super) contributions must reach your fund within 7 business days of each payday. ${money(r.paid.unpaid, true)} is missing for the quarter — worth <b>${money(r.paid.byRetirement)}</b> by age ${A.R.retireAge}. Ask your employer for the payment date and fund reference; if it is not in the fund within 7 business days of payday, report it to the ATO.</p>`;
    } else if (r.short > Math.max(1, r.ote * 0.002)) {
      s = stub('Super short on this payslip', '−' + money(r.short, true), per,
        `<span class="pair">Should be 12% of OTE: <b>${money(r.expected, true)}</b></span> · <span class="pair">Shown: <b>${money(r.shown, true)}</b></span>`);
      const why = r.sacrificeTrap ? 'matches 12% of your pay <em>after</em> salary sacrifice — since 2020 sacrificed super cannot reduce the guarantee'
        : r.hits.length ? r.hits.map((h) => h.text).join('; ') : 'does not match any common calculation';
      verdict = `<p class="slip-note slip-warn">The super shown ${why}. Over a year that is <b>${money(r.lost.perYear)}</b>; if it continues until age ${A.R.retireAge} you lose about <b>${money(r.lost.byRetirement)}</b> of retirement savings.</p>`;
    } else if (r.diff > Math.max(1, r.ote * 0.002)) {
      s = stub('Super above the guarantee', signed(r.diff, true), per,
        `<span class="pair">Guarantee: <b>${money(r.expected, true)}</b></span> · <span class="pair">Shown: <b>${money(r.shown, true)}</b></span>`);
      verdict = '<p class="slip-note">Your employer pays more than the 12% minimum, or the figure includes your own salary-sacrifice contribution. Both are fine — check the concessional cap if the total is large.</p>';
    } else {
      s = stub('Super guarantee correct', money(0, true), 'short',
        `<span class="pair">12% of OTE: <b>${money(r.expected, true)}</b></span> · <span class="pair">Shown: <b>${money(r.shown, true)}</b></span>`);
      verdict = `<p class="slip-note">The payslip figure matches 12% of your ordinary time earnings${r.capped ? ' (capped at the maximum contribution base)' : ''}. Now confirm it was actually paid: compare with your fund statement or ATO online services in myGov.</p>`;
    }

    let rows = row(`Ordinary time earnings this ${per}`, money(r.ote, true), 'gross');
    if (r.extras) rows += row('of which allowances, loadings, commission, bonus', money(r.extras, true), 'info');
    if (r.overtime) rows += row('Overtime (not OTE, no super due)', money(r.overtime, true), 'info');
    if (r.sacrifice) rows += row('Salary sacrifice (cannot reduce SG)', money(r.sacrifice, true), 'info');
    if (r.capped) rows += row('Maximum contribution base ($270,830 a year) this period', money(r.cap, true), 'info');
    rows += row('Guarantee due · 12%', money(r.expected, true), 'total') + row('Super on payslip', money(r.shown, true)) + row('Difference', signed(r.diff, true), r.short > 1 ? 'gross' : '');
    let detail = verdict + ledger('Superannuation guarantee · this payslip', rows);

    if (r.paid) {
      detail += ledger('Was it paid? · last quarter',
        row('Accrued on payslips', money(r.paid.accrued, true), 'gross') + row('Received by your fund', money(r.paid.received, true))
        + row('Unpaid', '−' + money(r.paid.unpaid, true), r.paid.unpaid > 1 ? 'total' : ''));
    }

    const yrs = r.lost.years;
    let ply = row('Your age → 67', `${r.age} → ${A.R.retireAge} (${yrs} yrs)`, 'info')
      + row('Assumed net return', `${(r.lost.rate * 100).toFixed(1)}% a year`, 'info');
    if (r.short > 1) ply += row('Shortfall per year', '−' + money(r.lost.perYear)) + row(`Lost by ${A.R.retireAge} if it continues`, '−' + money(r.lost.byRetirement), 'total');
    if (r.paid && r.paid.unpaid > 1) ply += row('Unpaid quarter, grown to 67', '−' + money(r.paid.byRetirement)) + row('If every quarter goes unpaid', '−' + money(r.paid.unpaidYearByRetirement), 'total');
    if (!(r.short > 1) && !(r.paid && r.paid.unpaid > 1)) ply += row('Nothing lost on these figures', money(0), 'total');
    detail += `<div class="ply" role="group" aria-label="By retirement">${ledger('What it means by retirement', ply)}</div>`;
    detail += '<p class="slip-note">Estimate only. Growth uses a flat assumed return before inflation and ignores contributions tax, insurance premiums and market swings.</p>';
    return { stub: s, detail };
  }

  let interacted = false;
  function update(ev) {
    try {
      const r = A.check({
        frequency: val('frequency'), ote: num(val('ote')), extras: num(val('extras')), overtime: num(val('overtime')),
        superShown: num(val('superShown')), sacrifice: num(val('sacrifice')), age: num(val('age')), returnRate: num(val('returnRate')),
        quarterAccrued: num(val('quarterAccrued')), quarterReceived: num(val('quarterReceived')),
      });
      const v = render(r);
      stubEl.innerHTML = v.stub;
      out.innerHTML = v.detail;
      if (ev && !interacted) { interacted = true; if (window.track) window.track('calc'); }
    } catch (err) { out.innerHTML = '<p class="slip-note">Please check the numbers you entered.</p>'; }
  }
  try {
    new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { if (form.elements[k]) form.elements[k].value = v; });
  } catch (e) { /* ignore bad hash */ }
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => { e.preventDefault(); update(e); });
  update();
})();
