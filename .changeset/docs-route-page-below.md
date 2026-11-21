---
'@astryxdesign/cli': patch
---

[feature] When `astryx docs <namespace>/<name>` finds nothing and exactly one page further down that namespace has that name or title, the error suggests that page: a miss on `authoring/define-the-theme` suggests `authoring/building-blocks/themes/define-the-theme` first. A child the route names stays first, and every child of the namespace still follows.

@josephfarina
