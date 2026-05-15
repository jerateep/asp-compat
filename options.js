// ============================================================
// Options page logic — v1.1.1
// Security: validate hostname format (RFC 1035) — รองรับทุก domain
// ============================================================

const HOSTNAME_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

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
  return String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
}

// ตรวจว่า hostname format ถูกต้องตาม RFC 1035
function validateHost(host) {
  if (typeof host !== 'string') return false;
  if (host.length === 0 || host.length > 253) return false;
  return HOSTNAME_REGEX.test(host);
}

function filterValidHosts(hosts) {
  const valid = [];
  const invalid = [];
  hosts.forEach(h => {
    if (validateHost(h)) valid.push(h);
    else invalid.push(h);
  });
  return { valid, invalid };
}

function load() {
  chrome.storage.sync.get(DEFAULTS, (s) => {
    $('enabled').checked = !!s.enabled;
    $('autoDetect').checked = !!s.autoDetect;
    $('verbose').checked = !!s.verbose;
    $('disabledHosts').value = arrayToText(s.disabledHosts);
    $('forceEnabledHosts').value = arrayToText(s.forceEnabledHosts);
    $('encodingOverride').value = s.encodingOverride || 'auto';
  });
}

function save() {
  const rawDisabled = textToArray($('disabledHosts').value);
  const rawForce = textToArray($('forceEnabledHosts').value);

  const disabledResult = filterValidHosts(rawDisabled);
  const forceResult = filterValidHosts(rawForce);

  // แจ้งเตือนถ้ามี host รูปแบบผิด
  const allInvalid = [...disabledResult.invalid, ...forceResult.invalid];
  if (allInvalid.length > 0) {
    alert(
      '⚠️ พบ hostname ที่รูปแบบไม่ถูกต้อง — จะถูกลบทิ้ง:\n\n' +
      allInvalid.map(h => '• ' + h).join('\n') +
      '\n\nกรุณาใส่ hostname ที่ถูกต้อง เช่น example.com หรือ app.company.local'
    );
  }

  const validEncodings = ['auto', 'tis-620', 'utf-8', 'none'];
  const encoding = $('encodingOverride').value;

  const data = {
    enabled: !!$('enabled').checked,
    autoDetect: !!$('autoDetect').checked,
    verbose: !!$('verbose').checked,
    disabledHosts: disabledResult.valid,
    forceEnabledHosts: forceResult.valid,
    encodingOverride: validEncodings.includes(encoding) ? encoding : 'auto'
  };

  chrome.storage.sync.set(data, () => {
    const status = $('save-status');
    status.classList.add('show');
    setTimeout(() => status.classList.remove('show'), 2000);
    $('disabledHosts').value = arrayToText(data.disabledHosts);
    $('forceEnabledHosts').value = arrayToText(data.forceEnabledHosts);
  });
}

function reset() {
  if (!confirm('คืนค่าเริ่มต้นทั้งหมด? การตั้งค่าปัจจุบันจะถูกล้าง')) return;
  chrome.storage.sync.set(DEFAULTS, () => load());
}

$('save').addEventListener('click', save);
$('reset').addEventListener('click', reset);

['enabled', 'autoDetect', 'verbose'].forEach(id => {
  $(id).addEventListener('change', save);
});

load();
