// Polska — wynagrodzenie brutto → netto 2026, umowa o pracę. Obliczenie miesiąc po miesiącu (styczeń–grudzień),
// z limitem 30-krotności (282 600 zł) i progiem 120 000 zł. Płaca minimalna 4 806 zł.
(function (root) {
  'use strict';
  const R = {
    zus: { emerytalne: 0.0976, rentowe: 0.015, chorobowe: 0.0245 },
    er: { emerytalne: 0.0976, rentowe: 0.065, wypadkowe: 0.0167, fp: 0.0245, fgsp: 0.001 },
    limit30: 282600, zdrowotna: 0.09,
    prog: 120000, stawka1: 0.12, stawka2: 0.32, kwotaZmniejszajaca: 300,
    ulgaMlodych: 85528, ppkEe: 0.02, ppkEr: 0.015,
  };
  const r2 = (v) => Math.round(v * 100) / 100;

  function calc(o, bruttoRoczne) {
    const B = bruttoRoczne / 12;
    const kup = o.kup === '300' ? 300 : 250;
    const pit2 = o.pit2 !== false;
    const ppk = !!o.ppk;
    let cumZus = 0, cumBase = 0, cumExempt = 0;
    const sum = { emer: 0, rent: 0, chor: 0, zdr: 0, pit: 0, ppk: 0, er: 0 };
    for (let m = 1; m <= 12; m++) {
      const capLeft = Math.max(0, R.limit30 - cumZus);
      const capped = Math.min(B, capLeft);
      cumZus += B;
      const emer = r2(capped * R.zus.emerytalne), rent = r2(capped * R.zus.rentowe), chor = r2(B * R.zus.chorobowe);
      const zus = emer + rent + chor;
      const zdr = r2((B - zus) * R.zdrowotna);
      const ppkEr = ppk ? r2(B * R.ppkEr) : 0;
      const ppkEe = ppk ? r2(B * R.ppkEe) : 0;
      // Ulga dla młodych: przychód zwolniony do 85 528 zł rocznie (bez kosztów na część zwolnioną).
      let taxableShare = 1;
      if (o.mlody) {
        const exemptNow = Math.min(B + ppkEr, Math.max(0, R.ulgaMlodych - cumExempt));
        cumExempt += exemptNow;
        taxableShare = (B + ppkEr) > 0 ? 1 - exemptNow / (B + ppkEr) : 0;
      }
      let pit = 0;
      if (taxableShare > 0) {
        const base = Math.max(0, Math.round((B + ppkEr - zus) * taxableShare - kup));
        const low = Math.max(0, Math.min(base, R.prog - cumBase));
        const high = base - low;
        cumBase += base;
        pit = Math.max(0, Math.round(low * R.stawka1 + high * R.stawka2 - (pit2 ? R.kwotaZmniejszajaca : 0)));
      }
      sum.emer += emer; sum.rent += rent; sum.chor += chor; sum.zdr += zdr; sum.pit += pit; sum.ppk += ppkEe;
      sum.er += r2(capped * (R.er.emerytalne + R.er.rentowe)) + r2(B * (R.er.wypadkowe + R.er.fp + R.er.fgsp)) + ppkEr;
    }
    const lines = [
      { label: 'Składka emerytalna', amount: sum.emer },
      { label: 'Składka rentowa', amount: sum.rent },
      { label: 'Składka chorobowa', amount: sum.chor },
      { label: 'Składka zdrowotna', amount: sum.zdr },
      { label: 'Zaliczka na PIT', amount: sum.pit },
    ];
    if (ppk) lines.push({ label: 'PPK (pracownik 2%)', amount: sum.ppk });
    return {
      net: bruttoRoczne - lines.reduce((s, x) => s + x.amount, 0), sum, lines,
      employer: [{ label: 'Składki pracodawcy (ZUS, FP, FGŚP' + (ppk ? ', PPK' : '') + ')', amount: sum.er }],
      notes: 'Kwoty miesięczne to średnia z 12 miesięcy: przy wysokich zarobkach netto spada po przekroczeniu progu 120 000 zł i rośnie po osiągnięciu limitu składek ZUS.',
    };
  }

  const PL = {
    currency: 'PLN', locale: 'pl-PL', decimals: 2, R, calc,
    labels: {
      amountGross: 'Wynagrodzenie brutto', amountNet: 'Oczekiwane netto', net: 'Wynagrodzenie netto', gross: 'Brutto',
      grossNeeded: 'Potrzebne brutto', breakdown: 'Potrącenia pracownika', employer: 'Koszt pracodawcy',
      employerTotal: 'Całkowity koszt', month: 'Miesiąc', year: 'Rok', error: 'Sprawdź wprowadzone kwoty.',
      effective: 'Łączne obciążenie', marginal: 'Krańcowe obciążenie',
    },
    fields: [
      { name: 'amount', type: 'money', label: 'Wynagrodzenie brutto', value: 8000, netValue: 6000, wide: true },
      { name: 'period', type: 'select', label: 'Okres', value: 'month', options: [['month', 'miesiąc'], ['year', 'rok']] },
      { name: 'kup', type: 'select', label: 'Koszty uzyskania przychodu', value: '250',
        options: [['250', 'Standardowe (250 zł)'], ['300', 'Podwyższone – dojazd (300 zł)']] },
      { name: 'pit2', type: 'check', label: 'Złożony PIT-2 (kwota zmniejszająca 300 zł)', value: true },
      { name: 'ppk', type: 'check', label: 'Uczestniczę w PPK', value: false },
      { name: 'mlody', type: 'check', label: 'Mam mniej niż 26 lat (ulga dla młodych)', value: false },
    ],
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL;
  else (root.Countries = root.Countries || {}).pl = PL;
})(typeof self !== 'undefined' ? self : this);
