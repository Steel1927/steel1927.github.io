// Hiển thị kết quả lương Việt Nam dạng phiếu lương, dùng chung cho trình duyệt (app.js) và lúc build (trang mức lương tính sẵn).
// salary(r, mode) -> { stub, detail }
(function (root) {
  'use strict';
  const fmt = (n) => Math.round(n).toLocaleString('vi-VN');
  const vnd = (n) => fmt(n) + '<span class="cur">₫</span>';
  const pct = (r) => (r * 100).toLocaleString('vi-VN') + '%';
  const row = (label, value, cls) => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row"><span>${label}</span></th><td><span>${value}</span></td></tr>`;
  const ledger = (caption, rows, head) => `<table class="ledger ledger-2"><caption>${caption}</caption>${head || ''}<tbody>${rows}</tbody></table>`;

  function stub(label, figure, per, meta) {
    return `<p class="stub-label">${label}<span class="stub-per"> / ${per}</span></p>
<output class="stub-figure${figure.replace(/<[^>]+>/g, '').length > 13 ? ' long' : ''}">${figure}</output>${meta ? `<p class="stub-meta">${meta}</p>` : ''}`;
  }

  function salary(r, mode) {
    const i = r.insurance, e = r.employerInsurance;
    const eff = r.gross ? 1 - r.net / r.gross : 0;
    const meta = `<span class="pair">Khấu trừ <b>${pct(Math.round(eff * 1000) / 1000)}</b></span> · <span class="pair">Thuế TNCN <b>${vnd(r.tax)}</b></span>`;
    const s = mode === 'net'
      ? stub('Lương Gross cần có', vnd(r.gross), 'tháng', meta)
      : stub('Lương thực nhận', vnd(r.net), 'tháng', meta);
    let detail = ledger('Diễn giải (người lao động)',
      row('Lương Gross', vnd(r.gross), 'gross')
      + row('BHXH 8%', '−' + vnd(i.bhxh)) + row('BHYT 1,5%', '−' + vnd(i.bhyt)) + row('BHTN 1%', '−' + vnd(i.bhtn))
      + row('Giảm trừ gia cảnh', vnd(r.deduction), 'info') + row('Thu nhập tính thuế', vnd(r.taxable), 'info')
      + row('Thuế TNCN', '−' + vnd(r.tax)) + row('Lương Net', vnd(r.net), 'total'));
    detail += `<div class="ply" role="group" aria-label="Bản của doanh nghiệp">${ledger('Doanh nghiệp trả',
      row('Lương Gross', vnd(r.gross), 'gross') + row('BHXH 17,5%', vnd(e.bhxh)) + row('BHYT 3%', vnd(e.bhyt))
      + row('BHTN 1%', vnd(e.bhtn)) + row('Kinh phí công đoàn 2%', vnd(r.unionFee)) + row('Tổng chi phí', vnd(r.employerCost), 'total'))}</div>`;
    detail += r.taxRows.length
      ? `<table class="ledger ledger-brackets"><caption>Thuế TNCN theo từng bậc</caption>
<thead><tr><th scope="col">Bậc</th><th scope="col">Thuế suất</th><th scope="col">Thu nhập trong bậc</th><th scope="col">Thuế</th></tr></thead><tbody>
${r.taxRows.map((t, k) => `<tr><th scope="row">${k + 1}</th><td>${pct(t.rate)}</td><td>${vnd(t.amount)}</td><td>${vnd(t.tax)}</td></tr>`).join('')}
</tbody></table>`
      : '<p class="slip-note">Thu nhập chưa đến mức phải nộp thuế TNCN.</p>';
    if (r.insuranceBase != null && r.insuranceBase < r.gross) {
      detail += `<p class="slip-note slip-warn">Công ty đóng BHXH trên ${vnd(r.insuranceBase)} thay vì ${vnd(r.gross)}. <a href="/kiem-tra-bhxh/#gross=${Math.round(r.gross)}&declared=${Math.round(r.insuranceBase)}">Xem bạn mất bao nhiêu khi thai sản, thất nghiệp, về hưu →</a></p>`;
    }
    return { stub: s, detail };
  }

  // Kiểm tra mức đóng BHXH: phần lương không được đóng → nhận thêm bao nhiêu, mất bao nhiêu.
  function bhxh(r) {
    const L = r.lost;
    const female = r.gender === 'female';
    if (r.gap <= 0) {
      return {
        stub: stub('Công ty đóng đủ', '0 ₫', 'thiếu mỗi tháng', `Mức đóng bằng lương thực tế${r.gross > r.capSocial ? ` (trên trần ${vnd(r.capSocial)})` : ''}. Không có quyền lợi nào bị mất.`),
        detail: '<p class="slip-note">Vẫn nên đối chiếu trên ứng dụng VssID mỗi quý: mức đóng ghi ở đó mới là mức công ty thực nộp.</p>',
      };
    }
    const meta = `<span class="pair">Bạn nhận thêm <b>+${vnd(r.extraNet)}</b>/tháng</span> · <span class="pair">Công ty tiết kiệm <b>${vnd(r.employerSaving)}</b>/tháng</span>`;
    const s = female
      ? stub('Mất mỗi lần nghỉ thai sản', '−' + vnd(L.maternity), '6 tháng', meta)
      : stub('Mất mỗi tháng lương hưu', '−' + vnd(L.pensionPerMonth), 'tháng, suốt đời', meta);
    const warn = r.belowMinWage
      ? `<p class="slip-note slip-warn">Mức đóng ${vnd(r.declared)} thấp hơn lương tối thiểu vùng ${vnd(r.minWage)} — lương trả cho bạn không được thấp hơn mức này, nên mức đóng cũng không thể thấp hơn.</p>` : '';
    const capNote = r.gross > r.capSocial
      ? `<p class="slip-note">Lương thực tế vượt trần đóng ${vnd(r.capSocial)}; phần vượt trần không ảnh hưởng quyền lợi, nên chỉ tính chênh lệch tới trần.</p>` : '';
    let detail = warn + ledger('Mỗi tháng hiện tại',
      row('Lương thực tế', vnd(r.gross), 'gross') + row('Mức công ty đóng BHXH', vnd(r.declared))
      + row('Phần không được đóng', vnd(r.gap), 'total')
      + row('Bạn nhận thêm (sau thuế)', '+' + vnd(r.extraNet)) + row('Công ty tiết kiệm (21,5%)', vnd(r.employerSaving)));
    detail += ledger('Quyền lợi bị mất, tính trên phần không đóng',
      (female ? row('Thai sản (6 tháng × 100%)', '−' + vnd(L.maternity), 'gross') : row('Nghỉ khi vợ sinh (5 ngày)', '−' + vnd(L.paternity)))
      + row('Ốm đau, mỗi ngày nghỉ (75% ÷ 24)', '−' + vnd(L.sickDay))
      + row(`Thất nghiệp (60%, ${L.unempMonths} tháng)`, '−' + vnd(L.unemp))
      + row(`Lương hưu mỗi tháng (${pct(L.pensionRate)} × chênh lệch)`, '−' + vnd(L.pensionPerMonth), female ? '' : 'gross')
      + row('Lương hưu trong 20 năm hưởng', '−' + vnd(L.pensionLife), 'total'));
    const offset = isFinite(r.yearsToOffsetMaternity) ? r.yearsToOffsetMaternity.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : '∞';
    detail += `<div class="ply" role="group" aria-label="Cân đối">${ledger('Cân đối sau 10 năm',
      row('Bạn nhận thêm', '+' + vnd(r.extraNet10y)) + row('Công ty tiết kiệm', vnd(r.employerSaving10y))
      + row('Bạn mất lương hưu (20 năm hưởng)', '−' + vnd(L.pensionLife), 'total'))}</div>`
      + `<p class="slip-note">${female ? `Tiền nhận thêm cần <b>${offset} năm</b> mới bù được một lần nghỉ thai sản. ` : ''}Chưa tính tai nạn lao động, tử tuất và trợ cấp một lần khi sinh (2 lần mức tham chiếu, không phụ thuộc lương).</p>`
      + capNote;
    return { stub: s, detail };
  }

  // Thưởng / lương tháng 13
  function bonus(r) {
    const s = stub('Thưởng thực nhận', vnd(r.netBonus), 'sau thuế',
      `<span class="pair">Thuế trên thưởng <b>${vnd(r.taxOnBonus)}</b></span> · <span class="pair">tỷ lệ <b>${pct(Math.round(r.effectiveRate * 1000) / 1000)}</b></span>`);
    let detail = ledger('Tháng có thưởng',
      row('Lương tháng (gross)', vnd(r.salary), 'gross') + row('Thưởng / lương tháng 13', vnd(r.bonus), 'gross')
      + row('Thuế TNCN cả tháng', '−' + vnd(r.monthTax)) + row('Trong đó thuế do thưởng', '−' + vnd(r.taxOnBonus), 'info')
      + row('Thực nhận cả tháng', vnd(r.monthNet), 'total'));
    detail += `<div class="ply" role="group" aria-label="Bản của doanh nghiệp">${ledger('Doanh nghiệp trả',
      row('Thưởng (gross)', vnd(r.bonus)) + row('BHXH, BHYT, BHTN trên thưởng', vnd(0), 'info') + row('Tổng chi thêm', vnd(r.bonus), 'total'))}</div>`;
    detail += r.splitSaving > 1000
      ? `<p class="slip-note">Nếu chia thưởng làm hai kỳ trả ở hai tháng khác nhau, thuế trên thưởng giảm còn ${vnd(r.splitTax)} (tiết kiệm ${vnd(r.splitSaving)}) vì mỗi phần rơi vào bậc thấp hơn. Thưởng vẫn tính vào thu nhập năm khi quyết toán, nên chênh lệch chỉ là tạm tính theo tháng.</p>`
      : '<p class="slip-note">Thưởng được cộng vào thu nhập chịu thuế của tháng chi trả; không đóng BHXH, BHYT, BHTN nếu là thưởng theo kết quả (Điều 104 Bộ luật Lao động).</p>';
    return { stub: s, detail };
  }

  // So hai phiếu lương
  function diff(r) {
    const sign = (n) => (n > 0.5 ? '+' : n < -0.5 ? '−' : '') + vnd(Math.abs(n));
    const s = stub(r.diff >= 0 ? 'Thực nhận tăng' : 'Thực nhận giảm', sign(r.diff), 'so với tháng trước',
      `<span class="pair">Tháng trước <b>${vnd(r.a.net)}</b></span> · <span class="pair">Tháng này <b>${vnd(r.b.net)}</b></span>`);
    let detail = ledger('Chênh lệch theo khoản',
      row('Lương gross', sign(r.parts.gross), 'gross') + row('Bảo hiểm người lao động', sign(r.parts.insurance))
      + row('Thuế TNCN', sign(r.parts.tax)) + row('Thực nhận', sign(r.diff), 'total'));
    detail += r.rows.length
      ? ledger('Nguyên nhân', r.rows.map((x) => row(x.label, sign(x.effect))).join('') + row('Cộng', sign(r.diff), 'total'))
      : '<p class="slip-note">Hai phiếu có cùng thông số nên thực nhận không đổi. Nếu phiếu thật khác nhau, kiểm tra các khoản ngoài lương: truy thu/hoàn thuế, tạm ứng, khấu trừ khác.</p>';
    detail += `<div class="ply" role="group" aria-label="Bản của doanh nghiệp">${ledger('Doanh nghiệp trả',
      row('Tháng trước', vnd(r.a.employerCost)) + row('Tháng này', vnd(r.b.employerCost)) + row('Chênh lệch', sign(r.b.employerCost - r.a.employerCost), 'total'))}</div>`;
    detail += '<p class="slip-note">Nguyên nhân được tách bằng cách đổi từng yếu tố một theo thứ tự trên; khi nhiều yếu tố cùng đổi, phần tương tác giữa chúng được ghi vào yếu tố đổi sau.</p>';
    return { stub: s, detail };
  }

  const api = { salary, bhxh, bonus, diff, vnd, stub, ledger, row };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VnView = api;
})(typeof self !== 'undefined' ? self : this);
