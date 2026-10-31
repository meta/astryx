// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs cli/experimental/render-pages`: turn a page into one
 * self-contained HTML file to share or embed, and turn that file back into
 * the page.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'render-pages',
  placement: {parent: 'namespace:experimental', slot: 'guides', order: 20},
  stability: 'experimental',
  title: 'Pages as one HTML file',
  category: 'guide',
  keywords: [
    'render',
    'static html',
    'single file',
    'artifact',
    'share a page',
    'snapshot',
    'embed',
    'sandboxed iframe',
    'reverse',
  ],
  description:
    'Experimental. Render a page to one self-contained HTML file for sharing or embedding, and get the page back from it.',
  sections: [
    {
      id: 'experimental',
      title: 'Experimental',
      content: [
        {
          type: 'prose',
          text: 'This command is experimental, as everything under `astryx docs cli/experimental` is: its options, its output file and its JSON may still change. Nothing else in the CLI changes because it exists.',
        },
      ],
    },
    {
      id: 'make-a-file',
      title: 'Make a file to share',
      content: [
        {
          type: 'prose',
          text: 'Build the page with Astryx components as usual, then render it. The page module needs a default export; it renders on your machine with the React and Astryx packages your project installed.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: 'astryx experimental render src/app/page.tsx --out page.html',
        },
        {
          type: 'prose',
          text: 'The result is ONE file with nothing beside it: the markup, only the CSS rules the page uses (from Core and from any stylesheet it imports, such as a theme), the page\u2019s own StyleX styles, and local images as data: URIs. It runs no script and loads nothing from the network, so it opens from disk, attaches to a message, and displays inside a sandboxed frame that blocks network and script. Colors follow the viewer\u2019s light or dark setting, and a `data-theme` of `light` or `dark` on the root element picks one. The file also carries the source of the page and of every local module, stylesheet, JSON file and image it imports, so whoever you share it with can read that code; keep secrets out of what the page imports.',
        },
        {
          type: 'prose',
          text: 'What it cannot keep: anything that needs a browser while running. State, effects, click handlers and data loaded after the first paint are gone, and a chart sized by its container is empty, so give charts a fixed size. Read browser-only values such as window inside an effect, or the render stops with ERR_RENDER_BROWSER_API.',
        },
      ],
    },
    {
      id: 'warnings',
      title: 'Read the warnings',
      content: [
        {
          type: 'prose',
          text: 'Each warning names something that may look different from what you meant, and what to change. The most common is a component that ignores its children: `<ListItem>Save</ListItem>` renders an empty row because ListItem takes `label="Save"`. Others flag remote images (a sandboxed viewer cannot load them; save the image next to the page and import it), a `<script>`, `<link>` or `<iframe>` the page itself renders (the file promises to run and load nothing, so remove them), missing images, and output the page printed while rendering.',
        },
      ],
    },
    {
      id: 'get-it-back',
      title: 'Get the page back',
      content: [
        {
          type: 'code',
          lang: 'bash',
          code: 'astryx experimental render --reverse page.html --out page.tsx',
        },
        {
          type: 'prose',
          text: 'Every rendered file carries its source, so this writes the page back byte for byte; edit it and render again. A file whose source block was removed but whose markup came from Astryx components is rebuilt from that markup instead: the components, their recorded props and the text come back, while styling, icons and behavior do not, so treat it as a starting point. HTML that was never an Astryx page is refused with ERR_RENDER_NOT_ASTRYX; describe the page to `astryx build` to start one.',
        },
        {
          type: 'prose',
          text: 'It writes the page, the modules, stylesheets and JSON files the page reaches through its own imports, and the images, fonts and media the render carried (however the page named them, as long as their bytes really are one): each goes where the page\'s relative imports find it from wherever you put the page, and a file the page imports through a path alias (`@/components/Header`) goes where your project\'s `tsconfig.json` or `jsconfig.json` alias points. Every file but the page goes inside the one new folder the restore creates (the topmost folder on the page\'s path that does not exist yet), never into a folder that already exists: a page that imports other files comes back into a new folder (`--out restored/app/page.tsx`), and a file it imports through a path alias comes back only when that alias points inside the new folder. Nor does it write a file that a test, story or benchmark runner would run by its default patterns (Jest, Vitest, Bun, AVA, Playwright, Storybook, Cypress and `node --test`: names such as `*.test.*`, `*.spec.*`, `*_test.*`, `*-test.*`, `*.bench.*`, `*.stories.*`, `*.cy.*`, and anything under `test/`, `tests/` or `__tests__/`), judged from the repository root (every folder above the file up to it), else the topmost folder with a package.json. Restored files are the sender\'s code: read them before you run or import them. Without `--out`, everything comes back into a new folder beside the HTML file, named after it (`page.html` comes back into `page-restored/`). A received file that carries anything else (a file the page never imports, a dotfile, `package.json`, a tool configuration, a path that leaves the folder) is refused with nothing written. An existing file is never replaced unless you pass `--overwrite`, and the refusal names every one; a generated, vendored or ignored file, and any path through a symbolic link, is not written even then. Add `--json` for the result as data: what was written, how big it is, and every warning.',
        },
      ],
    },
  ],
};
