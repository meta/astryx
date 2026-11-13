---
'@astryxdesign/core': patch
---

[feat] TimeInput: `onEntryErrorChange` reports why the field rejects typed text, so an app can word its own message. It receives a `TimeInputEntryError` with a `kind` that does not depend on the locale (`unreadable`, or `outOfRange` for a time before `min` or after `max`), the typed `text`, and, for `outOfRange`, the ISO time `value`. It runs each time the shown rejection changes, including when a new `min`, `max`, or `value`, or disabling the field, changes it, never twice for the same rejection, and with `null` when the rejection ends or the field unmounts while it stands. The native and bottom-sheet surfaces take no typed text, so they never report.

@nynexman4464
