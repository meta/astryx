# Component Documentation Guide

## Overview

Every component directory has a `{Name}.doc.mjs` file with structured documentation. The Astryx CLI reads these files to generate agent-friendly docs, skill files, and reference material.

These docs are for people **building with** Astryx, not for people building Astryx. Before adding process material — a rubric, a readiness gate, an audit checklist, lab→core criteria — read [`packages/cli/assets/docs/README.md`](../../packages/cli/assets/docs/README.md), which carries the test and the wiki page each kind goes to.

## Exports

| Export      | Type                      | Purpose                          | Required?                       |
| ----------- | ------------------------- | -------------------------------- | ------------------------------- |
| `docs`      | `ComponentDoc`            | English docs (source of truth)   | Yes                             |
| `docsZh`    | `ComponentTranslationDoc` | Chinese Simplified prose overlay | Optional, falls back to English |
| `docsDense` | `ComponentTranslationDoc` | Compressed prose overlay         | Optional, falls back to English |

**English first.** When adding a new component, write the `docs` export. That's it. Both `--lang zh` and `--lang dense` fall back to English if their exports don't exist. Translations are generated from English by AI and can be added later.

## Architecture

`docs` contains everything: props, examples, types, defaults, and English prose. Translations only override the prose. The CLI merges them at read time.

```
docs (English, full)     <- source of truth
  + docsZh (prose only)  <- merged onto docs when --lang zh
  + docsDense (prose only) <- merged onto docs when --lang dense
```

This means:

- Examples are defined once in `docs`, shared across all languages
- Prop names, types, defaults are defined once in `docs`
- Adding a new example only requires editing `docs`
- Translations only need to be updated when prose changes

## Writing `docs` (English)

See `@astryxdesign/cli/authoring` for the full type definitions.

```js
/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'Button',
  description:
    'Button component with multiple variants, sizes, and isLoading state.',
  features: [
    'Variants: primary, secondary, ghost, destructive',
    'Sizes: sm (28px), md (32px), lg (36px)',
  ],
  props: [
    {
      name: 'label',
      type: 'string',
      description: 'Accessible label.',
      required: true,
    },
    {
      name: 'variant',
      type: "'primary' | 'secondary' | 'ghost' | 'destructive'",
      description: 'Visual style.',
      default: "'secondary'",
    },
  ],
  examples: [
    {label: 'Basic', code: '<Button label="Save" variant="primary" />'},
  ],
  accessibility: ['Uses native <button> with proper ARIA attributes.'],
  keyboard: 'Enter/Space activates; Tab moves focus.',
  notes: ['Prefer Button over <div onClick> for accessibility.'],
};
```

## Writing Translations (docsZh / docsDense)

Translations use the `ComponentTranslationDoc` type. Only prose fields, no structure.

```js
// -------------------------------------------------------
// Auto-generated translations below. Do not edit manually.
// Regenerate with the dense compression protocol.
// See .context/decisions/dense-compression-protocol.md
// -------------------------------------------------------

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'multi-variant btn w/ loading state',
  features: [
    '4 variants: primary secondary ghost destructive',
    'sizes: sm 28px, md 32px, lg 36px',
  ],
  propDescriptions: {
    label: 'a11y label; aria-label for icon-only',
    variant: 'visual style',
  },
  accessibility: ['native <button> w/ proper ARIA attrs'],
  keyboard: 'Enter/Space=activate; Tab=move focus',
  notes: ['prefer over div onClick for a11y'],
};
```

The CLI merges this onto `docs`: compressed descriptions replace English ones, but props, examples, types, and defaults all come from `docs`.

## Adding a New Component's Docs

1. Create `packages/core/src/MyComponent/MyComponent.doc.mjs`
2. Write the `docs` export (English, required)
3. Optionally add `docsZh` and `docsDense` (both fall back to English if missing)
4. The CLI discovers doc files automatically, no registration needed

## CLI Flags

```bash
astryx component Button                       # Full docs (default)
astryx --detail compact component Button       # Token-optimized format
astryx --detail brief component Button         # Minimal one-line summary
astryx --lang zh component Button              # Chinese prose, same structure
astryx --lang dense component Button           # Compressed prose, same structure
astryx --detail compact --lang dense component Button  # Compact + compressed
```

`--lang` controls which prose translation is used. `--detail` controls how much detail (full, compact, brief). They compose independently.

## Reference Docs (non-component)

Reference docs (tokens, principles, theme) use a different type: `ReferenceDoc` from `@astryxdesign/cli/authoring`.

They live in `packages/cli/assets/docs/` as `.doc.mjs` files with translations in `*.doc.dense.mjs` and `*.doc.zh.mjs`.

Content is structured as sections with ordered content blocks:

- `prose` — translatable text
- `code` — code examples (not translated)
- `table` — data tables (not translated)
- `list` — rules, anti-patterns, tips (translatable)

To add a new reference doc: create `packages/cli/assets/docs/mytopic.doc.mjs` exporting a `docs` constant. It auto-discovers.

```bash
astryx docs                          # list topics
astryx docs tokens                   # full output
astryx docs tokens --index           # section index, one key per section
astryx docs tokens spacing           # single section, by key or title
astryx --detail compact docs tokens  # agent-friendly
astryx --lang dense docs tokens      # compressed prose
```
