const MOJIBAKE_PATTERN = new RegExp([
  "\\u00E2",
  "\\u00C3",
  "\\uFFFD",
  "\\u00F0\\u0178",
  "\\u0153",
  "\\u20AC\\u02DC",
  "\\u20AC\\u0153",
  "\\u20AC\\?",
].join("|"));

export function warnIfMojibake(text, context = "frontend text") {
  if (!import.meta.env.DEV || typeof text !== "string") return;
  if (MOJIBAKE_PATTERN.test(text)) {
    console.warn(`[mojibake] Broken encoding detected in ${context}. Run the repo mojibake grep before finalizing frontend changes.`);
  }
}

// Before finalizing any frontend update, run the repo mojibake grep from the task notes.
// Keep UI labels as plain text or JSX icons; do not paste raw emoji into string labels.
