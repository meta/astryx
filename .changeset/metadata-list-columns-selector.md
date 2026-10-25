---
'@astryxdesign/cli': patch
---

[fix] `astryx upgrade` to 0.7 no longer rewrites an app's own class on MetadataList, such as `.astryx-metadata-list.app-compact-list`, into a `[data-columns="app-compact-list"]` selector that never matches. Only the column values MetadataList emitted (`single`, `multi`, and `columns-<n>`) become `data-columns` selectors. (#7982)

@ejhammond
