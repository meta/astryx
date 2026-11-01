---
'@astryxdesign/cli': patch
---

[fix] `astryx component` matches component and hook names case for case, and only in the file that exports the name. A lowercased name such as `list` or `badge` is now unknown, with the component it matches by case suggested, instead of opening List's or Badge's doc. A module that only shares a name's spelling, such as a lowercase `button.ts` table elsewhere in Core, no longer opens the nearest doc either, and `--source` no longer reads it.

@vjeux
