# Testing Checklist

## Test pages

สร้างหน้าทดสอบ `test.asp` ที่มี legacy pattern ดังนี้:

### 1. document.all
```html
<script>
  var el = document.all["myButton"];
  if (el) el.style.color = "red";
</script>
<input type="button" id="myButton" value="Test">
```
**คาดหวัง**: ปุ่มเปลี่ยนเป็นสีแดง ✓

### 2. window.event
```html
<input type="button" value="Click" onclick="handleClick()">
<script>
  function handleClick() {
    var e = window.event;
    alert("Source: " + (e.srcElement || e.target).value);
  }
</script>
```
**คาดหวัง**: alert แสดง "Source: Click" ✓

### 3. attachEvent
```html
<input type="button" id="btn" value="Attach">
<script>
  var btn = document.getElementById("btn");
  btn.attachEvent("onclick", function() { alert("Worked!"); });
</script>
```
**คาดหวัง**: alert "Worked!" เมื่อคลิก ✓

### 4. ActiveX XMLHTTP
```html
<script>
  var xhr = new ActiveXObject("Microsoft.XMLHTTP");
  xhr.open("GET", "data.asp", true);
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) alert(xhr.responseText);
  };
  xhr.send();
</script>
```
**คาดหวัง**: AJAX request ทำงาน ✓

### 5. event.returnValue
```html
<form onsubmit="return validate()">
  <input name="email">
  <input type="submit">
</form>
<script>
  function validate() {
    if (!document.forms[0].email.value) {
      window.event.returnValue = false;
      return false;
    }
  }
</script>
```
**คาดหวัง**: form ไม่ submit ถ้า email ว่าง ✓

### 6. VBScript Detection
```html
<script language="vbscript">
  MsgBox "Hello"
</script>
```
**คาดหวัง**: Toast แจ้งว่า "VBScript ไม่รองรับ" ✓ (จะไม่รัน MsgBox)

### 7. Thai Encoding (TIS-620)
หน้า ASP ที่ server ส่ง `Response.Charset = "windows-874"` แต่ไม่มี `<meta charset>`
**คาดหวัง**: ถ้าเพี้ยน → Toast แจ้งเตือน

### 8. Form accept-charset
```html
<form action="submit.asp" method="post">
  <input name="title">
  <input type="submit">
</form>
```
**คาดหวัง**: form มี `accept-charset` ถูกเพิ่ม, action/method/field name ไม่เปลี่ยน ✓

## Regression Test

ทดสอบว่า extension **ไม่กระทบ** สิ่งเหล่านี้:

- [ ] Form field name ทุกตัวเหมือนเดิม
- [ ] Form action URL ไม่เปลี่ยน
- [ ] Form method (GET/POST) ไม่เปลี่ยน
- [ ] Hidden input ไม่ถูกลบ
- [ ] Cookie/Session ทำงานปกติ
- [ ] AJAX request ส่ง parameter ครบ
- [ ] Print preview ของใบเสร็จยังพิมพ์ได้ถูกต้อง

## ทดสอบบนเว็บไซต์จริง

1. ติดตั้ง extension แบบ unpacked
2. เปิดเว็บ ASP จริง
3. เปิด DevTools Console
4. ตรวจ log `[ASP-Compat]` ว่าพบ error หรือไม่
5. กดทุกปุ่ม, submit ทุก form
6. เทียบกับการทำงานบน IE (ถ้ายังมี VM)
