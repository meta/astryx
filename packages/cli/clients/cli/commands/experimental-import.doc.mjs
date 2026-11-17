// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx experimental import`. The terminal binding of
 * the `render()` function with `reverse` (referenced via `fn`).
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental import',
  displayName: 'astryx experimental import',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    'Turn an HTML file that experimental export wrote back into its page',
  description:
    "Turns ONE HTML file that `astryx experimental export` wrote back into the page's source. It writes the embedded source back byte for byte: the page and the local modules, stylesheets, JSON files and images it imports, into a new folder beside the file (`page-restored/`, then `page-restored-2/` when that folder exists). It names any text someone changed in the HTML after the export, with the file and line that hold the old text, and it says which CLI version and packages exported the file. A file with Astryx markup but no embedded source is rebuilt from its components (text and layout only, as a starting point); any other HTML is refused. It writes only inside the folder it runs from. Experimental: it may change or be removed in a patch release.",
  fn: 'render',
  args: [{name: 'file', param: 'file', required: false}],
  options: [
    {
      flag: '--out <file>',
      param: 'options.out',
      description:
        'Where to write the page module (default: page.html comes back into a new folder page-restored/); it stays inside the current folder',
    },
    {
      flag: '--overwrite',
      param: 'options.overwrite',
      description:
        'Replace the page module if it already exists (never a protected file; the files it imports always go into a new folder)',
    },
  ],
  examples: [
    {
      label: 'Turn a file back into its page',
      cli: 'astryx experimental import page.html --out page.tsx',
    },
    {label: 'As JSON', cli: 'astryx --json experimental import page.html'},
  ],
  outsideProject: 'same',
  requires: ['render.reverse'],
  exitCodes: [
    {code: 0, when: 'the page was written'},
    {
      code: 1,
      when: 'no file, a wrong extension, a missing file, any file to write outside the current folder, an existing output without --overwrite, a damaged embedded source, a file in a newer render format than this CLI reads, or HTML that is not an Astryx page',
    },
  ],
  related: ['experimental export'],
};
