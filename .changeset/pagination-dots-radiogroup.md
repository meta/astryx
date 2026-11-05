---
'@astryxdesign/core': patch
---

[fix] Pagination: the dots variant now exposes the APG radio group it already behaves as. Before, the dots were a `group` of `button`s named "Go to page N", with `aria-current="page"` on the current page. Now the container is a `radiogroup` named by the page-indicators label, and each dot is a `radio` named "Page N" with `aria-checked` on the current page and no `aria-current`. Keyboard behavior is unchanged.

@cixzhang
