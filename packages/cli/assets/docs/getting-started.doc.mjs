// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  name: 'getting-started',
  title: 'Getting Started',
  category: 'guide',
  description: 'Add the design system to your project and start building.',
  keywords: ['quick start', 'setup', 'install'],

  sections: [
    {
      title: 'Quick Start with AI',
      content: [
        {
          type: 'prose',
          text: 'Paste this into your AI coding tool and let it handle the setup:',
        },
        {
          type: 'code',
          lang: 'text',
          label: 'Set up the design system',
          code: 'Install @astryxdesign/core, @stylexjs/stylex, @astryxdesign/theme-neutral, and @astryxdesign/cli in this project, then run `{@command init}` to set up agent docs. Read the generated files to learn the conventions.',
        },
        {
          type: 'prose',
          text: 'Then give it a look. Every app gets a theme whether or not anyone picks one, so it is worth one question at setup rather than revisiting screens later that were built around the wrong look:',
        },
        {
          type: 'code',
          lang: 'text',
          label: 'Give it a look',
          code: 'Ask me what look and feel this app should have. Run `{@command theme list}`, install the closest theme package, and run `theme add <slug>`; use `--package` when owners share a slug. Import `themes` and `defaultThemeSlug` from the generated module once and pass `themes[defaultThemeSlug]` to `<Theme>`. Customize with `defineTheme({extends: importedTheme, ...})`. Use `theme eject` only when I ask for an independent source fork. Default to neutral if I have no preference, and show me the result before moving on.',
        },
      ],
    },
    {
      title: 'Install',
      content: [
        {
          type: 'prose',
          text: 'Astryx requires React 19 or later: `react` and `react-dom` >= 19.0.0 are peer dependencies of `@astryxdesign/core`.',
        },
        {
          type: 'prose',
          text: 'Add the core package and its `@stylexjs/stylex` peer dependency, plus a theme and the CLI.',
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Terminal',
          code: `{@pm install @astryxdesign/core @stylexjs/stylex @astryxdesign/theme-neutral @astryxdesign/cli}`,
        },
        {
          type: 'prose',
          text: "Then run `{@command init}` to install the AI agent cheat sheet (AGENTS.md/CLAUDE.md). It's non-interactive; no prompts; so it's safe for AI agents, CI, and scripts. Add `--all` for pointers to the theme and page-building workflows.",
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Terminal',
          code: `{@command init}`,
        },
      ],
    },
    {
      id: 'install-once',
      title: 'Install once, use everywhere',
      content: [
        {
          type: 'prose',
          text: "Install the CLI once for your computer too, and the astryx command works in any folder, for you and for any coding agent, even before a project exists. Inside a project, the project's own version still answers, so a global install never changes what your team and CI get. Keep it in the project as well; that is the recommended setup.",
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Terminal',
          code: `{@pm install @astryxdesign/cli --global}`,
        },
        {
          type: 'prose',
          text: 'Project, global, or both: {@link generic:project-global-or-both}. Everything else about global mode: {@link namespace:global}.',
        },
      ],
    },
    {
      title: 'Add base CSS and a theme',
      content: [
        {
          type: 'prose',
          text: 'Import the reset and base styles in your global CSS. Then run `{@command theme add neutral}`; the generated app module imports the theme’s production CSS and font CSS.',
        },
        {
          type: 'code',
          lang: 'css',
          label: 'globals.css',
          code: `@import '@astryxdesign/core/reset.css';
@import '@astryxdesign/core/astryx.css';`,
        },
        {
          type: 'prose',
          text: 'Run `{@command theme list}` to see every theme.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'App root',
          code: `import {Theme} from '@astryxdesign/core/theme';
import {themes, defaultThemeSlug} from './astryx-themes';

<Theme theme={themes[defaultThemeSlug]}><App /></Theme>`,
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`@astryxdesign/theme-neutral`: muted and minimal; a good starting point',
            '`@astryxdesign/theme-butter`: warm, golden tones with blue accents',
            '`@astryxdesign/theme-chocolate`: rich chocolate and caramel tones',
            '`@astryxdesign/theme-gothic`: dark-only theme with ink and noir influences',
            '`@astryxdesign/theme-matcha`: earthy greens and botanical tones',
            '`@astryxdesign/theme-stone`: warm neutrals inspired by sandstone',
            '`@astryxdesign/theme-y2k`: playful early-2000s pop aesthetic',
          ],
        },
        {
          type: 'prose',
          text: 'These stylesheets are cascade-layered: the reset loads in @layer reset and component styles in @layer astryx-base. If your project has existing global CSS, a legacy reset, or Tailwind, declare the layer order explicitly and assign every stylesheet to a layer deliberately: unlayered styles and later layers both override astryx-base regardless of specificity. Before building screens, read the two cascade layer sections of {@link generic:migration-setup}.',
        },
        {
          type: 'prose',
          text: 'Run {@link generic:use-a-theme} for the full theming guide.',
        },
      ],
    },
    {
      title: 'Add your first component',
      content: [
        {
          type: 'prose',
          text: 'Import each component from its own entry, the path `{@command component <Name>}` prints. This keeps bundles small and makes intent clear.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'app/page.tsx',
          code: `import {Button} from '@astryxdesign/core/Button';
import {VStack} from '@astryxdesign/core/VStack';

export default function Page() {
  return (
    <VStack gap={2}>
      <Button label="Hello Astryx" onClick={() => alert('Hi!')} />
    </VStack>
  );
}`,
        },
      ],
    },
    {
      title: 'Customize with StyleX',
      content: [
        {
          type: 'prose',
          text: 'Astryx components support various styling solutions, from plain CSS and `className` to Tailwind and CSS-in-JS. See {@link namespace:styling} for the full guide. Astryx also has a deep integration with [StyleX](https://stylexjs.com/), an atomic CSS-in-JS library: create styles with `stylex.create()` and pass them to components with the `xstyle` prop.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Style overrides',
          code: `import * as stylex from '@stylexjs/stylex';

const overrides = stylex.create({
  save: { alignSelf: 'flex-end', marginTop: 16 },
});

<Button label="Save" xstyle={overrides.save} />`,
        },
      ],
    },
    {
      title: 'Example Apps',
      content: [
        {
          type: 'prose',
          text: 'For a full working project, clone one of the example apps from the repo. These are complete setups with routing, theming, and components wired together.',
        },
        {
          type: 'table',
          headers: ['Example', 'Stack', 'Path'],
          rows: [
            [
              'Next.js',
              'Next.js + theme CSS',
              '[apps/example-nextjs](https://github.com/meta/astryx/tree/main/apps/example-nextjs)',
            ],
            [
              'Next.js + StyleX',
              'Next.js + StyleX for custom styles',
              '[apps/example-nextjs-stylex](https://github.com/meta/astryx/tree/main/apps/example-nextjs-stylex)',
            ],
            [
              'Next.js + Tailwind',
              'Next.js + Tailwind bridge',
              '[apps/example-nextjs-tailwind](https://github.com/meta/astryx/tree/main/apps/example-nextjs-tailwind)',
            ],
            [
              'Vite + Tailwind',
              'Vite + Tailwind bridge',
              '[apps/example-vite-tailwind](https://github.com/meta/astryx/tree/main/apps/example-vite-tailwind)',
            ],
          ],
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Clone and run an example',
          code: `git clone https://github.com/meta/astryx.git
cd astryx/apps/example-nextjs
{@pm install}
{@pm run dev}`,
        },
      ],
    },
    {
      title: 'Explore the CLI',
      content: [
        {
          type: 'prose',
          text: 'The CLI is your reference for components, tokens, templates, and docs. For reliable invocation (especially with AI assistants), add this script to your package.json:',
        },
        {
          type: 'code',
          lang: 'json',
          label: 'package.json',
          code: `"scripts": {
  "astryx": "node node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs"
}`,
        },
        {
          type: 'prose',
          text: "Then discover what's available:",
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Terminal',
          code: `{@command component}          # list all components
{@command component Button}   # props, usage, theming for Button
{@command docs}               # list all doc topics
{@command template --list}    # available page templates
{@command docs tokens}        # spacing, color, radius reference`,
        },
      ],
    },
  ],
};
