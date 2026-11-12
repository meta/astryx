// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  name: 'print',
  title: 'Print and PDF',
  category: 'guide',
  description:
    'Make a page that prints, or saves as PDF from the browser, on Letter or A4: page size and margins, what does not print, page breaks in tables, and dark themes on paper.',

  sections: [
    {
      id: 'overview',
      title: 'Overview',
      content: [
        {
          type: 'prose',
          text: 'Astryx components print with their screen styles. Astryx has no print stylesheet, so a page prints well when it is built for paper: it sets its page size, hides what only works on screen, lets its content flow onto as many pages as it needs, and puts no meaning in a background fill. The `printable-estimate` template does all of this. Start a document page from it, and read the sections below when you change it.',
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Start from the document template',
          code: '{@command template printable-estimate src/app/estimate/page.tsx}',
        },
        {
          type: 'prose',
          text: '"Save as PDF" in the browser print dialog makes the PDF, so a print button is one call: `window.print()`. To make PDFs on a server, load the same page in headless Chromium and print it with the CSS page size (in Playwright, `page.pdf({preferCSSPageSize: true})`).',
        },
      ],
    },
    {
      id: 'page-size',
      title: 'Page size and margins',
      content: [
        {
          type: 'prose',
          text: 'Set the paper size and margins with an `@page` rule. `@page` and `@media print` are not style props, so put them in a stylesheet, or in a `<style>` element in the page as the template does; neither needs a CSS compiler. When the app offers a paper-size choice, write the chosen size into the rule.',
        },
        {
          type: 'code',
          lang: 'css',
          label: 'Letter with 0.6 in margins',
          code: '@page {\n  size: letter; /* or A4 */\n  margin: 0.6in;\n}',
        },
        {
          type: 'prose',
          text: 'To show the page on screen as it prints, give the sheet the paper width (`8.5in` for Letter, `210mm` for A4) and padding equal to the `@page` margin. Lines then wrap at the same place on screen and on paper. In print, remove that padding and the sheet frame: the `@page` margin takes their place.',
        },
      ],
    },
    {
      id: 'what-does-not-print',
      title: 'What does not print',
      content: [
        {
          type: 'prose',
          text: 'Browsers leave out background colors and images when they print, unless the reader turns on background graphics in the print dialog. Borders and text print. In Astryx, these parts draw with a fill, so they disappear or lose contrast on paper:',
        },
        {
          type: 'table',
          headers: ['Part', 'On paper', 'Instead'],
          rows: [
            [
              'Badge',
              'The pill is gone, and its text can be too pale to read.',
              'Write the status as text, such as "Status: Paid".',
            ],
            [
              'Button, SegmentedControl, tabs',
              'Only the label prints.',
              'Hide controls in print (next section).',
            ],
            [
              'Card, muted surfaces, striped rows',
              'The fill is gone; the content stays.',
              'Separate content with spacing or borders.',
            ],
            [
              'Divider',
              'The line is gone.',
              'Add `print-color-adjust: exact` to the separator in print.',
            ],
          ],
        },
        {
          type: 'code',
          lang: 'css',
          label: 'Print the color of separators exactly',
          code: "@media print {\n  .document [role='separator'] {\n    print-color-adjust: exact;\n    -webkit-print-color-adjust: exact;\n  }\n}",
        },
        {
          type: 'prose',
          text: 'Table row and column dividers are borders, so they print as they are.',
        },
      ],
    },
    {
      id: 'screen-only',
      title: 'Hide what only works on screen',
      content: [
        {
          type: 'prose',
          text: 'Buttons, tabs, menus, back links and toolbars do nothing on paper. Put them in one screen-only region and hide it in print. A print button belongs there too.',
        },
        {
          type: 'code',
          lang: 'css',
          label: 'Hide the toolbar in print',
          code: '@media print {\n  .document-toolbar {\n    display: none;\n  }\n}',
        },
      ],
    },
    {
      id: 'let-content-flow',
      title: 'Let the content flow',
      content: [
        {
          type: 'prose',
          text: 'Print splits the document into pages, but it does not split the inside of a scroll container. Content in a fixed-height region that scrolls is cut off at the region\'s edge. An app frame such as `Layout` with `height="fill"` is one: its content area scrolls, so a long page prints only what fits. Render a document page in normal flow, without a fixed-height frame, as the template does.',
        },
      ],
    },
    {
      id: 'page-breaks',
      title: 'Page breaks in tables',
      content: [
        {
          type: 'prose',
          text: '`Table` renders a native table, and browsers repeat its header row at the top of every printed page. They repeat a `TableFooter` row at the bottom of every page too, so put totals below the table, not in its footer.',
        },
        {
          type: 'prose',
          text: 'Keep a row, and blocks such as totals or a signature area, on one page with `break-inside: avoid`. Keep a heading with what follows it with `break-after: avoid`.',
        },
        {
          type: 'code',
          lang: 'css',
          label: 'Page-break rules for a document',
          code: '@media print {\n  .document tr,\n  .document-keep-together {\n    break-inside: avoid;\n  }\n  .document h1,\n  .document h2 {\n    break-after: avoid;\n  }\n}',
        },
        {
          type: 'list',
          style: 'do',
          items: [
            "Give number columns a fixed width and `align: 'end'`, so the figures line up on every page and the header aligns with them.",
            'Format money and quantities with `Intl.NumberFormat`, and use `hasTabularNumbers` on `Text`, so digits line up.',
          ],
        },
        {
          type: 'list',
          style: 'dont',
          items: [
            'Put totals in `TableFooter`: they print at the bottom of every page.',
            'Use table virtualization or pagination for a printed table: print shows only the rows that are rendered.',
          ],
        },
      ],
    },
    {
      id: 'dark-themes',
      title: 'Dark themes on paper',
      content: [
        {
          type: 'prose',
          text: 'Paper is white, and the dark background does not print, so a dark theme prints pale text on white. Astryx colors follow the color scheme, so set `color-scheme: light` on the document in print. The page then prints with the light colors of the same theme.',
        },
        {
          type: 'code',
          lang: 'css',
          label: 'Print with the light colors',
          code: '@media print {\n  .document {\n    color-scheme: light;\n  }\n}',
        },
      ],
    },
  ],
};
