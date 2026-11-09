// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs styling-libraries/other-libraries`: Panda, Chakra, MUI,
 * Emotion, styled-components, UnoCSS, and the interop checklist.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'other-libraries',
  title: 'Other Libraries',
  placement: {parent: 'namespace:styling-libraries', slot: 'guides', order: 30},
  category: 'guide',
  description:
    'Panda, Chakra, MUI, Emotion, styled-components, Theme UI, UnoCSS, and the interop checklist.',
  keywords: [
    'UnoCSS',
    'semantic tokens',
    'palette',
  ],

  sections: [
    {
      id: 'semantic-token-systems',
      title: 'Panda, Chakra, and Other Semantic Token Systems',
      content: [
        {
          type: 'prose',
          text: 'Libraries like Panda CSS and Chakra UI have first-class semantic token objects. Put system CSS variables at the leaves of those objects so product code can use the library\'s semantic names while the system still owns the values.',
        },
        {
          type: 'code',
          lang: 'ts',
          label: 'Semantic token aliases',
          code: `semanticTokens: {
  colors: {
    text: {
      primary: {value: 'var(--color-text-primary)'},
      secondary: {value: 'var(--color-text-secondary)'},
    },
    background: {
      surface: {value: 'var(--color-background-surface)'},
      body: {value: 'var(--color-background-body)'},
    },
    border: {
      default: {value: 'var(--color-border)'},
    },
  },
},
tokens: {
  spacing: {
    4: {value: 'var(--spacing-4)'},
  },
  radii: {
    container: {value: 'var(--radius-container)'},
  },
}`,
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Panda-style usage',
          code: `<section
  className={css({
    bg: 'background.surface',
    color: 'text.primary',
    borderColor: 'border.default',
    p: '4',
    rounded: 'container',
  })}
/>`,
        },
        {
          type: 'prose',
          text: 'If a semantic-token library needs to generate its own light/dark CSS from raw values, align its mode selector with Theme (`data-theme="light|dark"`) and generate that adapter from system theme data. Otherwise it can drift from nested or runtime themes.',
        },
      ],
    },
    {
      title: 'MUI and Palette-Based Themes',
      content: [
        {
          type: 'prose',
          text: '`MUI` expects palette slots such as primary, background, text, and divider. Map those slots to system variables for ordinary component styling. Use raw values only when MUI or your code needs to parse colors for contrast, alpha, lighten, or darken calculations.',
        },
        {
          type: 'code',
          lang: 'ts',
          label: 'MUI palette mapped to system vars',
          code: `const theme = createTheme({
  cssVariables: true,
  colorSchemes: {
    light: {
      palette: {
        primary: {main: 'var(--color-accent)'},
        background: {
          default: 'var(--color-background-body)',
          paper: 'var(--color-background-surface)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
        },
        divider: 'var(--color-border)',
      },
    },
    dark: {
      palette: {
        primary: {main: 'var(--color-accent)'},
        background: {
          default: 'var(--color-background-body)',
          paper: 'var(--color-background-surface)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
        },
        divider: 'var(--color-border)',
      },
    },
  },
});`,
        },
        {
          type: 'prose',
          text: 'If MUI owns color mode in an app, generate the light and dark palette values from system theme data and keep Theme mode synchronized. If Theme owns color mode, keep both MUI schemes pointing at the same system CSS variables.',
        },
      ],
    },
    {
      id: 'css-in-js',
      title: 'Emotion, styled-components, Theme UI, and Styled System',
      content: [
        {
          type: 'prose',
          text: 'Runtime CSS-in-JS libraries such as `Emotion` and `styled-components` usually accept arbitrary theme objects. Keep those objects semantic, but store system CSS variable references as the values. This keeps generated classes stable while the system updates values through the CSS cascade.',
        },
        {
          type: 'code',
          lang: 'ts',
          label: 'Generic CSS-in-JS theme object',
          code: `const appTheme = {
  colors: {
    textPrimary: 'var(--color-text-primary)',
    textSecondary: 'var(--color-text-secondary)',
    surface: 'var(--color-background-surface)',
    border: 'var(--color-border)',
    accent: 'var(--color-accent)',
  },
  spacing: {
    4: 'var(--spacing-4)',
  },
  radius: {
    container: 'var(--radius-container)',
  },
};`,
        },
        {
          type: 'prose',
          text: 'Avoid rebuilding CSS-in-JS theme objects with raw color values on every mode switch. CSS variables let the class names stay the same while the browser resolves the active values.',
        },
      ],
    },
    {
      id: 'unocss',
      title: 'UnoCSS and Custom Utility Systems',
      content: [
        {
          type: 'prose',
          text: 'Utility generators such as UnoCSS can put system variables in their theme config or shortcuts. Keep classes semantic (`bg-surface`, `text-primary`) and let the values point at system tokens.',
        },
        {
          type: 'code',
          lang: 'ts',
          label: 'UnoCSS-style config',
          code: `export default defineConfig({
  theme: {
    colors: {
      surface: 'var(--color-background-surface)',
      primary: 'var(--color-text-primary)',
      border: 'var(--color-border)',
      accent: 'var(--color-accent)',
    },
    spacing: {
      4: 'var(--spacing-4)',
    },
  },
  shortcuts: {
    'astryx-card': 'bg-surface text-primary border border-border rounded-lg p-4',
  },
});`,
        },
        {
          type: 'prose',
          text: 'Static utility extractors cannot see dynamically constructed class names. Prefer explicit class strings or the library\'s safelist/source-registration mechanism.',
        },
      ],
    },
    {
      title: 'Interop Checklist',
      content: [
        {
          type: 'list',
          style: 'ordered',
          items: [
            'Import the reset/base CSS and a theme CSS file early enough for first paint. For production SSR, prefer built themes from `{@command theme build}` or published `/built` theme imports plus `theme.css`.',
            'Choose one owner for color mode. Theme uses `data-theme="light|dark"` and `color-scheme` to resolve `light-dark()` tokens.',
            'Map the external library\'s semantic layer to system variables by intent, not by exact naming. For example, MUI `background.paper` maps to `--color-background-surface`.',
            'Use {@link namespace:tokens} and focused token docs when building mappings. Keep mappings small at first: text, surface/body/card/popover, border, accent, status, spacing, radius, typography, shadow.',
            'Use token resolver APIs only for non-CSS APIs that need resolved values.',
          ],
        },
      ],
    },
  ],
};
