// Nút chia sẻ kết quả, in, và lấy mã nhúng công cụ. Chuỗi hiển thị lấy từ data-* do template sinh.
(function () {
  'use strict';
  const bar = document.querySelector('.actions');
  if (!bar) return;
  const track = (e) => window.track && window.track(e);
  const flash = (btn, text) => {
    const label = btn.querySelector('span') || btn;
    const old = label.textContent;
    label.textContent = text;
    setTimeout(() => { label.textContent = old; }, 1800);
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Khoảnh khắc chữ ký: cuống phiếu xé rời dọc đường răng cưa trước khi đem đi chia sẻ.
  function tear() {
    const stub = bar.closest('.stub-row') || document.querySelector('.slip-compare .compare');
    if (!stub || reduce) return;
    stub.classList.remove('torn'); void stub.offsetWidth; stub.classList.add('torn');
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
  }
  bar.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'share') {
      track('share');
      tear();
      const url = location.href;
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        try { await navigator.share({ title: document.title, url }); return; } catch (e) { /* người dùng huỷ */ }
      }
      if (await copy(url)) flash(btn, bar.dataset.copied);
    } else if (action === 'print') {
      track('print');
      print();
    } else if (action === 'embed') {
      track('embed_copy');
      const box = bar.querySelector('.embed-code');
      box.hidden = !box.hidden;
      if (!box.hidden) { box.select(); if (await copy(box.value)) flash(btn, bar.dataset.copied); }
    }
  });
})();
