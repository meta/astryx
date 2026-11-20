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
      "text": "Use tokens in StyleX code by importing their vars; component props take spacing steps instead (`gap={4}` is `--spacing-4`). Never hard-code a color, size, radius, or shadow that a token names."
    },
    {
      "type": "code",
      "lang": "tsx",
      "label": "Token vars in StyleX",
      "code": "import * as stylex from '@stylexjs/stylex';\nimport {colorVars, spacingVars, sizeVars, radiusVars} from '@astryxdesign/core/theme/tokens.stylex';\nimport {dataVars} from '@astryxdesign/core/theme/dataTokens.stylex';\n\nconst styles = stylex.create({\n  card: {\n    padding: spacingVars['--spacing-4'],\n    backgroundColor: colorVars['--color-background-surface'],\n    borderRadius: radiusVars['--radius-container'],\n  },\n  series: {\n    color: dataVars['--color-data-categorical-blue'],\n  },\n  button: {\n    height: sizeVars['--size-element-md'],\n  },\n});"
    },
    {
      "type": "list",
      "style": "unordered",
      "items": [
        "Spacing: --spacing-0 to --spacing-12, plus --spacing-0-5 and --spacing-1-5",
        "Text color: --color-text-primary, --color-text-secondary, --color-text-accent; status text --color-text-<status>",
        "Surfaces: --color-background-body, --color-background-surface, --color-background-card, --color-background-muted",
        "Borders: --color-border, --color-border-emphasized, --border-width",
        "Accent and status fills: --color-accent with --color-on-accent; --color-<status> with --color-on-<status>, where <status> is info, success, warning, or error",
        "Radius: --radius-inner, --radius-element, --radius-container, --radius-page, --radius-full",
        "Control heights: --size-element-sm, --size-element-md, --size-element-lg",
        "Shadow: --shadow-low, --shadow-med, --shadow-high",
        "Type: --text-heading-1-size to --text-heading-6-size, --text-body-size, --font-weight-semibold",
        "Charts: --color-data-categorical-<color> for each series, where <color> is blue, orange, purple, green, pink, cyan, red, teal, brown, or indigo, from dataVars in @astryxdesign/core/theme/dataTokens.stylex"
      ]
    },
    {
      "type": "prose",
      "text": "Each category below has every token with its default value."
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
