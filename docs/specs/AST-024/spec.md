---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-024
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-04
phase: accepted
owners: [rubyycheung]
affects_architecture: [architecture:theme-authoring-contract]
affects_families: []
affects_contributing: []
affects_consumer_docs: [theme, typography]
---

# Theme-extensible Heading visual roles system spec

## Intent

Product themes sometimes need named heading treatments beyond Astryx's three
built-in display roles. A theme may need a hero treatment, a compact section
heading, or another locally named visual role while still rendering the correct
`h1`–`h6` element. Authors may also need to change the weight of one Heading use
without creating a new visual role.

Astryx already supports theme-defined `Text` types and generates their TypeScript
augmentation during `astryx theme build`. `Heading` does not provide the same
extension point: its `type` is a closed union and it has no `weight` prop. This spec
makes Heading visual roles theme-extensible, keeps document semantics independent
from appearance, and gives generated theme CSS and generated types one dependable
contract.

## Non-goals

- Add product-specific heading names to the options Astryx provides in every
  theme.
- Infer an `h1`–`h6` level from a visual type name or font size.
- Allow visual styling to repair an incorrect document outline.
- Add arbitrary Heading sizes without a theme declaration or local source.
- Replace `Text`, typography tokens, or the existing type-scale generator.
- Define how additional typography values are calculated; theme-local scale
  extension authoring remains a separate proposal.
- Expand the font-weight choices available in every theme in this change.

## Terms

- **Semantic level:** the `Heading.level` value that selects `h1`–`h6` and the
  element's place in the document outline.
- **Visual type:** a named treatment that controls size, line height, font family,
  weight, or other approved visual properties without changing semantic level.
- **Built-in type:** `display-1`, `display-2`, or `display-3`.
- **Custom type:** a theme-owned visual type declared through a Heading component
  override and exposed to TypeScript through an augmentable map.
- **Weight override:** an explicit `Heading.weight` value for one rendered heading;
  it wins over the visual type or semantic-level default without changing either.

## Current limitation

`HeadingType` is currently the closed literal union
`'display-1' | 'display-2' | 'display-3'`. TypeScript module augmentation cannot
widen a type alias. The theme builder therefore skips a theme rule such as
`heading['type:hero']` when generating `.variants.d.ts`; emitting a new unrelated
interface would not change `HeadingProps.type`.

The browser can match the generated `data-type="hero"` selector, but application
source cannot pass `type="hero"` without a type error. If the error is bypassed,
Heading also has no defined baseline StyleX entry for that name. The current system
therefore permits CSS that its public component API cannot use safely.

## Requirements

### Extensible visual types

- **FR1 — Heading exposes a real augmentation point.** The public Heading subpath
  MUST export an interface whose keys form the custom portion of `HeadingType`.
  Built-in types remain available without augmentation. A generated declaration
  MUST widen the same interface consumed by `HeadingProps.type`; a declaration
  against a barrel-only or unused interface is invalid.
- **FR2 — Theme build enrolls declared custom types.** When a theme contains a
  custom `heading['type:<name>']` override, `astryx theme build` MUST emit the
  corresponding type augmentation and reference it from the generated theme
  declaration. If the augmentation cannot be generated or loaded, the build MUST
  fail with actionable guidance rather than emit CSS that typed source cannot use.
- **FR3 — Custom types are theme-owned but TypeScript availability is
  program-wide.** A custom name becomes type-safe after a consumer imports the
  owning theme's generated declarations. TypeScript module augmentation applies to
  the whole compilation, so it cannot prove that a matching Theme is active at one
  call site. Documentation MUST state that distinction. A custom name MUST NOT
  enlarge Heading's built-in type set for applications that do not import it.
- **FR4 — Runtime styling is deterministic.** A valid custom type MUST reflect its
  name through the same theming selector path as a built-in type. Before theme CSS
  applies, it MUST retain the selected semantic level's safe baseline rather than
  becoming unstyled or inheriting an unrelated ambient text size. If application
  source uses an imported custom name under a theme that does not define it, the
  safe baseline applies. Development tooling SHOULD warn when it can determine the
  active theme and mismatch without adding production runtime cost.
- **FR5 — Partial custom types are valid.** A custom Heading type MUST contain at
  least one meaningful visual declaration. Font size, line height, font family,
  weight, letter spacing, color, and other supported properties MAY be changed
  independently; omitted properties inherit from the selected semantic level's
  baseline. An empty or wholly invalid custom type fails before output.
- **FR6 — Existing types do not change.** Themes that declare no custom Heading
  type MUST retain their current types, runtime output, and generated artifacts.
  Existing `display-1` through `display-3` behavior remains compatible.

### Per-use weight

- **FR7 — Heading accepts an optional weight override.** `Heading` MUST accept the
  same named `TextWeight` values as `Text`: `normal`, `medium`, `semibold`, and
  `bold`. When omitted, the current level- or type-derived default remains.
- **FR8 — Explicit weight has clear precedence.** A supplied `weight` prop MUST win
  over the default weight of either a built-in or custom visual type. It MUST NOT
  change `level`, `accessibilityLevel`, or the selected HTML element. Heading MUST
  reflect the selected weight through its theming target, and the emitted cascade
  MUST guarantee this order regardless of authored rule order: explicit weight,
  then visual-type default, then semantic-level default.
- **FR9 — Theme values remain authoritative.** Named weight props resolve through
  the existing font-weight tokens, so a theme may change what `bold` or `semibold`
  means without changing component source. Raw numeric or arbitrary weight strings
  are not added to the component prop in the first version.

### Semantics and author guidance

- **FR10 — Level and type remain independent.** Every custom-type example MUST
  include an explicit semantic `level`. Tooling and documentation MUST NOT infer a
  level from names such as `hero`, `title`, or `display`.
- **FR11 — Visual reuse does not justify skipped levels.** Guidance MUST tell
  authors to choose heading levels from the document outline, then choose a visual
  type. It MUST NOT recommend changing `level` merely to obtain a different size.
- **FR12 — Non-heading text keeps using Text.** If content is not a section or page
  heading, authoring guidance MUST use `Text` even when the same visual treatment is
  desired. A shared visual name MAY be declared separately for both components, but
  does not make non-heading content semantic.

### Verification and generated artifacts

- **FR13 — Source, runtime, and build agree.** A custom Heading type MUST pass
  TypeScript, render the requested `h1`–`h6`, expose its `data-type`, receive the
  generated declarations, and compute the expected CSS in both runtime-injected
  and statically built theme modes.
- **FR14 — Missing declarations fail visibly.** A consumer that uses a custom type
  without importing the owning theme declarations MUST receive a TypeScript error.
  Documentation MUST show the required theme artifact import and explain that
  importing it cannot prove which Theme is active at runtime.
- **FR15 — Accessibility behavior is unchanged.** Adding a visual type or weight
  MUST NOT alter accessible name, heading role, semantic level, truncation behavior,
  or `aria-level` handling. Existing Heading accessibility tests remain applicable.

## Accepted API

```ts
// Excerpt from @astryxdesign/core/Heading
export interface HeadingTypeMap {
  'display-1': true;
  'display-2': true;
  'display-3': true;
}

export type HeadingType = keyof HeadingTypeMap;

export interface HeadingProps {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  type?: HeadingType;
  weight?: TextWeight;
}
```

A theme may then declare and build a local role:

```ts
defineTheme({
  name: 'product',
  localTokens: {
    '--astryx-theme-product-text-hero-size': '4.5rem',
    '--astryx-theme-product-text-hero-leading': '1.05',
  },
  components: {
    heading: {
      'type:hero': {
        fontSize: 'var(--astryx-theme-product-text-hero-size)',
        lineHeight: 'var(--astryx-theme-product-text-hero-leading)',
      },
    },
  },
});
```

After importing the built theme artifacts, application source can use the visual
role without changing its semantic level:

```tsx
<Heading level={1} type="hero">
  Product overview
</Heading>

<Heading level={2} type="hero" weight="bold">
  Featured report
</Heading>
```

## Current-state impact

The accepted spec changes no runtime or public API by itself. Its implementation
will replace Heading's closed type alias with a public map-backed union, teach the
theme builder to augment that map, give custom types a semantic-level baseline,
and add the existing named weight vocabulary to `HeadingProps`.

Themes and applications that use only the three built-in display types require no
migration. A theme that already emits `heading['type:<custom>']` CSS currently has
an unusable typed selector; after implementation and rebuild, its generated
declarations will make that existing local name available to consumers that import
the theme artifact. The augmentation is available throughout that TypeScript
program, while the custom styling remains owned by the active theme. No custom name
becomes an option that every Astryx application must support.

## Verification

| Contract  | Verification                                                                 | Representative failure                                                                                         |
| --------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| FR1–FR3   | Public-subpath augmentation and generated-declaration type tests             | The CSS builds but `type="hero"` still fails, or docs claim TypeScript knows which Theme is active.            |
| FR4–FR6   | Heading unit tests and before/after CSS snapshots                            | A custom type loses its level baseline, an intentional partial role fails, or a built-in theme changes output. |
| FR7–FR9   | Weight target and cascade tests for level, built-in type, and custom type    | `weight="bold"` loses to a type default, depends on authored rule order, or bypasses theme weight tokens.      |
| FR10–FR12 | Docs and authoring fixtures                                                  | Tooling infers `h1` from `hero`, skips a level for size, or uses Heading for non-heading copy.                 |
| FR13–FR15 | Consumer typecheck, runtime/static build parity, DOM and accessibility tests | The built artifact is not loaded, the selector differs by build path, or visual props alter heading semantics. |

### Completion criteria

This spec moves from `accepted` to `shipped` only when:

- Heading exposes and consumes one public augmentable type map;
- theme build emits and loads custom Heading type declarations;
- a custom type has a safe semantic-level baseline and at least one valid visual
  declaration;
- Heading accepts the existing named weight values with documented precedence;
- explicit weight wins through the runtime and built theme cascade, independent of
  authored rule order;
- runtime and static theme builds produce equivalent custom-type styling;
- built-in Heading behavior and themes without custom types remain unchanged; and
- examples and tests keep semantic level independent from visual treatment.

## Open questions

None.

## Decision log

### DEC-1 — Make Heading type extensible through a public map

**Reference:** `spec:AST-024/DEC-1`
**Decider:** `rubyycheung`, `2026-09-04`

Use the same proven map-based module-augmentation model as other extensible
component props. A closed type alias cannot be widened, and generating an unrelated
interface would falsely suggest type safety without changing `HeadingProps`.

### DEC-2 — Keep semantic level separate from visual type

**Reference:** `spec:AST-024/DEC-2`
**Decider:** `rubyycheung`, `2026-09-04`

Custom names control appearance only. Authors continue to choose `level` from the
document structure. This permits the same visual role at different valid levels
without coupling typography to accessibility semantics.

### DEC-3 — Add weight parity with Text

**Reference:** `spec:AST-024/DEC-3`
**Decider:** `rubyycheung`, `2026-09-04`

Add the existing named `TextWeight` vocabulary to Heading and make an explicit prop
override the type or level default. Do not add a second weight vocabulary or raw
numeric values in the first change.

### DEC-4 — Enroll visual roles independently by component

**Reference:** `spec:AST-024/DEC-4`
**Decider:** `rubyycheung`, `2026-09-04`

A visual-role name does not automatically become available to both `Text` and
`Heading`. Authors enroll it on each component whose semantics they intend to use.
The underlying theme-local typography values may be shared, and authoring tooling
may offer to create both mappings together, but it must show and confirm each use.

This prevents a Text treatment from silently becoming a heading treatment while
still avoiding duplicate value definitions.

### DEC-5 — Keep component weight choices consistent across themes

**Reference:** `spec:AST-024/DEC-5`
**Decider:** `rubyycheung`, `2026-09-04`

`Heading.weight` and `Text.weight` continue to use the same named choices in every
theme. The active theme decides whether a name such as `bold` resolves to 700, 750,
or another supported value. A custom visual type may also declare an exact weight
in theme source.

Rejected: accepting arbitrary numeric values directly at each component call site,
which would couple application source to one font and bypass theme ownership.

### DEC-6 — State the limit of theme-generated TypeScript clearly

**Reference:** `spec:AST-024/DEC-6`
**Decider:** `rubyycheung`, `2026-09-04`

Importing a theme's generated declaration makes its custom Heading names available
throughout that TypeScript program. It does not prove that the matching Theme is
active around every use. Runtime styling remains theme-scoped, mismatches retain the
semantic-level baseline, and development tooling warns when it can identify one
reliably.

Rejected: promising provider-aware static typing that TypeScript module augmentation
cannot enforce.

### DEC-7 — Permit partial visual roles

**Reference:** `spec:AST-024/DEC-7`
**Decider:** `rubyycheung`, `2026-09-04`

A custom Heading type may intentionally change only one supported visual property
and inherit the rest from its semantic level. It must contain at least one valid
declaration, but it does not have to restate font size and line height.

Rejected: requiring every custom type to be a complete typography replacement,
which would make small theme variations unnecessarily repetitive.
