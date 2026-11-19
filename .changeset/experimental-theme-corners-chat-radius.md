---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set <theme> corners <value>` now gives `--radius-chat` back to the container radius (`var(--radius-container)`, Core's own default), so chat surfaces (the composer, its drawer, message bubbles) follow the theme's corners instead of keeping the chat radius the base theme pins (28px on most bundled themes).

@josephfarina
