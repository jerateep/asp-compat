# CMS_Search.asp - Data Return Issue Diagnostic

## 🔍 Problem Analysis

When clicking search results in CMS_Search.asp (popup window), data doesn't return to the main form.

### Code Flow:
```
Main Page (e.g., CMSmanCreateTemplate.asp)
  ↓
Click Search Button → Opens CMS_Search.asp popup
  ↓
  - Popup receives: v_index=5, value_object=txt_customer
  ↓
User Clicks Result
  ↓
  Executes: window.opener.document.all[5].value="xyz"; window.close();
  ↓
❌ Data NOT returned to main page
```

---

## 🐛 Root Causes

### Cause #1: Invalid v_index Parameter
**Issue:** `v_index` might be empty/NaN/undefined

**Generated Code:**
```javascript
// ❌ Bad
window.opener.document.all[""].value="xyz"
window.opener.document.all[NaN].value="xyz"
window.opener.document.all[undefined].value="xyz"

// ✓ Good
window.opener.document.all[5].value="xyz"
```

**How to Check:**
1. Open DevTools in CMS_Search.asp popup
2. Run: `new URLSearchParams(window.location.search).get('v_index')`
3. Should show number (e.g., "5"), NOT empty string

### Cause #2: Element at Index Doesn't Match
**Issue:** `document.all[5]` might not be the field you expect

**Example:**
```javascript
// Parent page HTML structure:
// <input name="txt_customer" />  ← This is position 3
// <input name="txt_date" />      ← This is position 5 ❌ Wrong field!

// But popup expects position 5 to be txt_customer ✗
```

**How to Check:**
1. On Main Page - Open DevTools Console
2. Run: `document.all[5].name` or `document.all[5].id`
3. Verify it's the correct field name

### Cause #3: Cross-Window Access Blocked
**Issue:** Browser might block `window.opener.document` access (different domain/origin)

**Solution:** Both windows must be same origin (same domain)

---

## ✅ Fixes

### Fix #1: Add Error Handling to onclick

**File:** CMS_Search.asp  
**Line:** 50

**Current Code:**
```html
str_href = str_href & "window.opener.document.all["&request("v_index")&"].value="""
```

**Better Code with Error Handling:**
```javascript
str_href = str_href & "try{var el=window.opener.document.all["&request("v_index")&"];if(el){el.value="""
str_href = str_href & replace(trim(rs1(0) & " "), vbCrLf, "\n")&" : "&replace(rs1(1),"'","\'") 
str_href = str_href & """;}}catch(e){console.error('Search: element not found at index "&request("v_index")&"',e);}window.close();"
```

### Fix #2: Better Parameter Validation (Server-side)

**File:** CMS_Search.asp  
**Line:** 23-24

```asp
value_object_value = request("value_object")
v_index = request("v_index")

' Add validation
if v_index="" or not isnumeric(v_index) then
    response.write "<script>alert('Error: Invalid search parameters. Please go back and try again.'); window.close();</script>"
    response.end
end if
```

### Fix #3: Use Named Elements Instead of Index

**Better approach - use element name directly:**

```javascript
// Instead of: window.opener.document.all[5].value="xyz"
// Use: window.opener.document.getElementsByName("txt_customer")[0].value="xyz"

str_href = str_href & "var el=window.opener.document.getElementsByName('"&value_object_value&"')[0];"
str_href = str_href & "if(el){el.value="""& replace(trim(rs1(0) & " "), vbCrLf, "\n")&" : "&replace(rs1(1),"'","\'") &""";};"
```

---

## 🧪 Test Steps

### Test 1: Check v_index Parameter
1. Open main page (CMSmanCreateTemplate.asp)
2. Click any search button
3. CMS_Search.asp opens - check URL bar
4. URL should contain: `&v_index=5` (or some number)
5. Open DevTools Console: `console.log(new URLSearchParams(window.location.search).get('v_index'))`
6. Should print "5" or similar number

### Test 2: Check Parent Window element
1. On Main Page - keep DevTools open
2. Open search popup
3. In Main Page DevTools, run:
   ```javascript
   // Find what's at index 5
   console.log('Element at index 5:', document.all[5]);
   console.log('Name:', document.all[5]?.name);
   console.log('ID:', document.all[5]?.id);
   console.log('Value:', document.all[5]?.value);
   ```
4. Should show the target input field

### Test 3: Manual Test Click
1. In popup, right-click search result
2. Select "Inspect Element"
3. Find the `<a>` tag's onclick attribute
4. Copy the onclick code to DevTools console on MAIN PAGE
5. Execute it manually
6. See if it sets the value correctly

**Example:**
```javascript
// Copy this from popup onclick
window.opener.document.all[5].value="TEST_COMPANY : ABC123";
window.close();
```

---

## 🔧 Extension Debug Mode

### Enable Verbose Logging
1. Extension icon → Options
2. Turn ON "Verbose Logging"
3. DevTools Console → Check for "[ASP-Compat]" messages
4. Should show:
   ```
   [ASP-Compat] Activating on /CMS_Search.asp
   [ASP-Compat] Polyfill injected on /CMS_Search.asp
   [ASP-Compat-Polyfill] document.all polyfilled
   ```

---

## 📊 Expected Behavior

### ✅ Working Scenario:
1. Main page loads → extension activates
2. Search popup opens → extension activates in popup
3. Click result → onclick executes:
   - `window.opener.document.all[5]` = input field on main page ✓
   - Sets value with search result ✓
   - Popup closes ✓
   - Main page shows new value ✓

### ❌ Broken Scenarios:
```
Scenario 1: Bad v_index
  v_index = "" (empty)
  → document.all[""] fails ✗
  
Scenario 2: Wrong element index
  v_index = 5
  But document.all[5] = <div> not <input> ✗
  
Scenario 3: Cross-origin
  Main page: http://server1.com
  Popup: http://server2.com
  → window.opener.document blocked by browser ✗
```

---

## 🎯 Quick Fix (Recommended)

Add this to CMS_Search.asp line 50:

**Old:**
```vb
str_href = str_href & "window.opener.document.all["&request("v_index")&"].value="""
```

**New (with error handling):**
```vb
str_href = str_href & "try{window.opener.document.all["&request("v_index")&"].value="""
```

And add at end of onclick:
```vb
str_href = str_href & """; alert('Data sent!'); }catch(e){console.error('Error:',e); alert('Cannot update parent: '+e.message);}"
```

---

## 🔗 Related Pages

These also use same pattern - same issue applies:
- `CMS_SearchCust.asp`
- `CMS_SearchCust2.asp`
- `CMS_SearchTotal.asp`
- `CMS_SearchTotalBK.asp`
- `CMS_SearchView.asp`
- `CMS_SearchView2.asp`

---

## ✅ Verification Checklist

- [ ] Verbose Logging enabled in extension
- [ ] v_index parameter has valid number
- [ ] Element at that index is correct field
- [ ] Same origin between main page and popup
- [ ] onclick error handling added
- [ ] Test click on search result
- [ ] Check main page receives data
- [ ] Popup closes automatically

