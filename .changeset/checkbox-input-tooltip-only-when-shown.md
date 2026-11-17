---
'@astryxdesign/core': patch
---

[perf] CheckboxInput runs its disabled-message tooltip only while that message can show (the checkbox is disabled and has a `disabledMessage`), so a page of many checkboxes renders faster. A disabled checkbox's reason now also describes it in the server-rendered HTML, before the page hydrates.

@cixzhang
