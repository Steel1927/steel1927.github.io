// UK take-home pay, tax year 2026/27 (6 Apr 2026 – 5 Apr 2027). Statutory annual calculation.
// Source: https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027
(function (root) {
  'use strict';
  const R = {
    personalAllowance: 12570, taperStart: 100000,
    // Bands on taxable income (after the allowance). Above £125,140 the allowance is 0, so taxable = gross.
    rUK: [[37700, 0.20], [125140, 0.40], [Infinity, 0.45]],
    scotland: [[3967, 0.19], [16956, 0.20], [31092, 0.21], [62430, 0.42], [125140, 0.45], [Infinity, 0.48]],
    ni: { pt: 12570, uel: 50270, main: 0.08, upper: 0.02, employer: 0.15, st: 5000 },
    studentLoan: { plan1: [26900, 0.09], plan2: [29385, 0.09], plan4: [33795, 0.09], plan5: [25000, 0.09] },
    postgrad: [21000, 0.06],
  };

  function allowance(income) {
    return Math.max(0, R.personalAllowance - Math.max(0, income - R.taperStart) / 2);
  }

  function bandedTax(taxable, bands) {
    let prev = 0, tax = 0;
    for (const [upper, rate] of bands) {
      if (taxable <= prev) break;
      tax += (Math.min(taxable, upper) - prev) * rate;
      prev = upper;
    }
    return tax;
  }

  function calc(o, gross) {
    const pensionPct = Math.max(0, Number(o.pension) || 0) / 100;
    const pension = gross * pensionPct;
    const scheme = o.pensionType || 'net';
    // Salary sacrifice reduces pay for tax, NI and student loan; net-pay reduces taxable pay only.
    const niPay = scheme === 'sacrifice' ? gross - pension : gross;
    const taxPay = scheme === 'ras' ? gross : gross - pension;
    // Payroll view: relief-at-source extra relief and taper adjustments are claimed via self assessment.
    const pa = allowance(taxPay);
    const taxable = Math.max(0, taxPay - pa);
    const tax = bandedTax(taxable, o.region === 'scotland' ? R.scotland : R.rUK);
    const ni = Math.max(0, Math.min(niPay, R.ni.uel) - R.ni.pt) * R.ni.main + Math.max(0, niPay - R.ni.uel) * R.ni.upper;
    const lines = [{ label: 'Income tax', amount: tax }, { label: 'National Insurance', amount: ni }];
    if (pension) lines.push({ label: scheme === 'sacrifice' ? 'Pension (salary sacrifice)' : 'Pension contribution', amount: scheme === 'ras' ? pension * 0.8 : pension });
    let sl = 0;
    if (o.studentLoan && R.studentLoan[o.studentLoan]) {
      const [th, rate] = R.studentLoan[o.studentLoan];
      sl = Math.max(0, niPay - th) * rate;
      lines.push({ label: 'Student loan', amount: sl });
    }
    if (o.postgrad) {
      const pg = Math.max(0, niPay - R.postgrad[0]) * R.postgrad[1];
      lines.push({ label: 'Postgraduate loan', amount: pg });
      sl += pg;
    }
    const net = gross - lines.reduce((s, x) => s + x.amount, 0);
    const employerNi = Math.max(0, niPay - R.ni.st) * R.ni.employer;
    return {
      net, tax, ni, taxable, allowance: pa, lines,
      employer: [{ label: 'Employer NI (15%)', amount: employerNi }],
    };
  }

  const UK = {
    currency: 'GBP', locale: 'en-GB', decimals: 2, R, calc,
    labels: {
      amountGross: 'Gross salary', amountNet: 'Take-home pay you want', net: 'Take-home pay', gross: 'Gross salary',
      grossNeeded: 'Gross salary needed', breakdown: 'Your deductions', employer: 'Cost to employer',
      employerTotal: 'Total cost', month: 'Month', year: 'Year', error: 'Please check the numbers you entered.',
    },
    fields: [
      { name: 'amount', type: 'money', label: 'Gross salary', value: 35000, netValue: 28000, wide: true },
      { name: 'period', type: 'select', label: 'Per', value: 'year', options: [['year', 'Year'], ['month', 'Month']] },
      { name: 'region', type: 'select', label: 'Where you pay tax', value: 'ruk', options: [['ruk', 'UK except Scotland'], ['scotland', 'Scotland']] },
      { name: 'pension', type: 'number', label: 'Pension contribution (%)', value: 0 },
      { name: 'pensionType', type: 'select', label: 'Pension scheme type', value: 'net',
        options: [['net', 'Net pay (workplace)'], ['ras', 'Relief at source'], ['sacrifice', 'Salary sacrifice']] },
      { name: 'studentLoan', type: 'select', label: 'Student loan', value: '',
        options: [['', 'None'], ['plan1', 'Plan 1'], ['plan2', 'Plan 2'], ['plan4', 'Plan 4 (Scotland)'], ['plan5', 'Plan 5']] },
      { name: 'postgrad', type: 'check', label: 'Postgraduate loan', value: false },
    ],
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = UK;
  else (root.Countries = root.Countries || {}).uk = UK;
})(typeof self !== 'undefined' ? self : this);
