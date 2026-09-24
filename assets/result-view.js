// Hiển thị kết quả dạng phiếu lương, dùng chung cho trình duyệt (intl.js) và lúc build (trang mức lương tính sẵn).
// renderResult(C, r, { gross, factor, mode, periodLabel, rates }) -> { stub, detail } (HTML)
//   stub   : cuống phiếu xé rời, con số thực nhận (hoặc lương gộp cần có).
//   detail : sổ các dòng thu nhập/khấu trừ, bản sao cho doanh nghiệp (giấy vàng), ghi chú.
(function (root) {
  'use strict';
  const PERIODS = { year: 1, month: 12, semimonthly: 24, biweekly: 26, fortnight: 26, weekly: 52 };

  function formatter(C) {
    const money = new Intl.NumberFormat(C.locale, { style: 'currency', currency: C.currency, minimumFractionDigits: C.decimals, maximumFractionDigits: C.decimals });
    return (n) => money.format(n);
  }

  // Thuế suất thực tế = (brutto − netto) / brutto; thuế suất biên = phần netto mất đi khi brutto tăng thêm 1%.
  function rates(C, opts, gross) {
    if (!(gross > 0)) return { effective: 0, marginal: 0 };
    const r0 = C.calc(opts, gross);
    const step = Math.max(gross * 0.01, 1);
    const r1 = C.calc(opts, gross + step);
    return { effective: 1 - r0.net / gross, marginal: 1 - (r1.net - r0.net) / step };
  }

  const pctOf = (C) => (x) => (x * 100).toLocaleString(C.locale, { maximumFractionDigits: 1 }) + (C.locale.startsWith('en') ? '%' : ' %');

  function stubHtml(label, figure, per, meta) {
    return `<p class="stub-label">${label}<span class="stub-per"> / ${per}</span></p>
<output class="stub-figure">${figure}</output>${meta ? `<p class="stub-meta">${meta}</p>` : ''}`;
  }

  function ledger(caption, head, rows) {
    return `<table class="ledger stack"><caption>${caption}</caption>${head}<tbody>${rows}</tbody></table>`;
  }

  function renderResult(C, r, o) {
    const L = C.labels;
    const fmt = formatter(C);
    const pct = pctOf(C);
    const row = (label, annual, cls) =>
      `<tr${cls ? ` class="${cls}"` : ''}><th scope="row"><span>${label}</span></th><td data-l="${L.month}"><span>${fmt(annual / 12)}</span></td><td data-l="${L.year}"><span>${fmt(annual)}</span></td></tr>`;
    const head = `<thead><tr><th scope="col"><span class="sr-only">${L.breakdown}</span></th><th scope="col">${L.month}</th><th scope="col">${L.year}</th></tr></thead>`;
    const netMode = o.mode === 'net';
    const figure = fmt((netMode ? o.gross : r.net) / o.factor);
    const meta = o.rates
      ? `<span class="pair">${L.effective || 'Effective rate'} <b>${pct(o.rates.effective)}</b></span> · <span class="pair">${L.marginal || 'Marginal rate'} <b>${pct(o.rates.marginal)}</b></span>`
      : '';
    const deductions = r.lines.map((x) => row(x.label, -x.amount || 0, x.amount < 0 ? 'plus' : '')).join('');
    let detail = ledger(L.breakdown, head, row(L.gross, o.gross, 'gross') + deductions + row(L.net, r.net, 'total'));
    if (r.employer && r.employer.length) {
      const total = o.gross + r.employer.reduce((s, x) => s + x.amount, 0);
      detail += `<div class="ply" role="group" aria-label="${L.employer}">${ledger(L.employer, head,
        row(L.gross, o.gross, 'gross') + r.employer.map((x) => row(x.label, x.amount)).join('') + row(L.employerTotal, total, 'total'))}</div>`;
    }
    if (r.notes) detail += `<p class="slip-note">${r.notes}</p>`;
    return { stub: stubHtml(netMode ? L.grossNeeded : L.net, figure, o.periodLabel, meta), detail };
  }

  const api = { PERIODS, renderResult, rates, formatter, stubHtml, ledger };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ResultView = api;
})(typeof self !== 'undefined' ? self : this);
