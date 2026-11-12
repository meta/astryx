---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[docs] Markdown's anatomy now says when its Image part shows alternative text: for an empty image URL, while an unsafe URL renders as source text. Its guidance adds two don'ts: plugins cannot cross a Server Component boundary, and Markdown does not sanitize renderer output. Prop docs now describe `density`, `isStreaming`, `onLinkClick`, and `components`; `inlinePlugins` keeps its own description instead of lending it to `plugins`; `contentWidth` names its 680 default; and `contentAlign="start"` aligns prose to the inline start rather than the left.

@cixzhang
