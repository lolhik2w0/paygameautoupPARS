console.log('📦 [AutoRelist] content-offers загружен (v7)');

function findProblemLots() {
  const soldMarks = document.querySelectorAll('span.sc-1yy9pw8-10.eQPlRe');
  console.log(`[AutoRelist] Меток "Закончилось": ${soldMarks.length}`);

  const lots = [];
  const seen = new Set();

  // ⭐ ТРИГГЕР 1: проданные лоты (Закончилось)
  soldMarks.forEach(mark => {
    if (mark.textContent.trim() !== 'Закончилось') return;

    let container = mark;
    for (let d = 0; d < 12 && container; d++) {
      container = container.parentElement;
      if (!container) break;
      const editLink = container.querySelector('a[href$="/edit"]');
      if (editLink && editLink.getAttribute('href').includes('/seller/offers/')) break;
    }
    if (!container) return;

    const editLink = container.querySelector('a[href$="/edit"]');
    if (!editLink) return;
    const href = editLink.getAttribute('href') || '';
    const m = href.match(/\/seller\/offers\/(\d+)\/edit/);
    if (!m) return;
    const offer_id = m[1];
    if (seen.has(offer_id)) return;
    seen.add(offer_id);

    const titleEl = container.querySelector('span.jvm2kw-6.gzBPeb');
    const title = titleEl ? titleEl.textContent.trim() : '';

    lots.push({ offer_id, title, reason: 'sold' });
    console.log(`[AutoRelist] [продано] #${offer_id} → «${title.slice(0, 50)}...»`);
  });

  // ⭐ ТРИГГЕР 2: активные лоты БЕЗ [Автовыдача]
  // Идём по всем ссылкам на /edit — это надёжнее
  const editLinks = document.querySelectorAll('a[href^="/seller/offers/"][href$="/edit"]');
  console.log(`[AutoRelist] Всего ссылок /edit: ${editLinks.length}`);

  editLinks.forEach(editLink => {
    const href = editLink.getAttribute('href') || '';
    const m = href.match(/\/seller\/offers\/(\d+)\/edit/);
    if (!m) return;
    const offer_id = m[1];
    if (seen.has(offer_id)) return;

    // поднимаемся до контейнера строки
    let container = editLink;
    for (let d = 0; d < 12 && container; d++) {
      container = container.parentElement;
      if (!container) break;
      if (container.textContent.includes('Закончилось')) break; // это уже обработано выше
      if (container.querySelector('a[href$="/edit"]') && container.querySelector('span.jvm2kw-6.gzBPeb')) break;
    }
    if (!container) return;

    // если это уже Закончилось — пропускаем (обработано выше)
    if (container.textContent.includes('Закончилось')) return;

    // смотрим описание лота
    const descEl = container.querySelector('span.jvm2kw-7.aPctZ');
    const desc = descEl ? descEl.textContent.trim() : '';
    const hasAutoDelivery = desc.includes('[Автовыдача]');

    // ⭐ если описание ЕСТЬ и в нём НЕТ [Автовыдача] — это проблемный лот
    if (desc && !hasAutoDelivery) {
      const titleEl = container.querySelector('span.jvm2kw-6.gzBPeb');
      const title = titleEl ? titleEl.textContent.trim() : '';
      seen.add(offer_id);
      lots.push({ offer_id, title, reason: 'no-autodelivery' });
      console.log(`[AutoRelist] [без автовыдачи] #${offer_id} → «${title.slice(0, 50)}...»`);
    }
  });

  console.log(`[AutoRelist] Всего проблемных лотов: ${lots.length}`, lots);
  return { ok: true, sold: lots, total: lots.length };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'scanSoldLots') {
    try {
      sendResponse(findProblemLots());
    } catch (e) {
      sendResponse({ ok: false, error: e.message, sold: [] });
    }
    return true;
  }
  if (msg.action === 'ping') {
    sendResponse({ ok: true });
    return true;
  }
  return true;
});