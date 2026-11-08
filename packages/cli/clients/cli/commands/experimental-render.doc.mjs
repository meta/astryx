// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx experimental render`. The terminal binding of
 * the `render()` function (referenced via `fn`).
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental render',
  displayName: 'astryx experimental render',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    'Render a page to one self-contained HTML file, or turn one back into a page',
  description:
    "Renders the page's default export with the project's own Astryx components and writes ONE static HTML file that needs nothing beside it: no script runs and nothing loads from the network, so it opens anywhere, including a sandboxed frame with a strict content security policy, and follows the viewer's light or dark scheme. The page's own StyleX compiles, only the Core CSS rules the page uses are inlined, local images become data: URIs, and the page's source is embedded. Warnings name anything that may not look as meant, such as a component that did not render the text it was given (ListItem takes label=, not children). --reverse writes the embedded source back byte for byte; a file with Astryx markup but no embedded source is rebuilt from its components (text and layout only, as a starting point); any other HTML is refused. Experimental: it may change or be removed in a patch release.",
  fn: 'render',
  args: [{name: 'file', param: 'file', required: false}],
  options: [
    {
      flag: '--out <file>',
      param: 'options.out',
      description:
        "Where to write: an .html file, or with --reverse a page module (default: page.tsx gives page.html beside it; with --reverse, page.html comes back into a new folder page-restored/)",
    },
    {
      flag: '--reverse',
      param: 'options.reverse',
      description: 'Turn a rendered HTML file back into a page module',
    },
    {
      flag: '--title <text>',
      param: 'options.title',
      description:
        "The page's title (default: its first top-level heading, else the file name)",
    },
    {
      flag: '--overwrite',
      param: 'options.overwrite',
      description: 'With --reverse, replace the page module if it already exists (never a protected file; the files it imports always go into a new folder)',
    },
  ],
  examples: [
    {label: 'Render a page', cli: 'astryx experimental render src/app/page.tsx --out page.html'},
    {label: 'Give it back', cli: 'astryx experimental render --reverse page.html --out page.tsx'},
    {label: 'As JSON', cli: 'astryx --json experimental render page.tsx'},
  ],
  outsideProject: 'same',
  exitCodes: [
    {code: 0, when: 'the file was written (warnings included)'},
    {
      code: 1,
      when: 'no file, a wrong extension, a missing file, a page that does not compile, has no default export, imports a package that is not installed, reads a browser API while rendering, throws, or takes over 60 seconds; a file to write outside the current folder; with --reverse, an existing output without --overwrite, a damaged embedded source, or HTML that is not an Astryx page',
    },
  ],
  related: ['template', 'build'],
};
