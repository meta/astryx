---
'@astryxdesign/core': patch
---

[fix] Markdown's GFM autolink option (`autolink: 'gfm'`) no longer slows to seconds on long text. The bare-email scan started over at every character of a long run, so its time grew with the square of the run: a 100,000-character word took over 10 seconds. It now starts from each `@`, and trailing `)` are peeled off a link in one pass, so a long run costs about as much as a plain parse. Linked emails and URLs are unchanged.

@cixzhang
