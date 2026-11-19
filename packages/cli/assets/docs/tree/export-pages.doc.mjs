// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs cli/experimental/export-pages`: turn a page into one
 * self-contained HTML file to share or embed, and turn that file back into
 * the page.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'export-pages',
  placement: {parent: 'namespace:experimental', slot: 'guides', order: 20},
  stability: 'experimental',
  title: 'Pages as one HTML file',
  category: 'guide',
  keywords: [
    'render',
    'export',
    'static html',
    'single file',
    'artifact',
    'share a page',
    'snapshot',
    'embed',
    'sandboxed iframe',
    'reverse',
    'unrender',
    'version',
    'hand edits',
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
          text: 'Build the page with Astryx components as usual, then render it. A page that uses no Astryx components or styles (its modules import nothing from an Astryx package, directly, through a local component or a re-export, or lazily, and it imports no Astryx stylesheet) is refused with `ERR_RENDER_NOT_ASTRYX` and nothing is written: don\u2019t add Astryx to such an app to export it; share the page with the app\u2019s own build instead (for a Vite app, a single-file build). The page module needs a default export; it renders on your machine with the React and Astryx packages your project installed. Outside a project (no Astryx Core or CLI installed or declared for the folder), it renders with the Astryx, React and StyleX that the CLI itself runs with, so a single page file renders anywhere, a React app included. A tool that runs the CLI for you through its host entry can also list packages in the `package.json` beside that CLI, such as the icon library that templates import. A page outside a project uses the packages listed there under `dependencies` or `optionalDependencies` too, and `template` does not ask you to install them.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: 'astryx experimental export src/app/page.tsx --out page.html',
        },
        {
          type: 'prose',
          text: 'The result is ONE file with nothing beside it: the markup, the CSS rules the page can use (from Core and from any stylesheet it imports, such as a theme), the page\u2019s own StyleX styles, local images as data: URIs, and the page\u2019s own script (see The page\u2019s script). An image named from the site\u2019s root (`/pics/shoe.png`) comes from the site\u2019s `public/` folder, and `--reverse` puts it back there. That folder is the project\u2019s `public/`; when the project has none, it is the nearest `public/` above the page, inside the project (or, outside a project, inside the folder you run the command from). For `experimental import`, it also carries every image, font or media file (up to 8 MB each) that a carried module or stylesheet names by a relative path inside the folder that holds the carried files, also when the page does not show it. It loads nothing from the network, so it opens from disk, attaches to a message, and displays inside a sandboxed frame that blocks the network; a frame that also blocks scripts shows the rendered markup. An image the page names by an `https` address comes along too (see Images from the web). Colors follow the viewer\u2019s light or dark setting, and a `data-theme` of `light` or `dark` on the root element picks one. The file also carries the source of the page and of every local module, stylesheet, JSON file and image it imports, so whoever you share it with can read that code; keep secrets out of what the page imports.',
        },
        {
          type: 'prose',
          text: "What the markup cannot keep: anything that needs a browser while running. State, effects, click handlers and data loaded after the first paint come from the page\u2019s script once it runs (see The page\u2019s script), so a viewer that blocks scripts shows none of them. Charts made with recharts are the exception: the render draws each chart and ResponsiveContainer a module of the page (not an installed package) imports from recharts by name (`import {LineChart} from 'recharts'`), inside the page, so a custom tick, label or shape sees the page's React context. A chart sized by its container is drawn at a set of widths, and the file shows the drawing nearest the width the reader's browser gives it, with no script. The widths run from 60 pixels (a sparkline in a narrow table cell) to 1920 (a chart across a wide screen), each the square root of two times the one before, so the drawing shown scales by at most the fourth root of two (about 1.19) either way. The chart keeps the height the page gives it (a number, the width over `aspect`, or its share of the height that the box it fills states in its own style) and fits that box whole, so its text stays within a fifth of its own size. A box whose height comes from a stylesheet gives no height the render can read: the chart is drawn 300 pixels high and fits inside the box, scaled down in a shorter box (its text shrinks with it) and with empty space above and below in a taller one. Each such chart carries eleven drawings, so it takes several times the room in the file that one drawing takes. A legend keeps the place its props give it, in a chart of either kind. Charts show the data and props of the page's first render, before its effects run: when the page cannot be drawn again without a browser, or its effects change its charts or re-render the component that makes them, each chart is drawn by itself and its parts see React context defaults. A value a chart's parts read from a React context that an effect changes may still show its later value. A `chart-size` warning counts the charts the render cannot draw (one used through `import * as R`, say), and says when charts were drawn by themselves. It also counts SVG drawings that scale to their box with text that would show under 10 px on a 375 px phone. Read browser-only values such as window inside an effect, or the render stops with ERR_RENDER_BROWSER_API.",
        },
      ],
    },
    {
      id: 'warnings',
      title: 'Read the warnings',
      content: [
        {
          type: 'prose',
          text: 'Each warning names something that may look different from what you meant, and what to change. The most common is a component that ignores its children: `<ListItem>Save</ListItem>` renders an empty row because ListItem takes `label="Save"`. An `unknown-prop-value` warning names a value a Core component\u2019s prop does not have, with the file and line: `<Button variant="danger">` draws no variant\u2019s look, because Button\u2019s variants are primary, secondary, ghost and destructive. Values your themes add to a prop, such as a theme\u2019s own Button variant, count as values it has. Others flag a remote image the render could not fetch, and why (a sandboxed viewer cannot load it; save the image next to the page and import it), a `<script>`, `<link>` or `<iframe>` the page itself renders (the file promises to run and load nothing, so remove them), missing images, and output the page printed while rendering. A `screen-query` warning names each media query the page asks in JavaScript (Core\'s `useMediaQuery`, or `matchMedia`): the file runs no script, so readers on every screen get the answer the page got on the server. Fold such a layout with CSS instead: `Grid` with `columns={{minWidth}}`, or a StyleX `@media` or `@container` style. A `node-crash` warning names a Node build that crashes in `Intl.Segmenter` (its version and path). The page rendered without it, so the output may differ slightly: initials and character counts (such as Avatar initials) can split a joined emoji, a flag, or a letter written with a separate accent mark. Names in ordinary composed letters (`José`, `Zoë`, `李小龙`) come out the same. Render with an official Node.js build to remove the difference.',
        },
      ],
    },
    {
      id: 'remote-images',
      title: 'Images from the web',
      content: [
        {
          type: 'prose',
          text: 'An image the page names by an `https` address (an `<img>`\u2019s or an `<input>`\u2019s `src`, an `<img>`\u2019s or a `<source>`\u2019s `srcset`, a `<video>`\u2019s `poster`, or a CSS `url()`) is fetched once while the page renders, and the file carries it as a data: URI, so it shows in a viewer that blocks the network. The same goes for an image the page shows only later (after a click, in the next view), when the page\u2019s own code writes its address whole: an address an element shows as an image (the same `src`, `srcSet` and `poster`), written there or in a variable the same file reads there (`<img src={logoUrl}>`); an address whose path ends in an image extension; or one a name says is an image: a component\u2019s or an object\u2019s `src`, `srcSet` or `poster`, or a property or attribute whose name names an image: one of the name\u2019s words is avatar, image, img, photo, picture, thumbnail, thumb, logo, icon, cover, banner, poster or background, singular or plural (`avatarUrl` and `cover_images` count; `logoutUrl` does not). An address written only where an element takes it for something else, such as an `<iframe>`\u2019s or a `<video>`\u2019s `src`, is not fetched, even when its path names an image, and the file puts no carried data in such an attribute. Nor is an address whose path names a type that is never an image (`clip.mp4`). The page\u2019s script keeps every address as the page wrote it, so a link, a text and the URL API read the page\u2019s own address. Where the browser takes an image\u2019s address (the same attributes, or a CSS `url()` in a style the script sets), the file gives it the carried data instead. An address the code gives a fragment gets the carried image too; one it gives another query (`${hero}?w=640`, or the URL API\u2019s `searchParams`) can name another image, so the file asks the network for it. A link\u2019s address written in `href`, directly or through a variable that only links read, is never fetched, even when it names an image file. An address that counts only by a name (`imageUploadUrl`, an object\u2019s `src`) can be an API\u2019s or a player\u2019s: when its answer is another type (an API\u2019s JSON, a page), the result lists it with why, and the fetch adds no warning. Any other address the script draws later warns when its fetch fails, as in the first paint. No other address is fetched. An image address the code builds from parts where a whole one would count (a template or `+` chain that starts with `https://`, such as `https://cdn.example.com/${id}.png` in an `<img>`\u2019s `src`) cannot be carried: a warning names it, its file and its line. An address built any other way, such as from a variable that holds the host, is neither carried nor warned. The render sends no cookies or credentials with the request, takes only an image (by its type and its bytes) up to 8 MB, and gives each image 2 seconds to answer and 5 to arrive, and all of them 15. When the network answers none of the first images the render asks for, it asks for no more, so a machine with no network loses about 2 seconds. When a fetch fails (no network, no answer in time, not an image, too large, or an address that is not `https`), the page keeps the address and the render warns, naming why, except for an address that counts only by a name, as above. The JSON result lists every address fetched (`remoteImages.fetched`) and every one that was not, with why (`remoteImages.failed`); the text names the first ten of each and counts the rest. The page\u2019s source keeps the addresses, so `--reverse` gives back the page as written, and a render later fetches the images again.',
        },
        {
          type: 'prose',
          text: 'An image the file carries travels with it: anyone who has the file can see it, also after the address stops working or changes. Keep images that are not for everyone out of a page you share.',
        },
      ],
    },
    {
      id: 'interactive',
      title: 'The page\u2019s script',
      content: [
        {
          type: 'prose',
          text: 'The file carries the page\u2019s own script: the page\u2019s modules and the packages they use, bundled for the browser, inline after the embedded source. The file paints the rendered markup first; then the script draws the live page over it, so state, effects, click handlers, popovers, menus, dialogs, tabs and forms work as in the app, and a layout the page picks with `useMediaQuery` fits the reader\u2019s screen once the script runs. The render adds no network request and no `eval`, so the file works in a sandboxed viewer frame that allows scripts, under a content security policy that allows inline scripts. A link out of the file opens in a new tab, since a viewer\u2019s frame cannot follow it. A form submits through its submit event, which the file fires itself: a viewer\u2019s frame may block form submission, and a file has no server to send a form to. React and the page\u2019s modules add about 0.4 to 1 MB to a page, and up to 2 MB to a page with charts. The note at the file\u2019s top says it runs a script.',
        },
        {
          type: 'prose',
          text: 'esbuild builds the script. It is a dependency of the CLI that only this command loads, so no other command starts slower for it. A page whose script cannot be built for the browser (it imports `fs` or `path`, say) stops with ERR_RENDER_SCRIPT, which names the module, and nothing is written. A sandboxed frame can still block what the page itself does on load or on a click, such as a remote image, storage (`localStorage`, `sessionStorage`, cookies), an `alert()`, or moving focus before the reader acts. When the page\u2019s script throws, in its render or in an effect (a cookie write in a frame that blocks cookies, say), the file keeps showing its first paint. Storage works there in memory, so a page that saves to it keeps working.',
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
          code: 'astryx experimental import page.html --out page.tsx',
        },
        {
          type: 'prose',
          text: 'This is the way back (unrender). Every rendered file carries its source, so this writes the page back byte for byte; edit it and render again. A file whose source block was removed but whose markup came from Astryx components is rebuilt from that markup instead: the components, their recorded props and the text come back, while styling, icons and behavior do not, so treat it as a starting point. HTML that was never an Astryx page is refused with ERR_RENDER_NOT_ASTRYX; describe the page to `astryx build` to start one.',
        },
        {
          type: 'prose',
          text: "It writes the page, the modules, stylesheets and JSON files the page reaches through its own imports, and the images, fonts and media the render carried (however the page named them, as long as their bytes really are one): each goes where the page's relative imports find it from wherever you put the page, and a file the page imports through a path alias (`@/components/Header`) goes where your project's `tsconfig.json` or `jsconfig.json` alias points. Every file but the page goes inside the one new folder the restore creates (the topmost folder on the page's path that does not exist yet), never into a folder that already exists: a page that imports other files comes back into a new folder (`--out restored/app/page.tsx`), and a file it imports through a path alias comes back where that alias points only when that place is inside the new folder. When your alias points at a file you already have, the page uses that file if it, and every file it imports, is byte for byte the page's copy (`aliased.sameAsProject`); otherwise the page's copy comes back in its own layout inside the new folder, and the result names the file your alias reaches today (`aliased.differs`). The `paths` entries it gives apply to your whole project, so it also names the narrower fix: the relative import each restored file can use instead (`instead`). Where no alias of yours names such an import, the file also comes back in the page's own layout inside the new folder, and the result (`aliased`) names each such import, the whole `paths` the page needs to build (the entries your config has now, with the new ones), and the tsconfig.json or jsconfig.json they belong in. Only an import that cannot be a package name or a package's own subpath import is followed this way (`@/…`, `~/…`), so a received file can never remap a package or your own imports. Nor does it write a file that a test, story or benchmark runner would run by its default patterns (Jest, Vitest, Bun, AVA, Playwright, Storybook, Cypress and `node --test`: names such as `*.test.*`, `*.spec.*`, `*_test.*`, `*-test.*`, `*.bench.*`, `*.stories.*`, `*.cy.*`, and anything under `test/`, `tests/` or `__tests__/`), judged from the repository root (every folder above the file up to it), else the topmost folder with a package.json. Restored files are the sender's code: read them before you run or import them. Without `--out`, everything comes back into a new folder beside the HTML file, named after it (`page.html` comes back into `page-restored/`). A received file that carries anything else (a file the page never imports, a dotfile, `package.json`, a tool configuration, a path that leaves the folder) is refused with nothing written. A rendered file that lost its embedded source on the way (a sanitizer or an editor strips `<script>` blocks) and has no Astryx components to rebuild from is refused with `ERR_RENDER_SOURCE_DAMAGED`, as is a rendered file cut short before its embedded source, and a file a merge left with conflict markers (keep the whole file from one side, or render the merged page again). An existing file is never replaced unless you pass `--overwrite`, and the refusal names every one; a generated, vendored or ignored file, and any path through a symbolic link, is not written even then. Add `--json` for the result as data: what was written, how big it is, and every warning.",
        },
      ],
    },
    {
      id: 'file-notes',
      title: 'What the file says about itself',
      content: [
        {
          type: 'prose',
          text: 'A rendered file explains itself to whoever opens it next, a person or an agent with no other context. A plain note at its top names the CLI version and render format that made it, the page\u2019s path in its project, the files it carries, and the packages it rendered with and their versions. It then gives the exact commands, pinned to that CLI version with `npx @astryxdesign/cli@<version>`, that get the source back, and the one that renders the restored page over the same file again. A short note after the embedded source repeats the first command for a reader who starts at the end. The embedded source records the same facts as JSON.',
        },
        {
          type: 'prose',
          text: 'Change a page through its source, not through the HTML: the carried source never sees edits made to the markup. A render replaces an HTML file only when a render wrote it, so rendering the restored page with `--out` over the old file is safe.',
        },
      ],
    },
    {
      id: 'changed-after-render',
      title: 'Edits made to the HTML',
      content: [
        {
          type: 'prose',
          text: 'The embedded source also keeps checksums of the markup and the styles, the text of the markup and the title, as rendered. When someone edits the HTML after the render, `experimental import` still writes the page as rendered, and the result says `edited: true` and lists each run of text that changed, the title first: what it was, what it is now, and the restored file and line that hold the old text when it appears there once. `stylesEdited: true` says the styles changed. Make the same changes in the restored files, then render again. A change to attributes, elements or formatting alone shows as `edited: true` with no text changes.',
        },
      ],
    },
    {
      id: 'versions',
      title: 'Across CLI versions',
      content: [
        {
          type: 'prose',
          text: 'The embedded source carries a render format number. Every CLI reads each format up to its own, and a new optional field never changes the number, so an older CLI keeps reading files a newer one writes. A file that carries a kind of file an older CLI does not take (an `.mts`, `.cts` or `.cjs` module, or a module or JSON file named like configuration, such as `config.ts` or `data/config.json`) says format 2. A file whose modules import a TypeScript file by its JavaScript name through a relative import (`./fmt.js` for `fmt.ts`), which older CLIs cannot follow, says format 3. Every other file says format 1. A file in a newer format than the running CLI reads is refused with `ERR_RENDER_NEWER_FORMAT`, and the message names the CLI version that wrote it, which reads it. A file from an older CLI carries no note, but its `generator` meta names the version that wrote it, and `experimental import` reports that version as `renderedBy`.',
        },
        {
          type: 'prose',
          text: 'The note names the Core version the page was written for. To bring restored code to a project on a newer Core, run that project\u2019s own upgrade over the restored folder: `astryx upgrade --from <that version> --path <restored folder> --apply`.',
        },
      ],
    },
  ],
};
