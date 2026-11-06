// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tokens.ts
 * @input None (pure token definitions)
 * @output syntaxTokenDefaults, SyntaxTokenName
 * @position Domain token sub-module; re-exported from domainTokens/index.ts
 *
 * Code syntax highlighting tokens. Used by the CodeBlock component and any
 * consumer that renders highlighted source code.
 *
 * Default values reference the theme's named palette via var() so syntax
 * colors automatically adapt to any theme's color system. Themes can also
 * set an explicit syntax theme via defineTheme({ syntax: dracula }).
 *
 * 14 token colours and the code background, validated against 11 community
 * code themes — all of them map cleanly to those slots — plus five diff row
 * slots (added, removed, header paints; added and removed markers) that default
 * to semantic tokens, so a syntax theme that does not set them keeps a
 * readable diff.
 *
 * @see https://github.com/meta/astryx/issues/1148
 */

export const syntaxTokenDefaults = {
  // keyword -> accent text (control flow: if, return, const)
  '--color-syntax-keyword': 'var(--color-text-accent)',
  // string -> green text (string literals)
  '--color-syntax-string': 'var(--color-text-green)',
  // comment -> secondary text (passive annotations)
  '--color-syntax-comment': 'var(--color-text-secondary)',
  // number -> orange text (numeric literals)
  '--color-syntax-number': 'var(--color-text-orange)',
  // function -> blue text (function/method names)
  '--color-syntax-function': 'var(--color-text-blue)',
  // type -> purple text (types, interfaces, classes)
  '--color-syntax-type': 'var(--color-text-purple)',
  // variable -> primary text (neutral identifiers)
  '--color-syntax-variable': 'var(--color-text-primary)',
  // operator -> cyan text (=, +, =>, &&)
  '--color-syntax-operator': 'var(--color-text-cyan)',
  // constant -> orange text (true, false, null)
  '--color-syntax-constant': 'var(--color-text-orange)',
  // tag -> red text (HTML/JSX tags)
  '--color-syntax-tag': 'var(--color-text-red)',
  // attribute -> teal text (HTML/JSX attributes)
  '--color-syntax-attribute': 'var(--color-text-teal)',
  // property -> cyan text (object properties)
  '--color-syntax-property': 'var(--color-text-cyan)',
  // punctuation -> secondary text (brackets, semicolons). Not disabled text:
  // disabled grey is calibrated to fail AA on purpose (WCAG exempts inactive
  // controls), and punctuation in a code sample is normal, always-active
  // text — see #5386.
  '--color-syntax-punctuation': 'var(--color-text-secondary)',
  // background -> muted surface
  '--color-syntax-background': 'var(--color-background-muted)',
  // Diff rows (CodeBlock isDiff): whole-row tints behind unchanged syntax
  // colours. Added/removed derive from the semantic success/error muted
  // tokens at 25% strength: at full strength the secondary-grey syntax
  // tokens (operator, punctuation, comment) fall under 4.5:1 on the tints
  // in light; at 25% every default token clears it on both schemes with
  // margin while the tint still reads against the plain row. Header rows
  // (@@, and ---/+++ before the first hunk) sit on the muted surface.
  '--color-syntax-added':
    'color-mix(in srgb, var(--color-success-muted) 25%, transparent)',
  '--color-syntax-removed':
    'color-mix(in srgb, var(--color-error-muted) 25%, transparent)',
  '--color-syntax-diff-header': 'var(--color-background-muted)',
  // The margin of a changed row — its line number and +/- glyph — in the
  // default theme's tinted-text tokens, made for tinted surfaces; a defined
  // syntax theme that leaves them unset follows its own punctuation colour
  // (see defineSyntaxTheme). Code text keeps the syntax theme's colours.
  '--color-syntax-added-marker': 'var(--color-text-green)',
  '--color-syntax-removed-marker': 'var(--color-text-red)',
} as const;

export type SyntaxTokenName = keyof typeof syntaxTokenDefaults;

/** The five diff row slots: optional in a syntax theme, defaulted when unset. */
export const DIFF_SYNTAX_TOKEN_NAMES = [
  '--color-syntax-added',
  '--color-syntax-removed',
  '--color-syntax-diff-header',
  '--color-syntax-added-marker',
  '--color-syntax-removed-marker',
] as const satisfies ReadonlyArray<SyntaxTokenName>;
