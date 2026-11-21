---
'@astryxdesign/core': patch
---

[fix] ChatComposerDrawer rounds its top corners and its tuck under the composer with the composer corner, so a theme that sets `chat-composer` borderRadius moves the drawer with the composer. Outside a ChatComposer the drawer still uses `--radius-chat`. Shipped themes look the same.
@kentonquatman
