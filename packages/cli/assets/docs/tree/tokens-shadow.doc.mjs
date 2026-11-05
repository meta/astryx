// Copyright (c) Meta Platforms, Inc. and affiliates.

// AUTO-GENERATED — do not edit manually.
// Source: packages/core/src/theme/tokens.stylex.ts,
//   dataTokens.stylex.ts, and syntax/tokens.ts
// Run: node scripts/generate-token-docs.mjs

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  "type": "generic",
  "name": "tokens-shadow",
  "title": "Shadow Tokens",
  "placement": {
    "parent": "namespace:tokens",
    "slot": "guides",
    "order": 90
  },
  "category": "foundations",
  "description": "Elevation shadows (low to med to high) and inset shadows for input state rings.",
  "sections": [
    {
      "title": "Shadow Tokens",
      "content": [
        {
          "type": "prose",
          "text": "Elevation shadows (low to med to high) and inset shadows for input state rings."
        },
        {
          "type": "table",
          "headers": [
            "Token",
            "Value"
          ],
          "rows": [
            [
              "--shadow-low",
              "0px 1px 1px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2)), 0px 2px 8px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2))"
            ],
            [
              "--shadow-med",
              "0px 1px 2px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2)), 0px 2px 12px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2))"
            ],
            [
              "--shadow-high",
              "0px 2px 2px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.2)), 0px 8px 24px light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.3))"
            ],
            [
              "--shadow-inset-hover",
              "inset 0px 0px 0px 2px light-dark(rgba(5, 54, 89, 0.15), rgba(223, 226, 229, 0.2))"
            ],
            [
              "--shadow-inset-selected",
              "inset 0px 0px 0px 2px rgba(1, 113, 227, 0.5)"
            ],
            [
              "--shadow-inset-success",
              "inset 0px 0px 0px 2px rgba(38, 167, 86, 0.3)"
            ],
            [
              "--shadow-inset-warning",
              "inset 0px 0px 0px 2px rgba(226, 164, 0, 0.3)"
            ],
            [
              "--shadow-inset-error",
              "inset 0px 0px 0px 2px rgba(227, 25, 59, 0.3)"
            ]
          ]
        }
      ],
      "previewType": "shadow-box"
    }
  ]
};
