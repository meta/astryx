---
'@astryxdesign/core': patch
---

[fix] InputGroup: an `error` status on the group now sets `aria-invalid="true"` on its member fields (TextInput, NumberInput, Selector, MultiSelector, and DateInput and TimeInput on every surface: popover, native and bottom sheet). Before, the members were described by the group's error message but never announced as invalid, because the group's `role="group"` cannot carry `aria-invalid`; now a screen reader announces each member as invalid (`component:TextInput` FR9). A member given its own `status` keeps using it. No API changes beyond an optional `isInvalid` field on the `InputGroupContextValue` type.

@HelloOjasMutreja
