---
'@astryxdesign/cli': patch
---

[fix] `astryx build`: when an idea names a family only after its head ("a saml for a login") and the family's base template matches no other word, the variant that outranks the base now stays the start (`login-sso`, not `login`), so adding page templates no longer flips such ideas to the base. Ideas that name the family in their head ("saml login") start as before.

@mego1123
