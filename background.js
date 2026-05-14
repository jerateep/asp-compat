// ============================================================
// ASP Legacy Compatibility — Background Service Worker
// ============================================================

// ตั้งค่า default ตอนติดตั้งครั้งแรก
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(null, (existing) => {
    const defaults = {
      enabled: true,
      autoDetect: true,
      disabledHosts: [],
      forceEnabledHosts: [],
      verbose: false,
      encodingOverride: 'auto'
    };
    const merged = { ...defaults, ...existing };
    chrome.storage.sync.set(merged);
  });
});

// อัพเดท badge เมื่อ extension ทำงานบนหน้าใด ๆ
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ASP_COMPAT_ACTIVE' && sender.tab) {
    chrome.action.setBadgeText({ text: 'ON', tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId: sender.tab.id });
  }
  return false;
});

// Clear badge เมื่อเปลี่ยน tab/URL
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ text: '', tabId });
  }
});
