// India offer check, FY 2026-27: splits a CTC breakup into cash that is certain, cash that is conditional and amounts that
// never reach the bank; computes certain vs best-case monthly in-hand (new regime by default), flags each line, and compares
// with the first payslip. Uses countries/in.js for income tax and professional tax.
(function (root) {
  'use strict';
  const IN = typeof module !== 'undefined' && module.exports ? require('./countries/in.js') : root.Countries.in;
  const R = IN.R;
  const r0 = (v) => Math.round(v);
  const n = (v) => (v === '' || v == null ? 0 : Math.max(0, Number(v) || 0));

  // o (annual ₹): { basic, hra, special, variable, employerPf?, gratuity?, insurance, benefits, joiningBonus, esop, employerNps,
  //   ctcStated?, pfMode: 'capped'|'full'|'none', state, regime, oldDeductions?, payslipNet? (monthly) }
  function check(o) {
    const basic = n(o.basic), hra = n(o.hra), special = n(o.special), variable = n(o.variable);
    const pfMode = o.pfMode || 'capped';
    const pfWage = pfMode === 'none' ? 0 : pfMode === 'full' ? basic : Math.min(basic, R.pfCeiling * 12);
    const employerPf = o.employerPf === '' || o.employerPf == null ? r0(pfWage * R.pf) : n(o.employerPf);
    const employeePf = r0(pfWage * R.pf);
    const gratuity = o.gratuity === '' || o.gratuity == null ? r0(basic * R.gratuity) : n(o.gratuity);
    const insurance = n(o.insurance), benefits = n(o.benefits), joiningBonus = n(o.joiningBonus), esop = n(o.esop), employerNps = n(o.employerNps);

    const fixedCash = basic + hra + special;
    const conditional = variable + joiningBonus + esop;
    const nonCash = employerPf + gratuity + insurance + benefits + employerNps;
    const sum = fixedCash + conditional + nonCash;
    const ctc = Math.max(n(o.ctcStated), sum); // lines beyond the stated CTC mean the stated figure is stale
    const gap = r0(ctc - sum);
    const unexplained = Math.abs(gap) < 1000 ? 0 : gap; // stated CTC not covered by the lines entered (ignore rounding)

    const regime = o.regime === 'old' ? 'old' : 'new';
    const pt = IN.professionalTax(o.state, fixedCash / 12);
    const taxOn = (gross) => {
      const ded = R.stdDeduction[regime] + (regime === 'old' ? pt + n(o.oldDeductions) : 0);
      return IN.incomeTax(Math.max(0, gross - ded), regime, o.age || 'below60').total;
    };
    const taxCertain = taxOn(fixedCash);
    const taxBest = taxOn(fixedCash + variable);
    const inHandCertain = fixedCash - employeePf - pt - taxCertain;
    const inHandBest = fixedCash + variable - employeePf - pt - taxBest;
    const joiningNet = joiningBonus ? joiningBonus - (taxOn(fixedCash + variable + joiningBonus) - taxBest) : 0;

    const flags = [];
    if (employerPf) flags.push({ key: 'pf', amount: employerPf, text: 'Employer PF goes to your EPF account, not your bank. It is yours, but locked until you leave the workforce or retire (partial withdrawals allowed).' });
    if (gratuity) flags.push({ key: 'gratuity', amount: gratuity, text: 'Gratuity is an accrual. You receive it only after 5 years of continuous service (4 years 240 days per some High Courts; 1 year for fixed-term contracts under the Code on Social Security). Leave earlier and this line was never money.' });
    if (variable) flags.push({ key: 'variable', amount: variable, text: `Variable pay is quoted at 100% target. Ask HR the average payout for the last 2 years — payouts well below target are common, and it is usually paid quarterly or annually, not monthly.` });
    if (joiningBonus) flags.push({ key: 'joining', amount: joiningBonus, text: 'Joining bonus is one-off and normally clawed back if you leave within 12 months. It is not part of next year\'s CTC.' });
    if (esop) flags.push({ key: 'esop', amount: esop, text: 'ESOP/RSU value depends on vesting (typically 4 years, 1-year cliff), the company\'s valuation and, for private companies, a liquidity event. Tax is due at exercise/vesting on the perquisite value.' });
    if (insurance || benefits) flags.push({ key: 'benefits', amount: insurance + benefits, text: 'Insurance premiums, meal cards, transport and similar benefits are costs to the employer, not cash. Meal cards and some allowances are also taxable under the new regime.' });
    if (employerNps) flags.push({ key: 'nps', amount: employerNps, text: 'Employer NPS is locked until 60 (partial withdrawals limited). It is deductible up to 14% of basic under the new regime.' });
    if (unexplained > 0) flags.push({ key: 'unexplained', amount: unexplained, text: 'The stated CTC is higher than the lines you entered. Ask for the full breakup — the gap is often "flexi benefits", employer ESI, or a retention amount you may never see.' });
    if (basic && basic < 0.5 * (fixedCash + variable)) flags.push({ key: 'basic', amount: 0, text: 'Basic is below 50% of remuneration. Under the Labour Codes wage definition allowances above 50% count as wages, so PF and gratuity should be higher than this breakup implies.' });

    let payslip = null;
    if (o.payslipNet !== '' && o.payslipNet != null) {
      const net = n(o.payslipNet);
      const expected = inHandCertain / 12;
      const diff = r0(net - expected);
      const causes = [];
      if (diff < -50) {
        const fullPfExtra = pfMode === 'capped' && basic > R.pfCeiling * 12 ? r0((basic - R.pfCeiling * 12) * R.pf / 12) : 0;
        if (fullPfExtra && Math.abs(diff + fullPfExtra) <= Math.max(100, expected * 0.01)) causes.push(`PF is being deducted on your full basic (12% of ₹${r0(basic / 12).toLocaleString('en-IN')}) rather than on the ₹${R.pfCeiling.toLocaleString('en-IN')} ceiling — the difference is still yours, in EPF.`);
        if (!causes.length && regime === 'new') causes.push('TDS may be computed on projected income including variable pay, or professional tax/state may differ — ask payroll for the tax computation sheet.');
        if (!causes.length && regime === 'old') causes.push('Old-regime deductions apply only after you submit investment proofs; until then TDS is higher.');
      } else if (diff > 50) {
        causes.push('Higher than expected: variable pay, arrears or a reimbursement may be included this month, or TDS has not started yet.');
      }
      payslip = { net, expected: r0(expected), diff, causes };
    }

    return {
      basic, hra, special, variable, employerPf, employeePf, gratuity, insurance, benefits, joiningBonus, esop, employerNps,
      fixedCash, conditional, nonCash, ctc, unexplained, pt, regime,
      tax: { certain: r0(taxCertain), best: r0(taxBest) },
      inHand: { certain: r0(inHandCertain), best: r0(inHandBest), certainMonthly: r0(inHandCertain / 12), bestMonthly: r0(inHandBest / 12) },
      shares: { cash: ctc ? fixedCash / ctc : 0, conditional: ctc ? conditional / ctc : 0, nonCash: ctc ? (nonCash + Math.max(0, unexplained)) / ctc : 0 },
      joiningNet: r0(joiningNet), gratuityAt5: r0(basic / 12 * 15 / 26 * 5), flags, payslip,
    };
  }

  const INCheck = { check };
  if (typeof module !== 'undefined' && module.exports) module.exports = INCheck;
  else root.INCheck = INCheck;
})(typeof self !== 'undefined' ? self : this);
