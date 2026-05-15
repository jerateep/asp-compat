// ============================================================
// ASP Legacy Compatibility Layer — Polyfill (Page World)
// v1.1.1
//
// Security fixes retained:
//   #5 Toast: textContent only, no innerHTML
//   ActiveXObject: non-writable defineProperty (กัน hostile override)
//
// Rolled back: domain guard (ActiveX ทำงานทุก domain ที่ extension activate)
//
// ทำงานใน page world เพื่อให้ script ของหน้าจริงเข้าถึง API เก่าได้
// ทุก polyfill ห่อด้วย try/catch + IIFE เพื่อไม่ให้ตัวหนึ่งพังแล้วลามตัวอื่น
// ============================================================

(function() {
  'use strict';

  // อ่าน config จาก data attribute ของ script tag
  const currentScript = document.currentScript;
  const VERBOSE = currentScript && currentScript.dataset.aspCompatVerbose === '1';
  const LOG = '[ASP-Compat-Polyfill]';

  function log() { if (VERBOSE) console.log.apply(console, [LOG].concat([].slice.call(arguments))); }
  function warn() { console.warn.apply(console, [LOG].concat([].slice.call(arguments))); }

  // ============================================================
  // 1. document.all polyfill
  // IE-only: document.all เป็น HTMLCollection ของทุก element
  // ใน Chrome มี document.all อยู่แล้วแต่ falsy (เพื่อ feature detection เก่า)
  // เราทำให้ใช้งานได้แบบ array-like + เรียกเป็นฟังก์ชันได้
  // ============================================================
  (function polyfillDocumentAll() {
    try {
      const native = document.all;
      // ถ้า document.all ใช้งานได้แล้ว (return truthy เมื่อเข้าถึง index) ข้าม
      if (native && native[0]) return;

      const handler = {
        get(target, prop) {
          if (prop === Symbol.toPrimitive || prop === 'toString') return undefined;
          const all = document.getElementsByTagName('*');
          if (prop === 'length') return all.length;
          if (typeof prop === 'string' && /^\d+$/.test(prop)) return all[prop];
          // IE: document.all.tags("tagname") → getElementsByTagName
          if (prop === 'tags') {
            return function(tagName) {
              return document.getElementsByTagName(String(tagName || '*'));
            };
          }
          // IE: document.all.item(index) หรือ document.all.item(name)
          if (prop === 'item') {
            return function(key) {
              if (typeof key === 'number' || /^\d+$/.test(String(key))) {
                return all[Number(key)] || null;
              }
              return document.getElementById(String(key)) ||
                     document.getElementsByName(String(key))[0] ||
                     null;
            };
          }
          // IE: document.all.namedItem(name)
          if (prop === 'namedItem') {
            return function(name) {
              return document.getElementById(String(name)) ||
                     document.getElementsByName(String(name))[0] ||
                     null;
            };
          }
          // document.all("name") หรือ document.all["name"] → คืน element ที่มี id หรือ name นั้น
          if (typeof prop === 'string') {
            return document.getElementById(prop) ||
                   document.getElementsByName(prop)[0] ||
                   undefined;
          }
          return all[prop];
        }
      };

      // document.all เรียกแบบฟังก์ชันได้: document.all("elementId")
      const callable = function(name) {
        if (name === undefined) return document.getElementsByTagName('*');
        return document.getElementById(name) ||
               document.getElementsByName(name)[0] ||
               null;
      };

      const proxy = new Proxy(callable, handler);
      Object.defineProperty(document, 'all', {
        get: () => proxy,
        configurable: true
      });
      log('document.all polyfilled');
    } catch (e) { warn('document.all polyfill failed:', e); }
  })();

  // ============================================================
  // 1b. HTMLCollection / HTMLFormControlsCollection callable polyfill
  // IE-only: collection สามารถเรียกเป็นฟังก์ชันได้
  //   form.elements("name")  → form.elements.namedItem("name")
  //   form.elements(0)       → form.elements[0]
  //   document.forms("name") → document.forms.namedItem("name")
  //
  // กลยุทธ์: ใช้ Proxy ห่อ collection แบบ defensive
  // - return native element ผ่าน collection[prop] โดยตรง (รักษา HTMLCollection semantics)
  // - callable function fallback ทั้ง index และ named lookup
  // - ห้าม return null ถ้า collection จริง ๆ มี element อยู่
  // ============================================================
  (function polyfillCallableCollections() {
    try {
      // Marker เพื่อกัน wrap ซ้ำ
      const WRAPPED = Symbol.for('aspCompat.callableCollection');

      // Helper: ดึง element โดย name/id โดยไม่ throw
      function lookupByKey(collection, key) {
        // ลอง namedItem ก่อน (มาตรฐาน HTMLCollection)
        try {
          if (typeof collection.namedItem === 'function') {
            const named = collection.namedItem(key);
            if (named) return named;
          }
        } catch (_) {}
        // Fallback bracket access (native HTMLCollection รองรับทั้ง index และ name)
        try {
          const val = collection[key];
          if (val) return val;
        } catch (_) {}
        return null;
      }

      function makeCallable(collection) {
        if (!collection) return collection;
        if (typeof collection !== 'object' && typeof collection !== 'function') return collection;
        if (collection[WRAPPED]) return collection;

        // Callable target — เลียนแบบ IE: collection("...") → element
        const callable = function(key) {
          if (key === undefined || key === null) return collection;

          // Numeric → index access
          if (typeof key === 'number') {
            return collection[key] !== undefined ? collection[key] : null;
          }

          const strKey = String(key);
          if (/^\d+$/.test(strKey)) {
            const idx = Number(strKey);
            return collection[idx] !== undefined ? collection[idx] : null;
          }

          // Named lookup
          return lookupByKey(collection, strKey);
        };

        return new Proxy(callable, {
          // GET: forward ไปยัง collection จริง รักษา this binding ของ method
          get(target, prop, receiver) {
            if (prop === WRAPPED) return true;
            if (prop === '__aspCompatCallable') return true;

            // Symbol → return เลย (อย่าง Symbol.iterator)
            if (typeof prop === 'symbol') {
              const val = collection[prop];
              return typeof val === 'function' ? val.bind(collection) : val;
            }

            // ดึงค่าจาก collection จริง
            let val;
            try { val = collection[prop]; } catch (_) { val = undefined; }

            // ถ้าเป็น method → bind context ให้ถูก
            if (typeof val === 'function') {
              return val.bind(collection);
            }

            return val;
          },
          // SET: forward ไป collection (legacy code อาจ assign แม้ HTMLCollection ไม่ควรเขียนได้)
          set(target, prop, value) {
            try { collection[prop] = value; } catch (_) {}
            return true;
          },
          has(target, prop) {
            try { return prop in collection; } catch (_) { return false; }
          },
          ownKeys() {
            try { return Reflect.ownKeys(collection); } catch (_) { return []; }
          },
          getOwnPropertyDescriptor(target, prop) {
            try {
              const desc = Object.getOwnPropertyDescriptor(collection, prop);
              if (desc) {
                // ต้องเป็น configurable ไม่งั้น Proxy throw
                desc.configurable = true;
                return desc;
              }
            } catch (_) {}
            return undefined;
          },
          // Apply: callable("name") ทำงานปกติ
          apply(target, thisArg, args) {
            return Reflect.apply(callable, thisArg, args);
          }
        });
      }

      // ----- Patch property บน prototype -----
      function patchProperty(proto, propName) {
        if (!proto) return;
        const desc = Object.getOwnPropertyDescriptor(proto, propName);
        if (!desc || !desc.get) return;
        const origGetter = desc.get;
        try {
          Object.defineProperty(proto, propName, {
            get: function() {
              try {
                const orig = origGetter.call(this);
                return makeCallable(orig);
              } catch (e) {
                warn('Failed to wrap', propName, ':', e);
                return origGetter.call(this);
              }
            },
            configurable: true
          });
        } catch (e) {
          warn('Failed to patch', propName, 'on', proto, ':', e);
        }
      }

      // Form elements (สำคัญสุดสำหรับ legacy ASP)
      if (typeof HTMLFormElement !== 'undefined') {
        patchProperty(HTMLFormElement.prototype, 'elements');
      }

      // Document collections
      if (typeof Document !== 'undefined') {
        ['forms', 'images', 'links', 'anchors', 'scripts', 'embeds', 'plugins'].forEach(name => {
          patchProperty(Document.prototype, name);
          // บางเวอร์ชัน property อยู่บน HTMLDocument.prototype
          if (typeof HTMLDocument !== 'undefined') {
            patchProperty(HTMLDocument.prototype, name);
          }
        });
      }

      // Select options
      if (typeof HTMLSelectElement !== 'undefined') {
        patchProperty(HTMLSelectElement.prototype, 'options');
      }

      // Table rows / cells (legacy ASP มักใช้ tbl.rows(i).cells(j))
      if (typeof HTMLTableElement !== 'undefined') {
        patchProperty(HTMLTableElement.prototype, 'rows');
        patchProperty(HTMLTableElement.prototype, 'tBodies');
      }
      if (typeof HTMLTableRowElement !== 'undefined') {
        patchProperty(HTMLTableRowElement.prototype, 'cells');
      }
      if (typeof HTMLTableSectionElement !== 'undefined') {
        patchProperty(HTMLTableSectionElement.prototype, 'rows');
      }

      log('Callable collections polyfilled (form.elements, document.forms, table.rows, etc.)');
    } catch (e) { warn('Callable collections polyfill failed:', e); }
  })();

  // ============================================================
  // 2. window.event polyfill
  // IE-only: window.event เก็บ event ปัจจุบันแบบ global
  // ============================================================
  (function polyfillWindowEvent() {
    try {
      if ('event' in window && window.event !== undefined) {
        // บางเวอร์ชันของ Chrome มี window.event อยู่แล้ว ข้าม
        return;
      }

      let currentEvent = null;
      const captureTypes = [
        'click', 'dblclick', 'change', 'submit', 'reset', 'focus', 'blur',
        'keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'mousemove',
        'mouseover', 'mouseout', 'input', 'select', 'contextmenu', 'wheel'
      ];

      captureTypes.forEach(type => {
        window.addEventListener(type, e => { currentEvent = e; }, true);
      });

      Object.defineProperty(window, 'event', {
        get: () => currentEvent,
        configurable: true
      });
      log('window.event polyfilled');
    } catch (e) { warn('window.event polyfill failed:', e); }
  })();

  // ============================================================
  // 3. attachEvent / detachEvent polyfill
  // IE-only API สำหรับเพิ่ม event listener
  // ============================================================
  (function polyfillAttachEvent() {
    try {
      if (Element.prototype.attachEvent) return;

      const targets = [Element.prototype, Document.prototype, Window.prototype];
      targets.forEach(target => {
        target.attachEvent = function(eventName, handler) {
          const type = eventName.replace(/^on/, '');
          // ใน IE attachEvent handler รับ event จาก window.event
          // ใน DOM มาตรฐาน handler รับ event เป็น argument
          // wrapper เพื่อให้ handler เก่าเรียก this ถูกตัว
          const wrapped = function(e) { return handler.call(this, e); };
          handler.__aspCompatWrapped = wrapped;
          return this.addEventListener(type, wrapped, false);
        };
        target.detachEvent = function(eventName, handler) {
          const type = eventName.replace(/^on/, '');
          const wrapped = handler.__aspCompatWrapped || handler;
          return this.removeEventListener(type, wrapped, false);
        };
      });
      log('attachEvent / detachEvent polyfilled');
    } catch (e) { warn('attachEvent polyfill failed:', e); }
  })();

  // ============================================================
  // 4. Event object properties polyfill
  // - event.srcElement → event.target
  // - event.fromElement / toElement → relatedTarget
  // - event.returnValue = false → preventDefault
  // - event.cancelBubble = true → stopPropagation
  // ============================================================
  (function polyfillEventProperties() {
    try {
      const proto = Event.prototype;

      if (!('srcElement' in proto)) {
        Object.defineProperty(proto, 'srcElement', {
          get: function() { return this.target; },
          configurable: true
        });
      }

      if (!('fromElement' in proto)) {
        Object.defineProperty(proto, 'fromElement', {
          get: function() { return this.relatedTarget; },
          configurable: true
        });
      }

      if (!('toElement' in proto)) {
        Object.defineProperty(proto, 'toElement', {
          get: function() { return this.relatedTarget; },
          configurable: true
        });
      }

      // returnValue: setter เป็น false → preventDefault
      const originalReturnValueDesc = Object.getOwnPropertyDescriptor(proto, 'returnValue');
      if (!originalReturnValueDesc || !originalReturnValueDesc.set) {
        let _returnValue = new WeakMap();
        Object.defineProperty(proto, 'returnValue', {
          get: function() { return _returnValue.get(this) !== false; },
          set: function(v) {
            _returnValue.set(this, v);
            if (v === false) this.preventDefault();
          },
          configurable: true
        });
      }

      // cancelBubble: setter เป็น true → stopPropagation
      const originalCancelDesc = Object.getOwnPropertyDescriptor(proto, 'cancelBubble');
      if (!originalCancelDesc || !originalCancelDesc.set) {
        let _cancelBubble = new WeakMap();
        Object.defineProperty(proto, 'cancelBubble', {
          get: function() { return _cancelBubble.get(this) === true; },
          set: function(v) {
            _cancelBubble.set(this, v);
            if (v === true) this.stopPropagation();
          },
          configurable: true
        });
      }

      log('Event properties polyfilled (srcElement, returnValue, cancelBubble, etc.)');
    } catch (e) { warn('Event properties polyfill failed:', e); }
  })();

  // ============================================================
  // 5. Element.fireEvent polyfill
  // IE-only: element.fireEvent("onclick") → element.dispatchEvent
  // ============================================================
  (function polyfillFireEvent() {
    try {
      if (Element.prototype.fireEvent) return;
      Element.prototype.fireEvent = function(eventName, eventObj) {
        const type = eventName.replace(/^on/, '');
        let event;
        if (/^(click|dblclick|mouse|wheel)/.test(type)) {
          event = new MouseEvent(type, { bubbles: true, cancelable: true });
        } else if (/^key/.test(type)) {
          event = new KeyboardEvent(type, { bubbles: true, cancelable: true });
        } else {
          event = new Event(type, { bubbles: true, cancelable: true });
        }
        if (eventObj && typeof eventObj === 'object') {
          Object.keys(eventObj).forEach(k => {
            try { event[k] = eventObj[k]; } catch (_) {}
          });
        }
        return this.dispatchEvent(event);
      };
      log('Element.fireEvent polyfilled');
    } catch (e) { warn('fireEvent polyfill failed:', e); }
  })();

  // ============================================================
  // 6. ActiveXObject stub (non-writable for defense in depth)
  //
  // Security: ใช้ Object.defineProperty พร้อม writable:false, configurable:false
  // เพื่อป้องกัน script ของหน้า override ตัว stub ของเรา
  // sanitize progId ก่อน log/แสดง toast (กัน injection ใน UI)
  // ============================================================
  (function stubActiveX() {
    try {
      if (typeof window.ActiveXObject !== 'undefined') {
        log('ActiveXObject already defined — skip');
        return;
      }

      const XMLHTTP_TYPES = /^(microsoft\.xmlhttp|msxml2\.xmlhttp|msxml2\.serverxmlhttp)/i;
      const XMLDOM_TYPES = /^(microsoft\.xmldom|msxml2\.domdocument)/i;

      // Sanitize progId สำหรับ log/toast
      function safeProgId(p) {
        const s = String(p == null ? '' : p);
        return s.replace(/[^A-Za-z0-9._]/g, '?').substring(0, 64);
      }

      const activeXStub = function(progId) {
        const id = String(progId == null ? '' : progId).toLowerCase();

        if (XMLHTTP_TYPES.test(id)) {
          log('ActiveXObject XMLHTTP → XMLHttpRequest');
          return new XMLHttpRequest();
        }

        if (XMLDOM_TYPES.test(id)) {
          log('ActiveXObject XMLDOM → DOMParser');
          return {
            async: true,
            loadXML: function(xmlString) {
              try {
                const parser = new DOMParser();
                this._doc = parser.parseFromString(String(xmlString || ''), 'application/xml');
                return !this._doc.querySelector('parsererror');
              } catch (e) { return false; }
            },
            load: function() {
              warn('XMLDOM .load() จาก URL ใช้ไม่ได้ — ต้องใช้ fetch + DOMParser');
              return false;
            },
            get documentElement() { return this._doc ? this._doc.documentElement : null; },
            selectNodes: function(xpath) {
              if (!this._doc) return [];
              try {
                const result = this._doc.evaluate(
                  String(xpath || ''), this._doc, null,
                  XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
                );
                const nodes = [];
                for (let i = 0; i < result.snapshotLength; i++) nodes.push(result.snapshotItem(i));
                return nodes;
              } catch (e) { return []; }
            },
            selectSingleNode: function(xpath) {
              if (!this._doc) return null;
              try {
                const result = this._doc.evaluate(
                  String(xpath || ''), this._doc, null,
                  XPathResult.FIRST_ORDERED_NODE_TYPE, null
                );
                return result.singleNodeValue;
              } catch (e) { return null; }
            }
          };
        }

        // ActiveX อื่น ๆ — log แบบ sanitized แล้วคืน stub
        const cleanId = safeProgId(progId);
        warn('ActiveXObject ไม่รองรับ:', cleanId);
        showUserToast('⚠️ ฟีเจอร์ ActiveX (' + cleanId + ') ไม่รองรับบน Chrome — กรุณาติดต่อทีม IT');

        return new Proxy({}, {
          get: function(target, prop) {
            return function() {
              warn('ActiveX method called on unsupported object:', cleanId);
              return null;
            };
          },
          set: function() { return true; }
        });
      };

      // NON-WRITABLE: ป้องกัน hostile page script overwrite
      try {
        Object.defineProperty(window, 'ActiveXObject', {
          value: activeXStub,
          writable: false,
          configurable: false,
          enumerable: false
        });
        log('ActiveXObject stubbed (non-writable)');
      } catch (e) {
        // ถ้า defineProperty fail (เช่น property มีอยู่แล้วและ non-configurable)
        // ให้ fall back เป็น regular assignment พร้อม log warning
        warn('Could not define ActiveXObject as non-writable, falling back:', e.message);
        try {
          window.ActiveXObject = activeXStub;
        } catch (e2) {
          warn('ActiveXObject stub fully failed:', e2.message);
        }
      }
    } catch (e) { warn('ActiveXObject stub failed:', e.message || e); }
  })();

  // ============================================================
  // 7. VBScript detection
  // Chrome ไม่มี VBScript engine — เตือน user
  // ============================================================
  (function detectVBScript() {
    try {
      document.addEventListener('DOMContentLoaded', () => {
        const vbScripts = document.querySelectorAll(
          'script[language="vbscript" i], script[type="text/vbscript" i]'
        );
        if (vbScripts.length > 0) {
          warn('พบ VBScript ' + vbScripts.length + ' block — Chrome ไม่รองรับ VBScript ฝั่ง client');
          showUserToast('⚠️ หน้านี้ใช้ VBScript ซึ่ง Chrome ไม่รองรับ — บางฟีเจอร์อาจไม่ทำงาน');
        }
      });
    } catch (e) { warn('VBScript detection failed:', e); }
  })();

  // ============================================================
  // 8. String / Array methods ที่ IE legacy code อาจคาดหวัง
  // ============================================================
  (function polyfillLegacyMethods() {
    try {
      // String.prototype.substr มีอยู่แล้ว แต่ deprecated
      // Array.prototype หลายตัวที่ ES5+ มีอยู่แล้วใน Chrome ข้าม

      // ใส่ Element.prototype.removeNode (IE-only)
      if (!Element.prototype.removeNode) {
        Element.prototype.removeNode = function(removeChildren) {
          if (removeChildren === false && this.parentNode) {
            // ย้าย children ขึ้นไปเป็น sibling ของ this
            while (this.firstChild) this.parentNode.insertBefore(this.firstChild, this);
          }
          if (this.parentNode) this.parentNode.removeChild(this);
          return this;
        };
      }

      // element.children ใน IE รวม Comment node ด้วย แต่ใน Chrome ไม่รวม
      // ปกติไม่กระทบ — ไม่ patch

      // element.innerText มีอยู่แล้ว แต่บางที legacy code ใช้ .text
      // ไม่ patch เพราะอาจชนกับ property อื่น

      log('Legacy DOM methods polyfilled');
    } catch (e) { warn('Legacy methods polyfill failed:', e); }
  })();

  // ============================================================
  // 9. Conditional comments fallback
  // IE conditional comments แสดงเป็น HTML comment ใน Chrome
  // ถ้ามี <!--[if !IE]>...<![endif]--> ต้องให้แสดงผล
  // ============================================================
  (function handleConditionalComments() {
    try {
      document.addEventListener('DOMContentLoaded', () => {
        const walker = document.createTreeWalker(
          document.body || document.documentElement,
          NodeFilter.SHOW_COMMENT,
          null
        );
        const toProcess = [];
        let node;
        while (node = walker.nextNode()) {
          const text = node.nodeValue;
          // [if !IE]><!--><div>...</div><!--<![endif]
          if (/\[if\s+!\s*IE\]/i.test(text)) {
            toProcess.push(node);
          }
        }
        if (toProcess.length > 0) {
          log('Found', toProcess.length, 'non-IE conditional comments');
        }
      });
    } catch (e) { warn('Conditional comment handler failed:', e); }
  })();

  // ============================================================
  // 10. Toast UI (#5 XSS-safe — textContent ONLY)
  //
  // CRITICAL SECURITY RULE:
  //   ห้ามใช้ innerHTML, insertAdjacentHTML, document.write หรือ
  //   วิธีใด ๆ ที่ parse string เป็น HTML ใน toast
  //   เพราะ message อาจมาจากแหล่งที่ไม่ trust (เช่น progId จาก page script)
  // ============================================================
  function showUserToast(message) {
    // Coerce เป็น string ก่อน + จำกัดความยาว
    const safeMessage = String(message == null ? '' : message).substring(0, 300);

    const inject = function() {
      try {
        const toast = document.createElement('div');
        toast.className = 'asp-compat-toast asp-compat-toast-warning';
        // #5: textContent only — NEVER innerHTML
        toast.textContent = safeMessage;
        toast.addEventListener('click', function() {
          try { toast.remove(); } catch (_) {}
        });
        document.body.appendChild(toast);
        setTimeout(function() {
          try { toast.remove(); } catch (_) {}
        }, 8000);
      } catch (_) {}
    };
    if (document.body) inject();
    else document.addEventListener('DOMContentLoaded', inject);
  }

  // Mark ว่า polyfill ทำงานแล้ว
  try {
    Object.defineProperty(window, '__aspCompatPolyfillLoaded', {
      value: true,
      writable: false,
      configurable: false
    });
  } catch (_) {
    window.__aspCompatPolyfillLoaded = true;
  }
  log('All polyfills loaded successfully');
})();
