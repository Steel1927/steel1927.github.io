// India CTC → in-hand salary, tax year 2026-27 (Income-tax Act, 2025; rates unchanged by Finance Act 2026).
// New regime (s.202): slabs 0/5/10/15/20/25/30%, standard deduction ₹75,000, rebate (s.156) up to ₹60,000 for income ≤ ₹12L
// with marginal relief. EPF wage ceiling ₹25,000/month from 17 Sep 2026 (S.O. 5109(E)).
(function (root) {
  'use strict';
  const L = 100000;
  const R = {
    newSlabs: [[4 * L, 0], [8 * L, 0.05], [12 * L, 0.10], [16 * L, 0.15], [20 * L, 0.20], [24 * L, 0.25], [Infinity, 0.30]],
    oldSlabs: {
      below60: [[2.5 * L, 0], [5 * L, 0.05], [10 * L, 0.20], [Infinity, 0.30]],
      '60to79': [[3 * L, 0], [5 * L, 0.05], [10 * L, 0.20], [Infinity, 0.30]],
      '80plus': [[5 * L, 0], [10 * L, 0.20], [Infinity, 0.30]],
    },
    stdDeduction: { new: 75000, old: 50000 },
    rebate: { new: [12 * L, 60000], old: [5 * L, 12500] },
    surcharge: { new: [[50 * L, 0.10], [100 * L, 0.15], [200 * L, 0.25]], old: [[50 * L, 0.10], [100 * L, 0.15], [200 * L, 0.25], [500 * L, 0.37]] },
    cess: 0.04,
    pf: 0.12, pfCeiling: 25000, gratuity: 15 / 26 / 12,
  };

  function slabTax(income, slabs) {
    let prev = 0, tax = 0;
    for (const [upper, rate] of slabs) {
      if (income <= prev) break;
      tax += (Math.min(income, upper) - prev) * rate;
      prev = upper;
    }
    return tax;
  }

  function baseTax(taxable, regime, age) {
    const slabs = regime === 'old' ? R.oldSlabs[age] || R.oldSlabs.below60 : R.newSlabs;
    let tax = slabTax(taxable, slabs);
    const [limit, max] = R.rebate[regime];
    if (taxable <= limit) tax = Math.max(0, tax - Math.min(tax, max));
    else if (regime === 'new') tax = Math.min(tax, taxable - limit); // marginal relief on the rebate
    return tax;
  }

  function surchargeRate(taxable, regime) {
    let rate = 0;
    for (const [th, r] of R.surcharge[regime]) if (taxable > th) rate = r;
    return rate;
  }

  // Tax + surcharge (with marginal relief) + 4% cess on the taxable income.
  function incomeTax(taxable, regime = 'new', age = 'below60') {
    taxable = Math.max(0, Math.floor(taxable));
    const tax = baseTax(taxable, regime, age);
    let sur = tax * surchargeRate(taxable, regime);
    for (const [th] of R.surcharge[regime]) {
      if (taxable > th && surchargeRate(taxable, regime) === surchargeRate(th + 1, regime)) {
        const atTh = baseTax(th, regime, age) * (1 + surchargeRate(th, regime));
        sur = Math.min(sur, Math.max(0, atTh + (taxable - th) - tax));
      }
    }
    const cess = (tax + sur) * R.cess;
    return { tax, surcharge: sur, cess, total: tax + sur + cess };
  }

  function professionalTax(state, monthly) {
    switch (state) {
      case 'MH': return monthly > 10000 ? 2500 : monthly > 7500 ? 175 * 12 : 0;
      case 'KA': return monthly >= 25000 ? 2500 : 0;
      case 'WB': return 12 * (monthly > 40000 ? 200 : monthly > 25000 ? 150 : monthly > 15000 ? 130 : monthly > 10000 ? 110 : 0);
      case 'TN': {
        const half = monthly * 6;
        return 2 * (half > 75000 ? 1250 : half > 60000 ? 1025 : half > 45000 ? 930 : half > 30000 ? 425 : half > 21000 ? 180 : 0);
      }
      default: return 0;
    }
  }

  function calc(o, ctc) {
    const regime = o.regime === 'old' ? 'old' : 'new';
    const basicPct = Math.min(100, Math.max(0, Number(o.basicPct) || 50)) / 100;
    // CTC = basic + allowances + employer PF + gratuity; solve basic from the percentage of CTC.
    const basic = ctc * basicPct;
    const pfWage = o.pf === 'full' ? basic : Math.min(basic, R.pfCeiling * 12);
    const pf = o.pf === 'none' ? 0 : pfWage * R.pf;
    const gratuity = o.gratuity === false ? 0 : basic * R.gratuity;
    const gross = ctc - pf - gratuity;
    const pt = professionalTax(o.state, gross / 12);
    const deductions = R.stdDeduction[regime] + (regime === 'old' ? pt + Math.max(0, Number(o.oldDeductions) || 0) : 0);
    const taxable = Math.max(0, gross - deductions);
    const t = incomeTax(taxable, regime, o.age);
    const lines = [
      { label: 'Employer PF (part of CTC)', amount: pf },
      { label: 'Gratuity (part of CTC)', amount: gratuity },
      { label: 'Employee PF', amount: pf },
      { label: 'Professional tax', amount: pt },
      { label: `Income tax incl. 4% cess (${regime} regime)`, amount: t.total },
    ].filter((x) => x.amount > 0 || x.label.startsWith('Income tax'));
    const net = ctc - lines.reduce((s, x) => s + x.amount, 0);
    return { net, gross, taxable, tax: t, pf, gratuity, pt, lines, employer: [] };
  }

  const IN = {
    currency: 'INR', locale: 'en-IN', decimals: 0, R, calc, incomeTax, professionalTax,
    labels: {
      amountGross: 'Annual CTC', amountNet: 'In-hand salary you want', net: 'In-hand salary', gross: 'CTC',
      grossNeeded: 'CTC needed', breakdown: 'From CTC to in-hand', employer: '', employerTotal: '',
      month: 'Month', year: 'Year', error: 'Please check the numbers you entered.',
    },
    fields: [
      { name: 'amount', type: 'money', label: 'Annual CTC', value: 1200000, netValue: 1000000, wide: true },
      { name: 'period', type: 'select', label: 'Per', value: 'year', options: [['year', 'Year'], ['month', 'Month']] },
      { name: 'regime', type: 'select', label: 'Tax regime', value: 'new', options: [['new', 'New regime (default)'], ['old', 'Old regime']] },
      { name: 'basicPct', type: 'number', label: 'Basic salary (% of CTC)', value: 50 },
      { name: 'pf', type: 'select', label: 'Provident Fund', value: 'capped',
        options: [['capped', '12% on basic up to ₹25,000/month'], ['full', '12% of full basic'], ['none', 'No PF']] },
      { name: 'state', type: 'select', label: 'Professional tax (state)', value: 'MH',
        options: [['MH', 'Maharashtra'], ['KA', 'Karnataka'], ['WB', 'West Bengal'], ['TN', 'Tamil Nadu (Chennai)'], ['', 'None / other']] },
      { name: 'gratuity', type: 'check', label: 'Gratuity included in CTC', value: true },
      { name: 'age', type: 'select', label: 'Age (old regime)', value: 'below60', showIf: 'regime=old',
        options: [['below60', 'Below 60'], ['60to79', '60 to 79'], ['80plus', '80 and above']] },
      { name: 'oldDeductions', type: 'money', label: '80C + 80D + HRA exemption etc. (annual)', value: 150000, showIf: 'regime=old' },
    ],
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = IN;
  else (root.Countries = root.Countries || {}).in = IN;
})(typeof self !== 'undefined' ? self : this);
