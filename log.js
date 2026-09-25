const logEl = document.getElementById('log');

function render(log) {
  if (!log || log.length === 0) {
    logEl.innerHTML = '<div class="empty">Лог пуст</div>';
    return;
  }
  // от старых к новым
  logEl.innerHTML = log.map(item => {
    const time = new Date(item.ts).toLocaleString();
    return `<div class="${item.type || 'info'}">[${time}] ${item.text}</div>`;
  }).join('');
  logEl.scrollTop = logEl.scrollHeight;
}

function load() {
  chrome.runtime.sendMessage({ action: 'getState' }, (res) => {
    if (res && res.log) render(res.log);
  });
}

document.getElementById('refreshBtn').addEventListener('click', load);
document.getElementById('clearBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'clearLog' }, () => render([]));
});

load();
setInterval(load, 3000);