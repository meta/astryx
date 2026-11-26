---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set <theme> corners <value>` no longer makes chat corners less round. Since 0.7.17 the dial wrote `--radius-chat: var(--radius-container)`, so on a base whose chat corners are rounder than its containers (28px over 12px on most bundled themes) steps such as `more` dropped the composer, its drawer and message bubbles to the container radius. The dial now keeps the base's ratio of the two, up to one and a half times the base's chat radius (`min(calc(var(--radius-container) * 28 / 12), 42px)` on neutral), so rounder corners never make chat corners less round and smaller corners never make them rounder; a base that pins no other chat radius still gets `var(--radius-container)`. A corner bound (`how 'make corners never more than 8px'`) holds the chat radius too, still read from the container radius.

@josephfarina
