// Brutto-Netto-Rechner Deutschland 2026 — Lohnsteuer nach PAP 2026 (BMF, Stand 12.11.2025), Sozialversicherung 2026.
// https://www.bundesfinanzministerium.de/Content/DE/Downloads/Steuern/Steuerarten/Lohnsteuer/Programmablaufplan/2025-11-12-PAP-2026-anlage-1.pdf
(function (root) {
  'use strict';
  const R = {
    gfb: 12348, anp: 1230, sap: 36, efa: 4260, kfbFull: 9756, kfbHalf: 4878,
    w1: 14071, w2: 34939, w3: 222260,
    soliFreigrenze: 20350,
    bbgRv: 101400, bbgKv: 69750,
    rv: 0.093, av: 0.013, kvBase: 0.073, pvBase: 0.018, pvSachsen: 0.023, pvChildless: 0.006, pvPerChild: 0.0025,
    employer: { rv: 0.093, av: 0.013, kv: 0.073, pv: 0.018, pvSachsen: 0.013 },
    minijob: 603, midiMax: 2000, midiF: 0.6619,
  };
  const floorC = (v) => Math.floor(v * 100 + 1e-9) / 100;
  const ceilE = (v) => Math.ceil(v - 1e-9);
  const trunc6 = (v) => Math.floor(v * 1e6 + 1e-9) / 1e6;
  const round2 = (v) => Math.round(v * 100) / 100;

  // §32a EStG 2026
  function uptab(x) {
    x = Math.floor(x);
    let st;
    if (x <= 12348) st = 0;
    else if (x <= 17799) { const y = trunc6((x - 12348) / 10000); st = (914.51 * y + 1400) * y; }
    else if (x <= 69878) { const z = trunc6((x - 17799) / 10000); st = (173.10 * z + 2397) * z + 1034.87; }
    else if (x <= 277825) st = 0.42 * x - 11135.63;
    else st = 0.45 * x - 19470.38;
    return Math.floor(st + 1e-9);
  }

  function up56(x) {
    const diff = (uptab(Math.floor(x * 1.25)) - uptab(Math.floor(x * 0.75))) * 2;
    return Math.max(diff, Math.floor(x * 0.14));
  }

  // §39b Abs. 2 Satz 7 EStG (Steuerklassen V und VI)
  function mst56(zzx) {
    zzx = Math.floor(zzx);
    if (zzx > R.w2) {
      const base = up56(R.w2);
      if (zzx > R.w3) return Math.floor(Math.floor(base + (R.w3 - R.w2) * 0.42) + (zzx - R.w3) * 0.45);
      return Math.floor(base + (zzx - R.w2) * 0.42);
    }
    let st = up56(zzx);
    if (zzx > R.w1) st = Math.min(st, Math.floor(up56(R.w1) + (zzx - R.w1) * 0.42));
    return st;
  }

  // Zu versteuerndes Einkommen (Lohnsteuerverfahren) für Jahresbrutto zre4j; kfb = zusätzlicher Kinderfreibetrag.
  function zveOf(zre4j, o, kfb) {
    const stkl = o.stkl;
    const anp = stkl === 6 ? 0 : Math.min(R.anp, Math.ceil(zre4j));
    const sap = stkl === 6 ? 0 : R.sap;
    const efa = stkl === 2 ? R.efa : 0;
    const vspr = floorC(Math.min(zre4j, R.bbgRv) * R.rv);
    const kvsatz = 0.07 + o.zusatz / 200;
    const pvsatz = (o.sachsen ? R.pvSachsen : R.pvBase) + (o.childless ? R.pvChildless : -o.pva * R.pvPerChild);
    const vspkvpv = floorC(Math.min(zre4j, R.bbgKv) * (kvsatz + pvsatz));
    let vsp = ceilE(vspr + vspkvpv);
    if (stkl !== 6) {
      const vsphb = Math.min(1900, 0.013 * Math.min(zre4j, R.bbgRv) + vspkvpv);
      vsp = Math.max(vsp, ceilE(vspr + vsphb));
    }
    return Math.max(0, zre4j - (anp + sap + efa + kfb) - vsp);
  }

  // Jahreslohnsteuer für Jahresbrutto zre4j (kfb nur für Soli/KiSt-Bemessung).
  function jahresSteuer(zre4j, o, kfb) {
    const stkl = o.stkl;
    const zve = zveOf(zre4j, o, kfb);
    if (zve < 1) return 0;
    if (stkl === 5 || stkl === 6) return mst56(zve);
    if (stkl === 3) return uptab(zve / 2) * 2;
    return uptab(zve);
  }

  function sozial(monat, o) {
    const pvAn = (o.sachsen ? R.pvSachsen : R.pvBase) - (o.childless ? 0 : o.pva * R.pvPerChild);
    const kvAn = R.kvBase + o.zusatz / 200;
    const midi = monat > R.minijob && monat <= R.midiMax;
    // Übergangsbereich: beitragspflichtige Einnahme für den Arbeitnehmeranteil bzw. gesamt (§ 20a SGB IV)
    const baseAn = midi ? (R.midiMax / (R.midiMax - R.minijob)) * (monat - R.minijob) : monat;
    const baseGes = midi ? R.midiF * R.minijob + (R.midiMax / (R.midiMax - R.minijob) - (R.minijob / (R.midiMax - R.minijob)) * R.midiF) * (monat - R.minijob) : monat;
    const rvB = Math.min(baseAn, R.bbgRv / 12), kvB = Math.min(baseAn, R.bbgKv / 12);
    const rv = round2(rvB * R.rv), av = round2(rvB * R.av), kv = round2(kvB * kvAn);
    const pv = round2(kvB * pvAn + (o.childless ? Math.min(baseGes, R.bbgKv / 12) * R.pvChildless : 0));
    const e = R.employer;
    const eRv = Math.min(baseGes, R.bbgRv / 12), eKv = Math.min(baseGes, R.bbgKv / 12);
    // Arbeitgeberanteil = Gesamtbeitrag auf baseGes − Arbeitnehmeranteil (im Übergangsbereich), sonst halbe Beiträge.
    const ag = midi
      ? round2(eRv * (R.rv * 2 + R.av * 2) + eKv * (kvAn * 2 + (o.sachsen ? R.pvSachsen + e.pvSachsen : R.pvBase * 2))) - (rv + av + kv + (pv - (o.childless ? round2(Math.min(baseGes, R.bbgKv / 12) * R.pvChildless) : 0)))
      : round2(eRv * (e.rv + e.av) + eKv * (kvAn + (o.sachsen ? e.pvSachsen : e.pv)));
    return { rv, av, kv, pv, ag: Math.max(0, ag) };
  }

  function calc(opts, gross) {
    const kinder = Math.max(0, Math.floor(Number(opts.kinder) || 0));
    const o = {
      stkl: Number(opts.stkl) || 1,
      zusatz: Number(opts.zusatz) >= 0 ? Number(opts.zusatz) : 2.9,
      sachsen: opts.land === 'SN',
      childless: kinder === 0 && opts.ueber23 !== false,
      pva: Math.max(0, Math.min(kinder, 5) - 1),
    };
    const kirche = opts.kirche ? (opts.land === 'BY' || opts.land === 'BW' ? 0.08 : 0.09) : 0;
    const monat = gross / 12;

    if (monat <= R.minijob) {
      return {
        net: gross, lines: [], employer: [{ label: 'Minijob-Pauschalabgaben (ca. 30 %)', amount: gross * 0.3 }],
        notes: 'Minijob bis 603 € im Monat: pauschal versteuert und versichert durch den Arbeitgeber (RV-Befreiung auf Antrag).',
      };
    }

    const zre4j = floorC(monat * 12);
    const st = jahresSteuer(zre4j, o, 0);
    const kfb = o.stkl === 5 || o.stkl === 6 || kinder === 0 ? 0 : kinder * (o.stkl === 4 ? R.kfbHalf : R.kfbFull);
    const jbmg = kfb ? jahresSteuer(zre4j, o, kfb) : st;
    const kz = o.stkl === 3 ? 2 : 1;
    const soliJ = jbmg > R.soliFreigrenze * kz ? floorC(Math.min(jbmg * 0.055, (jbmg - R.soliFreigrenze * kz) * 0.119)) : 0;

    const lst = floorC(st / 12), soli = floorC(soliJ / 12), bk = floorC(jbmg / 12);
    const kist = floorC(bk * kirche);
    const sv = sozial(monat, o);

    const lines = [
      { label: 'Lohnsteuer', amount: lst * 12 },
      { label: 'Solidaritäts­zuschlag', amount: soli * 12 },
    ];
    if (kirche) lines.push({ label: `Kirchensteuer (${kirche * 100} %)`, amount: kist * 12 });
    lines.push(
      { label: 'Renten­versicherung', amount: sv.rv * 12 },
      { label: 'Arbeitslosen­versicherung', amount: sv.av * 12 },
      { label: 'Kranken­versicherung', amount: sv.kv * 12 },
      { label: 'Pflege­versicherung', amount: sv.pv * 12 },
    );
    const abz = lines.reduce((s, x) => s + x.amount, 0);
    return {
      net: gross - abz, lst, soli, kist, sv, lines,
      employer: [{ label: 'Sozial­versicherung Arbeitgeber', amount: sv.ag * 12 }],
      notes: monat <= R.midiMax ? 'Übergangsbereich (Midijob): reduzierte Arbeitnehmerbeiträge zur Sozialversicherung.' : '',
    };
  }

  const LAENDER = [['BW', 'Baden-Württemberg'], ['BY', 'Bayern'], ['BE', 'Berlin'], ['BB', 'Brandenburg'], ['HB', 'Bremen'],
    ['HH', 'Hamburg'], ['HE', 'Hessen'], ['MV', 'Mecklenburg-Vorpommern'], ['NI', 'Niedersachsen'], ['NW', 'Nordrhein-Westfalen'],
    ['RP', 'Rheinland-Pfalz'], ['SL', 'Saarland'], ['SN', 'Sachsen'], ['ST', 'Sachsen-Anhalt'], ['SH', 'Schleswig-Holstein'], ['TH', 'Thüringen']];

  const DE = {
    currency: 'EUR', locale: 'de-DE', decimals: 2, R, calc, uptab, mst56, zveOf, jahresSteuer, sozial, floorC,
    labels: {
      amountGross: 'Bruttogehalt', amountNet: 'Gewünschtes Nettogehalt', net: 'Nettogehalt', gross: 'Bruttogehalt',
      grossNeeded: 'Benötigtes Bruttogehalt', breakdown: 'Abzüge Arbeitnehmer', employer: 'Kosten Arbeitgeber',
      employerTotal: 'Gesamtkosten', month: 'Monat', year: 'Jahr', error: 'Bitte Eingaben prüfen.',
      effective: 'Abgabenquote', marginal: 'Grenzbelastung',
    },
    fields: [
      { name: 'amount', type: 'money', label: 'Bruttogehalt', value: 4000, netValue: 2600, wide: true },
      { name: 'period', type: 'select', label: 'Zeitraum', value: 'month', options: [['month', 'Monat'], ['year', 'Jahr']] },
      { name: 'stkl', type: 'select', label: 'Steuerklasse', value: '1',
        options: [['1', 'I – ledig'], ['2', 'II – alleinerziehend'], ['3', 'III – verheiratet'], ['4', 'IV – verheiratet'], ['5', 'V – verheiratet'], ['6', 'VI – Zweitjob']] },
      { name: 'land', type: 'select', label: 'Bundesland', value: 'NW', options: LAENDER },
      { name: 'kirche', type: 'check', label: 'Kirchensteuerpflichtig', value: false },
      { name: 'kinder', type: 'number', label: 'Kinder (unter 25)', value: 0 },
      { name: 'zusatz', type: 'number', label: 'KV-Zusatzbeitrag (%)', value: 2.9 },
    ],
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = DE;
  else (root.Countries = root.Countries || {}).de = DE;
})(typeof self !== 'undefined' ? self : this);
