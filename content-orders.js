console.log('📋 [AutoRelist] content-orders загружен (v6 - все страницы)');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForOrders(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rows = document.querySelectorAll('a.sc-8fx5g-1.kwEwfq');
    if (rows.length > 0) return rows;
    await sleep(300);
  }
  return [];
}

// ⭐ ищем на страницах 1, 2, 3, ... пока не найдём
async function findOrderByTitle(title) {
  const cleanTitle = (title || '').trim();
  const debug = [];
  debug.push(`Ищу: "${cleanTitle.slice(0, 60)}..." (длина ${cleanTitle.length})`);

  const MAX_PAGES = 10;

  for (let page = 1; page <= MAX_PAGES; page++) {
    // переходим на страницу через SPA-переход по URL (без перезагрузки)
    if (page > 1) {
      const url = `https://paygame.ru/seller/orders?page=${page}`;
      debug.push(`→ Переход на страницу ${page}`);
      history.pushState({}, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
      await sleep(2500);
    }

    const rows = await waitForOrders(8000);
    debug.push(`Страница ${page}: сделок в DOM ${rows.length}`);

    if (rows.length === 0) {
      debug.push(`Пустая страница ${page}, останавливаюсь`);
      break;
    }

    // показать первые 2 названия
    let shown = 0;
    for (const row of rows) {
      if (shown >= 2) break;
      const titleRow = row.querySelector('div.sc-8fx5g-8.fiUxYF');
      if (titleRow) {
        const t = titleRow.textContent.trim().replace(/^\[Автовыдача\]\s*/i, '').trim();
        debug.push(`  [${shown}] ${t.slice(0, 70)}... (${t === cleanTitle ? '✅ СОВПАДЕНИЕ' : '≠'})`);
        shown++;
      }
    }

    // ищем совпадение
    for (const row of rows) {
      const statusEl = row.querySelector('span.sc-8fx5g-5');
      if (!statusEl) continue;
      const statusClass = statusEl.className || '';
      if (!statusClass.includes('completed') && !statusClass.includes('in_work')) continue;

      const titleRow = row.querySelector('div.sc-8fx5g-8.fiUxYF');
      if (!titleRow) continue;
      let rowTitle = titleRow.textContent.trim().replace(/^\[Автовыдача\]\s*/i, '').trim();
      if (rowTitle !== cleanTitle) continue;

      const href = row.getAttribute('href') || '';
      const m = href.match(/\/seller\/orders\/([A-Z0-9]+)/);
      if (m) {
        debug.push(`✅ Найдена сделка ${m[1]} (стр. ${page}, статус ${statusEl.textContent})`);
        return { order_id: m[1], debug };
      }
    }

    // если страниц больше нет — стоп
    const nextBtn = document.querySelector('.xs0chy-1 li:last-child');
    if (!nextBtn) break;
  }

  debug.push(`❌ Не найдено ни на одной из ${MAX_PAGES} страниц`);
  return { order_id: null, debug };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'findOrderByTitle') {
    findOrderByTitle(msg.title)
      .then(res => sendResponse({ ok: true, order_id: res.order_id, debug: res.debug }))
      .catch(e => sendResponse({ ok: false, error: e.message, debug: ['Ошибка: ' + e.message] }));
    return true;
  }
  if (msg.action === 'ping') {
    sendResponse({ ok: true });
    return true;
  }
  return true;
});