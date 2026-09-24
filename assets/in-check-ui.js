// India offer check UI: form → INCheck.check → payslip stub and ledgers.
(function () {
  'use strict';
  const form = document.querySelector('form[data-tool="incheck"]');
  const out = document.getElementById('result');
  const stubEl = document.getElementById('stub');
  if (!form || !out || !stubEl || !window.INCheck) return;
  const I = window.INCheck;
  const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  const money = (v) => inr.format(Math.abs(v) < 0.5 ? 0 : v);
  const pct = (v) => Math.round(v * 100) + '%';
  const num = (s) => { const v = String(s ?? '').replace(/[₹,\s]/g, ''); return v === '' ? '' : Number(v); };
  const val = (k) => (form.elements[k] ? form.elements[k].value : '');
  const row = (label, value, cls) => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row"><span>${label}</span></th><td><span>${value}</span></td></tr>`;
  const ledger = (caption, rows) => `<table class="ledger ledger-2"><caption>${caption}</caption><tbody>${rows}</tbody></table>`;
  const stub = (label, figure, per, meta) => `<p class="stub-label">${label}<span class="stub-per"> / ${per}</span></p>
<output class="stub-figure${figure.length > 13 ? ' long' : ''}">${figure}</output>${meta ? `<p class="stub-meta">${meta}</p>` : ''}`;

  function render(r) {
    const s = stub('Certain in-hand', money(r.inHand.certainMonthly), 'month',
      `<span class="pair">Best case with full variable: <b>${money(r.inHand.bestMonthly)}</b></span> · <span class="pair">CTC ÷ 12: <b>${money(r.ctc / 12)}</b></span>`);
    const gapPct = r.ctc ? 1 - r.inHand.certain / r.ctc : 0;
    let verdict = `<p class="slip-note slip-warn">Of the ${money(r.ctc)} CTC, <b>${pct(r.shares.cash)}</b> is fixed cash, <b>${pct(r.shares.conditional)}</b> is conditional and <b>${pct(r.shares.nonCash)}</b> never reaches your bank. After tax and PF, <b>${pct(1 - gapPct)}</b> of the CTC is money you can count on each month.</p>`;

    let rows = row('Basic', money(r.basic), 'gross') + row('HRA', money(r.hra)) + row('Other fixed allowances', money(r.special))
      + row('Fixed cash (certain)', money(r.fixedCash), 'total');
    if (r.variable) rows += row('Variable pay at target', money(r.variable), 'info');
    if (r.joiningBonus) rows += row('Joining bonus (one-off, clawback)', money(r.joiningBonus), 'info');
    if (r.esop) rows += row('ESOP / RSU (vesting)', money(r.esop), 'info');
    if (r.conditional) rows += row('Conditional cash', money(r.conditional), 'total');
    if (r.employerPf) rows += row('Employer PF → EPF account', money(r.employerPf), 'info');
    if (r.gratuity) rows += row('Gratuity accrual (after 5 years)', money(r.gratuity), 'info');
    if (r.employerNps) rows += row('Employer NPS (locked to 60)', money(r.employerNps), 'info');
    if (r.insurance) rows += row('Insurance premium', money(r.insurance), 'info');
    if (r.benefits) rows += row('Meal, transport, other benefits', money(r.benefits), 'info');
    if (r.unexplained > 0) rows += row('Stated CTC not explained by lines', money(r.unexplained), 'info');
    rows += row('Never in your bank', money(r.nonCash + Math.max(0, r.unexplained)), 'total');
    let detail = verdict + ledger('Where the CTC goes · per year', rows);

    detail += ledger(`From fixed cash to in-hand · ${r.regime} regime`,
      row('Fixed cash', money(r.fixedCash), 'gross') + row('Employee PF (12%)', '−' + money(r.employeePf))
      + (r.pt ? row('Professional tax', '−' + money(r.pt)) : '') + row('Income tax incl. cess', '−' + money(r.tax.certain))
      + row('Certain in-hand per year', money(r.inHand.certain), 'total') + row('Certain in-hand per month', money(r.inHand.certainMonthly), 'total')
      + (r.variable ? row('If 100% variable is paid, per month', money(r.inHand.bestMonthly), 'info') : ''));

    if (r.payslip) {
      const p = r.payslip;
      detail += ledger('First payslip vs expectation · monthly',
        row('Net on payslip', money(p.net), 'gross') + row('Certain in-hand expected', money(p.expected))
        + row('Difference', (p.diff > 0 ? '+' : p.diff < 0 ? '−' : '') + money(Math.abs(p.diff)), Math.abs(p.diff) > 50 ? 'total' : ''));
      if (p.causes.length) detail += `<p class="slip-note slip-warn">${p.causes.join(' ')}</p>`;
      else if (Math.abs(p.diff) <= 50) detail += '<p class="slip-note">Your payslip matches the offer within ₹50. Next, check Form 26AS/AIS each quarter to confirm the TDS deducted was actually deposited.</p>';
    }

    let plyRows = '';
    if (r.gratuity) plyRows += row('Gratuity if you complete 5 years (15/26 × monthly basic × 5)', money(r.gratuityAt5));
    if (r.joiningBonus) plyRows += row('Joining bonus after tax', money(r.joiningNet));
    const notes = r.flags.map((f) => `<p class="slip-note">${f.amount ? `<b>${money(f.amount)}</b> · ` : ''}${f.text}</p>`).join('');
    detail += `<div class="ply" role="group" aria-label="What each line really means"><p class="stub-label">What each line really means</p>${notes}${plyRows ? ledger('Worth knowing', plyRows) : ''}</div>`;
    detail += '<p class="slip-note">Ask HR before signing: the average variable payout for the last two years, whether PF is on full basic or the ceiling, the clawback period on any bonus, the ESOP vesting schedule and strike price, and a full CTC breakup for any unexplained amount.</p>';
    return { stub: s, detail };
  }

  let interacted = false;
  function update(ev) {
    try {
      const r = I.check({
        basic: num(val('basic')), hra: num(val('hra')), special: num(val('special')), variable: num(val('variable')),
        employerPf: num(val('employerPf')), gratuity: num(val('gratuity')), insurance: num(val('insurance')), benefits: num(val('benefits')),
        joiningBonus: num(val('joiningBonus')), esop: num(val('esop')), employerNps: num(val('employerNps')), ctcStated: num(val('ctcStated')),
        pfMode: val('pfMode'), state: val('state'), regime: val('regime'), oldDeductions: num(val('oldDeductions')), payslipNet: num(val('payslipNet')),
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
