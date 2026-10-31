// Copyright (c) Meta Platforms, Inc. and affiliates.

// AUTO-GENERATED — do not edit manually.
// Source: packages/core/src/theme/tokens.stylex.ts,
//   dataTokens.stylex.ts, and syntax/tokens.ts
// Run: node scripts/generate-token-docs.mjs

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  "type": "generic",
  "name": "tokens-ease",
  "title": "Easing Tokens",
  "placement": {
    "parent": "namespace:tokens",
    "slot": "guides",
    "order": 110
  },
  "category": "foundations",
  "description": "Easing curves for animations and transitions. Of a theme's two `motion` knobs, `character` sets `--ease-entrance` and `--ease-move`: `crisp` decelerates without overshoot, `expressive` overshoots slightly, and at `standard` both equal `--ease-standard`; `--ease-exit` keeps its own curve at every character. `tempo` leaves curves alone. A duration scale's own fields win over the knobs, and explicit `tokens` win over everything. No curve here shapes motion that follows a finger or the system (dragging, momentum, the rubber band, the on-screen keyboard), and the press's clocks, hover-intent delays and gesture thresholds keep their timing whatever the character.",
  "sections": [
    {
      "title": "Easing Tokens",
      "content": [
        {
          "type": "prose",
          "text": "Easing curves for animations and transitions. Of a theme's two `motion` knobs, `character` sets `--ease-entrance` and `--ease-move`: `crisp` decelerates without overshoot, `expressive` overshoots slightly, and at `standard` both equal `--ease-standard`; `--ease-exit` keeps its own curve at every character. `tempo` leaves curves alone. A duration scale's own fields win over the knobs, and explicit `tokens` win over everything. No curve here shapes motion that follows a finger or the system (dragging, momentum, the rubber band, the on-screen keyboard), and the press's clocks, hover-intent delays and gesture thresholds keep their timing whatever the character."
        },
        {
          "type": "table",
          "headers": [
            "Token",
            "Value"
          ],
          "rows": [
            [
              "--ease-standard",
              "cubic-bezier(0.24, 1, 0.4, 1)"
            ],
            [
              "--ease-entrance",
              "cubic-bezier(0.24, 1, 0.4, 1)"
            ],
            [
              "--ease-move",
              "cubic-bezier(0.24, 1, 0.4, 1)"
            ],
            [
              "--ease-exit",
              "cubic-bezier(0.3, 0, 0.6, 0.6)"
            ]
          ]
        }
      ],
      "previewType": "easing-curve"
    }
  ]
};
