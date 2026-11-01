// Copyright (c) Meta Platforms, Inc. and affiliates.

// AUTO-GENERATED — do not edit manually.
// Source: packages/core/src/theme/tokens.stylex.ts,
//   dataTokens.stylex.ts, and syntax/tokens.ts
// Run: node scripts/generate-token-docs.mjs

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  "type": "generic",
  "name": "tokens-duration",
  "title": "Duration Tokens",
  "placement": {
    "parent": "namespace:tokens",
    "slot": "guides",
    "order": 100
  },
  "category": "foundations",
  "description": "Motion duration primitives. Three bands: fast (micro-interactions), medium (entrance/exit), slow (continuous). Min/max variants derive from base × ratio. Of a theme's two `motion` knobs, `tempo` (0.75–1.5) scales every duration here; `character` leaves durations alone. A duration scale beats `tempo` for the bands it sets, and explicit `tokens` beat both. `tempo` leaves these unscaled: finger tracking, momentum, the rubber band, the on-screen keyboard, the press's onset delay, cancel distance and tap flash, hover-intent delays, gesture thresholds, Spinner's and Skeleton's loops, and the 200 ms Reduce Motion cap.",
  "sections": [
    {
      "title": "Duration Tokens",
      "content": [
        {
          "type": "prose",
          "text": "Motion duration primitives. Three bands: fast (micro-interactions), medium (entrance/exit), slow (continuous). Min/max variants derive from base × ratio. Of a theme's two `motion` knobs, `tempo` (0.75–1.5) scales every duration here; `character` leaves durations alone. A duration scale beats `tempo` for the bands it sets, and explicit `tokens` beat both. `tempo` leaves these unscaled: finger tracking, momentum, the rubber band, the on-screen keyboard, the press's onset delay, cancel distance and tap flash, hover-intent delays, gesture thresholds, Spinner's and Skeleton's loops, and the 200 ms Reduce Motion cap."
        },
        {
          "type": "table",
          "headers": [
            "Token",
            "Value"
          ],
          "rows": [
            [
              "--duration-fast-min",
              "130ms"
            ],
            [
              "--duration-fast",
              "175ms"
            ],
            [
              "--duration-fast-max",
              "230ms"
            ],
            [
              "--duration-medium-min",
              "310ms"
            ],
            [
              "--duration-medium",
              "410ms"
            ],
            [
              "--duration-medium-max",
              "550ms"
            ],
            [
              "--duration-slow-min",
              "730ms"
            ],
            [
              "--duration-slow",
              "975ms"
            ],
            [
              "--duration-slow-max",
              "1300ms"
            ]
          ]
        }
      ],
      "previewType": "duration-bar"
    }
  ]
};
