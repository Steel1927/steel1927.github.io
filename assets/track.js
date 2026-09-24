// Đo lường ẩn danh, không cookie, không định danh: chỉ gửi {sự kiện, phiên bản quốc gia, đường dẫn}.
// Gửi gộp một lần khi rời trang (sendBeacon, text/plain để không cần CORS preflight) tới Apps Script của chủ web.
// Sự kiện: view (xem trang), calc (dùng miễn phí), compare, share, print, embed_copy, embed_view, buy_click (ý định mua).
(function () {
  'use strict';
  const root = document.documentElement;
  const endpoint = root.dataset.analytics;
  const queue = [];
  const base = { s: root.dataset.site || '', p: location.pathname };
  function track(e, extra) {
    if (!endpoint || !/^[a-z_]{2,20}$/.test(e)) return;
    queue.push(Object.assign({ e }, base, extra || {}));
    if (queue.length >= 20) flush();
  }
  function flush() {
    if (!queue.length) return;
    const body = JSON.stringify(queue.splice(0));
    try {
      if (!(navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain' })))) {
        fetch(endpoint, { method: 'POST', body, mode: 'no-cors', keepalive: true });
      }
    } catch (err) { /* đo lường không bao giờ được làm hỏng trang */ }
  }
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  addEventListener('pagehide', flush);
  window.track = track;
  track(root.dataset.embed ? 'embed_view' : 'view', root.dataset.embed && document.referrer
    ? { r: (() => { try { return new URL(document.referrer).hostname; } catch (e) { return ''; } })() } : undefined);
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('[data-track]');
    if (a) track(a.dataset.track);
  });
})();
