# ASP Legacy Compatibility Layer

Chrome Extension ที่ทำให้เว็บ Classic ASP เก่า (เขียนสำหรับ IE) ทำงานบน Chrome/Edge สมัยใหม่ได้
โดย**ไม่ต้องแก้โค้ด server**

## ทำอะไรได้บ้าง

✅ **Polyfill IE-only API**
- `document.all` — เข้าถึง element แบบ IE
- `window.event` — global event object
- `attachEvent` / `detachEvent` / `fireEvent` — IE event model
- `event.srcElement`, `event.returnValue`, `event.cancelBubble` — properties เก่า
- `Element.removeNode` — DOM method ของ IE

✅ **ActiveXObject stub**
- `Microsoft.XMLHTTP` / `Msxml2.XMLHTTP` → ใช้งานได้จริงผ่าน `XMLHttpRequest`
- `Microsoft.XMLDOM` / `Msxml2.DOMDocument` → ใช้งานพื้นฐานได้ผ่าน `DOMParser`
- ActiveX อื่น ๆ (Excel, FileSystemObject) → stub + เตือน user

✅ **CSS Fixes**
- ฟอนต์ legacy (MS Sans Serif, JasmineUPC) → ฟอนต์ระบบที่อ่านง่าย
- `<font>`, `<center>`, `<marquee>` แสดงผลพอใช้ได้
- รักษา print layout สำหรับใบเสร็จ/ฟอร์ม

✅ **Encoding Detection**
- ตรวจ mojibake (ตัวอักษรไทยเพี้ยน) และแจ้งเตือน

✅ **VBScript Detection**
- ตรวจ `<script language="vbscript">` และแจ้งเตือนผู้ใช้

✅ **Form Safety**
- เพิ่ม `accept-charset` ที่ขาดหาย (ไม่เปลี่ยน field name, action, method)

## ทำอะไรไม่ได้

❌ **รัน VBScript ฝั่ง client** — Chrome ไม่มี VBScript engine
❌ **รัน ActiveX จริง** เช่นเปิด Excel, อ่านไฟล์ local
❌ **บังคับ IE rendering mode** — Chrome ไม่มี IE mode (Edge IE Mode เป็นคนละเรื่อง)
❌ **แก้ encoding หลัง browser parse แล้ว** — ต้องแก้ที่ server

## ติดตั้ง

### วิธี Load Unpacked (สำหรับทดสอบ)

1. ดาวน์โหลดและ extract zip ไฟล์
2. เปิด Chrome ไปที่ `chrome://extensions`
3. เปิด **Developer mode** (มุมขวาบน)
4. คลิก **Load unpacked**
5. เลือกโฟลเดอร์ `asp-compat`

### วิธี Deploy ทั้งองค์กร

ใช้ Group Policy / Chrome Enterprise:
1. Pack extension เป็น `.crx` หรือใช้ Chrome Web Store (private)
2. Push ผ่าน `ExtensionInstallForcelist` policy
3. ตั้งค่า default settings ผ่าน `ExtensionSettings` policy

## วิธีใช้งาน

- **อัตโนมัติ**: เปิดเว็บที่เป็น `.asp` หรือ `.aspx` — extension ทำงานเอง (badge ขึ้น "ON")
- **คลิก icon**: เห็นสถานะหน้านี้, toggle เปิด/ปิด, ปิดเฉพาะโดเมน
- **Options page**: ตั้งค่ารายการ whitelist/blacklist, verbose logging

### Force enable สำหรับเว็บที่ใช้ URL Rewriting

ถ้าเว็บใช้ URL rewriting (URL ไม่ลงท้าย `.asp` แต่จริง ๆ เป็น ASP):
1. คลิก icon บน toolbar
2. กด **⊕ บังคับเปิดสำหรับโดเมนนี้**
3. โดเมนนั้นจะถูก activate ทุกหน้า

## Debug

เปิด DevTools Console จะเห็น log prefix `[ASP-Compat]` และ `[ASP-Compat-Polyfill]`

เปิด Verbose mode ใน Options เพื่อดู log ละเอียด

## โครงสร้างไฟล์

```
asp-compat/
├── manifest.json       # MV3 config
├── background.js       # Service worker
├── content.js          # Content script (isolated world)
├── polyfill.js         # Page world polyfills
├── fixes.css           # CSS overrides
├── popup.html/.js      # Toolbar UI
├── options.html/.js    # Settings page
└── icons/              # Extension icons
```

## ข้อจำกัดที่ทราบ

| ปัญหา | สถานะ | วิธีแก้ |
|---|---|---|
| ตัวอักษรไทยเพี้ยน (TIS-620 → UTF-8) | แจ้งเตือนได้ แต่แก้ที่ extension ไม่ได้ | แก้ที่ server: `Response.Charset = "windows-874"` |
| ActiveX จริง (Excel, FSO) | Stub เท่านั้น | Rewrite เป็น web API / server-side |
| VBScript client-side | ไม่รองรับ | Rewrite เป็น JavaScript |
| `X-UA-Compatible IE=7` | ไม่มีผล | ลบ meta tag, ทดสอบบน Chrome |

## License

Internal use — ปรับใช้ได้ตามต้องการ
