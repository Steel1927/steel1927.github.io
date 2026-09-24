// So sánh lương thực nhận giữa 10 quốc gia với cùng một mức lương (quy đổi theo tỷ giá lúc build).
(function () {
  'use strict';
  const form = document.querySelector('form[data-tool="compare"]');
  const out = document.getElementById('result');
  if (!form || !out) return;
  const lang = form.dataset.lang === 'vi' ? 'vi' : 'en';
  const S = {
    en: { country: 'Country', gross: 'Gross (local)', net: 'Take-home (local)', netIn: 'Take-home in', rate: 'Deductions', open: 'Open calculator',
      note: (d) => `Exchange rates of ${d}. Default settings per country: single, no children; US: California; Canada: Ontario; India: CTC with new regime; France: non-cadre.` },
    vi: { country: 'Quốc gia', gross: 'Lương gộp (nội tệ)', net: 'Thực nhận (nội tệ)', netIn: 'Thực nhận quy đổi', rate: 'Khấu trừ', open: 'Mở công cụ',
      note: (d) => `Tỷ giá ngày ${d}. Giả định mặc định: độc thân, không con; Mỹ: California; Canada: Ontario; Ấn Độ: CTC, chế độ thuế mới; Pháp: không phải cadre.` },
  }[lang];
  const COUNTRIES = [
    ['vn', { en: 'Vietnam', vi: 'Việt Nam' }, 'VN', 'VND', '/'], ['us', { en: 'United States', vi: 'Mỹ' }, 'US', 'USD', '/us/'],
    ['uk', { en: 'United Kingdom', vi: 'Anh' }, 'UK', 'GBP', '/uk/'], ['de', { en: 'Germany', vi: 'Đức' }, 'DE', 'EUR', '/de/'],
    ['fr', { en: 'France', vi: 'Pháp' }, 'FR', 'EUR', '/fr/'], ['pl', { en: 'Poland', vi: 'Ba Lan' }, 'PL', 'PLN', '/pl/'],
    ['ca', { en: 'Canada', vi: 'Canada' }, 'CA', 'CAD', '/ca/'], ['au', { en: 'Australia', vi: 'Úc' }, 'AU', 'AUD', '/au/'],
    ['in', { en: 'India', vi: 'Ấn Độ' }, 'IN', 'INR', '/in/'], ['ph', { en: 'Philippines', vi: 'Philippines' }, 'PH', 'PHP', '/ph/'],
  ];
  const FX = window.FX;
  const loc = lang === 'vi' ? 'vi-VN' : 'en-US';
  const fmt = (n, cur) => new Intl.NumberFormat(loc, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
  const parseMoney = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0;

  function defaults(C) {
    const o = {};
    for (const f of C.fields) o[f.name] = f.type === 'check' ? !!f.value : f.type === 'money' || f.type === 'number' ? Number(f.value) || 0 : f.value;
    return o;
  }
  function netAnnual(cc, grossAnnual) {
    if (cc === 'vn') return window.Calc.grossToNet({ gross: grossAnnual / 12 }).net * 12;
    const C = window.Countries[cc];
    return C.calc(defaults(C), grossAnnual).net;
  }

  const amountEl = form.elements.amount;
  amountEl.addEventListener('input', () => {
    const n = parseMoney(amountEl.value);
    amountEl.value = n ? n.toLocaleString(loc) : '';
  });
  try {
    new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { if (form.elements[k]) form.elements[k].value = v; });
  } catch (e) { /* bỏ qua */ }

  // Công cụ Việt Nam nhận lương theo tháng; các nước khác nhận kèm kỳ (năm/tháng).
  const link = (r, factor) => (r.cc === 'vn' ? `amount=${Math.round(r.grossLocal / 12)}`
    : `amount=${Math.round(r.grossLocal / factor)}&period=${factor === 12 ? 'month' : 'year'}`);

  let interacted = false;
  function update(ev) {
    const cur = form.elements.currency.value;
    const factor = form.elements.period.value === 'month' ? 12 : 1;
    const annual = parseMoney(amountEl.value) * factor;
    const rows = COUNTRIES.map(([cc, names, flag, local, href]) => {
      const grossLocal = annual / FX.rates[cur] * FX.rates[local];
      const net = netAnnual(cc, grossLocal);
      const netConv = net / FX.rates[local] * FX.rates[cur];
      return { cc, name: names[lang], flag, local, href, grossLocal, net, netConv, eff: grossLocal ? 1 - net / grossLocal : 0 };
    }).sort((a, b) => b.netConv - a.netConv);
    const max = rows[0].netConv || 1;
    out.innerHTML = `<table class="ledger compare"><caption>${S.netIn} ${cur}</caption><thead><tr><th>${S.country}</th><th>${S.gross}</th><th>${S.net}</th><th>${S.netIn} ${cur}</th><th>${S.rate}</th></tr></thead><tbody>
${rows.map((r) => `<tr><th scope="row"><a href="${r.href}#${link(r, factor)}" title="${S.open}"><span class="cc">${r.flag}</span>${r.name}</a></th>
<td>${fmt(r.grossLocal / factor, r.local)}</td><td>${fmt(r.net / factor, r.local)}</td>
<td><div class="bar-cell"><span style="width:${(r.netConv / max * 100).toFixed(1)}%"></span><b>${fmt(r.netConv / factor, cur)}</b></div></td>
<td>${(r.eff * 100).toFixed(1)}%</td></tr>`).join('')}
</tbody></table><p class="slip-note">${S.note(FX.date)} <a href="https://www.exchangerate-api.com" rel="nofollow noopener">Rates By Exchange Rate API</a></p>`;
    const live = document.getElementById('live');
    if (live) live.textContent = `${rows[0].name}: ${fmt(rows[0].netConv / factor, cur)}`;
    if (ev) {
      const params = new URLSearchParams({ amount: parseMoney(amountEl.value), currency: cur, period: form.elements.period.value });
      history.replaceState(null, '', '#' + params);
      if (!interacted) { interacted = true; if (window.track) window.track('compare'); }
    }
  }
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => { e.preventDefault(); update(e); });
  update();
})();
