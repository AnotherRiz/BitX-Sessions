# BitX Session

**Bitx Session** is a 100% free browser extension that makes managing multiple logins effortless. Save your sessions once, then switch between accounts instantly—no logging out, no retyping, no hassle.
Built for developers, QA testers, and power users, Bitx Session helps you jump between environments and identities in seconds, so you can stay focused and move faster.

<img width="349" height="400" alt="BitX Session - Saved Sessions List" src="https://github.com/user-attachments/assets/da565167-cade-48e1-9df7-c6f24927a1c5" />
<img width="350" height="401" alt="BitX Session - Saved Sessions Grid" src="https://github.com/user-attachments/assets/93dd6827-4f63-4280-b68d-1f55d396d635" />

---
---

## 🚀 Features

- **Save Login Sessions**  
  Capture and store cookies for the current session.

- **Switch Between Sessions Instantly**  
  Load saved sessions with one click — no more logging in/out manually.

- **Persistent Storage**  
  All session data is stored locally and securely in your browser.

- **Multi-Site Support**  
  Manage sessions for different websites independently.

- **Export and Import**  
  Seamlessly export and import your saved sessions between devices in seconds. Fast, smooth, and hassle-free.

---

## 🐞 Bug Report / Feature Request

Kindly create an issue [here]([(https://github.com/AnotherRiz/BitX-Sessions/issues)).
<br>Write a descriptive problem, step-to-reproduce, web browser that you use, and the website url.

---

## 📦 Manual Installation

### Chrome / Edge

1. Download and extract from the [release tab](https://github.com/AnotherRiz/BitX-Sessions/releases).
2. Open `chrome://extensions/` in your browser.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the downloaded folder.

### Firefox

1. Open `about:debugging`.
2. Click **This Firefox** > **Load Temporary Add-on**.
3. Select the `manifest.json` file from the `dist` folder.

---

## 🛠️ Build Instructions

```bash
# Install dependencies (requires Bun)
bun install

# Dev the project
bun run dev:<firefox or chrome>

# Build the project
bun run build:<firefox or chrome>
```

## Testing

This project uses Jest for testing. To run tests, use the following command:

```bash
bun run test
```

---

## 🙌 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

---

## 📜 License

MIT License
