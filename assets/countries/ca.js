// Canada take-home pay 2026 (annual). Federal + 13 provinces/territories, CPP/QPP, EI, QPIP.
// Source: CRA T4127 Payroll Deductions Formulas, 122nd/123rd editions (2026, annualised values).
(function (root) {
  'use strict';
  const R = {
    fed: [[58523, 0.14], [117045, 0.205], [181440, 0.26], [258482, 0.29], [Infinity, 0.33]],
    fedBpa: { max: 16452, min: 14829, from: 181440, to: 258482 }, cea: 1501, abatementQC: 0.165,
    cpp: { ympe: 74600, yampe: 85000, exemption: 3500, rate: 0.0595, baseShare: 4.95 / 5.95, rate2: 0.04 },
    qpp: { rate: 0.063, baseShare: 5.30 / 6.30 },
    ei: { mie: 68900, rate: 0.0163, rateQC: 0.013 },
    qpip: { mie: 103000, rate: 0.0043 },
    // [bracket upper bound, rate]; bpa = basic personal amount
    prov: {
      AB: { name: 'Alberta', b: [[61200, .08], [154259, .10], [185111, .12], [246813, .13], [370220, .14], [Infinity, .15]], bpa: 22769 },
      BC: { name: 'British Columbia', b: [[50363, .056], [100728, .077], [115648, .105], [140430, .1229], [190405, .147], [265545, .168], [Infinity, .205]], bpa: 13216 },
      MB: { name: 'Manitoba', b: [[47000, .108], [100000, .1275], [Infinity, .174]], bpa: 15780 },
      NB: { name: 'New Brunswick', b: [[52333, .094], [104666, .14], [193861, .16], [Infinity, .195]], bpa: 13664 },
      NL: { name: 'Newfoundland and Labrador', b: [[44678, .087], [89354, .145], [159528, .158], [223340, .178], [285319, .198], [570638, .208], [1141275, .213], [Infinity, .218]], bpa: 13094 },
      NS: { name: 'Nova Scotia', b: [[30995, .0879], [61991, .1495], [97417, .1667], [157124, .175], [Infinity, .21]], bpa: 11932 },
      NT: { name: 'Northwest Territories', b: [[53003, .059], [106009, .086], [172346, .122], [Infinity, .1405]], bpa: 18198 },
      NU: { name: 'Nunavut', b: [[55801, .04], [111602, .07], [181439, .09], [Infinity, .115]], bpa: 19659 },
      ON: { name: 'Ontario', b: [[53891, .0505], [107785, .0915], [150000, .1116], [220000, .1216], [Infinity, .1316]], bpa: 12989 },
      PE: { name: 'Prince Edward Island', b: [[33928, .095], [65820, .1347], [106890, .166], [142520, .1762], [200000, .19], [Infinity, .20]], bpa: 15000 },
      QC: { name: 'Quebec', b: [[54345, .14], [108680, .19], [132245, .24], [Infinity, .2575]], bpa: 18952 },
      SK: { name: 'Saskatchewan', b: [[54532, .105], [155805, .125], [Infinity, .145]], bpa: 20381 },
      YT: { name: 'Yukon', b: [[58523, .064], [117045, .09], [181440, .109], [500000, .128], [Infinity, .15]], bpa: null },
    },
    qcWorkerDeduction: { rate: 0.06, max: 1450 },
    on: { surtax1: [5818, 0.20], surtax2: [7446, 0.36], reduction: 300 },
    bcReduction: { max: 690, from: 25570, rate: 0.0356 },
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

  function fedBpa(ni) {
    const B = R.fedBpa;
    if (ni <= B.from) return B.max;
    if (ni >= B.to) return B.min;
    return B.max - (ni - B.from) * (B.max - B.min) / (B.to - B.from);
  }

  function ohp(ti) { // Ontario Health Premium
    if (ti <= 20000) return 0;
    if (ti <= 36000) return Math.min(300, (ti - 20000) * 0.06);
    if (ti <= 48000) return Math.min(450, 300 + (ti - 36000) * 0.06);
    if (ti <= 72000) return Math.min(600, 450 + (ti - 48000) * 0.25);
    if (ti <= 200000) return Math.min(750, 600 + (ti - 72000) * 0.25);
    return Math.min(900, 750 + (ti - 200000) * 0.25);
  }

  function calc(o, income) {
    const code = R.prov[o.province] ? o.province : 'ON';
    const P = R.prov[code];
    const qc = code === 'QC';
    const I = Math.max(0, income);
    const rrsp = Math.max(0, Number(o.rrsp) || 0);

    const pensionable = Math.max(0, Math.min(I, R.cpp.ympe) - R.cpp.exemption);
    const pp1 = pensionable * (qc ? R.qpp.rate : R.cpp.rate);
    const pp2 = Math.max(0, Math.min(I, R.cpp.yampe) - R.cpp.ympe) * R.cpp.rate2;
    const ppBase = pp1 * (qc ? R.qpp.baseShare : R.cpp.baseShare);
    const ppEnh = pp1 - ppBase;
    const ei = Math.min(I, R.ei.mie) * (qc ? R.ei.rateQC : R.ei.rate);
    const qpip = qc ? Math.min(I, R.qpip.mie) * R.qpip.rate : 0;

    const ni = Math.max(0, I - ppEnh - pp2 - rrsp); // net/taxable income
    const lowFed = R.fed[0][1];
    let fed = Math.max(0, bandTax(ni, R.fed) - lowFed * (fedBpa(ni) + Math.min(I, R.cea) + ppBase + ei + qpip));
    if (qc) fed *= 1 - R.abatementQC;

    let prov;
    if (qc) {
      const ti = Math.max(0, ni - Math.min(I * R.qcWorkerDeduction.rate, R.qcWorkerDeduction.max));
      prov = Math.max(0, bandTax(ti, P.b) - P.b[0][1] * P.bpa);
    } else {
      const low = P.b[0][1];
      let bpa = P.bpa;
      if (code === 'YT') bpa = fedBpa(ni);
      if (code === 'MB') bpa = ni <= 200000 ? bpa : ni >= 400000 ? 0 : bpa * (400000 - ni) / 200000;
      const credits = low * (bpa + ppBase + ei + (code === 'YT' ? Math.min(I, R.cea) : 0));
      prov = Math.max(0, bandTax(ni, P.b) - credits);
      if (code === 'ON') {
        const s = R.on;
        const surtax = Math.max(0, prov - s.surtax1[0]) * s.surtax1[1] + Math.max(0, prov - s.surtax2[0]) * s.surtax2[1];
        prov += surtax;
        prov -= Math.max(0, Math.min(prov, 2 * s.reduction - prov));
        prov += ohp(ni);
      }
      if (code === 'BC') prov = Math.max(0, prov - Math.max(0, R.bcReduction.max - Math.max(0, ni - R.bcReduction.from) * R.bcReduction.rate));
    }

    const lines = [
      { label: 'Federal income tax', amount: fed },
      { label: `${P.name} income tax`, amount: prov },
      { label: qc ? 'QPP' : 'CPP', amount: pp1 + pp2 },
      { label: 'Employment Insurance', amount: ei },
    ];
    if (qc) lines.push({ label: 'QPIP', amount: qpip });
    if (rrsp) lines.push({ label: 'RRSP contribution', amount: rrsp });
    return {
      net: I - lines.reduce((s, x) => s + x.amount, 0), fed, prov, cpp: pp1 + pp2, ei, qpip, ni, lines, employer: [],
      notes: 'Includes basic personal amounts, CPP/EI credits and Canada Employment Amount. Other credits (e.g. dependants, tuition, provincial low-income reductions) are not included.',
    };
  }

  const PROVINCES = Object.entries(R.prov).map(([k, v]) => [k, v.name]);
  const CA = {
    currency: 'CAD', locale: 'en-CA', decimals: 2, R, calc,
    labels: {
      amountGross: 'Annual salary', amountNet: 'Take-home pay you want', net: 'Take-home pay', gross: 'Salary',
      grossNeeded: 'Salary needed', breakdown: 'Deductions', employer: '', employerTotal: '',
      month: 'Month', year: 'Year', error: 'Please check the numbers you entered.',
    },
    fields: [
      { name: 'amount', type: 'money', label: 'Salary', value: 60000, netValue: 50000, wide: true },
      { name: 'period', type: 'select', label: 'Per', value: 'year',
        options: [['year', 'Year'], ['month', 'Month'], ['semimonthly', 'Semi-monthly'], ['biweekly', 'Bi-weekly'], ['weekly', 'Week']] },
      { name: 'province', type: 'select', label: 'Province / territory', value: 'ON', options: PROVINCES },
      { name: 'rrsp', type: 'money', label: 'RRSP contributions (annual)', value: 0 },
    ],
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CA;
  else (root.Countries = root.Countries || {}).ca = CA;
})(typeof self !== 'undefined' ? self : this);
