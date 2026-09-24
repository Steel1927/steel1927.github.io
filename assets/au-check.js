// Australia super check, 2026–27: is the Superannuation Guarantee on the payslip right (12% of ordinary time earnings),
// did it actually reach the fund, and what a shortfall costs by retirement. Node + browser.
// Sources: ATO "Explaining qualifying earnings", "Maximum contributions base" (Payday Super, 1 July 2026); Moneysmart assumptions.
(function (root) {
  'use strict';
  const R = {
    year: '2026–27', sgRate: 0.12, previousRate: 0.115,
    maxBaseYear: 270830,        // maximum contribution base 2026–27: annual, cumulative per employer under Payday Super (ATO)
    returnRate: 0.061,          // Moneysmart calculator "Balanced" return, net of tax and fees, before inflation (Jun 2026)
    retireAge: 67,
    paydaySuper: { from: '2026-07-01', businessDays: 7 },
  };
  const PERIODS = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4 };
  const r2 = (n) => Math.round(n * 100) / 100;

  function expectedSg(ote, periods) {
    const cap = R.maxBaseYear / periods;
    return { sg: Math.min(ote, cap) * R.sgRate, cap, capped: ote > cap };
  }

  // Explain a shortfall: which common employer mistake reproduces the payslip figure?
  function diagnose(ote, extras, shown, periods) {
    const tol = Math.max(1, ote * 0.002);
    const hits = [];
    const base = Math.max(0, ote - extras);
    if (Math.abs(base * R.sgRate - shown) <= tol && extras > 0) hits.push({ key: 'base-only', text: 'matches 12% of base pay only — allowances, loadings, commissions and bonuses left out' });
    if (Math.abs(ote * R.previousRate - shown) <= tol) hits.push({ key: 'old-rate', text: 'matches the old 11.5% rate (before 1 July 2025)' });
    if (Math.abs(base * R.previousRate - shown) <= tol && extras > 0) hits.push({ key: 'old-rate-base', text: 'matches 11.5% of base pay only' });
    const cap = expectedSg(ote, periods).cap;
    if (ote > cap && Math.abs(cap * R.sgRate - shown) <= tol) hits.push({ key: 'cap', text: 'matches 12% of the maximum contribution base — correct for high earners' });
    if (!hits.length && shown > 0) {
      const rate = shown / ote;
      hits.push({ key: 'rate', text: `works out at ${(rate * 100).toFixed(2)}% of ordinary time earnings`, rate });
    }
    return hits;
  }

  // Future value of a regular shortfall (annual amount A for n years) and of a one-off amount, at rate r.
  const fvSeries = (annual, years, r) => (years <= 0 ? 0 : r === 0 ? annual * years : annual * (Math.pow(1 + r, years) - 1) / r);
  const fvLump = (amount, years, r) => amount * Math.pow(1 + r, Math.max(0, years));

  // opts: { frequency, ote, extras?, overtime?, superShown, sacrifice?, age?, returnRate?,
  //         quarterAccrued?, quarterReceived? }
  function check(o) {
    const periods = PERIODS[o.frequency] || 26;
    const ote = Math.max(0, Number(o.ote) || 0);
    const extras = Math.min(ote, Math.max(0, Number(o.extras) || 0));
    const overtime = Math.max(0, Number(o.overtime) || 0);
    const shown = Math.max(0, Number(o.superShown) || 0);
    const sacrifice = Math.max(0, Number(o.sacrifice) || 0);
    const age = Math.max(15, Math.min(75, Number(o.age) || 35));
    const r = o.returnRate == null || o.returnRate === '' ? R.returnRate : Math.max(0, Number(o.returnRate) / 100 || 0);
    const years = Math.max(0, R.retireAge - age);

    const e = expectedSg(ote, periods);
    const expected = r2(e.sg);
    const diff = r2(shown - expected);            // < 0: short
    const short = Math.max(0, -diff);
    const hits = short > Math.max(1, ote * 0.002) ? diagnose(ote, extras, shown, periods) : [];
    // Salary sacrifice cannot reduce SG: expected is on pre-sacrifice OTE. Flag if employer did.
    const sacrificeTrap = sacrifice > 0 && Math.abs((ote - sacrifice) * R.sgRate - shown) <= Math.max(1, ote * 0.002) && short > 0;

    const shortYear = short * periods;
    const lost = { perYear: r2(shortYear), byRetirement: r2(fvSeries(shortYear, years, r)), years, rate: r };

    let paid = null;
    if (o.quarterReceived !== '' && o.quarterReceived != null) {
      const accrued = Math.max(0, Number(o.quarterAccrued) || 0) || expected * periods / 4;
      const received = Math.max(0, Number(o.quarterReceived) || 0);
      const unpaid = r2(Math.max(0, accrued - received));
      paid = { accrued: r2(accrued), received, unpaid, byRetirement: r2(fvLump(unpaid, years, r)), unpaidYear: r2(unpaid * 4), unpaidYearByRetirement: r2(fvSeries(unpaid * 4, years, r)) };
    }

    return { periods, frequency: o.frequency || 'fortnightly', ote, extras, overtime, shown, expected, cap: e.cap, capped: e.capped, diff, short, hits, sacrifice, sacrificeTrap, age, lost, paid };
  }

  const AUCheck = { R, PERIODS, expectedSg, diagnose, fvSeries, fvLump, check };
  if (typeof module !== 'undefined' && module.exports) module.exports = AUCheck;
  else root.AUCheck = AUCheck;
})(typeof self !== 'undefined' ? self : this);
