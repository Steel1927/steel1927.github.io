// UK payslip check, tax year 2026/27: recomputes PAYE income tax and Class 1 NI for one pay period from the tax code
// on the payslip (HMRC period method: free pay = (code × 10 + 9) ÷ periods, taxable pay rounded down to the pound),
// compares with what was deducted, infers the code payroll actually used, and prices the code against standard 1257L.
// Sources: gov.uk rates and thresholds 2026/27; HMRC "Calculating tax using tax codes" (CWG2, Taxable Pay Tables).
(function (root) {
  'use strict';
  const R = {
    year: '2026/27', standardCode: '1257L', personalAllowance: 12570,
    rUK: [[37700, 0.20], [125140, 0.40], [Infinity, 0.45]],
    scotland: [[3967, 0.19], [16956, 0.20], [31092, 0.21], [62430, 0.42], [125140, 0.45], [Infinity, 0.48]],
    flat: { BR: 0.20, D0: 0.40, D1: 0.45 },
    flatScot: { BR: 0.20, D0: 0.21, D1: 0.42, D2: 0.45, D3: 0.48 },
    // Class 1 employee NI thresholds per pay frequency (gov.uk 2026/27) and rates
    ni: { main: 0.08, upper: 0.02, pt: { 52: 242, 26: 484, 13: 967, 12: 1048 }, uel: { 52: 967, 26: 1934, 13: 3867, 12: 4189 } },
    studentLoan: { plan1: [26900, 0.09], plan2: [29385, 0.09], plan4: [33795, 0.09], plan5: [25000, 0.09], postgrad: [21000, 0.06] },
    kLimit: 0.5, // tax under a K code cannot exceed 50% of pay in the period
  };
  const PERIODS = { monthly: 12, weekly: 52, fortnightly: 26, fourweekly: 13 };
  const r2 = (n) => Math.round(n * 100) / 100;

  // "S1257L W1" -> { region, kind: 'L'|'K'|'flat'|'0T'|'NT', number, flat, nonCumulative, valid }
  function parseCode(input) {
    let s = String(input || '').toUpperCase().replace(/\s+/g, '');
    const out = { raw: String(input || '').trim().toUpperCase().replace(/\s+/g, ' '), region: 'ruk', nonCumulative: false, valid: true };
    if (/(W1|M1|X)$/.test(s) && !/^(NT)$/.test(s)) {
      const m = s.match(/(W1\/M1|W1M1|W1|M1|X)$/);
      if (m) { out.nonCumulative = true; s = s.slice(0, -m[0].length); }
    }
    if (s[0] === 'S') { out.region = 'scotland'; s = s.slice(1); }
    else if (s[0] === 'C') { out.region = 'wales'; s = s.slice(1); }
    if (s === 'NT') { out.kind = 'NT'; return out; }
    if (s === '0T') { out.kind = '0T'; out.number = 0; return out; }
    if (/^(BR|D0|D1|D2|D3)$/.test(s)) { out.kind = 'flat'; out.flat = s; return out; }
    let m = s.match(/^K(\d{1,4})$/);
    if (m) { out.kind = 'K'; out.number = Number(m[1]); return out; }
    m = s.match(/^(\d{1,4})([LMNT])$/);
    if (m) { out.kind = 'L'; out.number = Number(m[1]); out.suffix = m[2]; return out; }
    out.valid = false; out.kind = 'L'; out.number = 1257; out.suffix = 'L';
    return out;
  }

  const bands = (region) => (region === 'scotland' ? R.scotland : R.rUK);

  function bandedTax(taxable, bnds, scale) {
    let prev = 0, tax = 0;
    const rows = [];
    for (const [upper, rate] of bnds) {
      const top = upper / scale;
      if (taxable <= prev) break;
      const amount = Math.min(taxable, top) - prev;
      rows.push({ rate, amount, tax: amount * rate });
      tax += amount * rate;
      prev = top;
    }
    return { tax, rows };
  }

  // Expected PAYE tax for `pay` in one period (or cumulatively when n > 1 and pay is the to-date figure).
  function expectedTax(pay, code, periods, n) {
    n = n || 1;
    const scale = periods / n; // annual figures ÷ periods × n
    const c = typeof code === 'string' ? parseCode(code) : code;
    const flatTable = c.region === 'scotland' ? R.flatScot : R.flat;
    if (c.kind === 'NT') return { tax: 0, freePay: 0, taxable: 0, rows: [], basis: 'No tax (NT)' };
    if (c.kind === 'flat') {
      const rate = flatTable[c.flat] || 0.2;
      const taxable = Math.floor(pay);
      return { tax: taxable * rate, freePay: 0, taxable, rows: [{ rate, amount: taxable, tax: taxable * rate }], basis: `All pay at ${Math.round(rate * 100)}%` };
    }
    const annualFree = c.kind === '0T' ? 0 : c.number * 10 + 9;
    let freePay = annualFree / scale, extraPay = 0;
    if (c.kind === 'K') { extraPay = freePay; freePay = 0; }
    const taxable = Math.max(0, Math.floor(pay + extraPay - freePay));
    let { tax, rows } = bandedTax(taxable, bands(c.region), scale);
    let capped = false;
    if (c.kind === 'K' && tax > pay * R.kLimit) { tax = pay * R.kLimit; capped = true; }
    return { tax, freePay, extraPay, taxable, rows, capped };
  }

  // Which code reproduces the tax deducted? Tries special codes, then every L and K number.
  function inferCode(pay, deducted, periods, region) {
    const tol = 1;
    const cands = [];
    const pre = region === 'scotland' ? 'S' : region === 'wales' ? 'C' : '';
    for (const k of ['BR', '0T', 'D0', 'D1', 'NT'].concat(region === 'scotland' ? ['D2', 'D3'] : [])) cands.push(pre + k);
    const matches = [];
    for (const k of cands) {
      const t = expectedTax(pay, k, periods).tax;
      if (Math.abs(t - deducted) <= tol) matches.push({ code: k, diff: t - deducted });
    }
    let best = null;
    for (let nnum = 0; nnum <= 2500; nnum++) {
      const t = expectedTax(pay, { kind: 'L', number: nnum, region }, periods).tax;
      const d = Math.abs(t - deducted);
      if (!best || d < best.d) best = { code: `${pre}${nnum}L`, d, diff: t - deducted };
    }
    if (best && best.d <= tol && best.code !== `${pre}0L` && !matches.some((m) => m.code === best.code)) matches.push({ code: best.code, diff: best.diff });
    if (!matches.length) {
      let bk = null;
      for (let nnum = 1; nnum <= 2500; nnum++) {
        const t = expectedTax(pay, { kind: 'K', number: nnum, region }, periods).tax;
        const d = Math.abs(t - deducted);
        if (!bk || d < bk.d) bk = { code: `${pre}K${nnum}`, d, diff: t - deducted };
      }
      if (bk && bk.d <= tol) matches.push({ code: bk.code, diff: bk.diff });
    }
    return matches;
  }

  function expectedNi(pay, periods, exempt) {
    if (exempt) return 0;
    const pt = R.ni.pt[periods], uel = R.ni.uel[periods];
    return Math.max(0, Math.min(pay, uel) - pt) * R.ni.main + Math.max(0, pay - uel) * R.ni.upper;
  }

  function expectedStudentLoan(pay, periods, plan) {
    const p = R.studentLoan[plan];
    if (!p) return 0;
    return Math.floor(Math.max(0, pay - p[0] / periods) * p[1]);
  }

  // Annual tax under a code for a steady salary (12 identical periods) — used to price the code against 1257L.
  function annualTax(annualPay, code, region) {
    const c = typeof code === 'string' ? parseCode(code) : code;
    if (region) c.region = region;
    return expectedTax(annualPay / 12, c, 12).tax * 12;
  }

  // opts: { code, frequency, pay, taxDeducted, niPay?, niDeducted?, niExempt?, studentPlan?, slDeducted?, periodNo?, payToDate?, taxToDate? }
  function check(o) {
    const periods = PERIODS[o.frequency] || 12;
    const code = parseCode(o.code);
    const pay = Math.max(0, Number(o.pay) || 0);
    const deducted = Math.max(0, Number(o.taxDeducted) || 0);
    const exp = expectedTax(pay, code, periods);
    const diff = r2(deducted - exp.tax);   // > 0: more tax taken than the code says
    const matches = Math.abs(diff) <= 1 ? [] : inferCode(pay, deducted, periods, code.region);

    // Is the code itself costing you? Compare with the standard code on the same pay.
    const std = { kind: 'L', number: 1257, region: code.region };
    const annualPay = pay * periods;
    const stdTax = expectedTax(pay, std, periods).tax;
    const codeCost = r2(exp.tax - stdTax); // per period, > 0: paying more than on 1257L
    const isStandard = code.kind === 'L' && code.number === 1257;
    const highIncome = annualPay > 100000;

    const ni = o.niDeducted == null || o.niDeducted === '' ? null : {
      pay: o.niPay == null || o.niPay === '' ? pay : Math.max(0, Number(o.niPay) || 0),
      deducted: Math.max(0, Number(o.niDeducted) || 0),
    };
    if (ni) { ni.expected = r2(expectedNi(ni.pay, periods, !!o.niExempt)); ni.diff = r2(ni.deducted - ni.expected); ni.pt = R.ni.pt[periods]; ni.uel = R.ni.uel[periods]; }

    const sl = o.studentPlan && R.studentLoan[o.studentPlan] ? {
      plan: o.studentPlan, expected: expectedStudentLoan(pay, periods, o.studentPlan),
      deducted: Math.max(0, Number(o.slDeducted) || 0),
    } : null;
    if (sl) sl.diff = r2(sl.deducted - sl.expected);

    let ytd = null;
    const n = Math.floor(Number(o.periodNo) || 0);
    if (n >= 1 && n <= periods && o.payToDate !== '' && o.payToDate != null && !code.nonCumulative && code.kind !== 'flat' && code.kind !== 'NT') {
      const payToDate = Math.max(0, Number(o.payToDate) || 0);
      const taxToDate = Math.max(0, Number(o.taxToDate) || 0);
      const e = expectedTax(payToDate, code, periods, n);
      ytd = { n, payToDate, taxToDate, expected: r2(e.tax), diff: r2(taxToDate - e.tax), freePay: e.freePay };
    }

    return {
      periods, frequency: o.frequency || 'monthly', code, pay, deducted, expected: { ...exp, tax: r2(exp.tax) }, diff,
      matches, isStandard, codeCost, codeCostYear: r2(codeCost * periods), stdTax: r2(stdTax), annualPay, highIncome,
      ni, sl, ytd, annualAllowance: code.kind === 'L' ? code.number * 10 + 9 : 0,
    };
  }

  const UKCheck = { R, PERIODS, parseCode, expectedTax, inferCode, expectedNi, expectedStudentLoan, annualTax, check };
  if (typeof module !== 'undefined' && module.exports) module.exports = UKCheck;
  else root.UKCheck = UKCheck;
})(typeof self !== 'undefined' ? self : this);
