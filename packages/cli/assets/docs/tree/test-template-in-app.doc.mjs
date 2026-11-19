// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/templates/build-the-template/package-and-test/test-template-in-app`:
 * copy the packed template into a clean app, build it, and render it the way
 * apps will.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'test-template-in-app',
  placement: {
    parent: 'namespace:package-and-test',
    slot: 'guides',
    order: 30,
  },
  title: 'Test in an app',
  category: 'guide',
  description:
    'Prove the template works the way apps use it: installed from the packed package, copied, built, and rendered.',
  sections: [
    {
      id: 'install-the-packed-package',
      title: 'Install the packed package',
      content: [
        {
          type: 'prose',
          text: 'Install the packed package in a clean app as described in {@link generic:test-in-an-app}. Also install every library the copied source imports, such as its icon library. Pack and reinstall after every change.',
        },
      ],
    },
    {
      id: 'copy-the-template',
      title: 'Copy the template',
      content: [
        {
          type: 'code',
          lang: 'bash',
          code: `# Confirm discovery and metadata
astryx --json template --list --package @acme/astryx-widgets

# Inspect source without writing
{@command template acme-dashboard --package @acme/astryx-widgets}

# Copy a page and a block to their real app locations
{@command template acme-dashboard --package @acme/astryx-widgets src/app/acme-dashboard}
{@command template acme-stat-card --package @acme/astryx-widgets src/components}`,
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Confirm the copied files: `src/app/acme-dashboard/page.tsx` and `src/components/acme-stat-card.tsx`.',
            'Inspect the copied source for placeholder substitutions and relative references.',
            'Import the copied block into a real page. A file that is never imported has not been tested.',
          ],
        },
      ],
    },
    {
      id: 'build-every-supported-app',
      title: 'Build every supported app',
      content: [
        {
          type: 'prose',
          text: "Run the type check (`{@pm exec tsc --noEmit}`, or the app's own script) and the production build in every framework or bundler the integration supports. One toolchain passing does not prove another.",
        },
        {
          type: 'code',
          lang: 'bash',
          code: `{@pm exec tsc --noEmit}
{@pm run build}`,
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Every import resolves from the copied location.',
            'Production builds keep required side-effect CSS.',
            'No import bypasses `exports`, and no dependency resolves only through workspace hoisting.',
          ],
        },
      ],
    },
    {
      id: 'render-the-behavior-matrix',
      title: 'Render the behavior matrix',
      content: [
        {
          type: 'table',
          headers: ['Dimension', 'Required checks'],
          rows: [
            ['Width', 'Wide and narrow; include the smallest supported viewport'],
            ['Color', 'Every supported color mode and theme'],
            ['Input', 'Keyboard and pointer for the primary task'],
            [
              'Content',
              'Realistic, empty, long, loading, and error states that the pattern supports',
            ],
            [
              'Assets',
              'Successful CSS, font, icon, image, poster, and video requests',
            ],
            [
              'Runtime',
              'No console error, hydration mismatch, or missing-provider failure',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'Check the rendered hierarchy, reading order, focus order, clipping, overflow, and fallback states. A screenshot of one default state is not a complete test.',
        },
      ],
    },
    {
      id: 'grade-the-result',
      title: 'Grade the result',
      content: [
        {
          type: 'prose',
          text: 'Grade the exact packed revision using the evidence from this test ({@link namespace:write-good-templates}).',
        },
      ],
    },
  ],
};
