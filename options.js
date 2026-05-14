// ============================================================
// Options page logic
// ============================================================

const DEFAULTS = {
  enabled: true,
  autoDetect: true,
  verbose: false,
  disabledHosts: [],
  forceEnabledHosts: [],
  encodingOverride: 'auto'
};

const $ = id => document.getElementById(id);

function arrayToText(arr) {
  return (arr || []).join('\n');
}

function textToArray(text) {
  return text.split('\n').map(s => s.trim()).filter(Boolean);
}

async function load() {
  chrome.storage.sync.get(DEFAULTS, (s) => {
    $('enabled').checked = s.enabled;
    $('autoDetect').checked = s.autoDetect;
    $('verbose').checked = s.verbose;
    $('disabledHosts').value = arrayToText(s.disabledHosts);
    $('forceEnabledHosts').value = arrayToText(s.forceEnabledHosts);
    $('encodingOverride').value = s.encodingOverride || 'auto';
  });
}

async function save() {
  const data = {
    enabled: $('enabled').checked,
    autoDetect: $('autoDetect').checked,
    verbose: $('verbose').checked,
    disabledHosts: textToArray($('disabledHosts').value),
    forceEnabledHosts: textToArray($('forceEnabledHosts').value),
    encodingOverride: $('encodingOverride').value
  };
  chrome.storage.sync.set(data, () => {
    const status = $('save-status');
    status.classList.add('show');
    setTimeout(() => status.classList.remove('show'), 2000);
  });
}

async function reset() {
  if (!confirm('คืนค่าเริ่มต้นทั้งหมด? การตั้งค่าปัจจุบันจะถูกล้าง')) return;
  chrome.storage.sync.set(DEFAULTS, () => load());
}

$('save').addEventListener('click', save);
$('reset').addEventListener('click', reset);

// Auto-save toggles
['enabled', 'autoDetect', 'verbose'].forEach(id => {
  $(id).addEventListener('change', save);
});

load();
