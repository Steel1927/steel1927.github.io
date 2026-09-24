// Đặt mua file Excel bằng chuyển khoản: email → mã đơn từ Apps Script → mã VietQR có sẵn số tiền và nội dung.
// Tiền vào tài khoản chủ web (SePay báo về) → Apps Script khớp mã → gửi file qua email. Không lưu gì ở trình duyệt ngoài email vừa nhập.
(function () {
  'use strict';
  const box = document.querySelector('[data-order]');
  if (!box) return;
  const endpoint = document.documentElement.dataset.analytics;
  const form = box.querySelector('form');
  const out = box.querySelector('.order-result');
  const btn = form.querySelector('button');
  const d = box.dataset;
  const fmt = (n) => Number(n).toLocaleString('vi-VN') + ' ₫';

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = form.elements.email.value.trim();
    if (!email || !endpoint) return;
    btn.disabled = true; btn.textContent = 'Đang tạo mã…';
    try {
      const res = await fetch(endpoint + '?src=order', { method: 'POST', body: JSON.stringify({ email, product: d.product || 'excel' }) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'err');
      const info = encodeURIComponent(j.code);
      const qr = `https://img.vietqr.io/image/${encodeURIComponent(d.bank)}-${encodeURIComponent(d.account)}-compact2.png?amount=${j.amount}&addInfo=${info}&accountName=${encodeURIComponent(d.name)}`;
      out.innerHTML = `
<p class="order-step"><b>Bước 2.</b> Quét mã bằng ứng dụng ngân hàng, hoặc chuyển khoản thủ công đúng nội dung <code>${j.code}</code>.</p>
<img src="${qr}" alt="Mã VietQR chuyển khoản ${fmt(j.amount)} nội dung ${j.code}" width="280" height="330" loading="eager">
<table class="ledger ledger-2 order-ledger"><tbody>
<tr><th scope="row"><span>Ngân hàng</span></th><td><span>${d.bank}</span></td></tr>
<tr><th scope="row"><span>Số tài khoản</span></th><td><span>${d.account}</span></td></tr>
<tr><th scope="row"><span>Chủ tài khoản</span></th><td><span>${d.name}</span></td></tr>
<tr><th scope="row"><span>Số tiền</span></th><td><span>${fmt(j.amount)}</span></td></tr>
<tr class="total"><th scope="row"><span>Nội dung chuyển khoản</span></th><td><span>${j.code}</span></td></tr>
</tbody></table>
<p class="order-step"><b>Bước 3.</b> File được gửi tự động tới <b>${email}</b> trong vòng vài phút sau khi tiền vào tài khoản (kiểm tra cả thư mục Spam). Không nhận được: dùng form liên hệ ở trang Bảo mật, ghi mã ${j.code}.</p>`;
      form.hidden = true;
      if (window.track) window.track('buy_click');
    } catch (err) {
      out.innerHTML = `<p class="slip-note slip-warn">${err.message === 'limit' ? 'Bạn đã tạo quá nhiều mã trong một giờ. Dùng lại mã cũ trong email hoặc thử lại sau.' : 'Chưa tạo được mã đơn. Kiểm tra email rồi thử lại.'}</p>`;
      btn.disabled = false; btn.textContent = 'Nhận mã chuyển khoản';
    }
  });
})();
