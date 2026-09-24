// Form liên hệ → Apps Script (sheet "contact" + email cho chủ web). Có honeypot, không cookie.
(function () {
  'use strict';
  const form = document.querySelector('form.contact');
  if (!form) return;
  const endpoint = document.documentElement.dataset.analytics;
  const btn = form.querySelector('button');
  const note = form.querySelector('.contact-note');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!endpoint) return;
    btn.disabled = true;
    const data = { name: form.elements.name.value, email: form.elements.email.value, message: form.elements.message.value,
      website: form.elements.website.value, page: document.referrer ? new URL(document.referrer).pathname : location.pathname };
    try {
      const j = await (await fetch(endpoint + '?src=contact', { method: 'POST', body: JSON.stringify(data) })).json();
      if (!j.ok) throw new Error(j.error || 'err');
      note.textContent = form.dataset.sent; form.reset();
    } catch (err) {
      note.textContent = form.dataset.fail; btn.disabled = false;
    }
  });
})();
