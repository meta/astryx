---
schema_version: 1
template_version: 1
kind: architecture
id: architecture:component-size-cascade
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-07
owners: [cixzhang]
applies_to:
  [
    packages/core/src/SizeContext/,
    packages/core/src/ButtonGroup/,
    packages/core/src/InputGroup/,
    packages/core/src/Toolbar/,
    packages/core/src/SideNav/,
  ]
verified_by:
  [
    packages/core/src/SizeContext/SizeContext.test.tsx,
    packages/core/src/ButtonGroup/ButtonGroup.test.tsx,
    packages/core/src/InputGroup/InputGroup.test.tsx,
    packages/core/src/Toolbar/Toolbar.test.tsx,
    packages/core/src/SideNav/SideNav.test.tsx,
  ]
deciding_specs: []
---

# Component size cascade architecture

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "layout": ["INV1", "INV2", "INV3", "INV4", "INV5", "INV9"]
  }
}
```

## Purpose

A person should encounter coherent control sizing inside a component-owned group
without every child repeating the same prop. An explicit child choice must still
win, and components outside the declared cascade must keep their own size contract.

This record owns the shared runtime precedence and scope of Astryx's standard element
size cascade. Component and family contracts decide participation, geometry, and
intentional overrides.

## System model

The standard cascade has three roles:

1. A **participating consumer** accepts the standard `sm | md | lg` element-size
   axis and resolves it through the shared size context.
2. A **provider owner** establishes a default size for documented eligible
   descendants.
3. A **component default** supplies the fallback when no explicit or inherited
   value applies.

A consumer resolves one effective size in this order:

1. explicit component prop;
2. nearest active provider value; and
3. the consumer's documented component default.

The effective size then flows through the consumer's own geometry, rendered state,
and theming contract. This architecture does not decide those component-specific
mappings.

## Boundaries and invariants

- **INV1 — The standard axis is shared.** Participating components use the
  canonical standard element-size vocabulary `sm | md | lg`. A component with a
  genuinely different semantic axis remains outside this cascade and documents its
  own values.
- **INV2 — Participation is explicit.** A component inherits size only when its
  current component or family contract adopts the cascade. Merely exposing a prop
  named `size` does not enroll it.
- **INV3 — Explicit intent wins.** A participating consumer's explicit size prop
  MUST override every inherited provider value.
- **INV4 — The nearest provider wins.** Without an explicit prop, a participating
  consumer MUST use the nearest active provider's value. Nested provider scopes do
  not leak through one another.
- **INV5 — Local default is final.** Without an explicit prop or active provider
  value, the consumer MUST use its documented component default. The shared helper's
  generic default does not silently rewrite a component's published default.
- **INV6 — Null resets the inherited scope.** A provider value of `null` suppresses
  an outer inherited value for descendants in that scope, causing each consumer to
  use its own fallback unless another nearer provider applies.
- **INV7 — Provider ownership is declared.** A group or container provides only to
  the eligible descendant set named by its current contract. That owner decides
  whether it first inherits an outer size, resolves an explicit group prop, or
  intentionally starts a new scope.
- **INV8 — Propagation does not erase child ownership.** A provider supplies a
  default, not a forced value. Sibling descendants resolve independently, and one
  child's explicit override MUST NOT alter another child or the provider.
- **INV9 — Public, rendered, and visual size agree.** After resolution, a
  participating component's public value, rendered state, geometry, and theme-facing
  size metadata MUST describe the same effective size under its own contract.
- **INV10 — Exported transport is not component admission.** `SizeContext`,
  `useSize`, and `SizeProvider` are public exports and the current transport.
  Their public compatibility belongs to `architecture:public-component-api`.
  Their existence or use does not by itself authorize a new public size axis or
  enroll a component in the standard cascade.

## Allowed variation

- A provider owner may establish a fixed descendant size without consuming the
  cascade for its own layout when its current contract says so.
- A family may constrain which descendants inherit, or intentionally flatten a
  nested member to preserve connected geometry.
- A component may use another closed size vocabulary only outside this standard
  cascade; generic helper typing is implementation capability, not shared semantics.
- Themes may vary tokens or geometry for a resolved value without changing
  precedence or provider ownership.

## Change coupling

Focused review triggers when a change:

- adds or removes `useSize` or `SizeProvider` from a component;
- changes a participating component's explicit, inherited, or fallback precedence;
- changes a provider's eligible descendants or whether it inherits an outer scope;
- adds a nonstandard value to the shared `ElementSize` type; or
- makes rendered/theming size differ from the resolved public value.

Review checks the provider and representative children with explicit, inherited,
local-default, nested, and null-reset states.

## Owning code

- `packages/core/src/SizeContext/SizeContext.ts` owns shared resolution and
  transport.
- `packages/core/src/ButtonGroup/`, `packages/core/src/InputGroup/`,
  `packages/core/src/Toolbar/`, and `packages/core/src/SideNav/` own the current
  provider placement, inherited or fixed provider value, and descendant scope.
- Participating component and family contracts own admission, component defaults,
  eligible descendants, geometry, and intentional overrides.
- `architecture:public-component-api` owns export reachability and compatibility
  for `SizeContext`, `useSize`, and `SizeProvider`.
- `architecture:component-theming-surface` and component style owners own
  theme-facing size metadata and visual meaning after resolution.

## Deciding specs

None. Public admission of a new size concept still follows `spec:AST-002`; this
record governs only the already-adopted shared cascade.

## Promotion evidence gaps

This authority-only draft does not add tests. Before promotion to `current`, focused
evidence must directly cover:

- a nested `null` provider resetting an outer value to the consumer's local default;
- ButtonGroup and InputGroup inherited, explicit-group, and explicit-child
  precedence; and
- Toolbar intentionally starting a fixed scope beneath an unrelated outer provider.

Current SideNav tests already cover its fixed `sm` footer/action sub-scopes and
explicit child override. These gaps are verification work, not new semantics.

## Verification

| Invariant | Evidence                                                                                                                              | Failure signal                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| INV1–INV2 | `ElementSize` plus current component/family adoption records                                                                          | a nonparticipant inherits accidentally or a participant invents a parallel standard value                  |
| INV3–INV6 | `SizeContext.test.tsx` explicit/provider/default, nested-provider, null-reset, sibling, and rerender fixtures                         | inherited size overrides explicit intent, outer scope crosses a nearer provider, or local fallback is lost |
| INV7–INV8 | focused ButtonGroup, InputGroup, Toolbar, and SideNav provider-owner tests plus the shared sibling fixture                            | a provider reaches an ineligible descendant, changes scope silently, or one child changes another          |
| INV9      | the changed participant's owning component/family geometry, rendered-state, and theming evidence; representative, not exhaustive here | resolved size and painted or exposed effective size disagree                                               |
| INV10     | package export inventory plus `architecture:public-component-api` review                                                              | exported transport is treated as private, or transport use is treated as component admission               |
