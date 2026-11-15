---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-034
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-11
phase: accepted
owners: [cixzhang]
affects_architecture: [architecture:theme-compilation, architecture:cli-surface]
affects_families: []
affects_contributing: [contributing:cli-conventions]
affects_consumer_docs: [theme]
---

# Theme family build behavior spec

## Intent

A theme package author should be able to compile one related theme family without
shipping each member's repeated resolved declarations. The caller selects the family
and supplies one stable key. The build emits one `<key>.css` containing every member,
one `<key>.js` exporting every complete member, and one matching `<key>.d.ts`.
Consumers load the CSS once and switch themes by identity.

Public [PR #5687](https://github.com/meta/astryx/pull/5687) demonstrates the user
need and the required cascade result. Its separately loaded base and member files are
not the accepted output: they can be incomplete, depend on load order, omit a
zero-delta member, and produce invalid JavaScript when source bindings collide. A
replacement uses one aggregate output trio so consumers never assemble the family.

## Non-goals

- Implement the compiler, CLI, or generated artifacts in this specification pull
  request.
- Add a new command, response field, error code, or per-member family entrypoint.
- Strengthen the existing theme build's filesystem failure, cleanup, or publication
  guarantees.
- Add or change the portable/global token vocabulary, component APIs, or theme values.

## Requirements

### Inputs and outputs

- **FR1 — Selected themes form one valid lineage.** The selected themes MUST form one
  connected, acyclic `extends` tree with exactly one root. Every selected non-root
  member's parent MUST also be selected. Duplicate names or identities, missing
  ancestors, and cycles MUST fail before family output is published. Descendants at
  any depth are valid; a family is not limited to one root and its direct children.
- **FR2 — The CLI emits one caller-keyed output trio.** The stable command shape is:

  ```sh
  astryx theme build --family <base> <children...> --family-key <key>
  ```

  `--family-key <key>` is required with `--family` and is refused without it before any
  output is written. It names only `<key>.css`, `<key>.js`, and `<key>.d.ts`. The family
  key is only the filename stem: it does not change a member's identity or serialized
  `data.name`, and it establishes no second output-directory convention. The key uses
  the existing safe lower-kebab filename rules. Family mode composes with `--check`,
  and is refused with `--watch` and `--out`; other options retain the owning build's
  existing semantics. It adds no response field or error code; any future response
  change follows `spec:AST-017`.

### Observable family behavior

- **FR3 — One stylesheet is complete for every member.** `<key>.css` MUST contain all
  theme-authored CSS needed by every selected member. For each member, every generated
  declaration and resulting computed style MUST match that member's complete standalone
  build across every supported theme surface. Completeness follows `spec:AST-066`: a
  member contributes only its explicitly authored `--color-data-*` overrides; canonical
  defaults come from the consuming StyleX data-variable group, outside theme build. A
  consumer MUST NOT load, order, or discover another family stylesheet.
- **FR4 — Theme identity selects the correct cascade.** After `<key>.css` loads,
  selecting or switching a member requires only changing the theme identity. A
  descendant's differing values MUST win over inherited values without consumer
  specificity work or stylesheet-order requirements. Nested roots follow
  `spec:AST-066`: same and different identities inherit every unspecified data value,
  while a child replaces only the subset it explicitly authors. Sibling roots stay
  isolated, and unrelated same-layer stylesheets produce the same winners in either
  physical order.
- **FR5 — Deterministic output preserves zero-delta members.** Equivalent selected
  sets MUST produce byte-identical CSS, JavaScript, and declarations regardless of
  argument order. A member with no visual delta still has its selectable identity,
  complete JavaScript export, and declaration.
- **FR6 — JavaScript and types expose every complete member.** `<key>.js` MUST be a
  CSS-free standard ESM module with one complete resolved export for every selected
  member. It MUST parse and import when separate theme sources reuse the same local
  binding name. `<key>.d.ts` MUST describe every member export under supported
  TypeScript module resolution. CSS, JavaScript, and type readiness remain independent.

### Failure, check, and compatibility

- **FR7 — Success means one complete keyed result.** An invalid lineage, key, or
  member MUST fail before the command reports success. A successful build MUST expose
  all three expected keyed files with current bytes. A failed build MUST NOT report
  success for a mixed, missing, or stale expected set. This defines no stronger
  durability guarantee than the existing theme build.
- **FR8 — `--check` verifies the expected keyed outputs.** With the same family
  selection and key, `--check` MUST regenerate the expected CSS, JavaScript, and
  declaration output and compare those three files using the existing theme-build
  check semantics. It MUST report missing or outdated expected files without writing
  generated output. This contract does not add detection or cleanup of unrelated or
  extra files.
- **FR9 — Existing command and artifact paths remain compatible.** Standalone and
  ordinary multi-file commands, output names, generated JavaScript/types, theme names,
  inheritance, and consumer import paths keep their meaning. `spec:AST-066` intentionally
  removes canonical data defaults from every theme-build mode and leaves only authored
  scoped data overrides; family mode MUST NOT preserve the superseded raw global-data
  block. Family selection itself remains opt-in.

### Evidence and implementation relationship

- **FR10 — PR #5687 is evidence, not the replacement implementation.** Its duplication
  measurements, lineage evidence, and cascade experiments may inform replacement work.
  Its public base-plus-member consumption model is superseded. The replacement MUST
  satisfy the completeness, load-order, zero-delta, and binding-safety behavior above
  through one aggregate CSS/JS/d.ts output.

## Current-state impact

Current `main` builds one complete CSS, JavaScript, and declaration set per theme.
Implementing this accepted amendment adds the opt-in family command behavior above.
`spec:AST-066` separately removes canonical data defaults from standalone and family
theme CSS, leaves only each member's authored scoped data overrides, and assigns
canonical default emission to the public StyleX consumer graph. It does not change the
keyed trio, member exports, declarations, or selection command.

This specification changes no runtime, compiler, CLI, generated artifact, or package by
itself and adds no Changeset.

## Verification

| Contract | Required evidence                                                       | Failure signal                                                                                                                                                                                |
| -------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR2  | graph and CLI composition tests                                         | a missing ancestor or cycle builds; the key changes identity; family mode emits anything other than the keyed trio                                                                            |
| FR3–FR5  | standalone-equivalence fixtures plus real Chromium                      | a component, prose, adaptation, on-media, authored data subset, nested same/different identity, sibling-root, reversed-order, or zero-delta state differs; argument order changes bytes       |
| FR6      | ESM parse/import, TypeScript, and binding-collision fixtures            | an export is incomplete or absent; reused local names break parsing; declarations disagree with exports                                                                                       |
| FR7–FR9  | invalid-input, write-failure, check, and standalone regression fixtures | invalid input reports success; a successful build exposes mixed, missing, or stale bytes; check falsely passes them; standalone output changes beyond the `spec:AST-066` data-default removal |

Real-browser verification MUST load only `<key>.css` in addition to the ordinary
consumer StyleX output and exercise every selected identity, representative components
and prose, on-media behavior, each member's authored data subset, a parent-authored data
override across nested same and different identities, sibling roots, a zero-delta member,
and an unrelated same-layer stylesheet in both orders.
Structural tests MUST prove deterministic bytes, zero canonical data defaults in family
CSS, complete ESM exports, matching types, and collision-safe imports. Existing
standalone fixtures MUST retain every behavior outside `spec:AST-066`.

### Completion criteria

This specification remains `accepted` until one replacement implementation proves:

- one deterministic keyed CSS/JS/d.ts trio for direct and nested descendants;
- complete standalone-equivalent theme behavior from that single stylesheet, including
  `spec:AST-066` authored sparse data overrides, zero canonical defaults, and nested
  inheritance;
- selectable zero-delta members and collision-safe aggregate JavaScript/types;
- build and `--check` cannot report success for mixed, missing, or stale expected
  keyed files; and
- real Chromium behavior plus standalone builds unchanged outside the
  `spec:AST-066` canonical-data-default removal.

## Decision log

### Amendment — Adopt StyleX data-token ownership

**Decider:** `cixzhang`, `2026-10-01`

`spec:AST-066` changes the standalone behavior against which family members are
measured: canonical data defaults come from a retained public StyleX variable group,
while every theme identity emits only its authored data subset. This amendment updates
FR3, FR4, FR9, verification, and DEC-2 without changing the family command, keyed output
trio, graph contract, or complete-member principle.

### Amendment — Keep the specification at the observable boundary

**Decider:** `cixzhang`, `2026-09-12`

The accepted 2026-09-11 text coupled the family output contract to a second internal
architecture. This amendment removes that design from the behavior contract. No
earlier family-specific internal architecture requirement remains in force; only the
observable requirements in this amended record govern.

The amendment retains the one-file family result, deterministic order, nested lineage,
zero-delta identity, complete aggregate exports, binding safety, correct cascade, and
real-browser proof.

### DEC-1 — Emit one keyed family output trio

**Reference:** `spec:AST-034/DEC-1`
**Decider:** `cixzhang`, `2026-09-11`; amended `2026-09-12`

The family command emits `<key>.css`, `<key>.js`, and `<key>.d.ts`. The CSS contains all
members, the ESM exports every complete member, and the declaration describes those
exports. The required `--family-key` changes filenames only. Per-member family output
and consumer runtime assembly are rejected because they return graph and load-order
work to the consumer.

### DEC-2 — Preserve complete member behavior in one stylesheet

**Reference:** `spec:AST-034/DEC-2`
**Decider:** `cixzhang`, `2026-09-11`; amended `2026-09-12`

Every selected identity produces the same observable theme CSS behavior as its complete
standalone build. Descendant differences win without a consumer-managed load order or
specificity escalation, including for components, prose, adaptations, and on-media
behavior. Under `spec:AST-066`, canonical data defaults come from the retained public
StyleX group; same and different nested identities inherit every unspecified value and
override only their authored subset. Family CSS contains no canonical data defaults.

## Open questions

None.
