console.log('✏️ [AutoRelist] content-edit загружен (v2)');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitFor(selector, maxMs = 8000, interval = 300) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const el = document.querySelector(selector);
    if (el && el.offsetParent !== null) return el;
    await sleep(interval);
  }
  return null;
}

async function waitForByText(tag, text, maxMs = 5000, interval = 300) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const els = document.querySelectorAll(tag);
    for (const el of els) {
      if (el.offsetParent !== null && el.textContent.trim().includes(text)) return el;
    }
    await sleep(interval);
  }
  return null;
}

async function insertAutoDelivery(data) {
  console.log('[AutoRelist] Старт вставки...');

  let openBtn = document.getElementById('section-auto-delivery');
  if (!openBtn) openBtn = await waitForByText('button', 'Автовыдача', 5000);
  if (!openBtn) {
    console.log('[AutoRelist] ❌ Кнопка открытия модалки не найдена');
    return { ok: false, error: 'open-btn-not-found' };
  }
  console.log('[AutoRelist] Открываю модалку...');
  openBtn.click();

  const textarea = await waitFor('textarea.sc-13gt5tw-2.eRPKFt', 8000);
  if (!textarea) {
    console.log('[AutoRelist] ❌ textarea не найдена');
    return { ok: false, error: 'textarea-not-found' };
  }
  console.log('[AutoRelist] Модалка открыта');

  textarea.focus();
  textarea.value = data;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(500);

  const addBtn = document.querySelector('button.sc-13gt5tw-4.hLOaej')
    || await waitForByText('button', 'Добавить', 5000);
  if (!addBtn) {
    console.log('[AutoRelist] ❌ Кнопка «Добавить» не найдена');
    return { ok: false, error: 'add-btn-not-found' };
  }
  console.log('[AutoRelist] Жму «Добавить»...');
  addBtn.click();
  await sleep(2000);

  // ⭐ сначала пробуем «Пересоздать» (проданный лот)
  let saveBtn = await waitForByText('button', 'Пересоздать', 3000);
  if (saveBtn) {
    console.log('[AutoRelist] Жму «Пересоздать»...');
  } else {
    // иначе «Сохранить» (активный лот)
    saveBtn = await waitForByText('button', 'Сохранить', 3000);
    if (saveBtn) console.log('[AutoRelist] Жму «Сохранить»...');
  }

  if (saveBtn) {
    saveBtn.click();
    await sleep(2500);
  } else {
    console.log('[AutoRelist] ⚠️ Ни «Пересоздать», ни «Сохранить» не найдены');
  }

  const closeBtn = document.querySelector('button.caypnu-32.hdQAHq')
    || await waitForByText('button', 'Закрыть', 3000);
  if (closeBtn) {
    console.log('[AutoRelist] Жму «Закрыть»...');
    closeBtn.click();
    await sleep(1500);
  }

  console.log('[AutoRelist] ✅ Готово');
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'insertAutoDelivery') {
    insertAutoDelivery(msg.data).then(sendResponse);
    return true;
  }
  if (msg.action === 'ping') {
    sendResponse({ ok: true });
    return true;
  }
  return true;
});