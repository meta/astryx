---
'@astryxdesign/core': patch
---

[fix] Selector, MultiSelector and CommandPalette now announce the option a key highlights, with its position and selected state, to VoiceOver on iPhone and iPad, which does not follow the list's highlight on its own. Other screen readers keep reading the highlight as before, with no second announcement.

@cixzhang
