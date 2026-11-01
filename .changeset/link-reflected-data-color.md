---
'@astryxdesign/core': patch
---

[fix] A caller's `data-color` no longer replaces the one `Link` reflects for theme targeting (`architecture:public-component-api` INV5, `Link` FR11). Before, caller props were spread after the theme attributes, so passing `data-color` changed what theme rules saw on the root even though the real `color` prop was unchanged. This holds for the anchor, button and disabled forms. Other caller `data-*` attributes still reach the root.

@parinith-web
