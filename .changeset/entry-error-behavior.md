---
'@astryxdesign/core': patch
---

[feat] DateInput, DateTimeInput, and TimeInput take `entryErrorBehavior`, and FormLayout takes `defaultEntryErrorBehavior`. The prop sets when a field shows its own entry error, such as a date the calendar does not have or a time outside `min` and `max`. It does not set when validation runs, and it is not React Aria's `validationBehavior`. `'complete'`, the default, keeps each field's current timing. `'blur-or-enter'` holds the message, `aria-invalid`, the invalid styling, the announcement, and the `onEntryErrorChange` report until the person presses Enter or leaves the field; an edit that makes the entry valid or empty still clears the error at once. A field's own prop wins over the form default, a nested FormLayout replaces it, and a Dialog opened from the form starts without it. PowerSearch value editors and Table filter editors keep `'complete'`. The new `EntryErrorBehavior` type names the two values.

@nynexman4464
