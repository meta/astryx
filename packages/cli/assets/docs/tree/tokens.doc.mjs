// Copyright (c) Meta Platforms, Inc. and affiliates.

// AUTO-GENERATED — do not edit manually.
// Run: node scripts/generate-token-docs.mjs
// Total: 286 tokens across 15 categories.

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  "type": "namespace",
  "name": "tokens",
  "title": "All Tokens",
  "summary": "Complete reference for color, data visualization, syntax, spacing, size, border, focus, radius, shadow, motion, and typography tokens.",
  "keywords": [
    "design tokens",
    "css variables",
    "custom properties"
  ],
  "blocks": [
    {
      "type": "prose",
      "text": "Use tokens in StyleX code: import their vars from `@astryxdesign/core/theme/tokens.stylex`, and data colors from `@astryxdesign/core/theme/dataTokens.stylex`. Component props take spacing steps instead: `gap={4}` is `--spacing-4`. Never hard-code a color, size, radius, or shadow that a token names."
    },
    {
      "type": "prose",
      "text": "A status color comes as a pair: a fill, and an on- color for text on that fill. Each guide below lists one family of tokens, and {@link generic:tokens-usage} has a complete StyleX example."
    }
  ],
  "slots": {
    "guides": {
      "title": "Token Categories",
      "accepts": {
        "kinds": [
          "generic"
        ]
      }
    }
  }
};
