console.log("[PromptGuard] Test Site Redactor Loaded");

// ==========================================
// 1. LOCAL PII VAULT & REGEX PATTERNS
// ==========================================
let piiVault = {};
let tokenCounter = 0;
let isHunting = true;

// Define Regex Patterns
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const NAME_REGEX = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;
const PHONE_REGEX = /\b(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})\b/g;
const SSN_REGEX = /\b(?!000|666|9\d{2})\d{3}[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}\b/g;
const SCHOOL_REGEX = /\b([A-Z][a-z0-9'-]+(?:\s+[A-Z][a-z0-9'-]+)?)\s+(?:Elementary(?:\s+School)?|Middle(?:\s+School)?|High(?:\s+School)?|Academy|Institute|School|University|College|Prep(?:aratory)?(?:\s+School)?)\b/g;
const INTRO_IM_REGEX = /\b(?:i'?m|i\s+am)\s+([A-Z][a-z]+)\b/gi;
const INTRO_NAME_REGEX = /\bmy\s+names?('?s)?\s+is?\s+([A-Z][a-z]+)\b/gi;
const TEACHER_REGEX = /\b(?:M[rs]s?|Miss|Dr|Doctor|Mister|Madam|Professor)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi;

function replaceWithToken(text, regex, typeLabel) {
    return text.replace(regex, (match) => {
        // Check if we already tokenized this exact text
        const existingToken = Object.keys(piiVault).find((key) => piiVault[key] === match);
        if (existingToken) return existingToken;

        tokenCounter++;
        const token = `{{${typeLabel}_${tokenCounter}}}`;
        piiVault[token] = match;
        return token;
    });
}

function tokenizePII(rawText) {
    let cleanText = rawText;

    // 1. Structured PII
    cleanText = replaceWithToken(cleanText, EMAIL_REGEX, "EMAIL");
    cleanText = replaceWithToken(cleanText, PHONE_REGEX, "PHONE");
    cleanText = replaceWithToken(cleanText, SSN_REGEX, "SSN");

    // 2. Schools & Teachers
    cleanText = replaceWithToken(cleanText, SCHOOL_REGEX, "SCHOOL");
    cleanText = replaceWithToken(cleanText, TEACHER_REGEX, "TEACHER");

    // 3. Phrase-Based Introductions
    cleanText = replaceWithToken(cleanText, INTRO_IM_REGEX, "INTRO");
    cleanText = replaceWithToken(cleanText, INTRO_NAME_REGEX, "INTRO_NAME");

    // 4. Standalone Full Names
    cleanText = replaceWithToken(cleanText, NAME_REGEX, "NAME");

    return cleanText;
}

// ==========================================
// 2. REACT 19 STATE SYNCHRONIZER
// ==========================================
function updateReactInput(element, newText) {
    const prototype = element instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;

    const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

    if (nativeSetter) {
        nativeSetter.call(element, newText);
    } else {
        element.value = newText;
    }

    // Dispatch events so React's synthetic event tracker registers setInput()
    element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

function getActiveInputBox() {
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
        return active;
    }
    return document.querySelector("form input, form textarea");
}

// ==========================================
// 3. CAPTURE PHASE INTERCEPTION
// ==========================================
let isSimulating = false;

function handleFormSubmit(event) {
    if (isSimulating) return;

    const form = event.target.tagName === "FORM" ? event.target : event.target.closest("form");
    const inputBox = form ? form.querySelector("input, textarea") : getActiveInputBox();
    if (!inputBox) return;

    const originalText = inputBox.value || "";
    if (!originalText.trim()) return;

    const cleanText = tokenizePII(originalText);

    // If PII was found and redacted
    if (cleanText !== originalText) {
        // 1. Block the original submission before React's onSubmit sees the unredacted state
        event.preventDefault();
        event.stopImmediatePropagation();

        console.log("[PromptGuard] Original Text:", originalText);
        console.log("[PromptGuard] Redacted Text (sent over network):", cleanText);
        console.log("[PromptGuard] PII Vault:", piiVault);

        // 2. Update the input element and dispatch events for React state
        updateReactInput(inputBox, cleanText);

        // 3. Buffer 40ms to allow React 19 batching to re-render, then submit safely
        setTimeout(() => {
            isSimulating = true;

            if (form && typeof form.requestSubmit === "function") {
                form.requestSubmit();
            } else {
                const submitBtn = form?.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.click();
            }

            setTimeout(() => {
                isSimulating = false;
            }, 200);
        }, 40);
    }
}

// Intercept form submission in the capture phase (beats React's listener)
document.addEventListener("submit", handleFormSubmit, true);

// Support Enter key for textareas (if switched from input in future)
document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !isSimulating) {
        const target = event.target;
        if (target && target.tagName === "TEXTAREA") {
            event.preventDefault();
            const form = target.closest("form");
            if (form) form.requestSubmit();
        }
    }
}, true);

// ==========================================
// 4. UI RESTORER (MUTATION OBSERVER)
// ==========================================
function restoreTokensInNode(textNode) {
    let nodeText = textNode.nodeValue;
    if (!nodeText) return;
    let changed = false;

    for (const [token, originalValue] of Object.entries(piiVault)) {
        if (nodeText.includes(token)) {
            const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(escapedToken, "g");
            nodeText = nodeText.replace(regex, originalValue);
            changed = true;
        }
    }

    if (changed) {
        textNode.nodeValue = nodeText;
    }
}

function walkAndRestore(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    let textNode;
    while ((textNode = walker.nextNode())) {
        restoreTokensInNode(textNode);
    }
}

const uiObserver = new MutationObserver((mutations) => {
    if (!isHunting || Object.keys(piiVault).length === 0) return;

    mutations.forEach((mutation) => {
        // 1. Newly added chat bubbles
        if (mutation.type === "childList") {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Never modify the user's typing box or form elements
                    if (node.closest("form") || node.tagName === "INPUT" || node.tagName === "TEXTAREA") return;
                    walkAndRestore(node);
                } else if (node.nodeType === Node.TEXT_NODE) {
                    if (node.parentElement?.closest("form")) return;
                    restoreTokensInNode(node);
                }
            });
        }
        // 2. React re-render text updates (characterData)
        if (mutation.type === "characterData") {
            const node = mutation.target;
            if (node.parentElement?.closest("form")) return;
            restoreTokensInNode(node);
        }
    });
});

uiObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
});