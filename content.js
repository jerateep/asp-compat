// ============================================================
// ASP Legacy Compatibility Layer — Content Script
// ทำงานใน isolated world เพื่อตรวจหน้า ASP และ inject polyfill เข้า page world
// ============================================================

(function() {
  'use strict';

  const LOG_PREFIX = '[ASP-Compat]';

  // ----- 1. ตรวจว่าเป็นหน้า ASP หรือไม่ -----
  function isAspPage() {
    const url = window.location.href.toLowerCase();
    const pathname = window.location.pathname.toLowerCase();

    // ตรวจจาก URL extension
    if (/\.(asp|aspx|asa|cer|cdx)(\?|#|$)/i.test(pathname)) return true;

    // ตรวจจาก default document ที่นิยมใช้ใน IIS เก่า
    if (/\/(default|index)\.(asp|aspx)(\?|#|$)/i.test(pathname)) return true;

    // ตรวจจาก meta generator (ASP บางตัวใส่ไว้)
    const generator = document.querySelector('meta[name="generator"]');
    if (generator && /asp/i.test(generator.content)) return true;

    return false;
  }

  // ----- 2. โหลด settings จาก storage -----
  async function getSettings() {
    return new Promise(resolve => {
      chrome.storage.sync.get({
        enabled: true,
        autoDetect: true,
        disabledHosts: [],
        forceEnabledHosts: [],
        verbose: false,
        encodingOverride: 'auto'
      }, resolve);
    });
  }

  // ----- 3. ตรวจว่าควรเปิด extension บนหน้านี้หรือไม่ -----
  function shouldActivate(settings) {
    if (!settings.enabled) return false;

    const host = window.location.hostname.toLowerCase();

    // ถ้าโดน disable เฉพาะ host นี้
    if (settings.disabledHosts.includes(host)) return false;

    // ถ้าถูก force enable
    if (settings.forceEnabledHosts.includes(host)) return true;

    // ถ้า auto-detect: ใช้กับหน้า ASP เท่านั้น
    if (settings.autoDetect) return isAspPage();

    return false;
  }

  // ----- 4. Inject polyfill เข้า page world (สำคัญ: ต้องก่อน script ของหน้าจริง) -----
  function injectPolyfill(settings) {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('polyfill.js');
      script.dataset.aspCompatVerbose = settings.verbose ? '1' : '0';
      script.dataset.aspCompatEncoding = settings.encodingOverride || 'auto';

      // ใส่ใน <html> ก่อน <head> เพราะ document_start = head ยังไม่มี
      const target = document.documentElement;
      target.insertBefore(script, target.firstChild);

      // ลบ script tag หลังโหลดเสร็จ (polyfill ทำงานไปแล้ว)
      script.onload = function() { script.remove(); };

      if (settings.verbose) {
        console.log(LOG_PREFIX, 'Polyfill injected at', performance.now().toFixed(2), 'ms');
      }
    } catch (e) {
      console.error(LOG_PREFIX, 'Failed to inject polyfill:', e);
    }
  }

  // ----- 5. Auto-detect encoding และเตือนผู้ใช้ถ้าเพี้ยน -----
  function checkEncoding(settings) {
    document.addEventListener('DOMContentLoaded', () => {
      const metaCharset = document.querySelector('meta[charset], meta[http-equiv="Content-Type" i]');
      let detectedCharset = document.characterSet || document.charset || '';

      if (settings.verbose) {
        console.log(LOG_PREFIX, 'Detected charset:', detectedCharset);
        if (metaCharset) console.log(LOG_PREFIX, 'Meta charset tag:', metaCharset.outerHTML);
      }

      // ตรวจอาการตัวอักษรไทยเพี้ยน (mojibake): 
      // ถ้าหน้าเป็น TIS-620 แต่ browser decode เป็น UTF-8 จะเห็นเป็นตัวอักษรประหลาด
      const bodyText = document.body ? document.body.innerText.substring(0, 1000) : '';
      const hasMojibake = /[\u00C0-\u00FF]{3,}/.test(bodyText) && !/[\u0E00-\u0E7F]/.test(bodyText);

      if (hasMojibake) {
        console.warn(LOG_PREFIX, 'พบอาการตัวอักษรเพี้ยน (mojibake) — หน้านี้อาจเป็น TIS-620/Windows-874');
        console.warn(LOG_PREFIX, 'วิธีแก้: ขอให้ทีม IT เพิ่ม Content-Type header หรือ <meta charset> ที่ server');
        showToast('⚠️ ตัวอักษรอาจแสดงผลเพี้ยน — กรุณาแจ้งทีม IT', 'warning');
      }
    });
  }

  // ----- 6. แก้ form ที่ไม่ได้กำหนด accept-charset -----
  function patchForms(settings) {
    document.addEventListener('DOMContentLoaded', () => {
      const forms = document.querySelectorAll('form:not([accept-charset])');
      forms.forEach(form => {
        // กำหนด accept-charset ตาม document charset เดิม
        // ไม่เปลี่ยน field name, action, method
        const docCharset = document.characterSet || 'UTF-8';
        form.setAttribute('accept-charset', docCharset);
        if (settings.verbose) {
          console.log(LOG_PREFIX, 'Patched form accept-charset:', form.action || '(no action)');
        }
      });
    });
  }

  // ----- 7. Toast UI สำหรับแจ้งเตือนผู้ใช้ -----
  function showToast(message, level = 'info') {
    const inject = () => {
      const toast = document.createElement('div');
      toast.className = 'asp-compat-toast asp-compat-toast-' + level;
      toast.textContent = message;
      toast.addEventListener('click', () => toast.remove());
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 8000);
    };
    if (document.body) inject();
    else document.addEventListener('DOMContentLoaded', inject);
  }

  // ============================================================
  // 7b. Auto-fix legacy bugs in generated links
  // หน้า ASP บางหน้า generate JavaScript ที่มี NaN/undefined/null/empty index
  // เช่น: document.all[NaN].value = "..."
  // ปัญหานี้เกิดจาก server generate URL ผิด แต่ extension ช่วยแก้ที่ client ได้
  //
  // กลยุทธ์:
  //   1. หาทุก <a onclick="..."> ที่มี pattern buggy
  //   2. ถ้า URL มี value_object → แทนด้วย getElementsByName(value_object)[0]
  //   3. Log warning ใน console เพื่อให้ dev รู้ว่าต้องแก้ที่ server
  // ============================================================
  function fixBuggyLinks(settings) {
    const urlParams = new URLSearchParams(window.location.search);
    const valueObject = urlParams.get('value_object');
    const vForm = urlParams.get('v_form');
    const vIndex = urlParams.get('v_index');

    // ตรวจว่าหน้านี้น่าจะเป็น search popup ที่มี bug หรือไม่
    // - มี v_index=NaN หรือ undefined → buggy
    // - หรือไม่ได้ส่ง v_index มาเลย → buggy
    const indexIsBad = !vIndex ||
                       vIndex === 'NaN' ||
                       vIndex === 'undefined' ||
                       vIndex === 'null' ||
                       vIndex.trim() === '';

    if (!indexIsBad) return; // index ปกติ ไม่ต้อง fix
    if (!valueObject) return; // ไม่มีข้อมูล fallback ก็ทำอะไรไม่ได้

    const fixLinks = () => {
      // Pattern ที่จะ match:
      //   document.all[NaN]
      //   document.all[undefined]
      //   document.all[]
      //   document.all["NaN"]
      //   document.all['NaN']
      const BUGGY_PATTERNS = [
        /document\.all\[\s*(?:NaN|undefined|null|""|''|"\s*"|'\s*')\s*\]/g,
        /document\.all\[\s*\]/g  // empty bracket
      ];

      // สร้าง replacement: ใช้ getElementsByName เพื่อหา field ตามชื่อ
      // escape valueObject เพื่อกัน injection
      const safeValueObject = valueObject.replace(/['"\\\n\r]/g, '');
      const replacement = `document.getElementsByName('${safeValueObject}')[0]`;

      let fixedCount = 0;
      const allLinks = document.querySelectorAll('a[onclick], button[onclick], [onclick]');

      allLinks.forEach(el => {
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

      // ตรวจ href javascript: ด้วย
      document.querySelectorAll('a[href^="javascript:"]').forEach(a => {
        let href = a.getAttribute('href');
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
          '⚠️ พบ bug ในหน้า ' + window.location.pathname + ': ' +
          'server generate document.all[' + vIndex + '] ซึ่งใช้งานไม่ได้\n' +
          '   → Extension แก้ให้ชั่วคราว ' + fixedCount + ' จุด โดยใช้ getElementsByName("' + safeValueObject + '") แทน\n' +
          '   💡 ทีม IT ควรแก้ที่ server: ' + window.location.pathname + ' ให้ตรวจ IsNumeric(v_index) ก่อนใช้ document.all[v_index]'
        );

        if (settings.verbose) {
          console.log(LOG_PREFIX, 'Fixed links:', { valueObject, vForm, vIndex, fixedCount });
        }
      }
    };

    // run ทั้ง DOM โหลดครั้งแรก และเมื่อ DOM เปลี่ยน (กรณี dynamic content)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fixLinks);
    } else {
      fixLinks();
    }

    // เผื่อ ASP generate link แบบ dynamic หลัง load (rare แต่ defensive)
    if (document.body) {
      const observer = new MutationObserver(() => fixLinks());
      const startObserving = () => {
        observer.observe(document.body, { childList: true, subtree: true });
        // หยุด observe หลัง 5 วินาที — เพียงพอสำหรับ ASP page load
        setTimeout(() => observer.disconnect(), 5000);
      };
      if (document.body) startObserving();
      else document.addEventListener('DOMContentLoaded', startObserving);
    }
  }

  // ----- 8. ฟัง message จาก popup (toggle on/off, etc.) -----
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'ASP_COMPAT_PING') {
      sendResponse({
        active: window.__aspCompatActive || false,
        isAsp: isAspPage(),
        host: window.location.hostname,
        charset: document.characterSet
      });
    }
    return true;
  });

  // ----- MAIN -----
  getSettings().then(settings => {
    if (!shouldActivate(settings)) {
      if (settings.verbose) console.log(LOG_PREFIX, 'Skipped on', window.location.hostname);
      return;
    }

    window.__aspCompatActive = true;
    if (settings.verbose) console.log(LOG_PREFIX, 'Activating on', window.location.href);

    injectPolyfill(settings);
    checkEncoding(settings);
    patchForms(settings);
    fixBuggyLinks(settings);

    // อัพเดท badge
    chrome.runtime.sendMessage({ type: 'ASP_COMPAT_ACTIVE' }).catch(() => {});
  });
})();
