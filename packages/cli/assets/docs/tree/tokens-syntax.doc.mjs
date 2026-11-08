// Copyright (c) Meta Platforms, Inc. and affiliates.

// AUTO-GENERATED — do not edit manually.
// Source: packages/core/src/theme/tokens.stylex.ts,
//   dataTokens.stylex.ts, and syntax/tokens.ts
// Run: node scripts/generate-token-docs.mjs

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  "type": "generic",
  "name": "tokens-syntax",
  "title": "Syntax Tokens",
  "placement": {
    "parent": "namespace:tokens",
    "slot": "guides",
    "order": 30
  },
  "category": "foundations",
  "description": "Code highlighting colors used by CodeBlock. Each defaults to a palette token, so syntax colors follow the theme; defineTheme({syntax}) sets a syntax theme instead.",
  "sections": [
    {
      "title": "Syntax Tokens",
      "content": [
        {
          "type": "prose",
          "text": "Code highlighting colors used by CodeBlock. Each defaults to a palette token, so syntax colors follow the theme; defineTheme({syntax}) sets a syntax theme instead."
        },
        {
          "type": "table",
          "headers": [
            "Token",
            "Value"
          ],
          "rows": [
            [
              "--color-syntax-keyword",
              "var(--color-text-accent)"
            ],
            [
              "--color-syntax-string",
              "var(--color-text-green)"
            ],
            [
              "--color-syntax-comment",
              "var(--color-text-secondary)"
            ],
            [
              "--color-syntax-number",
              "var(--color-text-orange)"
            ],
            [
              "--color-syntax-function",
              "var(--color-text-blue)"
            ],
            [
              "--color-syntax-type",
              "var(--color-text-purple)"
            ],
            [
              "--color-syntax-variable",
              "var(--color-text-primary)"
            ],
            [
              "--color-syntax-operator",
              "var(--color-text-cyan)"
            ],
            [
              "--color-syntax-constant",
              "var(--color-text-orange)"
            ],
            [
              "--color-syntax-tag",
              "var(--color-text-red)"
            ],
            [
              "--color-syntax-attribute",
              "var(--color-text-teal)"
            ],
            [
              "--color-syntax-property",
              "var(--color-text-cyan)"
            ],
            [
              "--color-syntax-punctuation",
              "var(--color-text-secondary)"
            ],
            [
              "--color-syntax-background",
              "var(--color-background-muted)"
            ],
            [
              "--color-syntax-added",
              "color-mix(in srgb, var(--color-success-muted) 25%, transparent)"
            ],
            [
              "--color-syntax-removed",
              "color-mix(in srgb, var(--color-error-muted) 25%, transparent)"
            ],
            [
              "--color-syntax-diff-header",
              "var(--color-background-muted)"
            ],
            [
              "--color-syntax-added-marker",
              "var(--color-text-green)"
            ],
            [
              "--color-syntax-removed-marker",
              "var(--color-text-red)"
            ]
          ]
        }
      ],
      "previewType": "swatch"
    }
  ]
};
