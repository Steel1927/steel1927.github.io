// US paycheck calculator 2026: federal income tax (Rev. Proc. 2025-32, incl. OBBBA), FICA, 50 states + DC, NYC,
// state payroll deductions (SDI/PFML etc.). Annual liability estimate. State data: us-data.js (load it first).
(function (root) {
  'use strict';
  const DATA = typeof module !== 'undefined' && module.exports ? require('./us-data.js') : root.US_DATA;
  const R = {
    fed: {
      single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
      married: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
      hoh: [[17700, 0.10], [67450, 0.12], [105700, 0.22], [201750, 0.24], [256200, 0.32], [640600, 0.35], [Infinity, 0.37]],
    },
    sd: { single: 16100, married: 32200, hoh: 24150 },
    ctc: { perChild: 2200, other: 500, phaseStart: { single: 200000, hoh: 200000, married: 400000 }, per1000: 50 },
    ss: { rate: 0.062, wageBase: 184500 }, medicare: { rate: 0.0145, addl: 0.009, addlStart: { single: 200000, hoh: 200000, married: 250000 } },
    k401Limit: 24500,
  };

  // Brackets as [upperBound, rate]
  function upperTax(income, bands) {
    let prev = 0, tax = 0;
    for (const [upper, rate] of bands) {
      if (income <= prev) break;
      tax += (Math.min(income, upper) - prev) * rate;
      prev = upper;
    }
    return tax;
  }
  // Brackets as [lowerBound, rate] (state data format)
  function lowerTax(income, bands) {
    let tax = 0;
    for (let i = 0; i < bands.length; i++) {
      const [lo, rate] = bands[i];
      const hi = i + 1 < bands.length ? bands[i + 1][0] : Infinity;
      if (income > lo) tax += (Math.min(income, hi) - lo) * rate;
    }
    return tax;
  }

  function stateTax(code, status, wages, deps) {
    const s = DATA.states[code];
    if (!s || s.type === 'none') return 0;
    const fs = status === 'married' ? 'married' : 'single';
    const pick = (obj) => (obj ? obj[fs] || 0 : 0);
    let sd = pick(s.standardDeduction);
    let ex = pick(s.personalExemption) + deps * ((s.personalExemption && s.personalExemption.dependent) || 0);
    let credit = pick(s.personalCredit) + deps * ((s.personalCredit && s.personalCredit.dependent) || 0);
    const married = fs === 'married';
    if (code === 'SC' && s.SCIAD) {
      const p = s.SCIAD[fs];
      sd = wages <= p.phaseOutStart ? p.amount : wages >= p.phaseOutEnd ? 0 : p.amount * (p.phaseOutEnd - wages) / (p.phaseOutEnd - p.phaseOutStart);
    }
    if (code === 'WI') {
      const [a, b] = married ? [29039, 159690] : [20119, 136453];
      sd = wages <= a ? sd : wages >= b ? 0 : sd * (b - wages) / (b - a);
    }
    if (code === 'CT') {
      const start = married ? 48000 : 30000;
      ex = Math.max(0, pick(s.personalExemption) - Math.max(0, Math.ceil((wages - start) / 1000)) * 1000);
    }
    if (code === 'IL' && wages > (married ? 500000 : 250000)) ex = 0;
    if (code === 'OR' && wages > (married ? 200000 : 100000)) credit = 0;
    if (code === 'UT') {
      credit = pick(s.personalCredit) + deps * 2111 * 0.06;
      credit = Math.max(0, credit - Math.max(0, wages - (married ? 36426 : 18213)) * 0.013);
    }
    const ti = Math.max(0, wages - sd - ex);
    let bands = s.brackets[fs];
    if (code === 'AR' && s.bracketsHighIncome && ti > 94700) bands = s.bracketsHighIncome[fs];
    return Math.max(0, lowerTax(ti, bands) - credit);
  }

  function payrollDeductions(code, wages) {
    return (DATA.payroll[code] || []).map((p) => {
      let amt = Math.min(wages, p.wageCap || Infinity) * p.rate;
      if (p.weeklyMax) amt = Math.min(amt, p.weeklyMax * 52);
      if (p.annualMax) amt = Math.min(amt, p.annualMax);
      return { label: `${code} ${p.name}`, amount: amt };
    });
  }

  function calc(o, gross) {
    const status = ['married', 'hoh'].includes(o.filing) ? o.filing : 'single';
    const kids = Math.max(0, Math.floor(Number(o.children) || 0));
    const others = Math.max(0, Math.floor(Number(o.otherDeps) || 0));
    const k401 = Math.min(gross * Math.max(0, Number(o.k401) || 0) / 100, R.k401Limit);
    const pretax = Math.min(gross, Math.max(0, Number(o.pretax) || 0)); // §125 health/HSA: reduces income tax and FICA
    const ficaWages = gross - pretax;
    const fedWages = Math.max(0, gross - pretax - k401);

    const taxable = Math.max(0, fedWages - R.sd[status]);
    const fedBefore = upperTax(taxable, R.fed[status]);
    const phase = Math.max(0, Math.ceil((fedWages - R.ctc.phaseStart[status]) / 1000)) * R.ctc.per1000;
    const credits = Math.max(0, kids * R.ctc.perChild + others * R.ctc.other - phase);
    const fed = Math.max(0, fedBefore - credits);

    const ss = Math.min(ficaWages, R.ss.wageBase) * R.ss.rate;
    const medicare = ficaWages * R.medicare.rate + Math.max(0, ficaWages - R.medicare.addlStart[status]) * R.medicare.addl;

    const code = o.state || 'TX';
    const stWages = code === 'PA' ? ficaWages : fedWages; // PA taxes 401(k) deferrals
    const st = stateTax(code, status, stWages, kids + others);
    const lines = [
      { label: 'Federal income tax', amount: fed },
      { label: 'Social Security (6.2%)', amount: ss },
      { label: 'Medicare', amount: medicare },
      { label: `${(DATA.states[code] || {}).name || code} state income tax`, amount: st },
    ];
    if (code === 'NY' && o.nyc) {
      const nyTi = Math.max(0, stWages - DATA.states.NY.standardDeduction[status === 'married' ? 'married' : 'single'] - (kids + others) * 1000);
      lines.push({ label: 'New York City income tax', amount: lowerTax(nyTi, DATA.local.NYC.brackets[status === 'married' ? 'married' : 'single']) });
    }
    lines.push(...payrollDeductions(code, ficaWages).filter((x) => x.amount > 0));
    if (k401) lines.push({ label: '401(k) contribution', amount: k401 });
    if (pretax) lines.push({ label: 'Pre-tax health / HSA', amount: pretax });
    return {
      net: gross - lines.reduce((s, x) => s + x.amount, 0), fed, fedBefore, taxable, ss, medicare, state: st, lines,
      employer: [{ label: 'Employer FICA (7.65%)', amount: Math.min(ficaWages, R.ss.wageBase) * R.ss.rate + ficaWages * R.medicare.rate }],
      notes: 'Annual tax estimate using the standard deduction. Actual paycheck withholding depends on your W-4. Local income taxes (except NYC) are not included.',
    };
  }

  const STATES = Object.entries(DATA.states).map(([k, v]) => [k, v.name]).sort((a, b) => a[1].localeCompare(b[1]));
  const US = {
    currency: 'USD', locale: 'en-US', decimals: 2, R, calc, stateTax, lowerTax,
    labels: {
      amountGross: 'Gross pay', amountNet: 'Take-home pay you want', net: 'Take-home pay', gross: 'Gross pay',
      grossNeeded: 'Gross pay needed', breakdown: 'Taxes & deductions', employer: 'Employer cost',
      employerTotal: 'Total cost', month: 'Month', year: 'Year', error: 'Please check the numbers you entered.',
    },
    fields: [
      { name: 'amount', type: 'money', label: 'Gross pay', value: 75000, netValue: 60000, wide: true },
      { name: 'period', type: 'select', label: 'Per', value: 'year',
        options: [['year', 'Year'], ['month', 'Month'], ['semimonthly', 'Semi-monthly paycheck'], ['biweekly', 'Bi-weekly paycheck'], ['weekly', 'Weekly paycheck']] },
      { name: 'state', type: 'select', label: 'State', value: 'CA', options: STATES },
      { name: 'filing', type: 'select', label: 'Filing status', value: 'single',
        options: [['single', 'Single'], ['married', 'Married filing jointly'], ['hoh', 'Head of household']] },
      { name: 'children', type: 'number', label: 'Children under 17', value: 0 },
      { name: 'otherDeps', type: 'number', label: 'Other dependents', value: 0 },
      { name: 'k401', type: 'number', label: '401(k) contribution (%)', value: 0 },
      { name: 'pretax', type: 'money', label: 'Pre-tax health / HSA (annual)', value: 0 },
      { name: 'nyc', type: 'check', label: 'I live in New York City', value: false, showIf: 'state=NY' },
    ],
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = US;
  else (root.Countries = root.Countries || {}).us = US;
})(typeof self !== 'undefined' ? self : this);
