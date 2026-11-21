---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set <theme> corners <value>` now writes `--radius-chat` from the container radius, so chat surfaces (the composer, its drawer, message bubbles) follow the theme's corners instead of keeping the chat radius the base theme pins (28px on most bundled themes). A base whose chat corners are rounder than its containers keeps the ratio of the two, up to one and a half times the base's chat radius (`min(calc(var(--radius-container) * 28 / 12), 42px)` on neutral), so rounder corners never make chat corners less round and smaller corners never make them rounder; a base that pins no other chat radius gets `var(--radius-container)`, Core's own default. A corner bound (`how 'make corners never more than 8px'`) holds the chat radius too, still read from the container radius.

@josephfarina
