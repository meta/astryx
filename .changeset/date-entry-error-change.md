---
'@astryxdesign/core': patch
---

[feat] DateInput, DateTimeInput: `onEntryErrorChange` reports why the field rejects typed text, so an app can word its own message. It receives a `DateEntryError` with a `kind` that does not depend on the locale (`unreadable`, `incomplete`, `nonexistent`, `outOfRange` for a date before `min` or after `max`, or `unavailable` for a day that `dateConstraints` rules out), the typed `text`, and, for `outOfRange` and `unavailable`, the Gregorian ISO `date`. It runs each time the rejection changes, including when a new `min`, `max`, `dateConstraints`, or `value`, a calendar pick, disabling the field, or Enter or blur changes it, and with `null` when the rejection ends. With the callback, an `error` `status` that has a message is the message the field shows and announces, and the field's own message applies only without one; a `warning` or `success` status never replaces a rejection. Without the callback, nothing changes. The native and touch pickers take no typed text, so the callback never runs there. Fixes #10366.

@nynexman4464
