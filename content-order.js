console.log('📄 [AutoRelist] content-order загружен (v3)');

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

function findShowBtn() {
  let showBtn = document.querySelector('button.ZNDhx');
  if (showBtn && showBtn.offsetParent !== null) return showBtn;
  const btns = document.querySelectorAll('button');
  for (const b of btns) {
    if (b.offsetParent !== null && b.textContent.trim() === 'Показать') return b;
  }
  return null;
}

function extractDataFromBlocks() {
  const allBlocks = document.querySelectorAll('div.sc-1tp1im0-10.fLkffS');
  console.log(`[AutoRelist] Блоков .fLkffS: ${allBlocks.length}`);

  for (const block of allBlocks) {
    const text = block.textContent.trim();
    console.log(`[AutoRelist] Блок: "${text.slice(0, 100)}..."`);

    // пропускаем подсказки
    if (text.includes('Конфиденциальные данные')) continue;
    if (text.includes('Выполните свои обязательства')) continue;
    if (text.includes('запросите подтверждение')) continue;
    if (text.length < 5) continue;
    if (text.length > 500) continue;

    // ⭐ должен быть "login:password" — то есть минимум один ":"
    // и не должен быть фразой (без пробелов между словами до ":")
    if (!text.includes(':')) continue;

    // отсеиваем явные фразы: > 5 пробелов перед ":"
    const beforeColon = text.split(':')[0];
    const spacesBefore = (beforeColon.match(/ /g) || []).length;
    if (spacesBefore > 3) continue;

    return text;
  }
  return null;
}

async function revealAutoDelivery() {
  console.log('[AutoRelist] Ищу кнопку «Показать»...');

  const showBtn = findShowBtn();
  if (!showBtn) {
    console.log('[AutoRelist] ❌ Кнопка «Показать» не найдена');
    return { ok: false, error: 'show-btn-not-found' };
  }

  console.log('[AutoRelist] Клик по «Показать»...');
  showBtn.click();
  await sleep(1500);

  let data = extractDataFromBlocks();

  // ⭐ если не нашли — кликаем ещё раз
  if (!data) {
    console.log('[AutoRelist] Первый клик не дал данных, пробую второй...');
    await sleep(1000);
    const btn2 = findShowBtn();
    if (btn2) btn2.click();
    await sleep(2000);
    data = extractDataFromBlocks();
  }

  if (!data) {
    console.log('[AutoRelist] ❌ Данные автовыдачи не найдены');
    return { ok: false, error: 'data-not-revealed' };
  }

  console.log('[AutoRelist] ✅ Данные получены:', data.slice(0, 30) + '...');
  return { ok: true, data };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'revealAutoDelivery') {
    revealAutoDelivery().then(sendResponse);
    return true;
  }
  if (msg.action === 'ping') {
    sendResponse({ ok: true });
    return true;
  }
  return true;
});