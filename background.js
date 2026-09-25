console.log('[AutoRelist] background загружен (v6 - авто-режим + логи)');

let state = {
  running: false,
  log: [],
  stats: { success: 0, failed: 0, skipped: 0, todayCount: 0, todayDate: new Date().toDateString() }
};

let autoTimer = null;

function log(text, type = 'info') {
  console.log(`[AutoRelist] ${text}`);
  const entry = { text, type, ts: Date.now() };
  state.log.push(entry);
  if (state.log.length > 500) state.log.shift();
  saveState();
  chrome.runtime.sendMessage({ action: 'relistLog', text, type }).catch(() => {});
}

function saveState() {
  chrome.storage.local.set({ relistState: state });
}

// счётчик за сегодня
function resetTodayIfNeeded() {
  const today = new Date().toDateString();
  if (state.stats.todayDate !== today) {
    state.stats.todayDate = today;
    state.stats.todayCount = 0;
  }
}

// =========================================================
// АВТО-РЕЖИМ
// =========================================================
async function getAutoSettings() {
  const data = await chrome.storage.local.get(['autoEnabled', 'autoInterval']);
  return {
    enabled: data.autoEnabled === true,
    interval: parseInt(data.autoInterval) || 5  // минут
  };
}

async function startAutoMode() {
  const s = await getAutoSettings();
  if (!s.enabled) return;
  if (autoTimer) clearInterval(autoTimer);
  log(`⏰ Авто-режим включён: каждые ${s.interval} мин`, 'info');
  autoTimer = setInterval(async () => {
    if (state.running) return;
    const s2 = await getAutoSettings();
    if (!s2.enabled) { stopAutoMode(); return; }
    log('⏰ Авто-запуск по таймеру', 'info');
    startRelist();
  }, s.interval * 60 * 1000);
}

function stopAutoMode() {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
    log('⏹ Авто-режим выключен', 'warn');
  }
}

// =========================================================
// ВКЛАДКИ
// =========================================================
async function createTabAndWait(url, active = false) {
  await new Promise(r => setTimeout(r, 300));
  let tab;
  let attempts = 0;
  while (attempts < 3) {
    try { tab = await chrome.tabs.create({ url, active }); break; }
    catch (e) { attempts++; await new Promise(r => setTimeout(r, 500)); }
  }
  if (!tab) throw new Error('Не удалось открыть вкладку');
  await waitForTabLoad(tab.id);
  return tab;
}

function waitForTabLoad(tabId, timeout = 15000) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, timeout);
  });
}

async function closeTab(tabId) { try { await chrome.tabs.remove(tabId); } catch (e) {} }

async function sendToTab(tabId, msg, timeout = 30000) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; resolve({ ok: false, error: 'timeout' }); }
    }, timeout);
    chrome.tabs.sendMessage(tabId, msg, (res) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(res || { ok: false, error: 'no-response' });
    });
  });
}

// =========================================================
// ОСНОВНАЯ ЛОГИКА
// =========================================================
async function startRelist() {
  if (state.running) return { ok: false, error: 'Уже запущено' };

  resetTodayIfNeeded();
  state.running = true;
  state.log = [];
  state.stats.success = 0;
  state.stats.failed = 0;
  state.stats.skipped = 0;
  saveState();
  chrome.runtime.sendMessage({ action: 'relistState', running: true }).catch(() => {});

  let offersTab = null;
  let ordersTab = null;

  try {
    log('🔍 Открываю /seller/offers...', 'info');
    offersTab = await createTabAndWait('https://paygame.ru/seller/offers', false);

    log('🔄 Обновляю страницу...', 'info');
    await chrome.tabs.reload(offersTab.id);
    await waitForTabLoad(offersTab.id);
    await new Promise(r => setTimeout(r, 4000));

    log('📦 Сканирую проблемные лоты...', 'info');
    const soldRes = await sendToTab(offersTab.id, { action: 'scanSoldLots' });

    if (!soldRes || !soldRes.ok) {
      log(`❌ Ошибка сканирования: ${soldRes?.error || 'неизвестно'}`, 'err');
      return { ok: false, error: soldRes?.error };
    }

    const soldLots = soldRes.sold || [];
    log(`📦 Проблемных лотов: ${soldLots.length}`, 'info');
    soldLots.forEach(l => log(`   • #${l.offer_id} [${l.reason}]`, 'dim'));

    const filtered = [];
    for (const lot of soldLots) {
      const title = (lot.title || '').toUpperCase();
      if (title.includes('БЕЗ АКТИВНОСТИ') || title.includes('В ОДНИ РУКИ')) {
        log(`⏭ Пропущен #${lot.offer_id}`, 'warn');
        state.stats.skipped++;
        continue;
      }
      filtered.push(lot);
    }

    if (filtered.length === 0) {
      log('🏁 Нет лотов для перевыставления', 'info');
      return { ok: true };
    }

    log('📋 Открываю /seller/orders...', 'info');
    ordersTab = await createTabAndWait('https://paygame.ru/seller/orders', false);
    await new Promise(r => setTimeout(r, 4000));

    for (const lot of filtered) {
      await processLot(lot, ordersTab.id);
    }

    log(`🏁 Готово: ${state.stats.success} успешно, ${state.stats.failed} ошибок, ${state.stats.skipped} пропущено`, 'ok');
    return { ok: true };

  } catch (e) {
    log(`❌ Ошибка: ${e.message}`, 'err');
    return { ok: false, error: e.message };
  } finally {
    if (offersTab) await closeTab(offersTab.id);
    if (ordersTab) await closeTab(ordersTab.id);
    state.running = false;
    saveState();
    chrome.runtime.sendMessage({
      action: 'relistDone',
      success: state.stats.success,
      failed: state.stats.failed,
      skipped: state.stats.skipped
    }).catch(() => {});
    chrome.runtime.sendMessage({ action: 'relistState', running: false }).catch(() => {});
  }
}

async function processLot(lot, ordersTabId) {
  log(`▶️ Лот #${lot.offer_id} [${lot.reason}]`, 'info');
  let orderTab = null;
  let editTab = null;

  try {
    const findRes = await sendToTab(ordersTabId, { action: 'findOrderByTitle', title: lot.title }, 60000);

    if (findRes && findRes.debug) {
      findRes.debug.forEach(line => log(`   [dbg] ${line}`, 'dim'));
    }

    if (!findRes || !findRes.ok || !findRes.order_id) {
      log(`   ⚠️ Сделка не найдена`, 'warn');
      state.stats.failed++;
      return;
    }

    const order_id = findRes.order_id;
    log(`   ↳ Найдена сделка #${order_id}`, 'dim');

    orderTab = await createTabAndWait(`https://paygame.ru/orders/${order_id}`, false);
    await new Promise(r => setTimeout(r, 3000));

    const dataRes = await sendToTab(orderTab.id, { action: 'revealAutoDelivery' });
    if (!dataRes || !dataRes.ok || !dataRes.data) {
      log(`   ❌ Данные не получены: ${dataRes?.error || 'пусто'}`, 'err');
      state.stats.failed++;
      return;
    }

    const loginPassword = dataRes.data;
    log(`   ↳ Данные: ${loginPassword.slice(0, 30)}...`, 'ok');

    editTab = await createTabAndWait(`https://paygame.ru/seller/offers/${lot.offer_id}/edit`, false);
    await new Promise(r => setTimeout(r, 3500));

    const insertRes = await sendToTab(editTab.id, { action: 'insertAutoDelivery', data: loginPassword }, 45000);
    if (!insertRes || !insertRes.ok) {
      log(`   ❌ Ошибка вставки: ${insertRes?.error}`, 'err');
      state.stats.failed++;
      return;
    }

    log(`✅ Лот #${lot.offer_id} перевыставлен`, 'ok');
    state.stats.success++;
    state.stats.todayCount++;
    saveState();

  } catch (e) {
    log(`   ❌ Ошибка: ${e.message}`, 'err');
    state.stats.failed++;
  } finally {
    if (orderTab) await closeTab(orderTab.id);
    if (editTab) await closeTab(editTab.id);
  }
}

// =========================================================
// СООБЩЕНИЯ
// =========================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startRelist') {
    startRelist().then(sendResponse);
    return true;
  }
  if (msg.action === 'getState') {
    resetTodayIfNeeded();
    sendResponse(state);
    return true;
  }
  if (msg.action === 'clearLog') {
    state.log = [];
    saveState();
    sendResponse({ ok: true });
    return true;
  }
  if (msg.action === 'setAutoEnabled') {
    chrome.storage.local.set({ autoEnabled: msg.value }, () => {
      if (msg.value) startAutoMode();
      else stopAutoMode();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.action === 'setAutoInterval') {
    chrome.storage.local.set({ autoInterval: msg.value }, () => {
      startAutoMode();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.action === 'getAutoSettings') {
    getAutoSettings().then(s => sendResponse({ ok: true, ...s }));
    return true;
  }
  if (msg.action === 'openLogWindow') {
    chrome.tabs.create({ url: chrome.runtime.getURL('log.html') });
    sendResponse({ ok: true });
    return true;
  }
  return true;
});

// при старте — если авто-режим был включён, запускаем
chrome.storage.local.get(['autoEnabled'], (data) => {
  if (data.autoEnabled === true) startAutoMode();
});