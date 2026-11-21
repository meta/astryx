// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'PageControl',
  displayName: 'Page Control',
  category: 'Navigation',
  keywords: [
    'page control',
    'page indicator',
    'pager dots',
    'dots',
    'carousel dots',
    'onboarding',
    'paging',
  ],
  description:
    'A row of page indicators under a paging view, as on iOS: one dot per page, the current one highlighted. A tap or a click to either side of the current dot moves one page that way, and sliding a finger or dragging the mouse across the dots scrubs straight to the page under it. Under a finger (any touch device, iOS and Android alike), with more than ten pages the row is a window whose edge dots shrink to show there is more, and a held finger shows a platter behind the dots; with a mouse a long row is cropped to the control. Experimental: lands in lab first.',
  props: [
    {
      name: 'totalPages',
      type: 'number',
      description: 'Number of pages.',
      required: true,
    },
    {
      name: 'page',
      type: 'number',
      description: 'Current page number (1-based). Page 1 is the first page.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(page: number) => void',
      description:
        'Called with the page, 1-based, that a tap, a click, a scrub, an arrow key, Home, End or an assistive technology asks for; a scrub calls it each time the page under the pointer changes, so a quick sweep can skip a page. Update the paging view and page together.',
      required: true,
    },
    {
      name: 'label',
      type: 'string',
      description:
        'Names the control for assistive technology. Defaults to "Page indicators", localized.',
    },
    {
      name: 'hidesForSinglePage',
      type: 'boolean',
      description: 'Render nothing when there is only one page.',
      default: 'false',
    },
  ],
  usage: {
    description:
      'Use PageControl below a paging view, such as a Carousel with `hasSnap` or onboarding screens, to show how many pages there are and which one is showing. Keep its page in step with the view in both directions.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pair it with a view that pages by swipe: the control is a secondary way to move and the main way to see where you are.',
      },
      {
        guidance: true,
        description:
          'Keep pages few enough to count at a glance; past ten the row stays a fixed width, shows a window of them and scrolls as the page changes.',
      },
      {
        guidance: false,
        description:
          "Don't use it for long lists of results (use Pagination) or for choosing between views (use SegmentedControl or TabList).",
      },
    ],
  },
};
