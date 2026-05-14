// ============================================================
// Popup logic — v1.0.2
// ============================================================

const $ = id => document.getElementById(id);

const DEFAULTS = {
  enabled: true,
  autoDetect: true,
  disabledHosts: [],
  forceEnabledHosts: []
};

// ----- Helpers -----
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get(DEFAULTS, resolve);
  });
}

function saveSettings(updates) {
  return new Promise(resolve => {
    chrome.storage.sync.set(updates, resolve);
  });
}

async function pingContent(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'ASP_COMPAT_PING' });
  } catch (e) {
    // tab ที่ extension เข้าไม่ถึง เช่น chrome://, file:// บางกรณี
    return null;
  }
}

function getHost(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function setStatus(text, cls) {
  const el = $('page-status');
  el.textContent = text;
  el.className = 'badge ' + cls;
}

function showError(msg) {
  console.error('[ASP-Compat Popup]', msg);
  const banner = document.createElement('div');
  banner.style.cssText = 'background:#ffebee;color:#b71c1c;padding:10px 14px;font-size:12px;border-bottom:1px solid #f5c6cb;';
  banner.textContent = '⚠️ ' + msg;
  document.body.insertBefore(banner, document.body.firstChild);
}

// ----- Render state -----
function renderState(tab, settings, ping) {
  const host = getHost(tab.url);

  $('host').textContent = host || '(ไม่ทราบ)';
  $('charset').textContent = (ping && ping.charset) ? ping.charset : '-';

  if (!ping) {
    $('is-asp').textContent = '(ตรวจไม่ได้)';
  } else {
    $('is-asp').textContent = ping.isAsp ? '✓ ใช่' : '✗ ไม่ใช่';
  }

  if (!ping) {
    setStatus('ไม่ทำงาน', 'badge-na');
  } else if (ping.active) {
    setStatus('ทำงานอยู่', 'badge-on');
  } else {
    setStatus('ไม่ทำงาน', 'badge-off');
  }

  $('toggle-enabled').checked = !!settings.enabled;
  $('toggle-auto').checked = !!settings.autoDetect;

  const isDisabled = settings.disabledHosts.includes(host);
  const isForced = settings.forceEnabledHosts.includes(host);

  if (isDisabled) {
    $('btn-disable-host').textContent = '✓ ปิดอยู่ — คลิกเพื่อยกเลิก';
    $('btn-disable-host').dataset.action = 'enable';
  } else {
    $('btn-disable-host').textContent = '⊘ ปิดสำหรับโดเมนนี้';
    $('btn-disable-host').dataset.action = 'disable';
  }

  if (isForced) {
    $('btn-force-host').textContent = '✓ บังคับเปิดอยู่ — คลิกเพื่อยกเลิก';
    $('btn-force-host').dataset.action = 'unforce';
  } else {
    $('btn-force-host').textContent = '⊕ บังคับเปิดสำหรับโดเมนนี้';
    $('btn-force-host').dataset.action = 'force';
  }

  if (!host) {
    $('btn-disable-host').disabled = true;
    $('btn-force-host').disabled = true;
    $('btn-disable-host').style.opacity = '0.5';
    $('btn-force-host').style.opacity = '0.5';
  }
}

// ----- Actions -----
async function handleHostButton(action, tab, host) {
  if (!host) return;
  const settings = await getSettings();
  let disabled = settings.disabledHosts.slice();
  let forced = settings.forceEnabledHosts.slice();

  switch (action) {
    case 'disable':
      if (!disabled.includes(host)) disabled.push(host);
      forced = forced.filter(h => h !== host);
      break;
    case 'enable':
      disabled = disabled.filter(h => h !== host);
      break;
    case 'force':
      if (!forced.includes(host)) forced.push(host);
      disabled = disabled.filter(h => h !== host);
      break;
    case 'unforce':
      forced = forced.filter(h => h !== host);
      break;
  }

  await saveSettings({ disabledHosts: disabled, forceEnabledHosts: forced });
  chrome.tabs.reload(tab.id);
  window.close();
}

// ----- Init -----
async function init() {
  try {
    const tab = await getCurrentTab();
    if (!tab) {
      showError('ไม่พบ tab ปัจจุบัน');
      return;
    }

    const [settings, ping] = await Promise.all([
      getSettings(),
      pingContent(tab.id)
    ]);

    renderState(tab, settings, ping);

    const host = getHost(tab.url);

    $('toggle-enabled').addEventListener('change', async (e) => {
      await saveSettings({ enabled: e.target.checked });
    });

    $('toggle-auto').addEventListener('change', async (e) => {
      await saveSettings({ autoDetect: e.target.checked });
    });

    $('btn-disable-host').addEventListener('click', async () => {
      const action = $('btn-disable-host').dataset.action;
      await handleHostButton(action, tab, host);
    });

    $('btn-force-host').addEventListener('click', async () => {
      const action = $('btn-force-host').dataset.action;
      await handleHostButton(action, tab, host);
    });

    $('btn-options').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    $('link-reload').addEventListener('click', () => {
      chrome.tabs.reload(tab.id);
      window.close();
    });

    $('link-options').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

  } catch (err) {
    showError('Popup error: ' + (err && err.message ? err.message : String(err)));
    console.error(err);
  }
}

document.addEventListener('DOMContentLoaded', init);
