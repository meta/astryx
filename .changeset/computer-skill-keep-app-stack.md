---
'@astryxdesign/cli': patch
---

[fix] The computer-level agent text adds Astryx to a new project, or to an existing app only when the user asks for Astryx; an existing app that doesn't use Astryx keeps its current UI stack. Before, it told agents to add Astryx to any project without it, so an agent asked for one page in a plain React app could rewrite the app with Astryx.

@josephfarina
