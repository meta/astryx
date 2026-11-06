---
'@astryxdesign/cli': patch
---

[fix] The `contact-form`, `form-two-column` and `form-wizard-dialog` templates focus the first invalid field after a blocked submit, as `form-wizard-vertical` and `checkout-wizard` do. Before, focus stayed on the submit button.
