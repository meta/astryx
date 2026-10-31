---
'@astryxdesign/core': patch
---

[feat] FieldStatus: the `tooltip` variant is deprecated and is removed in the next minor release. FieldStatus has no tooltip presentation: a direct `<FieldStatus variant="tooltip">` draws a plain message box with no tooltip, and your editor now marks it deprecated. To show a status message from a field's on-field icon, set `statusVariant="tooltip"` on the field control instead; that stays supported.

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
