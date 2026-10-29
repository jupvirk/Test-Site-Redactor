# 🧪 PromptGuard Redactor — Test Site Extension

> **Development & Testing Harness for Client-Side Prompt Redaction**  
> Intercepts prompts, tokenizes sensitive PII, and validates client-side redaction against local AI arenas.

---

## 📌 Overview

**PromptGuard Redactor (Test Site)** is a Chromium extension (Manifest V3) specifically engineered for local development, testing, and security auditing. It operates in tandem with local sandboxes like [PromptGuard Test Site (Simple AI Arena)](../PromptGuard-Test-Site) on `localhost` and `127.0.0.1`.

This extension adapts the core prompt interception architecture from [GPT-Redactor](../GPT-Redactor) to test React 19 form behaviors, measure tokenization accuracy, and inspect over-the-network payloads directly inside browser developer tools.

```
+-----------------------------------------------------------------------------------------+
|                                    LOCAL TEST BED                                       |
|                                                                                         |
|   [ User Input on Localhost ] ──► "My SSN is 123-45-6789 and email is test@domain.com"  |
|                 │                                                                       |
|                 ▼ (Capture Phase: form 'submit' listener)                               |
|   [ PromptGuard Interceptor ]                                                           |
|       ├── Extracts PII to in-memory vault                                               |
|       ├── Sets value via React 19 Prototype Setter                                      |
|       ├── Buffers 40ms for React re-render batching                                     |
|       └── Triggers safe programmatic form.requestSubmit()                               |
|                 │                                                                       |
|                 ▼ (Network Payload Sent to Next.js API)                                 |
|       Payload: "My SSN is {{SSN_1}} and email is {{EMAIL_1}}"                           |
|                 │                                                                       |
|                 ▼                                                                       |
|   [ Response Text Node Added to DOM ]                                                   |
|                 │                                                                       |
|                 ▼ (MutationObserver: childList + characterData)                         |
|   [ Token Restorer ] ──► Tokens restored to original values on-screen                   |
+-----------------------------------------------------------------------------------------+
```

---

## ✨ Features

- **🏠 Localhost-Only Scope**  
  Restricted exclusively to `http://localhost:*/*` and `http://127.0.0.1:*/*` through Manifest V3 host permissions, ensuring zero interference with production browsing.
- **⚛️ React 19 State Synchronizer**  
  Targeted specifically at React 19 synthetic input tracking. Bypasses virtual DOM overrides by accessing native `HTMLInputElement` and `HTMLTextAreaElement` prototype property setters before dispatching bubbling `input` and `change` events.
- **⏱️ 40ms Batching Buffer**  
  Accommodates modern React 19 concurrent and batched state updates before invoking `form.requestSubmit()`, preventing race conditions where unredacted text might otherwise submit.
- **🗂️ Full PII Detection Suite**  
  - **Emails**: Identifies and tokenizes all standard email addresses (`{{EMAIL_n}}`).
  - **Phone Numbers**: Matches US/International telephone numbers (`{{PHONE_n}}`).
  - **Social Security Numbers (SSN)**: Complies with 3-2-4 hyphenated/spaced formats (`{{SSN_n}}`).
  - **Educational Institutions**: Schools, High Schools, Colleges, Universities, and Academies (`{{SCHOOL_n}}`).
  - **Instructors & Titles**: Dr., Professor, Mr., Mrs., Ms. (`{{TEACHER_n}}`).
  - **Identity Phrases**: *"I'm [Name]"* and *"My name is [Name]"* contextual recognition (`{{INTRO_n}}`).
  - **Standalone Names**: Capitalized multi-word proper nouns (`{{NAME_n}}`).
- **🔄 Dual-Trigger UI Restorer**  
  Watches both `childList` (new chat message bubbles added to DOM) and `characterData` (live text streaming mutations) to seamlessly decode tokens without ever altering form input fields.

---

## 🛠️ Project Structure

```
Test-Site-Redactor/
├── manifest.json      # Manifest V3 (scoped to localhost & 127.0.0.1)
├── content.js         # React 19 interceptor, PII tokenizer & MutationObserver
└── README.md          # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites

You need a locally running test site, such as the [PromptGuard-Test-Site](../PromptGuard-Test-Site/simple-ai-arena):
```bash
cd ../PromptGuard-Test-Site/simple-ai-arena
npm install
npm run dev
# Running on http://localhost:3000
```

### Loading the Extension

1. In Chrome, navigate to `chrome://extensions/`.
2. Toggle **Developer mode** in the upper-right corner.
3. Click **Load unpacked**.
4. Select the `Test-Site-Redactor` directory.

### Verifying Redaction in the DevTools

1. Open `http://localhost:3000` in Chrome.
2. Open DevTools (`F12`) and switch to the **Console** tab. You should see:
   ```
   [PromptGuard] Test Site Redactor Loaded
   ```
3. Type a message with sample PII into the arena prompt box:
   > *"Hi, my name is John Smith. Contact Dr. Robinson at Green Valley High School regarding my SSN 123-45-6789."*
4. Submit the prompt.
5. In the **Console**, review the logged outputs:
   - `[PromptGuard] Original Text`: Contains the raw user prompt.
   - `[PromptGuard] Redacted Text (sent over network)`: Contains the tokenized version.
   - `[PromptGuard] PII Vault`: Displays the in-memory key-value dictionary.
6. Open the **Network** tab in DevTools, inspect the POST request to `/api/chat`, and verify that **only the tokenized prompt was sent to the server**.

---

## 🔬 Technical Implementation Details

### React 19 State Synchronization

React overrides the standard `.value` setter on input elements to track state changes. In React 19, assigning directly to `.value` fails to trigger `onChange` / `setInput`. 

`Test-Site-Redactor` calls the native browser setter directly:

```javascript
const prototype = element instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;

const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

if (nativeSetter) {
    nativeSetter.call(element, newText);
} else {
    element.value = newText;
}

element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
```

### MutationObserver Selective Filtering

The UI restorer protects against recursive loops and accidental form modification by verifying element tags and ancestry:

```javascript
if (node.closest("form") || node.tagName === "INPUT" || node.tagName === "TEXTAREA") return;
```

---

## 🔒 Security Guarantee

- Operates strictly on local hostnames (`localhost`, `127.0.0.1`).
- Contains no external network dependencies or remote scripts.
- Vault state is stored in memory and immediately discarded on browser tab closure or refresh.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
