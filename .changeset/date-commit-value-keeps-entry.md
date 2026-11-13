---
'@astryxdesign/core': patch
---

[fix] DateInput, DateTimeInput: a `value` that the app passes at an Enter or blur that keeps a rejected date no longer erases it, so the entry meets WCAG 2.2 3.3.1 (Error Identification). Before, when an app set `value` in the same update as an Enter or blur that kept unreadable, incomplete, nonexistent, or out-of-range date text, as an app does when it restores the date it had before the edit, the field dropped the text, its message, and `aria-invalid`, and reported `null` through `onEntryErrorChange`; a native date control lost its rejection message the same way. Now the text, its rejection, and its message stay at every such Enter or blur, a blur after an Enter included, so the person can correct the entry, and nothing is reported. A later new `value` replaces the text, as before. No app code changes are needed.

@nynexman4464
