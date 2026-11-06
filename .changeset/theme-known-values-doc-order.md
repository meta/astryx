---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` recognizes a sub-component's built-in values regardless of the order its file system lists the component docs. A parent doc that lists a sub-component by name only, such as `Avatar.doc.mjs` listing `AvatarStatusDot`, could load after the sub-component's own doc and erase the values it declares. On such a file system, styling `avatar-status-dot` `variant:success` wrote a `.variants.d.ts` that enrolled the built-in value as custom, and the same key inside an adaptation rule failed the build with "Adaptation rule enrolls the custom value". The build now merges every doc's entry for a component.

@utsavo-afk
