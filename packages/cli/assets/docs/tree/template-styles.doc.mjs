// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/templates/build-the-template/template-assets/template-styles`:
 * style a template with Astryx first, keep editable styles in the file, and
 * ship shared CSS from the package.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'template-styles',
  placement: {
    parent: 'namespace:template-assets',
    slot: 'guides',
    order: 20,
  },
  title: 'Styles',
  category: 'guide',
  description:
    "Keep the copied UI on the app's theme: use Astryx props and tokens first, keep editable styles in the file, and ship shared CSS from your package.",
  sections: [
    {
      id: 'start-with-astryx',
      title: 'Start with Astryx',
      content: [
        {
          type: 'prose',
          text: 'Use Astryx component props, layout primitives, and design tokens before writing custom CSS. This keeps the copied result aligned with the host theme and reduces the styling contract an app inherits.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Use Stack and Grid spacing props instead of margins between children.',
            'Use component variants, sizes, padding, and alignment props before restyling internals.',
            'Use public theme token exports for a value that Astryx does not expose as a prop.',
            'Do not copy private generated class names or target component internals with selectors.',
          ],
        },
      ],
    },
    {
      id: 'keep-editable-styles-with-the-source',
      title: 'Keep editable styles with the source',
      content: [
        {
          type: 'prose',
          text: 'When a style belongs to the editable starting point, define it in the template file.',
        },
        {
          type: 'code',
          lang: 'tsx',
          code: `import * as stylex from '@stylexjs/stylex';
import {colorVars} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  trend: {
    color: colorVars['--color-text-success'],
    minWidth: 0,
  },
});

// Later: <Text xstyle={styles.trend}>Up 12%</Text>`,
        },
        {
          type: 'prose',
          text: 'Use custom declarations only when no Astryx prop or token fits. Each one counts in the Custom CSS category of {@link generic:template-grading-rubric}.',
        },
      ],
    },
    {
      id: 'publish-shared-css',
      title: 'Publish shared CSS deliberately',
      content: [
        {
          type: 'prose',
          text: 'When a stylesheet must stay package-owned, import it from the template by its public package path.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'templates/acme-dashboard.tsx',
          code: "import '@acme/astryx-widgets/styles/acme-dashboard.css';",
        },
        {
          type: 'prose',
          text: 'Then export that path and include the file in the package ({@link generic:export-template-assets}). TypeScript 6 and later check side-effect imports by default, so this import type-checks only when the app or its framework declares `*.css` modules.',
        },
      ],
    },
  ],
};
