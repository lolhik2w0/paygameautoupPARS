const logEl = document.getElementById('log');
const statusEl = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const clearBtn = document.getElementById('clearBtn');
const openLogBtn = document.getElementById('openLogBtn');
const autoToggle = document.getElementById('autoToggle');
const autoInterval = document.getElementById('autoInterval');
const statSuccess = document.getElementById('statSuccess');
const statFailed = document.getElementById('statFailed');
const statSkipped = document.getElementById('statSkipped');
const statToday = document.getElementById('statToday');

function log(msg, type = 'info') {
  const time = new Date().toLocaleTimeString();
  const div = document.createElement('div');
  div.className = type;
  div.textContent = `[${time}] ${msg}`;
  logEl.prepend(div);
  while (logEl.children.length > 200) logEl.removeChild(logEl.lastChild);
}

function setStatus(text, on = false) {
  statusEl.textContent = text;
  statusEl.className = on ? 'status-box on' : 'status-box';
}

function updateStats(s) {
  statSuccess.textContent = s.success || 0;
  statFailed.textContent = s.failed || 0;
  statSkipped.textContent = s.skipped || 0;
  statToday.textContent = s.todayCount || 0;
}

// загрузка состояния
chrome.runtime.sendMessage({ action: 'getState' }, (res) => {
  if (!res) return;
  if (res.running) {
    setStatus('🔴 Идёт перевыставление...', true);
    startBtn.disabled = true;
  }
  updateStats(res.stats || {});
  if (res.log) res.log.forEach(item => log(item.text, item.type));
});

// загрузка авто-настроек
chrome.runtime.sendMessage({ action: 'getAutoSettings' }, (res) => {
  if (!res) return;
  autoToggle.checked = res.enabled || false;
  autoInterval.value = String(res.interval || 5);
});

// кнопка старт
startBtn.addEventListener('click', async () => {
  logEl.innerHTML = '';
  startBtn.disabled = true;
  setStatus('🔴 Идёт перевыставление...', true);

  chrome.runtime.sendMessage({ action: 'startRelist' }, (res) => {
    if (res && res.ok) return;
    log(`⚠️ Повтор через секунду...`, 'warn');
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'startRelist' }, (res2) => {
        if (!res2 || !res2.ok) {
          log(`❌ ${res2?.error || 'неизвестно'}`, 'err');
          setStatus('❌ Ошибка');
          startBtn.disabled = false;
        }
      });
    }, 1000);
  });
});

// тумблер авто-режима
autoToggle.addEventListener('change', () => {
  chrome.runtime.sendMessage({ action: 'setAutoEnabled', value: autoToggle.checked }, () => {
    log(autoToggle.checked ? '⏰ Авто-режим включён' : '⏹ Авто-режим выключен', autoToggle.checked ? 'ok' : 'warn');
  });
});

// интервал
autoInterval.addEventListener('change', () => {
  chrome.runtime.sendMessage({ action: 'setAutoInterval', value: parseInt(autoInterval.value) }, () => {
    log(`⏰ Интервал: ${autoInterval.value} мин`, 'info');
  });
});

// открыть полный лог
openLogBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openLogWindow' });
});

// очистить
clearBtn.addEventListener('click', () => {
  logEl.innerHTML = '<div class="dim">Лог очищен.</div>';
  chrome.runtime.sendMessage({ action: 'clearLog' });
});

// приём сообщений
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'relistLog') log(msg.text, msg.type || 'info');
  if (msg.action === 'relistDone') {
    setStatus(`✅ Готово: ${msg.success} успешно, ${msg.failed} ошибок`, false);
    startBtn.disabled = false;
  }
  if (msg.action === 'relistState') {
    setStatus(msg.running ? '🔴 Идёт перевыставление...' : 'Готов к работе', msg.running);
    startBtn.disabled = msg.running;
  }
});