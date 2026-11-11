---
'@astryxdesign/core': patch
---

[chore] Internal: Core's internal finger-scroll reader accepts a ref that names the document, so Lab's ChatVirtualizer can watch the page's own scroll when it attaches to `document.scrollingElement`. Apps import nothing new.

@cixzhang
