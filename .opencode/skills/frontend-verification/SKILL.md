---
name: frontend-verification
description: Guide for verifying frontend changes using chrome-devtools MCP. Use this when you need to verify UI changes, check for console errors, or test frontend functionality after making changes to Vue components, pages, or styles.
license: MIT
---

# Frontend Verification

Always verify frontend changes using the **chrome-devtools** MCP.

## Important Rules

- **Never kill Chrome**: Do NOT kill Chrome before or after using the MCP server
- **Leave dev server running**: Do NOT stop the dev server when you're done working

## Dev Server Management

### Check if Server is Running

Always check if the dev server is already running before asking the user to start it:

```bash
curl -s http://localhost:3003/api/readyz
```

**Expected response when running:**

```json
{ "status": "ready" }
```

### Starting the Server

- If the server is NOT running, ask the user to start it with `pnpm dev`
- If the server IS running, proceed directly to verification

## Verification Steps

### 1. Navigate to the Application

```
chrome-devtools_navigate_page to http://localhost:3003
```

### 2. Visual Verification

Use one of these tools to verify the UI:

- `chrome-devtools_take_screenshot` - For visual inspection
- `chrome-devtools_take_snapshot` - For text-based accessibility tree view

### 3. Check for Errors

```
chrome-devtools_list_console_messages
```

Look for:

- JavaScript errors
- Vue warnings
- Network failures
- Type errors

### 4. Interactive Testing (if needed)

- `chrome-devtools_click` - Click elements
- `chrome-devtools_fill` - Fill form inputs
- `chrome-devtools_hover` - Test hover states
- `chrome-devtools_wait_for` - Wait for specific text to appear

## Common Verification Scenarios

### After Component Changes

1. Navigate to the page containing the component
2. Take a screenshot to verify visual appearance
3. Check console for Vue warnings or errors
4. Test any interactive features

### After Style Changes

1. Navigate to the affected page
2. Take a screenshot to verify the styling
3. Check for CSS errors in console
4. Test responsive behavior if needed (use `chrome-devtools_resize_page`)

### After Route/Page Changes

1. Navigate to the new or modified route
2. Verify the page loads correctly
3. Check console for routing errors
4. Test navigation to/from the page

## Example Workflow

```bash
# 1. Check if dev server is running
curl -s http://localhost:3003/api/readyz

# 2. If running, navigate to the app
chrome-devtools_navigate_page to http://localhost:3003

# 3. Take a screenshot
chrome-devtools_take_screenshot

# 4. Check for errors
chrome-devtools_list_console_messages

# 5. Test specific functionality (if needed)
chrome-devtools_click on element
chrome-devtools_wait_for specific text
```
