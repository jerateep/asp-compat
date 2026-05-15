// ============================================================
// ASP Legacy Compatibility — Background Service Worker
// v1.1.0
//
// Security notes:
//   - ไม่ log full URL ของ tab (#6)
//   - Default settings validated by content.js เมื่ออ่าน
// ============================================================

// ตั้งค่า default ตอนติดตั้งครั้งแรก
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(null, (existing) => {
    if (chrome.runtime.lastError) {
      console.warn('[ASP-Compat-BG] Storage error on install:', chrome.runtime.lastError.message);
      return;
    }
    const defaults = {
      enabled: true,
      autoDetect: true,
      disabledHosts: [],
      forceEnabledHosts: [],
      verbose: false,
      encodingOverride: 'auto'
    };
    const merged = Object.assign({}, defaults, existing);
    chrome.storage.sync.set(merged);
  });
});

// อัพเดท badge เมื่อ extension ทำงาน
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'ASP_COMPAT_ACTIVE' && sender.tab) {
    try {
      chrome.action.setBadgeText({ text: 'ON', tabId: sender.tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId: sender.tab.id });
    } catch (e) {
      // tab อาจปิดไปแล้ว ไม่ critical
    }
  }
  return false;
});

// Clear badge เมื่อโหลด tab ใหม่
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    try {
      chrome.action.setBadgeText({ text: '', tabId });
    } catch (_) {}
  }
});
