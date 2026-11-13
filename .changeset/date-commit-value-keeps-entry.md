---
'@astryxdesign/core': patch
---

[fix] DateInput, DateTimeInput: a `value` that the app passes at the Enter or blur that keeps a rejected date no longer erases it. Before, when an app set `value` in the same update as the Enter or blur that kept unreadable, incomplete, nonexistent, or out-of-range date text, as an app does when it restores the date it had before the edit, the field dropped the text, its message, and `aria-invalid`, and reported `null` through `onEntryErrorChange`; a native date control lost its rejection message the same way. Now the text, its rejection, and its message stay, so the person can correct the entry, and nothing is reported. A later new `value` replaces the text, as before. No app code changes are needed.

@nynexman4464
