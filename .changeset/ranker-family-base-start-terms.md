---
'@astryxdesign/cli': patch
---

[fix] `astryx build`: a variant no longer displaces its family's base template when the base matched too few terms, unless the idea names the family in its head. The matched-terms requirement the base carries in `baseFirst` (two matched terms to start on its own) was needed against score drift — one term's idf rises with a growing catalog until a one-term base scores like two — but it read past the rule a start already follows: a family word in the idea's head is start evidence on its own, the same evidence `pickStart` accepts in place of a second matched term. So `"saml login"` starts the family's basic login page again (not `login-sso`), and `"login page with a split button"` starts the base (not `login-split`); ideas that name the family only outside the head keep the requirement ("a funnel for a dashboard" still starts the funnel), and variants that draw two matched terms of their own still lead ("weather widget with radar" stays the weather widget).

@mego1123
