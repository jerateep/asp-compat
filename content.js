// ============================================================
// ASP Legacy Compatibility Layer — Content Script
// v1.1.3
//
// Security fixes retained:
//   #1 XSS: whitelist sanitization in fixBuggyLinks()
//   #2 CSP: onerror handler on polyfill injection
//   #4 Settings validation: type check + format validation
//   #5 Toast: textContent only, no innerHTML
//   #6 Safe URL logging: strip query string
//
// Rolled back: #3, #8 (domain restriction) — extension รองรับทุก domain
// ============================================================

(function() {
  'use strict';

  const LOG_PREFIX = '[ASP-Compat]';

  // ============================================================
  // #6 SAFE URL LOGGING — strip query string and fragment
  // ป้องกัน session token / sensitive param หลุดเข้า console log
  // ============================================================
  function safeLogPath() {
    try {
      return window.location.pathname || '(no path)';
    } catch (e) {
      return '(unavailable)';
    }
  }

  // ============================================================
  // ตรวจว่าเป็นหน้า ASP หรือไม่
  // ============================================================
  function isAspPage() {
    const pathname = window.location.pathname.toLowerCase();
    if (/\.(asp|aspx|asa|cer|cdx)(\?|#|$)/i.test(pathname)) return true;
    if (/\/(default|index)\.(asp|aspx)(\?|#|$)/i.test(pathname)) return true;
    const generator = document.querySelector('meta[name="generator"]');
    if (generator && /asp/i.test(generator.content || '')) return true;
    return false;
  }

  // ============================================================
  // #4 SETTINGS VALIDATION — type check + format validation
  // ห้าม trust ค่าจาก chrome.storage โดยตรง
  // ============================================================
  // RFC 1035 hostname regex — รองรับทุก domain
  const HOSTNAME_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  function isValidHostname(s) {
    if (typeof s !== 'string') return false;
    if (s.length === 0 || s.length > 253) return false;
    return HOSTNAME_REGEX.test(s);
  }

  const SETTINGS_SCHEMA = {
    enabled:           { type: 'boolean', default: true },
    autoDetect:        { type: 'boolean', default: true },
    verbose:           { type: 'boolean', default: false },
    disabledHosts:     { type: 'hostArray', default: [] },
    forceEnabledHosts: { type: 'hostArray', default: [] },
    encodingOverride:  { type: 'enum', default: 'auto',
                         allowed: ['auto', 'tis-620', 'utf-8', 'none'] }
  };

  function validateSettings(raw) {
    const clean = {};
    for (const key of Object.keys(SETTINGS_SCHEMA)) {
      const schema = SETTINGS_SCHEMA[key];
      const value = raw && raw.hasOwnProperty(key) ? raw[key] : undefined;

      switch (schema.type) {
        case 'boolean':
          clean[key] = (typeof value === 'boolean') ? value : schema.default;
          break;
        case 'enum':
          clean[key] = (typeof value === 'string' && schema.allowed.includes(value))
            ? value : schema.default;
          break;
        case 'hostArray':
          if (!Array.isArray(value)) {
            clean[key] = schema.default;
            break;
          }
          // Validate format (RFC 1035) — ไม่ผูกกับ domain ใดเฉพาะ
          clean[key] = value.filter(isValidHostname);
          break;
        default:
          clean[key] = schema.default;
      }
    }
    return clean;
  }

  function getSettings() {
    return new Promise(resolve => {
      try {
        chrome.storage.sync.get(null, (raw) => {
          if (chrome.runtime.lastError) {
            console.warn(LOG_PREFIX, 'Storage error:', chrome.runtime.lastError.message);
            resolve(validateSettings({}));
            return;
          }
          resolve(validateSettings(raw));
        });
      } catch (e) {
        resolve(validateSettings({}));
      }
    });
  }

  // ============================================================
  // ตรวจว่าควรเปิด extension บนหน้านี้หรือไม่
  // ============================================================
  function shouldActivate(settings) {
    if (!settings.enabled) return false;
    const host = (window.location.hostname || '').toLowerCase();
    if (settings.disabledHosts.includes(host)) return false;
    if (settings.forceEnabledHosts.includes(host)) return true;
    if (settings.autoDetect) return isAspPage();
    return false;
  }

  // ============================================================
  // #2 CSP-AWARE POLYFILL INJECTION
  // เพิ่ม onerror handler เพื่อ detect CSP block และแจ้ง user
  // ============================================================
  function injectPolyfill(settings) {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('polyfill.js');
      script.dataset.aspCompatVerbose = settings.verbose ? '1' : '0';
      script.dataset.aspCompatEncoding = settings.encodingOverride || 'auto';

      script.onerror = function() {
        console.error(
          LOG_PREFIX,
          'ไม่สามารถโหลด polyfill ได้ — อาจมี Content-Security-Policy block',
          'path:', safeLogPath()
        );
        showToast(
          '⚠️ ไม่สามารถเปิดโหมด Compatibility สำหรับหน้านี้ได้ ' +
          'อาจมีนโยบายความปลอดภัยของหน้าจำกัดอยู่ — แจ้งทีม IT',
          'warning'
        );
        try { script.remove(); } catch (_) {}
      };
      script.onload = function() {
        try { script.remove(); } catch (_) {}
      };

      const target = document.documentElement;
      target.insertBefore(script, target.firstChild);

      if (settings.verbose) {
        console.log(LOG_PREFIX, 'Polyfill injected on', safeLogPath());
      }
    } catch (e) {
      console.error(LOG_PREFIX, 'Failed to inject polyfill:', e.message || e);
    }
  }

  // ============================================================
  // Encoding detection
  // ============================================================
  function checkEncoding(settings) {
    document.addEventListener('DOMContentLoaded', () => {
      const detectedCharset = document.characterSet || document.charset || '';
      if (settings.verbose) {
        console.log(LOG_PREFIX, 'Detected charset:', detectedCharset);
      }

      const bodyText = document.body ? document.body.innerText.substring(0, 1000) : '';
      const hasMojibake = /[\u00C0-\u00FF]{3,}/.test(bodyText) && !/[\u0E00-\u0E7F]/.test(bodyText);

      if (hasMojibake) {
        console.warn(
          LOG_PREFIX,
          'พบอาการตัวอักษรเพี้ยน (mojibake) บน', safeLogPath(),
          '— ทีม IT ควรเพิ่ม Response.Charset ที่ server'
        );
        showToast('⚠️ ตัวอักษรอาจแสดงผลเพี้ยน — กรุณาแจ้งทีม IT', 'warning');
      }
    });
  }

  // ============================================================
  // แก้ form ที่ไม่ได้กำหนด accept-charset
  // ============================================================
  function patchForms(settings) {
    document.addEventListener('DOMContentLoaded', () => {
      const forms = document.querySelectorAll('form:not([accept-charset])');
      forms.forEach(form => {
        const docCharset = document.characterSet || 'UTF-8';
        form.setAttribute('accept-charset', docCharset);
        if (settings.verbose) {
          console.log(LOG_PREFIX, 'Patched form accept-charset on', safeLogPath());
        }
      });
    });
  }

  // ============================================================
  // #5 TOAST UI — textContent ONLY, never innerHTML
  // ห้ามรับ HTML string จากแหล่งภายนอก
  // ============================================================
  function showToast(message, level) {
    const safeMessage = (typeof message === 'string') ? message : String(message);
    const safeLevel = ['info', 'warning', 'error'].includes(level) ? level : 'info';

    const inject = () => {
      try {
        const toast = document.createElement('div');
        toast.className = 'asp-compat-toast asp-compat-toast-' + safeLevel;
        toast.textContent = safeMessage; // #5: textContent (XSS-safe)
        toast.addEventListener('click', () => {
          try { toast.remove(); } catch (_) {}
        });
        document.body.appendChild(toast);
        setTimeout(() => {
          try { toast.remove(); } catch (_) {}
        }, 8000);
      } catch (_) {}
    };
    if (document.body) inject();
    else document.addEventListener('DOMContentLoaded', inject);
  }

  // ============================================================
  // #1 XSS HARDENING — Auto-fix legacy bugs in generated links
  // Whitelist: อนุญาตเฉพาะ [A-Za-z0-9_$] ความยาว 1-64
  // ============================================================
  const SAFE_IDENTIFIER = /^[A-Za-z0-9_$]{1,64}$/;

  function isSafeIdentifier(s) {
    return typeof s === 'string' && SAFE_IDENTIFIER.test(s);
  }

  function fixBuggyLinks(settings) {
    let urlParams;
    try {
      urlParams = new URLSearchParams(window.location.search);
    } catch (e) {
      return;
    }

    const valueObject = urlParams.get('value_object');
    const vIndex = urlParams.get('v_index');

    const indexIsBad = !vIndex ||
                       vIndex === 'NaN' ||
                       vIndex === 'undefined' ||
                       vIndex === 'null' ||
                       (typeof vIndex === 'string' && vIndex.trim() === '');

    if (!indexIsBad) return;
    if (!valueObject) return;

    if (!isSafeIdentifier(valueObject)) {
      console.warn(
        LOG_PREFIX,
        'ปฏิเสธการ auto-fix: value_object ไม่ใช่ identifier ที่ปลอดภัย ' +
        '(อนุญาตเฉพาะ A-Z, a-z, 0-9, _, $ ความยาว 1-64 ตัวอักษร)'
      );
      return;
    }

    const fixLinks = () => {
      const BUGGY_PATTERNS = [
        /document\.all\[\s*(?:NaN|undefined|null|""|''|"\s*"|'\s*')\s*\]/g,
        /document\.all\[\s*\]/g
      ];

      const replacement = "document.getElementsByName('" + valueObject + "')[0]";

      let fixedCount = 0;
      const allElements = document.querySelectorAll('a[onclick], button[onclick], [onclick]');

      allElements.forEach(el => {
        let onclick = el.getAttribute('onclick');
        if (!onclick) return;
        let changed = false;
        for (const pattern of BUGGY_PATTERNS) {
          if (pattern.test(onclick)) {
            onclick = onclick.replace(pattern, replacement);
            changed = true;
          }
        }
        if (changed) {
          el.setAttribute('onclick', onclick);
          fixedCount++;
        }
      });

      document.querySelectorAll('a[href^="javascript:"]').forEach(a => {
        let href = a.getAttribute('href');
        if (!href) return;
        let changed = false;
        for (const pattern of BUGGY_PATTERNS) {
          if (pattern.test(href)) {
            href = href.replace(pattern, replacement);
            changed = true;
          }
        }
        if (changed) {
          a.setAttribute('href', href);
          fixedCount++;
        }
      });

      if (fixedCount > 0) {
        console.warn(
          LOG_PREFIX,
          'พบ bug ที่ ' + safeLogPath() + ': document.all[' + vIndex + '] — ' +
          'แก้ ' + fixedCount + ' จุด โดยใช้ getElementsByName ของ field "' + valueObject + '"'
        );
        console.warn(
          LOG_PREFIX,
          '💡 ทีม IT ควรแก้ที่ server: ตรวจ IsNumeric(v_index) ก่อนใช้ document.all[v_index]'
        );
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fixLinks);
    } else {
      fixLinks();
    }

    if (document.body) {
      try {
        const observer = new MutationObserver(() => fixLinks());
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 5000);
      } catch (_) {}
    }
  }

  // ============================================================
  // Message listener (สำหรับ popup)
  // ============================================================
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === 'ASP_COMPAT_PING') {
        sendResponse({
          active: !!window.__aspCompatActive,
          isAsp: isAspPage(),
          host: window.location.hostname,
          charset: document.characterSet
        });
      }
      return true;
    });
  } catch (_) {}

  // ============================================================
  // MAIN
  // ============================================================
  getSettings().then(settings => {
    if (!shouldActivate(settings)) {
      if (settings.verbose) {
        console.log(LOG_PREFIX, 'Skipped on', safeLogPath());
      }
      return;
    }

    window.__aspCompatActive = true;
    if (settings.verbose) {
      console.log(LOG_PREFIX, 'Activating on', safeLogPath());
    }

    injectPolyfill(settings);
    checkEncoding(settings);
    patchForms(settings);
    fixBuggyLinks(settings);

    try {
      chrome.runtime.sendMessage({ type: 'ASP_COMPAT_ACTIVE' }).catch(() => {});
    } catch (_) {}
  });
})();
