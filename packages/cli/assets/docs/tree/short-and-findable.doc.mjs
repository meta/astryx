// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/docs/short-and-findable`:
 * keep each read short, lead each section with its summary, and write docs
 * that search finds.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'short-and-findable',
  placement: {parent: 'namespace:docs', slot: 'guides', order: 50},
  title: 'Short and findable',
  category: 'guide',
  description: 'Write short sections that people and agents find by search.',
  sections: [
    {
      id: 'keep-each-read-short',
      title: 'Keep each read short',
      content: [
        {
          type: 'prose',
          text: 'Readers open one section at a time, so give each section one idea and keep it to about 30 lines. `{@command doctor}` warns on any read over 32 KB.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'When a section needs a second idea, split it into two sections.',
            'Keep a topic to a few sections. When it grows past five, split it into more guides in your docs section.',
            'A topic with more than one section reads as its section list. Readers open one section by its key, or the whole topic with `--full`.',
          ],
        },
        {
          type: 'code',
          lang: 'bash',
          code: '# The section list\n{@command docs acme/deploying}\n# One section\n{@command docs acme/deploying check-before-you-ship}\n# Everything\n{@command docs acme/deploying --full}',
        },
      ],
    },
    {
      id: 'lead-with-the-summary',
      title: 'Lead with the summary',
      content: [
        {
          type: 'prose',
          text: "A section's first prose block, or its first list item, is its summary in section lists and search results. Make it answer the section's question in one or two sentences.",
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'The summary is cut at about 240 characters.',
            'A code block first does not count: the summary comes from the next prose block.',
            'Open with the answer, not with background.',
          ],
        },
        {
          type: 'code',
          lang: 'text',
          code: 'build-before-you-ship  Build before you ship - Build the app, then upload the `dist` folder.',
        },
      ],
    },
    {
      id: 'make-docs-findable',
      title: 'Make docs findable',
      content: [
        {
          type: 'prose',
          text: 'In a topic with more than one section, search ranks a section whose title matches the query, or that names it in backticks, above words in body text. Title each section with the task a reader searches for.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Name the task in the words a reader types, such as "Deploy to production". Avoid titles such as "Overview" or "Details".',
            'Write field names, file names, and error codes in backticks, such as `deployTarget`: in a topic with more than one section, search treats each one as a keyword.',
            'Other words in the summary and body match too, but rank below titles and identifiers. The summary shows under each hit, so make it answer the query.',
          ],
        },
      ],
    },
    {
      id: 'test-with-search',
      title: 'Test with search',
      content: [
        {
          type: 'prose',
          text: 'Test a doc the way a new reader finds it: search for the question, and check that the first hit answers it. Quote a query of more than one word.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command search "place a doc" --type doc}',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'This query returns the section of these guides that shows how to place a doc.',
            'Run the same search in an app that installs your package; see {@link generic:test-in-an-app}.',
          ],
        },
      ],
    },
  ],
};
