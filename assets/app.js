(function () {
  'use strict';
  const form = document.querySelector('form.tool');
  const out = document.getElementById('result');
  const stubEl = document.getElementById('stub');
  if (!form || !out || !stubEl) return;

  const fmt = (n) => Math.round(n).toLocaleString('vi-VN');
  const vnd = (n) => fmt(n) + '<span class="cur">₫</span>';
  const parseMoney = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0;
  const val = (name) => form.elements[name] && form.elements[name].value;

  // Định dạng số tiền khi gõ (giữ vị trí con trỏ tương đối từ cuối).
  form.querySelectorAll('input.money').forEach((el) => {
    el.addEventListener('input', () => {
      const fromEnd = el.value.length - el.selectionStart;
      const n = parseMoney(el.value);
      el.value = n ? fmt(n) : '';
      const pos = Math.max(0, el.value.length - fromEnd);
      el.setSelectionRange(pos, pos);
    });
  });

  // Khôi phục & lưu dữ liệu nhập qua URL hash để chia sẻ được kết quả.
  try {
    const params = new URLSearchParams(location.hash.slice(1));
    params.forEach((v, k) => {
      const el = form.elements[k];
      if (!el) return;
      el.value = el.classList && el.classList.contains('money') && parseMoney(v) ? fmt(parseMoney(v)) : v;
    });
  } catch (e) { /* bỏ qua hash lỗi */ }
  function saveHash() {
    const params = new URLSearchParams();
    Array.from(form.elements).forEach((el) => { if (el.name) params.set(el.name, el.value); });
    history.replaceState(null, '', '#' + params.toString());
  }

  const renderers = {
    salary() {
      const insMode = val('insMode');
      form.querySelectorAll('[data-show]').forEach((el) => { el.hidden = el.dataset.show !== insMode; });
      const opts = {
        region: Number(val('region')), dependents: Number(val('dependents')), period: val('period'),
        nonTaxable: parseMoney(val('nonTaxable')), noInsurance: insMode === 'none',
        insuranceSalary: insMode === 'custom' ? parseMoney(val('insuranceSalary')) : null,
      };
      const amount = parseMoney(val('amount'));
      const r = form.dataset.mode === 'net'
        ? Calc.netToGross({ ...opts, net: amount })
        : Calc.grossToNet({ ...opts, gross: amount });
      return VnView.salary(r, form.dataset.mode);
    },

    bhxh() {
      return VnView.bhxh(Calc.bhxhGap({
        gross: parseMoney(val('gross')), declared: parseMoney(val('declared')), gender: val('gender'),
        region: Number(val('region')), dependents: Number(val('dependents')), period: val('period'),
        years: Number(val('years')), unempYears: Number(val('unempYears')),
      }));
    },

    bonus() {
      return VnView.bonus(Calc.bonusTax({
        salary: parseMoney(val('salary')), bonus: parseMoney(val('bonus')),
        region: Number(val('region')), dependents: Number(val('dependents')), period: val('period'),
      }));
    },

    diff() {
      const pick = (p) => ({ gross: parseMoney(val(p + 'gross')), insuranceSalary: val(p + 'ins') === '' ? null : parseMoney(val(p + 'ins')),
        dependents: Number(val(p + 'dep')), region: Number(val(p + 'region')), period: val(p + 'period'), nonTaxable: parseMoney(val(p + 'free')) });
      return VnView.diff(Calc.payslipDiff(pick('a'), pick('b')));
    },

    loan() {
      const r = Calc.loan({
        principal: parseMoney(val('principal')), annualRate: Number(String(val('annualRate')).replace(',', '.')),
        months: Number(val('months')), method: val('method'),
      });
      const rows = r.schedule.map((s) => `<tr><th scope="row">${s.month}</th><td>${vnd(s.principal)}</td><td>${vnd(s.interest)}</td><td>${vnd(s.payment)}</td><td>${vnd(s.balance)}</td></tr>`).join('');
      const annuity = val('method') === 'annuity';
      return {
        stub: VnView.stub(annuity ? 'Trả mỗi tháng' : 'Trả tháng đầu', vnd(r.firstPayment), 'tháng',
          `Tổng lãi <b>${vnd(r.totalInterest)}</b>`),
        detail: VnView.ledger('Tổng khoản vay', VnView.row('Tổng tiền lãi', vnd(r.totalInterest))
          + VnView.row('Tổng gốc + lãi', vnd(r.totalPayment), 'total'))
          + `<details class="schedule"><summary>Lịch trả nợ chi tiết (${r.schedule.length} tháng)</summary><div class="scroll">
<table class="ledger ledger-grid"><thead><tr><th scope="col">Tháng</th><th scope="col">Gốc</th><th scope="col">Lãi</th><th scope="col">Tổng trả</th><th scope="col">Dư nợ</th></tr></thead><tbody>${rows}</tbody></table></div></details>`,
      };
    },

    savings() {
      const r = Calc.savings({
        principal: parseMoney(val('principal')), annualRate: Number(String(val('annualRate')).replace(',', '.')),
        termMonths: Number(val('termMonths')), totalMonths: Number(val('totalMonths')), compound: val('compound') === '1',
      });
      return {
        stub: VnView.stub('Tổng tiền lãi', vnd(r.interest), `${Number(val('totalMonths'))} tháng`, `Số dư cuối kỳ <b>${vnd(r.final)}</b>`),
        detail: `<table class="ledger ledger-grid"><caption>Lãi theo từng kỳ</caption><thead><tr><th scope="col">Kỳ</th><th scope="col">Tháng</th><th scope="col">Lãi kỳ</th><th scope="col">Số dư</th></tr></thead><tbody>
${r.rows.map((x) => `<tr><th scope="row">${x.period}</th><td>${x.month}</td><td>${vnd(x.interest)}</td><td>${vnd(x.balance)}</td></tr>`).join('')}
</tbody></table>`,
      };
    },
  };

  let interacted = false;
  function update(ev) {
    try {
      const view = renderers[form.dataset.tool]();
      stubEl.innerHTML = view.stub;
      out.innerHTML = view.detail;
      if (ev || location.hash) saveHash();
      if (ev && !interacted) { interacted = true; if (window.track) window.track('calc'); }
    } catch (e) { out.innerHTML = '<p class="slip-note">Vui lòng kiểm tra lại số liệu nhập.</p>'; }
  }
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => { e.preventDefault(); update(e); });
  update();
})();
