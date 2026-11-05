// Copyright (c) Meta Platforms, Inc. and affiliates.

// AUTO-GENERATED — do not edit manually.
// Source: packages/core/src/theme/tokens.stylex.ts,
//   dataTokens.stylex.ts, and syntax/tokens.ts
// Run: node scripts/generate-token-docs.mjs

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  "type": "generic",
  "name": "tokens-focus",
  "title": "Focus Tokens",
  "placement": {
    "parent": "namespace:tokens",
    "slot": "guides",
    "order": 70
  },
  "category": "foundations",
  "description": "The keyboard focus ring, shared by every component that draws one. Override these to restyle focus across the system.",
  "sections": [
    {
      "title": "Focus Tokens",
      "content": [
        {
          "type": "prose",
          "text": "The keyboard focus ring, shared by every component that draws one. Override these to restyle focus across the system."
        },
        {
          "type": "table",
          "headers": [
            "Token",
            "Value"
          ],
          "rows": [
            [
              "--focus-outline-width",
              "2px"
            ],
            [
              "--focus-outline-style",
              "solid"
            ],
            [
              "--focus-outline-color",
              "var(--color-accent)"
            ],
            [
              "--focus-outline-offset",
              "3px"
            ]
          ]
        }
      ]
    }
  ]
};
