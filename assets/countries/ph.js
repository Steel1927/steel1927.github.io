// Philippines net pay 2026: BIR withholding (TRAIN, RR 11-2018 Annex E monthly table), SSS (Circular 2024-006),
// PhilHealth 5% (floor ₱10,000 / ceiling ₱100,000), Pag-IBIG 2% up to ₱10,000 Maximum Fund Salary.
(function (root) {
  'use strict';
  const R = {
    // [over, base tax, rate] — monthly withholding table (whole-peso thresholds as published by BIR)
    wtax: [[666667, 183541.80, 0.35], [166667, 33541.80, 0.30], [66667, 8541.80, 0.25], [33333, 1875, 0.20], [20833, 0, 0.15]],
    sss: { minMsc: 5000, maxMsc: 35000, regularCap: 20000, ee: 0.05, er: 0.10 },
    philhealth: { rate: 0.05, floor: 10000, ceiling: 100000 },
    pagibig: { mfs: 10000, lowComp: 1500 },
  };
  const round2 = (v) => Math.round(v * 100) / 100;

  function withholding(taxable) {
    for (const [over, base, rate] of R.wtax) if (taxable > over) return round2(base + (taxable - over) * rate);
    return 0;
  }

  function msc(comp) {
    if (comp < 5250) return R.sss.minMsc;
    if (comp >= 34750) return R.sss.maxMsc;
    return Math.floor((comp + 250) / 500) * 500;
  }

  function calc(o, gross) {
    const basic = gross / 12;
    const allow = Math.max(0, Number(o.allowances) || 0);
    const deMin = Math.max(0, Number(o.deMinimis) || 0);
    const comp = basic + allow;
    const m = msc(comp);
    const sss = R.sss.ee * Math.min(m, R.sss.regularCap) + R.sss.ee * Math.max(0, m - R.sss.regularCap);
    const phBase = Math.min(Math.max(basic, R.philhealth.floor), R.philhealth.ceiling);
    const philhealth = round2(phBase * R.philhealth.rate / 2);
    const pagibig = (comp <= R.pagibig.lowComp ? 0.01 : 0.02) * Math.min(comp, R.pagibig.mfs);
    const contrib = sss + philhealth + pagibig;
    const taxable = Math.max(0, comp - contrib);
    const tax = o.mwe ? 0 : withholding(taxable);
    const lines = [];
    if (allow) lines.push({ label: 'Taxable allowances', amount: -allow * 12 });
    if (deMin) lines.push({ label: 'Non-taxable allowances (de minimis)', amount: -deMin * 12 });
    lines.push(
      { label: 'SSS (incl. MPF)', amount: sss * 12 },
      { label: 'PhilHealth', amount: philhealth * 12 },
      { label: 'Pag-IBIG', amount: pagibig * 12 },
      { label: 'Withholding tax', amount: tax * 12 },
    );
    const net = gross - lines.reduce((s, x) => s + x.amount, 0);
    const ec = m < 15000 ? 10 : 30;
    return {
      net, sss, philhealth, pagibig, taxable, tax, lines,
      employer: [
        { label: 'SSS employer share + EC', amount: (R.sss.er * m + ec) * 12 },
        { label: 'PhilHealth employer share', amount: philhealth * 12 },
        { label: 'Pag-IBIG employer share', amount: 0.02 * Math.min(comp, R.pagibig.mfs) * 12 },
      ],
      notes: '13th month pay and other benefits up to ₱90,000 a year are tax-exempt and not included here.',
    };
  }

  const PH = {
    currency: 'PHP', locale: 'en-PH', decimals: 2, R, calc, withholding, msc,
    labels: {
      amountGross: 'Basic salary', amountNet: 'Net pay you want', net: 'Net pay', gross: 'Basic salary',
      grossNeeded: 'Basic salary needed', breakdown: 'Deductions', employer: 'Employer contributions',
      employerTotal: 'Total cost to employer', month: 'Month', year: 'Year', error: 'Please check the numbers you entered.',
    },
    fields: [
      { name: 'amount', type: 'money', label: 'Basic salary', value: 30000, netValue: 25000, wide: true },
      { name: 'period', type: 'select', label: 'Per', value: 'month', options: [['month', 'Month'], ['year', 'Year']] },
      { name: 'allowances', type: 'money', label: 'Taxable allowances (monthly)', value: 0 },
      { name: 'deMinimis', type: 'money', label: 'De minimis / non-taxable (monthly)', value: 0 },
      { name: 'mwe', type: 'check', label: 'Minimum wage earner (tax-exempt)', value: false },
    ],
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PH;
  else (root.Countries = root.Countries || {}).ph = PH;
})(typeof self !== 'undefined' ? self : this);
