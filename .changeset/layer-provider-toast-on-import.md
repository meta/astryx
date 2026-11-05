---
'@astryxdesign/core': patch
---

[perf] LayerProvider no longer carries the toast viewport. An app that imports `LayerProvider` from `@astryxdesign/core/Layer` and never imports Toast loads about 45 KB (46,161 bytes) less JavaScript (gzip). Toast registers its viewport when it is imported, and LayerProvider then renders it after the app. Without a Toast import, LayerProvider renders no empty viewport. A toast shown before the viewport mounts waits, then shows. On the server, LayerProvider renders no viewport; it mounts after hydration.

@vjeux
