// Australia take-home pay 2026–27 (1 Jul 2026 – 30 Jun 2027). Annual calculation.
// Rates: https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents (15% bottom rate from 1 July 2026)
(function (root) {
  'use strict';
  const R = {
    // [upper bound of taxable income, marginal rate]
    resident: [[18200, 0], [45000, 0.15], [135000, 0.30], [190000, 0.37], [Infinity, 0.45]],
    foreign: [[135000, 0.30], [190000, 0.37], [Infinity, 0.45]],
    whm: [[45000, 0.15], [135000, 0.30], [190000, 0.37], [Infinity, 0.45]],
    lito: { max: 700, t1: 37500, t2: 45000, t3: 66667 },
    // Medicare levy low-income thresholds: latest published (2025–26); 2026–27 not yet published.
    medicare: { rate: 0.02, lower: 28011, upper: 35013 },
    help: { t1: 69528, t2: 129717, base2: 9028, t3: 186050 },
    super: { rate: 0.12, maxBase: 270830 },
  };

  function bandTax(income, bands) {
    let prev = 0, tax = 0;
    for (const [upper, rate] of bands) {
      if (income <= prev) break;
      tax += (Math.min(income, upper) - prev) * rate;
      prev = upper;
    }
    return tax;
  }

  function lito(ti) {
    const L = R.lito;
    if (ti <= L.t1) return L.max;
    if (ti <= L.t2) return L.max - (ti - L.t1) * 0.05;
    if (ti <= L.t3) return Math.max(0, 325 - (ti - L.t2) * 0.015);
    return 0;
  }

  function medicare(ti) {
    const M = R.medicare;
    if (ti <= M.lower) return 0;
    if (ti <= M.upper) return (ti - M.lower) * 0.1;
    return ti * M.rate;
  }

  function help(ri) {
    const H = R.help;
    if (ri <= H.t1) return 0;
    if (ri <= H.t2) return (ri - H.t1) * 0.15;
    if (ri <= H.t3) return H.base2 + (ri - H.t2) * 0.17;
    return ri * 0.10;
  }

  function calc(o, amount) {
    const residency = o.residency || 'resident';
    // Packages quoted "including super": salary = package / 1.12 (up to the maximum contribution base).
    const gross = o.superMode === 'included'
      ? (amount / (1 + R.super.rate) <= R.super.maxBase ? amount / (1 + R.super.rate) : amount - R.super.maxBase * R.super.rate)
      : amount;
    const ti = Math.max(0, Math.floor(gross));
    const bands = residency === 'foreign' ? R.foreign : residency === 'whm' ? R.whm : R.resident;
    const taxBefore = bandTax(ti, bands);
    const offset = residency === 'resident' ? Math.min(taxBefore, lito(ti)) : 0;
    const tax = taxBefore - offset;
    const levy = residency === 'resident' ? medicare(ti) : 0;
    const lines = [];
    if (o.superMode === 'included') lines.push({ label: 'Employer super (inside package)', amount: amount - gross });
    lines.push({ label: 'Income tax (after LITO)', amount: tax }, { label: 'Medicare levy', amount: levy });
    if (o.help) lines.push({ label: 'HELP / study loan repayment', amount: help(ti) });
    const net = amount - lines.reduce((s, x) => s + x.amount, 0);
    const sg = Math.min(gross, R.super.maxBase) * R.super.rate;
    return {
      net, gross, taxBefore, lito: offset, tax, medicare: levy, lines,
      employer: o.superMode === 'included' ? [] : [{ label: 'Superannuation guarantee (12%, paid on top)', amount: sg }],
      notes: 'Medicare levy uses the latest published low-income thresholds. Medicare Levy Surcharge (no private hospital cover, income over $105,000) is not included.',
    };
  }

  const AU = {
    currency: 'AUD', locale: 'en-AU', decimals: 0, R, calc, lito, medicare, help,
    labels: {
      amountGross: 'Salary', amountNet: 'Take-home pay you want', net: 'Take-home pay', gross: 'Salary',
      grossNeeded: 'Salary needed', breakdown: 'Deductions', employer: 'Employer contributions',
      employerTotal: 'Total package', month: 'Month', year: 'Year', error: 'Please check the numbers you entered.',
    },
    fields: [
      { name: 'amount', type: 'money', label: 'Salary', value: 80000, netValue: 65000, wide: true },
      { name: 'period', type: 'select', label: 'Per', value: 'year',
        options: [['year', 'Year'], ['month', 'Month'], ['fortnight', 'Fortnight'], ['weekly', 'Week']] },
      { name: 'superMode', type: 'select', label: 'Salary quoted', value: 'excluded',
        options: [['excluded', 'Excluding super (base salary)'], ['included', 'Including super (package)']] },
      { name: 'residency', type: 'select', label: 'Residency', value: 'resident',
        options: [['resident', 'Australian resident'], ['foreign', 'Foreign resident'], ['whm', 'Working holiday maker']] },
      { name: 'help', type: 'check', label: 'I have a HELP / study loan', value: false },
    ],
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = AU;
  else (root.Countries = root.Countries || {}).au = AU;
})(typeof self !== 'undefined' ? self : this);
