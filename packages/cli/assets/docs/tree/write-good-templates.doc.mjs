// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/templates/write-good-templates`:
 * what makes a template good, the rubric that scores it, and grading with an agent.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'write-good-templates',
  placement: {parent: 'namespace:templates', slot: 'quality', order: 10},
  title: 'How to write good templates',
  summary:
    'Write templates people trust: what good means, the rubric that scores it, and how to grade one with an agent.',
  keywords: [
    'template quality',
    'template rubric',
    'grade template',
    'template review',
  ],
  blocks: [
    {
      type: 'prose',
      text: 'A good template does more than render. It gives an app a clear product starting point that is easy to understand, safe to change, and complete after Astryx copies it out of the package. A rubric scores that quality so you can grade as you build.',
    },
    {
      type: 'list',
      style: 'unordered',
      items: [
        'Its purpose and primary task are clear before someone reads every detail.',
        'It composes Astryx components instead of rebuilding their behavior with raw HTML or custom styles.',
        'Its hierarchy, spacing, interactions, and reading order still work at narrow widths and in every supported color mode.',
        'Its source, imports, styles, fonts, icons, images, and media still work from the copied location.',
        'Its metadata makes the template easy to find and accurately explains when to use it.',
        'Its example content is realistic enough to expose overflow, empty-space, and hierarchy problems.',
      ],
    },
    {
      type: 'prose',
      text: 'Grade the first runnable version, again after each source, doc, dependency, or asset change, and in full before every release. Grade the source, doc, copied file, and rendered app together; none of them is enough alone.',
    },
    {
      type: 'list',
      style: 'ordered',
      items: [
        'Read every scoring rule in {@link generic:template-grading-rubric}.',
        'Fix publication blockers first, then every reasonable deduction.',
        'Repeat the full grade on the packed package in a clean app ({@link generic:test-template-in-app}).',
        'To have an agent grade and improve the template, use {@link generic:grade-template-with-agent}.',
      ],
    },
    {
      type: 'prose',
      text: 'Keep each scorecard with its package revision and rubric version.',
    },
  ],
  slots: {
    guides: {
      title: 'Guides',
      accepts: {kinds: ['generic']},
    },
  },
};
