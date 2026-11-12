// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/templates/build-the-template/template-assets/template-fonts`:
 * use the app typeface by default, and ship every font file a template needs
 * when it must bring its own.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'template-fonts',
  placement: {
    parent: 'namespace:template-assets',
    slot: 'guides',
    order: 30,
  },
  title: 'Fonts',
  category: 'guide',
  description:
    "Keep text in the app's typeface unless the template truly needs its own, and ship every font file it uses when it does.",
  sections: [
    {
      id: 'prefer-host-typography',
      title: 'Prefer host typography',
      content: [
        {
          type: 'prose',
          text: 'Use Astryx typography components and theme values unless the template must demonstrate a specific licensed typeface. A copied template should normally inherit the app typography instead of installing a new global font.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Do not add a font only to make sample content look more polished.',
            'Do not override the app body font from a template.',
            'Use a custom face only for a real product or content requirement that the integration package owns.',
          ],
        },
      ],
    },
    {
      id: 'package-a-required-font',
      title: 'Package a required font',
      content: [
        {
          type: 'prose',
          text: 'Keep the font files beside a package-owned stylesheet. The stylesheet can use relative `url()` paths because it stays in the package, and the template imports the stylesheet by its public path ({@link generic:template-styles}).',
        },
        {
          type: 'code',
          lang: 'css',
          label: 'styles/acme-dashboard.css',
          code: `@font-face {
  font-family: 'Acme Sans';
  src: url('../assets/fonts/acme-sans-regular.woff2') format('woff2');
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}

.acme-dashboard-title {
  font-family: 'Acme Sans', sans-serif;
}`,
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Ship WOFF2 when it satisfies the supported browsers. Add another format only when those browsers require it.',
            'Declare every weight and style the template uses. Do not make the browser synthesize bold or italic because a file is missing.',
            'Use `font-display: swap` unless the product requirement and performance test justify another value.',
            'Confirm that the font license permits redistribution in the integration package.',
          ],
        },
        {
          type: 'prose',
          text: 'Exporting the stylesheet does not publish the font files it points to. Include the font directory in the package as well ({@link generic:export-template-assets}).',
        },
      ],
    },
    {
      id: 'check-fonts-in-the-app',
      title: 'Check fonts in the app',
      content: [
        {
          type: 'prose',
          text: 'When you test the template in an app ({@link generic:test-template-in-app}), also confirm the following.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Every font request succeeds from the built asset path.',
            'Computed styles show the requested family, weight, and style.',
            'Text stays readable with the fallback stack when a font loads slowly or fails.',
          ],
        },
      ],
    },
  ],
};
