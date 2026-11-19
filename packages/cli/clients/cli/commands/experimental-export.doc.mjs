// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx experimental export`. The terminal binding of
 * the `render()` function (referenced via `fn`).
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental export',
  displayName: 'astryx experimental export',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    'Export a page built with Astryx components as one self-contained HTML file, or turn one back into a page',
  description:
    "Renders the page's default export with the project's own Astryx components and writes ONE HTML file that is the page as a live app and needs nothing beside it: the markup, the CSS rules the page can use, the page's own StyleX, its local images as data: URIs, its source, and its own script, built by esbuild (a dependency of the CLI that only this command loads). The file paints the rendered markup first; then the script draws the live page over it, so popovers, menus, dialogs, tabs, forms and every other control work as in the app. An image the page names by an https address is fetched once while the page renders, and the file carries it; the result lists each address fetched and each one not fetched, with why. The file loads nothing from the network and the render adds no eval, so it opens anywhere, including a sandboxed frame that allows scripts under a strict content security policy, and it follows the viewer's light or dark scheme. A page whose script cannot be built for the browser (a module it loads needs Node, say) is refused, and the error names the module. A page that uses no Astryx components or styles is refused with ERR_RENDER_NOT_ASTRYX, and nothing is written: don't add Astryx to such an app to export it; share the page with the app's own build instead. Warnings name anything that may not look as meant, such as a component that did not render the text it was given (ListItem takes label=, not children). The file opens with a plain note for whoever opens it next: the CLI version and render format that made it, the page's path, the files it carries, the packages it rendered with, and the exact commands that give the page back and render it again. To make a page to share, follow `astryx docs cli/experimental/share-a-page` first: it lists the layouts that go wrong on a phone. The way back is `astryx experimental import <file.html>` (`--reverse` here does the same): it writes the embedded source back byte for byte and names any text someone changed in the HTML after the render, with the file and line that hold the old text; a file with Astryx markup but no embedded source is rebuilt from its components (text and layout only, as a starting point); any other HTML is refused. Experimental: it may change or be removed in a patch release.",
  fn: 'render',
  args: [{name: 'file', param: 'file', required: false}],
  options: [
    {
      flag: '--out <file>',
      param: 'options.out',
      description:
        'Where to write: an .html file, or with --reverse a page module (default: page.tsx gives page.html beside it; with --reverse, page.html comes back into a new folder page-restored/). A relative path stays inside the current folder; when rendering, an absolute path may name any folder, and the render still never replaces a file it did not write',
    },
    {
      flag: '--reverse',
      requires: ['render.reverse'],
      param: 'options.reverse',
      description: 'Turn a rendered HTML file back into a page module, as experimental import does',
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
      description:
        'With --reverse, replace the page module if it already exists (never a protected file; the files it imports always go into a new folder)',
    },
  ],
  examples: [
    {
      label: 'Before you make a page to share, read what goes wrong on a phone',
      cli: 'astryx docs cli/experimental/share-a-page',
    },
    {
      label: 'Export a page',
      cli: 'astryx experimental export src/app/page.tsx --out page.html',
    },
    {
      label: 'Give it back',
      cli: 'astryx experimental import page.html --out page.tsx',
    },
    {label: 'As JSON', cli: 'astryx --json experimental export page.tsx'},
  ],
  outsideProject: 'same',
  requires: ['render.page'],
  exitCodes: [
    {code: 0, when: 'the file was written (warnings included)'},
    {
      code: 1,
      when: 'no file, a wrong extension, a missing file, a page that does not compile, has no default export, imports a package that is not installed, reads a browser API while rendering, throws, crashes Node, or takes over 60 seconds, or has a script that cannot be built for the browser (a module that needs Node); a page that uses no Astryx components or styles; a relative --out, or with --reverse any file to write, outside the current folder; an absolute --out that is a symbolic link; with --reverse, an existing output without --overwrite, a damaged embedded source, a file in a newer render format than this CLI reads, or HTML that is not an Astryx page',
    },
  ],
  related: ['template', 'build'],
};
