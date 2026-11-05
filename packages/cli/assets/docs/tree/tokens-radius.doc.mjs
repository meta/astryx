// Copyright (c) Meta Platforms, Inc. and affiliates.

// AUTO-GENERATED — do not edit manually.
// Source: packages/core/src/theme/tokens.stylex.ts,
//   dataTokens.stylex.ts, and syntax/tokens.ts
// Run: node scripts/generate-token-docs.mjs

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  "type": "generic",
  "name": "tokens-radius",
  "title": "Radius Tokens",
  "placement": {
    "parent": "namespace:tokens",
    "slot": "guides",
    "order": 80
  },
  "category": "foundations",
  "description": "Numeric scale based on a 4dp base unit. Tokens scale with the theme's radius multiplier; --radius-none and --radius-full are fixed.",
  "sections": [
    {
      "title": "Radius Tokens",
      "content": [
        {
          "type": "prose",
          "text": "Numeric scale based on a 4dp base unit. Tokens scale with the theme's radius multiplier; --radius-none and --radius-full are fixed."
        },
        {
          "type": "table",
          "headers": [
            "Token",
            "Value"
          ],
          "rows": [
            [
              "--radius-none",
              "0px"
            ],
            [
              "--radius-inner",
              "4px"
            ],
            [
              "--radius-element",
              "8px"
            ],
            [
              "--radius-container",
              "12px"
            ],
            [
              "--radius-page",
              "28px"
            ],
            [
              "--radius-chat",
              "28px"
            ],
            [
              "--radius-full",
              "9999px"
            ]
          ]
        }
      ],
      "previewType": "radius-box"
    }
  ]
};
