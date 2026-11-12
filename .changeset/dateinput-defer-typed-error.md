---
'@astryxdesign/core': patch
---

[feat] DateInput, DateTimeInput, FormLayout: add `entryErrorBehavior: 'complete' | 'blur-or-enter'` option (defaulting to `'complete'`), exported `EntryErrorBehavior` type, and `defaultEntryErrorBehavior` form-level propagation on `FormLayout`. Under `entryErrorBehavior="blur-or-enter"`, typed dates that do not exist (such as `02/31/2026`) or that fall outside allowed bounds (`min`, `max`, `dateConstraints`) defer their error display, live-region announcement, and `aria-invalid` state until the field is committed on `Enter` or blur. The default remains `'complete'`, matching current behavior where errors surface as soon as a complete date entry is typed.

@Geervan
