---
'@astryxdesign/cli': patch
---

[fix] In the theme editor, a focus-ring change that keeps a status ("make the focus ring on inputs red but keep the invalid ones") keeps that status's ring as Core draws it while focused, instead of writing its resting shadow. With Core's status fields now drawing their focus ring, a ring change reaches them too unless they are kept.

@josephfarina
