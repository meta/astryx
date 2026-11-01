---
'@astryxdesign/core': patch
---

[feat] `reset.css`: a date or time field (`date`, `time`, `datetime-local`, `month`, `week`) now matches a text field with the same styles at the reset's line-height of 1.5 and above. In iOS Safari an empty field keeps its height instead of collapsing to its padding, and the value follows the field's `text-align` instead of always centring. In Chromium the field loses the 2px its row of editable fields added; at a tighter line-height such as `normal`, Chromium's own icons can still keep a `time` field up to 4px taller and the other types 1px taller. To keep the old look, add after the reset `::-webkit-date-and-time-value { min-height: auto; text-align: center; }` (iOS Safari's empty-field height and centring) and `::-webkit-datetime-edit-fields-wrapper { padding-block: 1px; }` (Chromium's height).

@vjeux
