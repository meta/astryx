---
schema_version: 3
template_version: 7
kind: component
id: component:Kbd
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility]
verified_by: [packages/core/src/Kbd/Kbd.test.tsx, scripts/check-knowledge.mjs]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:internationalization,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-102]
---

# Kbd component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. Kbd takes a `keys` string and base props.                                                                                                                                             |
| Behavior                | Kbd splits `keys` on `+`, draws one hidden key badge per key with platform-aware glyphs, and names the whole shortcut once with spoken key names.                                                   |
| End-user impact         | Sighted people see familiar key glyphs; screen-reader users hear the shortcut as words. Those words are English in every locale.                                                                    |
| Builder impact          | None.                                                                                                                                                                                               |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. Badges hold a fixed height; listed under Current-state impact.                                                                            |
| Review checks           | Reject a badge that is exposed to assistive technology, a caller `role` or `aria-label` that replaces the computed one, duplicate React keys for repeated keys, or `mod` that ignores the platform. |
| Governing rules         | `architecture:component-theming-surface`; `architecture:internationalization` INV1, INV1a; `architecture:public-component-api` INV5; `spec:AST-102` FR4.                                            |

This table is a review projection; the body below is authoritative.

## Intent

Kbd presents a keyboard shortcut as one or more painted key badges. It owns
parsing the shortcut string, the platform-aware glyph for each key, the
shortcut's accessible name, and the `kbd` target. Consumer usage lives in
`Kbd.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The shortcut group, its current `kbd` target, and the painted key badges it
  renders from the supplied shortcut string.
- Key parsing, aliases, platform-aware glyphs, and the spoken name.

**Does not own / non-goals**

- The action associated with the shortcut or how the shortcut is discovered —
  owned by the product callsite.
- Whether an individual key badge should gain a public target — open (OQ1).
- Listening for or handling the shortcut — not provided; Kbd is display only.
- Caller DOM props, `ref`, `className`, `style`, and `xstyle` on the group —
  shipped and documented, uncontracted here beyond FR4's role and label
  precedence.

## Public concepts

| Concept | Closed values or states                                             | Meaning               | Availability by variant/orientation/state | Default  | Owner           | Stability | Invalid-value behavior                    |
| ------- | ------------------------------------------------------------------- | --------------------- | ----------------------------------------- | -------- | --------------- | --------- | ----------------------------------------- |
| Keys    | `+`-separated key names; `mod`, named keys, aliases, any other text | The shortcut to show. | Always.                                   | required | `component:Kbd` | Stable    | An unknown key shows uppercased as typed. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Basis                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| FR1 | The current render contains one shortcut group and one painted key badge for every parsed key segment. `keys` splits on `+`; each segment is trimmed and lowercased, `esc` reads as `escape` and `return` as `enter`, and a repeated key gets its own badge. Each badge is at least the `--spacing-5` size and MUST grow with a set text size so its glyph never clips (`spec:AST-102` FR4). Implementation gap: the badge height is fixed at `--spacing-5`.                                                                                    | Current source, docs, and tests; `spec:AST-102` FR4                       |
| FR2 | The shortcut group carries the current `kbd` target; individual key badges currently carry no public target (OQ1).                                                                                                                                                                                                                                                                                                                                                                                                                              | Current source, docs, and tests                                           |
| FR3 | Each badge shows a glyph: `mod` is ⌘ on Apple platforms and the catalog's short Control text ("Ctrl" in English) elsewhere and before hydration; `escape` shows the catalog's short Escape text ("Esc"); `ctrl`, `alt`, `shift`, `enter`, `backspace`, `tab`, and the arrows show their symbols; `plus` shows "+"; any other key shows uppercased.                                                                                                                                                                                              | `architecture:internationalization` INV1a; current source and tests       |
| FR4 | The group has `role="img"` and an `aria-label` built from each key's spoken name, taken from the Astryx catalog (`mod` is "Command" on Apple platforms and "Control" elsewhere and before hydration; an unknown key is spoken uppercased), joined pairwise through the catalog's shortcut message (" + " in English, for example "Command + K"); every badge is `aria-hidden`. A caller's `role` and `aria-label` never replace the computed ones; other caller ARIA props, such as `aria-labelledby` and `aria-hidden`, still reach the group. | `architecture:internationalization` INV1, INV1a; current source and tests |

### Allowed variation

- **AV1 — Shortcut content.** Platform-specific key text and caller-supplied
  shortcut combinations may vary without changing the two-part anatomy recorded
  here.

### Representative states

| State        | Required invariant                                        | Allowed variation |
| ------------ | --------------------------------------------------------- | ----------------- |
| Single key   | One badge; the name is the key's spoken name.             | Key.              |
| Mod + key    | ⌘ or Ctrl by platform; name "Command" or "Control" + key. | Platform.         |
| Repeated key | One badge per occurrence.                                 | —                 |

### Transformation and precedence order

- **ORD1 — Key resolution.** Split on `+` → trim → lowercase → alias → glyph
  and spoken name.

### Performance and resources

- **PR1 — No listener.** Kbd attaches no event listener.

## Accessibility contract

- **AR1 — One name.** The shortcut is one image named by its spoken keys,
  unless a caller's `aria-labelledby` names it; the glyph badges are hidden
  (FR4).
- **AR2 — Localization.** Visible short texts and spoken names follow the
  provider locale through the catalog (FR3, FR4).

## Design relationships

| Anatomy or state | Design requirement                                                 | Representation authority       | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------------------ | ------------------------------ | -------------- | ------------------ |
| Shortcut         | Groups the complete shortcut and carries its accessible name.      | Current source and public docs | Supporting     | FR1, FR2, FR4      |
| Key badge        | Paints one visible badge for each key in the supplied combination. | Current source and public docs | Prominent      | FR1–FR3            |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Shortcut": {"target": "kbd"},
  "Key badge": {
    "none": {
      "reason": "unsettled: No current public target reaches this part"
    }
  }
}
```

The `none` disposition records current reachability while target exposure remains
unsettled. It does not decide that key badges should remain without a public
target.

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification, target
  mapping, and the difference between factual reachability and intended public
  theming API.
- `architecture:internationalization` owns catalog-backed Astryx text; FR3
  and FR4 take their short texts, spoken names, and joining message from it.

## Verification map

| Contract            | Verification                                                                                                                                         | Representative states                                                   | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                       | Audit section             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| FR1                 | `Kbd.test.tsx` single-key, multi-key, whitespace, alias, and repeated-key cases                                                                      | Single and multiple keys; spaced and mixed-case input; repeated aliases | A missing or extra badge, an untrimmed or wrongly cased key, or a lost alias fails. Evidence gap: no test asserts badge height or text growth.                                                                                                                                                                                                        | `audit:Kbd/anatomy`       |
| FR2                 | `Kbd.test.tsx` theme-class case                                                                                                                      | Root target and child badges                                            | A missing root `kbd` target fails. Evidence gap: no test asserts that badges carry no target.                                                                                                                                                                                                                                                         | `audit:Kbd/theming`       |
| FR3, FR4            | `Kbd.test.tsx` glyph, platform, accessible-name, override, and localization cases ("localizes visible key text and the spoken shortcut combination") | Mac and non-Mac; special and unknown keys                               | A wrong glyph for `mod`, `ctrl`, `alt`, `shift`, `enter`, `escape`, `plus`, or an unknown key, an exposed badge, a caller `role` or `aria-label` that replaces the computed one, or text that skips the catalog fails. Evidence gap: no test asserts the `backspace`, `tab`, or arrow glyphs, or the "Ctrl" text and "Control" name before hydration. | `audit:Kbd/accessibility` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                        | Canonical anatomy and targets                                           | Missing, extra, prefixed, stale, or alias-backed mappings fail repository validation.                                                                                                                                                                                                                                                                 | `audit:Kbd/theming`       |
| ORD1, PR1, AR1, AR2 | ORD1 is covered by the FR1 and FR3 rows and AR1 and AR2 by the FR3, FR4 row. Evidence gap: no test asserts the absence of listeners                  | —                                                                       | —                                                                                                                                                                                                                                                                                                                                                     | `audit:Kbd/behavior`      |

## Current-state impact

- **Fixed badge height (FR1).** Badges hold a fixed height instead of growing
  with a set text size, against `spec:AST-102` FR4.

## Decision log

No component-local decision.

## Open questions

- **OQ1 — Should each Key badge gain a stable public theming target?**
  (`human-api`) The current lack of reachability does not decide the answer.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or system rules. It links to their owners.
