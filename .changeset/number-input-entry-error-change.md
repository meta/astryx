---
'@astryxdesign/core': patch
---

[feat] NumberInput: `onEntryErrorChange` reports why the field rejects typed text, so an app can word its own message. It receives a `NumberInputEntryError` with a `kind` that does not depend on the locale (`unreadable`, `fractional` for a fraction when `isIntegerOnly`, or `outOfRange` for any number while `min` is above `max`), the typed `text`, and, for `fractional` and `outOfRange`, the number as `value`. It runs each time the rejection changes: at Enter or blur, when an edit makes the text valid or empty, when a new `value`, `min`, `max`, or `isIntegerOnly` changes or ends it, and when disabling the field drops the text. It reports `null` when the rejection ends, or when the field unmounts while one stands, and never twice for the same rejection. Pass an `error` `status` with a message to word the rejection; that message is the one announced.

@nynexman4464
