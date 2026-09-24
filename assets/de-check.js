// Gehaltsabrechnung prüfen (Deutschland 2026): rechnet Lohnsteuer, Soli, Kirchensteuer und Sozialversicherung für die
// Steuerklasse auf der Abrechnung nach (PAP 2026 aus countries/de.js), vergleicht mit den abgezogenen Beträgen, erkennt die
// tatsächlich verwendete Steuerklasse und den KV-Zusatzbeitrag und schätzt für Ehepaare die Nachzahlung je Steuerklassenwahl.
(function (root) {
  'use strict';
  const DE = typeof module !== 'undefined' && module.exports ? require('./countries/de.js') : root.Countries.de;
  const R = DE.R;
  const r2 = (v) => Math.round(v * 100) / 100;

  function engineOpts(o, stkl) {
    const kinder = Math.max(0, Math.floor(Number(o.kinder) || 0));
    return {
      stkl: Number(stkl) || 1, zusatz: Number(o.zusatz) >= 0 ? Number(o.zusatz) : 2.9, sachsen: o.land === 'SN',
      childless: kinder === 0 && o.ueber23 !== false, pva: Math.max(0, Math.min(kinder, 5) - 1),
    };
  }

  // Erwartete Abzüge pro Monat für Brutto/Monat und Steuerklasse.
  function expected(o, stkl, brutto) {
    const r = DE.calc({ stkl, land: o.land, kirche: !!o.kirche, kinder: o.kinder, zusatz: o.zusatz }, brutto * 12);
    return { lst: r.lst, soli: r.soli, kist: r.kist, rv: r.sv.rv, av: r.sv.av, kv: r.sv.kv, pv: r.sv.pv, net: r.net / 12 };
  }

  function inferStkl(o, brutto, lst) {
    const hits = [];
    for (let k = 1; k <= 6; k++) if (Math.abs(expected(o, k, brutto).lst - lst) <= 1) hits.push(k);
    return hits;
  }

  function inferZusatz(o, brutto, kv) {
    const base = Math.min(brutto, R.bbgKv / 12);
    if (!(base > 0) || !(kv > 0)) return null;
    const z = (kv / base - R.kvBase) * 200;
    return z >= 0 && z <= 6 ? Math.round(z * 10) / 10 : null;
  }

  // Ehepaar: gemeinsame Einkommensteuer (Splitting, nur Arbeitslohn und Pauschbeträge) gegen einbehaltene Lohnsteuer
  // je Steuerklassenkombination. Rückgabe pro Kombination: monatliche Lohnsteuer beider, Netto beider, Jahresausgleich.
  function couple(o, bruttoA, bruttoB) {
    const jA = DE.floorC(bruttoA * 12), jB = DE.floorC(bruttoB * 12);
    const zve = (j, stkl) => DE.zveOf(j, engineOpts(o, stkl), 0);
    const jointTax = DE.uptab((zve(jA, 4) + zve(jB, 4)) / 2) * 2;
    const lstY = (j, stkl) => DE.jahresSteuer(j, engineOpts(o, stkl), 0);
    const combos = [];
    for (const [a, b, label] of [[3, 5, 'III / V'], [5, 3, 'V / III'], [4, 4, 'IV / IV'], [4, 4, 'IV / IV mit Faktor']]) {
      const factor = label.includes('Faktor') ? Math.min(1, Math.floor(jointTax / (lstY(jA, 4) + lstY(jB, 4)) * 1000) / 1000) : 1;
      const wA = Math.floor(lstY(jA, a) * factor), wB = Math.floor(lstY(jB, b) * factor);
      const eA = expected(o, a, bruttoA), eB = expected(o, b, bruttoB);
      const adjA = factor < 1 ? DE.floorC(wA / 12) - eA.lst : 0, adjB = factor < 1 ? DE.floorC(wB / 12) - eB.lst : 0;
      combos.push({
        label, stklA: a, stklB: b, factor, withheld: wA + wB, settlement: r2(jointTax - (wA + wB)),
        lstA: r2(eA.lst + adjA), lstB: r2(eB.lst + adjB), netA: r2(eA.net - adjA), netB: r2(eB.net - adjB),
        netTotal: r2(eA.net - adjA + eB.net - adjB),
      });
    }
    return { jointTax, combos };
  }

  // o: { brutto, stkl, lst, land, kirche, kinder, zusatz, soli?, kist?, rv?, av?, kv?, pv?, partnerBrutto?, partnerStkl? }
  function check(o) {
    const brutto = Math.max(0, Number(o.brutto) || 0);
    const stkl = Math.min(6, Math.max(1, Number(o.stkl) || 1));
    const exp = expected(o, stkl, brutto);
    const given = (k) => (o[k] === '' || o[k] == null ? null : Math.max(0, Number(o[k]) || 0));
    const lines = [];
    const LABELS = { lst: 'Lohnsteuer', soli: 'Solidaritätszuschlag', kist: 'Kirchensteuer', rv: 'Rentenversicherung', av: 'Arbeitslosenversicherung', kv: 'Krankenversicherung', pv: 'Pflegeversicherung' };
    for (const k of Object.keys(LABELS)) {
      const g = given(k);
      lines.push({ key: k, label: LABELS[k], expected: r2(exp[k]), deducted: g, diff: g == null ? null : r2(g - exp[k]) });
    }
    const lstLine = lines[0];
    const lstDiff = lstLine.diff == null ? 0 : lstLine.diff;
    const stklHits = Math.abs(lstDiff) > 1 ? inferStkl(o, brutto, lstLine.deducted) : [];
    const kvLine = lines.find((l) => l.key === 'kv');
    const zusatzHit = kvLine.diff != null && Math.abs(kvLine.diff) > 0.5 ? inferZusatz(o, brutto, kvLine.deducted) : null;
    const totalDiff = r2(lines.reduce((s, l) => s + (l.diff || 0), 0));
    const married = stkl >= 3 && stkl <= 5;
    const pb = given('partnerBrutto');
    const pair = married && pb > 0 ? couple(o, brutto, pb) : null;
    let current = null;
    if (pair) {
      const ps = Number(o.partnerStkl) || (stkl === 3 ? 5 : stkl === 5 ? 3 : 4);
      current = pair.combos.find((c) => c.stklA === stkl && c.stklB === ps && c.factor === 1) || null;
    }
    return { brutto, stkl, exp, lines, lstDiff, stklHits, zusatzHit, totalDiff, pair, current, married, kirche: !!o.kirche };
  }

  const DECheck = { expected, inferStkl, inferZusatz, couple, check };
  if (typeof module !== 'undefined' && module.exports) module.exports = DECheck;
  else root.DECheck = DECheck;
})(typeof self !== 'undefined' ? self : this);
