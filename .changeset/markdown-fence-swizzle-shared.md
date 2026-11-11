---
'@astryxdesign/core': patch
---

[fix] A fence plugin made with the package's `createMarkdownFenceTransform` now renders its node in a swizzled Markdown, and the reverse. Before, the copy described the plugin to its transform under its own keys, so the package's fence transform refused to run and the fence fell back to a plain code block. No new props, exports or defaults.

@cixzhang
