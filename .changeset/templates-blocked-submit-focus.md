---
'@astryxdesign/cli': patch
---

[fix] The `contact-form`, `form-two-column` and `form-wizard-dialog` templates move focus after a blocked submit to the first invalid field that has a focus handle, as `form-wizard-vertical` does. Fields with no single focus handle (contact-form's goal tokens, the dialog's CheckboxList and MultiSelector) are skipped. Before, focus stayed on the submit button.

@cixzhang
