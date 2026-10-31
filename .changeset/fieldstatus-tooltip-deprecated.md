---
'@astryxdesign/core': patch
---

[feat] FieldStatus: the `tooltip` variant is deprecated and is removed in the next minor release. FieldStatus renders no message box for it, so a direct `<FieldStatus variant="tooltip">` shows nothing. To show a status message from a field's on-field icon, set `statusVariant="tooltip"` on the field control instead; that stays supported.

Before:

```tsx
<FieldStatus type="error" message="Required" variant="tooltip" />
```

After:

```tsx
<TextInput
  label="Name"
  status={{type: 'error', message: 'Required'}}
  statusVariant="tooltip"
/>
```

@cixzhang
