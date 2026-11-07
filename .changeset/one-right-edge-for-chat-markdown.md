---
'@astryxdesign/core': patch
---

[fix] Markdown prose and full-width code blocks share one right edge in chat surfaces. ChatLayout's message area now publishes `--markdown-content-width` (100% of the message column), and Markdown's `contentWidth` default resolves through that variable with its 680px fallback, so paragraphs stop at the same edge as the code blocks and tables below them instead of the default 680px inside a wider chat column. Explicit `contentWidth` values keep working unchanged, and Markdown outside a publishing surface is untouched (it deliberately does not read Layout's always-published `--layout-content-width`, which would uncap prose line length there). (#5598)

@ManoharPaturi
