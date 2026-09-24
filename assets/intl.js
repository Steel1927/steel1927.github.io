// Giao diện chung cho máy tính lương quốc tế. Module quốc gia: window.Countries[cc]
// với { currency, locale, decimals, labels, fields, calc(opts, annualGross) -> {net, lines, employer} } (số liệu theo năm).
// Hiển thị kết quả: ResultView (result-view.js). Đo lường: window.track (track.js).
(function () {
  'use strict';
  const form = document.querySelector('form[data-tool="intl"]');
  const out = document.getElementById('result');
  const stubEl = document.getElementById('stub');
  if (!form || !out || !stubEl) return;
  const C = window.Countries[form.dataset.country];
  const V = window.ResultView;
  const track = (e) => window.track && window.track(e);
  const groupFmt = new Intl.NumberFormat(C.locale, { maximumFractionDigits: 0 });
  const parseMoney = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0;
  const parseNum = (s) => Number(String(s).replace(',', '.').replace(/[^\d.\-]/g, '')) || 0;

  form.querySelectorAll('input.money').forEach((el) => {
    el.value = el.value ? groupFmt.format(parseMoney(el.value)) : '';
    el.addEventListener('input', () => {
      const fromEnd = el.value.length - el.selectionStart;
      const n = parseMoney(el.value);
      el.value = n ? groupFmt.format(n) : '';
      const pos = Math.max(0, el.value.length - fromEnd);
      el.setSelectionRange(pos, pos);
    });
  });

  try {
    new URLSearchParams(location.hash.slice(1)).forEach((v, k) => {
      const el = form.elements[k];
      if (!el) return;
      if (el.type === 'checkbox') el.checked = v === '1'; else el.value = v;
    });
  } catch (e) { /* hash lỗi: bỏ qua */ }

  function readOpts() {
    const o = {};
    C.fields.forEach((f) => {
      const el = form.elements[f.name];
      if (!el) return;
      o[f.name] = f.type === 'check' ? el.checked : f.type === 'money' ? parseMoney(el.value)
        : f.type === 'number' ? parseNum(el.value) : el.value;
    });
    return o;
  }

  function hashParams() {
    const params = new URLSearchParams();
    C.fields.forEach((f) => {
      const el = form.elements[f.name];
      if (el) params.set(f.name, el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value);
    });
    return params.toString();
  }

  function solveGross(opts, targetNet) {
    let lo = 0, hi = Math.max(targetNet * 2, 1000);
    while (C.calc(opts, hi).net < targetNet && hi < 1e12) hi *= 2;
    for (let i = 0; i < 200 && hi - lo > 0.005; i++) {
      const mid = (lo + hi) / 2;
      if (C.calc(opts, mid).net < targetNet) lo = mid; else hi = mid;
    }
    return hi;
  }

  let interacted = false;
  function update(e) {
    form.querySelectorAll('[data-show-if]').forEach((el) => {
      const [k, v] = el.dataset.showIf.split('=');
      const src = form.elements[k];
      el.hidden = !src || (src.type === 'checkbox' ? String(src.checked) !== v : src.value !== v);
    });
    try {
      const o = readOpts();
      const factor = V.PERIODS[o.period] || 1;
      const periodEl = form.elements.period;
      const periodLabel = periodEl && periodEl.selectedOptions ? periodEl.selectedOptions[0].text : C.labels.year;
      const entered = o.amount * factor;
      const gross = form.dataset.mode === 'net' ? solveGross(o, entered) : entered;
      const r = C.calc(o, gross);
      const view = V.renderResult(C, r, { gross, factor, mode: form.dataset.mode, periodLabel, rates: V.rates(C, o, gross) });
      stubEl.innerHTML = view.stub;
      out.innerHTML = view.detail;
      // Trang đã có hash sẵn từ URL tĩnh thì giữ nguyên đường dẫn gốc cho tới khi người dùng thay đổi.
      if (e || location.hash) history.replaceState(null, '', '#' + hashParams());
      if (e && !interacted) { interacted = true; track('calc'); }
    } catch (err) {
      out.innerHTML = `<p class="slip-note">${C.labels.error}</p>`;
    }
  }
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => { e.preventDefault(); update(e); });
  update();
})();
