---
'@astryxdesign/core': patch
---

[fix] Under a finger, the time wheels in the TimeInput and DateTimeInput bottom sheets now follow iOS's date picker: (#8179)

- The AM/PM column follows the hour. Turning the hour from 11 to 12 now gives 12 PM, not 12 AM, and the AM/PM column turns onto PM. From 12 PM to 1 it stays PM.
- A bound that falls between whole minutes, such as `min="09:00:30"` without a seconds column, now commits the nearest whole minute inside it, with a finger as with a mouse.

With a mouse, each column still turns on its own.

@vjeux
