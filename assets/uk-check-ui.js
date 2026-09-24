// UK payslip check UI: reads the form, runs UKCheck.check, renders the stub and ledgers in the payslip idiom.
(function () {
  'use strict';
  const form = document.querySelector('form[data-tool="ukcheck"]');
  const out = document.getElementById('result');
  const stubEl = document.getElementById('stub');
  if (!form || !out || !stubEl || !window.UKCheck) return;
  const U = window.UKCheck;
  const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
  const money = (n) => gbp.format(Math.abs(n) < 0.005 ? 0 : n);
  const signed = (n) => (n > 0.005 ? '+' : n < -0.005 ? '−' : '') + money(Math.abs(n));
  const pct = (r) => Math.round(r * 100) + '%';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (s) => { const v = String(s ?? '').replace(/[£,\s]/g, ''); return v === '' ? '' : Number(v); };
  const val = (k) => form.elements[k] ? (form.elements[k].type === 'checkbox' ? form.elements[k].checked : form.elements[k].value) : '';
  const row = (label, value, cls) => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row"><span>${label}</span></th><td><span>${value}</span></td></tr>`;
  const ledger = (caption, rows) => `<table class="ledger ledger-2"><caption>${caption}</caption><tbody>${rows}</tbody></table>`;
  const stub = (label, figure, per, meta) => `<p class="stub-label">${label}<span class="stub-per"> / ${per}</span></p>
<output class="stub-figure${figure.length > 13 ? ' long' : ''}">${figure}</output>${meta ? `<p class="stub-meta">${meta}</p>` : ''}`;
  const PER = { monthly: 'month', weekly: 'week', fortnightly: 'fortnight', fourweekly: '4 weeks' };

  const CODE_NOTES = {
    flatBR: 'BR taxes everything at the basic rate with no Personal Allowance. It is normal for a second job or pension; on your only job it usually means your employer had no P45 or starter checklist and HMRC has not yet issued your proper code.',
    flatD: 'D0/D1 tax everything at the higher or additional rate. Correct only for a second income when your first job already uses your allowance and basic-rate band.',
    '0T': '0T gives no Personal Allowance. It is used when a new employer has no starter information, or when income is over £125,140. If neither applies, ask HMRC to issue the right code.',
    K: 'A K code means deductions (company car, medical insurance, tax owed from an earlier year) exceed your allowance, so extra pay is taxed. Check the items on your PAYE coding notice (P2) still apply.',
    NT: 'NT means no tax is deducted. It is rare and usually needs written HMRC authority.',
    W1M1: 'The W1/M1 (or X) marker makes the code non-cumulative: each period is taxed on its own and earlier overpayments are not refunded through payroll. HMRC usually replaces it within a few weeks; any excess comes back as a refund once the cumulative code arrives or after 5 April.',
    low: 'Your code number is below 1257, so your allowance has been reduced — usually for benefits in kind, untaxed income or tax owed from an earlier year. If none of these apply to you, check your coding notice.',
    high: 'Your code number is above 1257, so you have extra allowances — for example Marriage Allowance (suffix M), job expenses or a professional subscription.',
    marriageN: 'Suffix N means you have transferred 10% of your allowance to your spouse or civil partner.',
  };

  function codeNote(c) {
    if (c.kind === 'flat') return c.flat === 'BR' ? CODE_NOTES.flatBR : CODE_NOTES.flatD;
    if (c.kind === '0T') return CODE_NOTES['0T'];
    if (c.kind === 'K') return CODE_NOTES.K;
    if (c.kind === 'NT') return CODE_NOTES.NT;
    if (c.number < 1257) return CODE_NOTES.low;
    if (c.number > 1257) return c.suffix === 'M' ? CODE_NOTES.high : CODE_NOTES.high;
    if (c.suffix === 'N') return CODE_NOTES.marriageN;
    return '';
  }

  function render(r) {
    const per = PER[r.frequency] || 'month';
    const c = r.code;
    const codeLabel = esc(c.raw || '1257L');
    const invalid = !c.valid ? `<p class="slip-note slip-warn">"${codeLabel}" is not a tax code we recognise — showing 1257L. Codes look like 1257L, S1257L, BR, 0T, K497 or 1257L W1/M1.</p>` : '';

    // Headline: payroll error first, then the cost of the code itself.
    let s, verdict;
    if (Math.abs(r.diff) > 1) {
      s = stub(r.diff > 0 ? 'Tax taken above your code' : 'Tax taken below your code', signed(r.diff), per,
        `<span class="pair">Expected under ${codeLabel}: <b>${money(r.expected.tax)}</b></span> · <span class="pair">Deducted: <b>${money(r.deducted)}</b></span>`);
      verdict = r.matches.length
        ? `<p class="slip-note slip-warn">Your deduction matches code <b>${r.matches.map((m) => esc(m.code)).join('</b> or <b>')}</b>, not ${codeLabel}. Either payroll is using a different code from the one printed, or the payslip figure includes an adjustment. Ask payroll which code they hold.</p>`
        : `<p class="slip-note slip-warn">No standard code produces ${money(r.deducted)} on ${money(r.pay)}. Ask payroll to explain the figure — a cumulative catch-up after a code change is the usual cause.</p>`;
    } else if (!r.isStandard && r.codeCost > 0.5) {
      s = stub('Extra tax from your code', signed(r.codeCost), per,
        `<span class="pair">Payroll applied ${codeLabel} correctly</span> · <span class="pair">vs 1257L: <b>${money(r.codeCostYear)}</b> a year</span>`);
      verdict = `<p class="slip-note slip-warn">Your payslip is right for code ${codeLabel}, but that code costs you ${money(r.codeCostYear)} a year more than the standard 1257L. If ${codeLabel} is not right for you, the difference is refundable.</p>`;
    } else if (!r.isStandard && r.codeCost < -0.5) {
      s = stub('Tax saved by your code', signed(r.codeCost), per,
        `<span class="pair">Payroll applied ${codeLabel} correctly</span> · <span class="pair">vs 1257L: <b>${money(-r.codeCostYear)}</b> a year less</span>`);
      verdict = `<p class="slip-note">You pay less than on 1257L. Make sure the extra allowance is genuine — if HMRC later removes it, the shortfall is collected through a lower code or a bill.</p>`;
    } else {
      s = stub('Payslip matches your code', money(0), 'difference',
        `<span class="pair">Expected: <b>${money(r.expected.tax)}</b></span> · <span class="pair">Deducted: <b>${money(r.deducted)}</b></span>`);
      verdict = `<p class="slip-note">Income tax is correct for ${codeLabel} on ${money(r.pay)} this ${per}.</p>`;
    }
    const note = codeNote(c);
    const w1 = c.nonCumulative ? `<p class="slip-note">${CODE_NOTES.W1M1}</p>` : '';

    // Ledger 1: how the expected tax was built
    const e = r.expected;
    let rows = row('Taxable pay this ' + per, money(r.pay), 'gross');
    if (c.kind === 'K') rows += row(`Extra pay from code ${codeLabel}`, '+' + money(e.extraPay), 'info');
    else if (c.kind === 'L') rows += row(`Free pay (${money(r.annualAllowance)} ÷ ${r.periods})`, '−' + money(e.freePay), 'info');
    else rows += row('Free pay', money(0), 'info');
    rows += row('Taxable (rounded down)', money(e.taxable), 'info');
    (e.rows || []).forEach((b) => { rows += row(`${money(b.amount)} at ${pct(b.rate)}`, money(b.tax)); });
    if (e.capped) rows += row('Capped at 50% of pay', money(e.tax), 'info');
    rows += row('Expected income tax', money(e.tax), 'total') + row('Deducted on payslip', money(r.deducted)) + row('Difference', signed(r.diff), Math.abs(r.diff) > 1 ? 'gross' : '');
    let detail = invalid + verdict + ledger(`Income tax · code ${codeLabel}${c.nonCumulative ? ' (non-cumulative)' : ''}`, rows);

    // Ledger 2: NI
    if (r.ni) {
      detail += ledger('National Insurance · Class 1 employee',
        row('Pay for NI', money(r.ni.pay), 'gross')
        + row(`8% between ${money(r.ni.pt)} and ${money(r.ni.uel)}`, money(Math.max(0, Math.min(r.ni.pay, r.ni.uel) - r.ni.pt) * 0.08))
        + (r.ni.pay > r.ni.uel ? row(`2% above ${money(r.ni.uel)}`, money((r.ni.pay - r.ni.uel) * 0.02)) : '')
        + row('Expected NI', money(r.ni.expected), 'total') + row('Deducted on payslip', money(r.ni.deducted))
        + row('Difference', signed(r.ni.diff), Math.abs(r.ni.diff) > 1 ? 'gross' : ''));
      if (Math.abs(r.ni.diff) > 1) detail += `<p class="slip-note slip-warn">NI is ${money(Math.abs(r.ni.diff))} ${r.ni.diff > 0 ? 'more' : 'less'} than category A rates give. Directors, people over State Pension age, under-21s and apprentices under 25 use different rules; otherwise ask payroll.</p>`;
    }

    // Ledger 3: student loan
    if (r.sl) {
      detail += ledger(`Student loan · ${esc(r.sl.plan.replace('plan', 'Plan ').replace('postgrad', 'Postgraduate'))}`,
        row('Expected repayment', money(r.sl.expected), 'total') + row('Deducted on payslip', money(r.sl.deducted)) + row('Difference', signed(r.sl.diff), Math.abs(r.sl.diff) > 1 ? 'gross' : ''));
    }

    // Ply: the year view — code cost and cumulative position
    let ply = row('Annual pay at this rate', money(r.annualPay), 'gross')
      + row(`Tax for the year on ${codeLabel}`, money(r.expected.tax * r.periods), r.isStandard ? 'total' : '');
    if (!r.isStandard) ply += row('Tax for the year on 1257L', money(r.stdTax * r.periods))
      + row(r.codeCost > 0 ? 'Extra paid because of your code' : 'Saved because of your code', signed(r.codeCostYear), 'total');
    if (r.ytd) {
      ply += row(`Taxable pay to date (period ${r.ytd.n})`, money(r.ytd.payToDate), 'info')
        + row('Tax due to date', money(r.ytd.expected)) + row('Tax paid to date', money(r.ytd.taxToDate))
        + row(r.ytd.diff > 0 ? 'Overpaid so far this year' : 'Underpaid so far this year', signed(r.ytd.diff), 'total');
    }
    detail += `<div class="ply" role="group" aria-label="Over the year">${ledger('Over the tax year 2026/27', ply)}</div>`;
    if (r.highIncome) detail += '<p class="slip-note">Pay above £100,000 a year: the Personal Allowance tapers away, so a code below 1257L can be correct.</p>';
    if (note) detail += `<p class="slip-note">${note}</p>`;
    detail += w1;
    return { stub: s, detail };
  }

  let interacted = false;
  function update(ev) {
    try {
      const r = U.check({
        code: val('code'), frequency: val('frequency'), pay: num(val('pay')), taxDeducted: num(val('taxDeducted')),
        niPay: num(val('niPay')), niDeducted: num(val('niDeducted')), niExempt: val('niExempt'),
        studentPlan: val('studentPlan'), slDeducted: num(val('slDeducted')),
        periodNo: num(val('periodNo')), payToDate: num(val('payToDate')), taxToDate: num(val('taxToDate')),
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
