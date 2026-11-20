---
'@astryxdesign/cli': patch
---

[fix] The contact-form template no longer scrolls sideways on a phone. Its section takes the full width up to 800px instead of its content's width, so a long field placeholder no longer sets the page's minimum width. On its own, the page looks the same at 768px and wider. Inside a padded layout region narrower than 800px, the section now stays within the padding where it used to run into it.

@josephfarina
