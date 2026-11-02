---
'@astryxdesign/core': patch
---

[fix] More slots treat `''`, `false` and `true` as empty, the way React renders them, instead of drawing an empty wrapper: ChatSystemMessage's `icon`, Item's `startContent`, `endContent` and `description` (so a ListItem or menu row gains no blank lane), and MetadataList's `title` and MetadataListItem's `icon`. `0` still counts as content and shows "0".

@czarandy
