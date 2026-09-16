# Principal Software Engineer Journey — Kindle EPUB Exporter

This directory contains the automated toolchain to compile curriculum Markdown files into Amazon Kindle-compatible **EPUB 3** eBooks.

---

## Quick Start

### 1. Export Module 02 (Authentication)
Using PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\export-kindle.ps1 -Module "02-Authentication"
```
Or directly with Node.js:
```bash
node scripts/export-kindle.js -m 02
```

### 2. Export All Modules
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\export-kindle.ps1 -All
```
Or with Node.js:
```bash
node scripts/export-kindle.js --all
```

### 3. Export the 6 Grouped Study Volumes
```bash
node scripts/export-kindle.js --volumes
```

### 4. Export the Complete Single Omnibus Edition
```bash
node scripts/export-kindle.js --omnibus
```

### 5. List Available Modules
```bash
node scripts/export-kindle.js --list
```

---

## Generated Output

All generated `.epub` files are saved to:
```
dist/kindle/
  ├── PrincipalJourney-02-Authentication.epub
  ├── PrincipalJourney-Volume-1-WebAPI.epub
  ├── PrincipalJourney-Volume-2-Authentication.epub
  ├── PrincipalJourney-Complete-Omnibus.epub
  └── ...
```

---

## How to Read on Your Kindle

### Method 1: Send to Kindle Web (Recommended & Easiest)
1. Open your browser and go to: **[amazon.com/sendtokindle](https://www.amazon.com/sendtokindle)**.
2. Sign in with your Amazon account.
3. Drag and drop any `.epub` from `dist/kindle/`.
4. Click **Send**.
5. Within 1–2 minutes, the book will automatically download to your Kindle device over Wi-Fi, with Whispersync enabled (progress, notes, and highlights synced across devices).

### Method 2: Send to Kindle via Email
1. Locate your Kindle email address in your Amazon account (**Manage Your Content and Devices** -> **Preferences** -> **Personal Document Settings**).
2. Ensure your personal email is in the **Approved Personal Document E-mail List**.
3. Attach the `.epub` file to an email and send it to your `@kindle.com` address.

### Method 3: Kindle Mobile App (iOS / Android)
1. Transfer or download the `.epub` file to your phone.
2. Open the file and select **Share** -> **Kindle**.
3. The book will sync to your entire Kindle library.

### Method 4: Offline USB Sideloading
1. Connect your Kindle to your computer using a USB cable.
2. If sideloading directly, convert the `.epub` to `.azw3` or `.kfx` using [Calibre](https://calibre-ebook.com/) for optimal typography.
3. Copy the file into the `documents/` folder on your Kindle drive.

---

## E-Ink Typography & Styling

The export engine applies `scripts/kindle-style.css` which is tailored specifically for E-ink screens:
* **Bookerly & Ember Mono**: Uses Kindle's native serif font with clean fallback typography.
* **Wrapped Code Blocks**: Code blocks are wrapped with left-accent borders so long C# and SQL lines never get truncated off the edge of narrow screens.
* **ASCII Box-Drawing**: Box diagrams (`┌───┐`, `↓`) use tight-line monospaced blocks to preserve visual alignment.
* **Mermaid Diagrams**: Formatted as high-contrast architecture diagram cards.
* **Responsive Tables**: Formatted with clear borders and alternating row shading.
* **Page Breaks**: Every chapter starts cleanly on a fresh page.
