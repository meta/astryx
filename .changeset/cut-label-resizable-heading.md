---
'@astryxdesign/core': patch
---

[fix] A truncating plain-text Table heading with a resize boundary and no sort control now cuts its label with an ellipsis inside its own column, instead of letting the label run under the next column's heading. On a right-to-left page a cut Latin label keeps its start, as a plain-text or sortable heading already does; a label with a right-to-left letter keeps the page's direction.

@cixzhang
