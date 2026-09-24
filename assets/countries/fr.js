// France — salaire brut → net 2026 (salarié du privé, CDI, métropole).
// Cotisations : URSSAF / Agirc-Arrco 2026 ; PASS 48 060 € (PMSS 4 005 €) ; taux neutre PAS : grille BOI-BAREME-000037 (1er mai 2026).
// Vecteurs de test : moteur mon-entreprise.urssaf.fr.
(function (root) {
  'use strict';
  const R = {
    pmss: 4005,
    ee: { vieillessePlaf: 0.069, vieillesseDeplaf: 0.004, aaT1: 0.0315, aaT2: 0.0864, cegT1: 0.0086, cegT2: 0.0108, cet: 0.0014, apec: 0.00024 },
    prevoyanceCadre: 0.015, // part patronale minimale sur T1 (entre dans l'assiette CSG et le net imposable)
    csgDed: 0.068, csgNonDed: 0.024, crds: 0.005, csgAbattement: 0.0175,
    // [seuil mensuel de net imposable à partir duquel le taux s'applique, taux]
    tauxNeutre: [[55558, 0.43], [25937, 0.38], [16523, 0.33], [12200, 0.28], [8789, 0.24], [7037, 0.20], [5624, 0.179],
      [4690, 0.158], [4019, 0.138], [3571, 0.119], [3135, 0.099], [2738, 0.075], [2315, 0.053], [2170, 0.041], [2060, 0.035],
      [1928, 0.029], [1807, 0.021], [1698, 0.013], [1635, 0.005]],
  };

  function tauxNeutre(netImposable) {
    for (const [seuil, taux] of R.tauxNeutre) if (netImposable >= seuil) return taux;
    return 0;
  }

  function mensuel(B, o) {
    const P = R.pmss, e = R.ee;
    const t1 = Math.min(B, P), t2 = Math.min(Math.max(B - P, 0), 7 * P);
    const cadre = o.statut === 'cadre';
    const mutEe = Math.max(0, Number(o.mutuelle ?? 20) || 0), mutEr = mutEe;
    const prev = cadre ? t1 * R.prevoyanceCadre : 0;
    const vieillesse = t1 * e.vieillessePlaf + B * e.vieillesseDeplaf;
    const retraite = t1 * (e.aaT1 + e.cegT1) + t2 * (e.aaT2 + e.cegT2) + (B > P ? Math.min(B, 8 * P) * e.cet : 0);
    const apec = cadre ? Math.min(B, 4 * P) * e.apec : 0;
    const assietteCsg = Math.min(B, 4 * P) * (1 - R.csgAbattement) + Math.max(0, B - 4 * P) + mutEr + prev;
    const csgDed = assietteCsg * R.csgDed;
    const csgCrds = assietteCsg * (R.csgNonDed + R.crds);
    const net = B - vieillesse - retraite - apec - csgDed - csgCrds - mutEe;
    const netImposable = net + csgCrds + mutEr + prev;
    const taux = o.pas === 'perso' ? Math.max(0, Number(o.tauxPerso) || 0) / 100 : tauxNeutre(netImposable);
    const pas = netImposable * taux;
    return { vieillesse, retraite, apec, csgDed, csgCrds, mutEe, net, netImposable, taux, pas };
  }

  function calc(o, brutAnnuel) {
    const m = mensuel(brutAnnuel / 12, o);
    const lines = [
      { label: 'Assurance vieillesse', amount: m.vieillesse * 12 },
      { label: 'Retraite complémentaire Agirc-Arrco', amount: m.retraite * 12 },
    ];
    if (m.apec) lines.push({ label: 'APEC', amount: m.apec * 12 });
    lines.push(
      { label: 'CSG déductible', amount: m.csgDed * 12 },
      { label: 'CSG non déductible + CRDS', amount: m.csgCrds * 12 },
      { label: 'Mutuelle (part salarié)', amount: m.mutEe * 12 },
      { label: `Prélèvement à la source (${(m.taux * 100).toLocaleString('fr-FR')} %)`, amount: m.pas * 12 },
    );
    return {
      net: brutAnnuel - lines.reduce((s, x) => s + x.amount, 0),
      netAvantImpot: m.net * 12, netImposable: m.netImposable * 12, m, lines, employer: [],
      notes: `Net avant impôt : ${(m.net).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} € / mois · net imposable : ${m.netImposable.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} € / mois.`,
    };
  }

  const FR = {
    currency: 'EUR', locale: 'fr-FR', decimals: 2, R, calc, mensuel, tauxNeutre,
    labels: {
      amountGross: 'Salaire brut', amountNet: 'Salaire net souhaité (après impôt)', net: 'Net après impôt', gross: 'Salaire brut',
      grossNeeded: 'Salaire brut nécessaire', breakdown: 'Du brut au net', employer: '', employerTotal: '',
      month: 'Mois', year: 'An', error: 'Merci de vérifier les montants saisis.',
      effective: 'Taux de prélèvement global', marginal: 'Taux marginal',
    },
    fields: [
      { name: 'amount', type: 'money', label: 'Salaire brut', value: 3000, netValue: 2200, wide: true },
      { name: 'period', type: 'select', label: 'Période', value: 'month', options: [['month', 'mois'], ['year', 'an']] },
      { name: 'statut', type: 'select', label: 'Statut', value: 'noncadre', options: [['noncadre', 'Non-cadre'], ['cadre', 'Cadre']] },
      { name: 'mutuelle', type: 'number', label: 'Mutuelle part salarié (€/mois)', value: 20 },
      { name: 'pas', type: 'select', label: 'Taux de prélèvement', value: 'neutre',
        options: [['neutre', 'Taux neutre (non personnalisé)'], ['perso', 'Mon taux personnalisé']] },
      { name: 'tauxPerso', type: 'number', label: 'Taux personnalisé (%)', value: 5, showIf: 'pas=perso' },
    ],
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = FR;
  else (root.Countries = root.Countries || {}).fr = FR;
})(typeof self !== 'undefined' ? self : this);
