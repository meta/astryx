---
'@astryxdesign/cli': patch
---

[feature] When `astryx docs <namespace>/<name>` finds nothing and exactly one page further down that namespace has that name or title, the error suggests that page: a miss on `authoring/define-the-theme` suggests `authoring/building-blocks/themes/define-the-theme` first. When the route names the namespace's first child by route, that child stays first and the page comes right after it; the other children follow.

@josephfarina
