---
'@astryxdesign/core': patch
---

[feat] `reset.css`: in Chromium, a date or time field (`date`, `time`, `datetime-local`, `month`, `week`) now matches the height of a text field with the same styles at the reset's line-height of 1.5 and above: it loses the 2px its row of editable fields added. In iOS Safari the value follows the field's `text-align` instead of always centring. At a tighter line-height such as `normal`, Chromium's own icons can still keep a `time` field up to 4px taller and the other types 1px taller. To keep the old look, add after the reset `::-webkit-date-and-time-value { min-height: auto; text-align: center; }` (iOS Safari) and `::-webkit-datetime-edit-fields-wrapper { padding-block: 1px; }` (Chromium).

@vjeux
