# SECURITY CHANGELOG v1.1.1

เอกสารสำหรับทีม Security review

## 🔧 Hotfix v1.1.2 (In Progress)

| # | Issue | Fix |
|---|-------|-----|
| 9 | document.all.tags() undefined | Added IE methods: tags(), item(), namedItem() |

**Impact:** Fix legacy ASP code using `document.all.tags("tagname")`, `document.all.item(idx)`, `document.all.namedItem(name)` (common in calendar libraries, form frameworks)

## สรุป Fixes ที่ Apply

| # | Issue | Status |
|---|-------|--------|
| 1 | XSS — whitelist sanitization in `fixBuggyLinks()` | ✅ Applied |
| 2 | CSP conflict — `onerror` handler on polyfill injection | ✅ Applied |
| 3 | ActiveX domain guard | ⊘ Rolled back (เปลี่ยนเป็น non-writable เท่านั้น) |
| 4 | Settings validation — type check + hostname format | ✅ Applied |
| 5 | Toast uses `textContent` — never `innerHTML` | ✅ Applied |
| 6 | Safe URL logging — strip query string | ✅ Applied |
| 7 | Version integrity check | ⊘ Dropped (ทีม security ยังไม่ระบุ requirement) |
| 8 | Domain restriction | ⊘ Rolled back (เปิดทุก domain เพื่อ extensibility) |

Version: 1.1.1

---

## รายละเอียดการแก้

### #1 XSS — Whitelist Sanitization in `fixBuggyLinks()`

**ไฟล์:** `content.js`

อนุญาตเฉพาะ `[A-Za-z0-9_$]{1,64}` (JS identifier ที่ valid) ใน `value_object` ของ URL parameter ถ้าไม่ผ่าน whitelist → ไม่ทำ auto-fix เลย (fail-closed)

```javascript
const SAFE_IDENTIFIER = /^[A-Za-z0-9_$]{1,64}$/;
if (!isSafeIdentifier(valueObject)) {
  console.warn(LOG_PREFIX, 'ปฏิเสธการ auto-fix: ...');
  return;
}
```

### #2 CSP Conflict — `onerror` Handler

**ไฟล์:** `content.js`

ถ้าหน้ามี Content-Security-Policy ที่ block extension script จะแสดง toast + log error ชัดเจน แทนที่จะเงียบหายไป

```javascript
script.onerror = function() {
  console.error(LOG_PREFIX, 'ไม่สามารถโหลด polyfill ได้ ...', 'path:', safeLogPath());
  showToast('⚠️ ไม่สามารถเปิดโหมด Compatibility ...', 'warning');
};
```

### #3 ActiveX Domain Guard — ROLLED BACK

**Status:** ตัด domain restriction ออก เพื่อรองรับการใช้งานในหลาย domain ในอนาคต

**สิ่งที่เก็บไว้:** Non-writable defineProperty บน `window.ActiveXObject` เพื่อกัน hostile page script overwrite — เป็น defense ทั่วไปที่ไม่ผูกกับ domain

```javascript
Object.defineProperty(window, 'ActiveXObject', {
  value: activeXStub,
  writable: false,
  configurable: false,
  enumerable: false
});
```

นอกจากนี้ `progId` ที่จะแสดงใน toast ยังถูก sanitize:
```javascript
function safeProgId(p) {
  return String(p == null ? '' : p)
    .replace(/[^A-Za-z0-9._]/g, '?')
    .substring(0, 64);
}
```

### #4 Settings Validation

**ไฟล์:** `content.js` (read path), `options.js` (write path)

มี `SETTINGS_SCHEMA` + `validateSettings()` ที่ enforce:
- `enabled`, `autoDetect`, `verbose` → `boolean` strict
- `disabledHosts`, `forceEnabledHosts` → array of string ที่ผ่าน RFC 1035 hostname regex
- `encodingOverride` → enum `['auto', 'tis-620', 'utf-8', 'none']`

ทั้ง read และ write ใช้ validation เดียวกัน — belt-and-suspenders

**หมายเหตุ:** เปลี่ยนจาก "Thaicom-only validation" เป็น "RFC 1035 hostname format validation" เพื่อรองรับทุก domain

### #5 Toast — `textContent` Only

**ไฟล์:** `content.js`, `polyfill.js`

ทุก toast ใช้ `textContent` ไม่ใช้ `innerHTML` พร้อม comment กำกับชัดเจน

```javascript
toast.textContent = safeMessage; // textContent only — NEVER innerHTML
```

Audit: `grep "innerHTML|document.write|insertAdjacentHTML"` ทั้ง codebase พบเฉพาะใน comment เท่านั้น

### #6 Safe URL Logging

**ไฟล์:** `content.js`

ใช้ `safeLogPath()` ที่คืนเฉพาะ pathname ตัด query string + fragment ทิ้ง

```javascript
function safeLogPath() {
  try { return window.location.pathname || '(no path)'; }
  catch (e) { return '(unavailable)'; }
}
```

ป้องกัน session token / sensitive param หลุดเข้า DevTools console

### #7 Version Integrity Check — DROPPED

ตัดออกตาม request — รอความชัดเจนจากทีม security ว่าต้องการ mechanism แบบใด

### #8 Domain Restriction — ROLLED BACK

**Status:** กลับเป็น `<all_urls>` เพื่อรองรับการขยายไปยัง domain อื่นในอนาคต

**Rationale:**
- Extension นี้ออกแบบมาให้ extensible สำหรับหลาย customer/organization
- Hard-code domain ทำให้ต้องแก้ code + redeploy ทุกครั้งที่มี domain ใหม่
- Risk ที่ลดลงจาก domain restriction ส่วนใหญ่ถูก cover ด้วย security fixes อื่นที่ยังคงอยู่ (#1, #2, #4, #5, #6) ซึ่งเป็น defense ทั่วไปที่ไม่ผูกกับ domain

**สิ่งที่ user/admin ทำได้แทน:**
- ใช้ Chrome Enterprise Policy (`ExtensionSettings.runtime_allowed_hosts`) จำกัด domain ระดับ deployment
- ใช้ feature `disabledHosts` ใน options page เพื่อ exclude domain ที่ไม่ต้องการ

---

## Testing

### Manual Test Cases

1. **#1 XSS via value_object:**
   - URL: `?value_object=test'); alert('xss'); //&v_index=NaN`
   - Expected: ปฏิเสธ + log warning, ไม่มี alert
   - ✅ Pass

2. **#2 CSP block:**
   - หน้า ASP บน site ที่มี strict CSP
   - Expected: Toast + console error
   - ✅ Pass

3. **#4 Tampered storage:**
   - `chrome.storage.sync.set({ disabledHosts: 'not-an-array' })`
   - Expected: validateSettings() returns default `[]`
   - ✅ Pass

4. **#5 Toast XSS:**
   - Toast message ที่มี `<script>alert(1)</script>` (เช่นจาก progId)
   - Expected: แสดงเป็น literal text
   - ✅ Pass

5. **#6 URL logging:**
   - เปิดหน้า `/foo.asp?token=secret123`
   - Expected: console เห็นแค่ `/foo.asp`
   - ✅ Pass

6. **ActiveX overwrite attempt:**
   - `window.ActiveXObject = function() { return 'hijacked'; }`
   - Expected: TypeError (non-writable) ในโหมด strict
   - ✅ Pass

### Automated checks
```
✓ All JS files pass node --check syntax
✓ manifest.json valid JSON
✓ grep "innerHTML|document.write|insertAdjacentHTML" → only in comments
✓ grep "thaicom" → no references (fully rolled back)
```

---

## Files Changed (vs v1.0.4)

```
manifest.json     — version bump (host: <all_urls> เหมือนเดิม)
content.js        — rewrite: #1, #2, #4, #5, #6
polyfill.js       — modify: #5, non-writable ActiveXObject
background.js     — minor: safe error logging
options.js        — rewrite: #4 hostname format validation
options.html      — minor: version label
popup.html/.js    — minor: version label
```

---

## Defense in Depth Summary

| Layer | Mechanism | Issue |
|-------|-----------|-------|
| Content script | onerror on script tag | #2 |
| Settings IO | validateSettings() | #4 |
| Auto-fix logic | whitelist regex | #1 |
| UI rendering | textContent only | #5 |
| Logging | safeLogPath() | #6 |
| ActiveXObject | non-writable property | (defense) |
| ActiveX progId | sanitize before display | (defense) |

---

*จัดทำสำหรับทีม Security review · v1.1.1*
