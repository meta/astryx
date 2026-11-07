---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` no longer depends on the order it loads the core component docs. A parent doc that lists a sub-component by name only, such as `Avatar.doc.mjs` listing `AvatarStatusDot`, erased the values the sub-component's own doc declares when it loaded after that doc; when `Avatar.doc.mjs` loaded last, `avatar-status-dot` `variant:success` counted as a custom value. The build now merges every doc's entry for a component.

@utsavo-afk
