// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `render()` / `astryx experimental export`.
 * @position packages/cli/api/render — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'render',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'render()',
  summary:
    'Render a page to one self-contained HTML file, or turn a rendered file back into a page.',
  description:
    "Renders the page module's default export on the server with the project's own React and Astryx components (outside a project, with the Astryx, React and StyleX the CLI runs with, and, when a tool runs the CLI through its host entry, the packages the `package.json` beside that CLI lists in `dependencies` or `optionalDependencies`), and writes ONE HTML file that is the page as a live app and needs nothing beside it: the page's own StyleX styles are compiled, Core's stylesheets are cut to the rules the page can use (layer order, custom properties and keyframes kept), local images become data: URIs, the page's source is embedded so it can be given back exactly, and the page's own script follows it inline: the page's modules and the packages they use, bundled for the browser by esbuild (a dependency of the CLI that only this function loads). The file paints its markup first, then the script draws the live page over it, so state, effects and event handlers work: popovers, menus, dialogs, tabs and forms behave as in the app. An image the page names by an `https` address is fetched once while the page renders, with no cookies or credentials, only when it is an image of up to 8 MB, within a time limit for each image and one for all of them, and the file carries it; any failure leaves the address and warns. It loads nothing from the network and the render adds no `eval`, so it works in a sandboxed frame that allows scripts under a policy that allows inline scripts, and its colors follow the viewer's light or dark scheme. A page whose script cannot be built for the browser (a module it loads needs Node, say) is refused. A page is refused with ERR_RENDER_COMPILE naming the file, the line, the module and the missing name, as a build refuses it, when it imports a name that one of its own modules, a StyleX variables module (`.stylex`) or an `@astryxdesign/*` package does not export, draws a member (`<Name.Member>`) such an export lacks, or imports any package subpath the package does not export (a named, default or side-effect import). A name another package does not export is refused only when the page's script is built: a page that draws or calls it as it renders fails with ERR_RENDER_FAILED first. Not checked: type imports, a name the page never uses as a value, a default import from a module that exists, a named import from one of the page's own CommonJS modules (a bundler reads those by interop), and a name the page imports through a TypeScript module that only re-exports it with a plain `export {…}` (such a page fails with ERR_RENDER_FAILED if it draws or calls the name as it renders). Warnings name anything that may differ from what the author meant, such as a component that did not render the text it was given. The file opens with a plain note for its next reader, a person or an agent: the CLI version and render format that made it, the page's path, the files it carries, the packages and versions it rendered with, and the exact commands that give the page back and render it again; the embedded source records the same facts and the markup as rendered. Each file the page uses that a render cannot carry is named on the note's 'Not carried' line and in `notCarried` (the JSON result and the text output), and its warning says why; the note then no longer says the page comes back exactly. A file left out because its name reads as a tool's configuration gets the `not-carried` warning, which says what carries it. With `reverse` (the way back, or unrender), it writes the embedded source back byte for byte, and only the files a render embeds: the page and the local modules, stylesheets, JSON files and images it imports, into a new folder; it also reports the render format, the CLI version and packages that rendered the file, and whether someone changed the markup after the render, naming each run of text that changed and where the old text sits in the restored source (the restored files stay the page as rendered); a file with Astryx markup but no embedded source is rebuilt from its component class names and data attributes (text and layout only); any other file is refused. Experimental: it may change or be removed in a patch release.",
  importPath: '@astryxdesign/cli/api/experimental',
  signature:
    'render(file: string, options?: RenderOptions): Promise<RenderPageResponse | RenderReverseResponse>',
  keywords: [
    'render',
    'static',
    'interactive',
    'hydrate',
    'html',
    'export',
    'artifact',
    'snapshot',
    'self-contained',
    'reverse',
    'unrender',
    'restore',
    'round trip',
  ],
  params: [
    {
      name: 'file',
      type: 'string',
      description:
        'The page module (.tsx, .jsx, .ts, .js or .mjs) with a default export, or with `reverse` the rendered .html file.',
    },
    {
      name: 'options.out',
      type: 'string',
      description:
        "The file to write. Rendering: an .html file (default: the page's name with .html); a relative path stays inside the current folder, and an absolute path may name any folder (a render never replaces a file it did not write). Reversing: a page module inside the current folder (default: inside a new folder beside the HTML file, named after it, such as `report-restored/`).",
    },
    {
      name: 'options.reverse',
      type: 'boolean',
      description: 'Turn a rendered HTML file back into a page module.',
      default: 'false',
    },
    {
      name: 'options.title',
      type: 'string',
      description:
        "The rendered page's title (default: its first top-level heading, else the file name). Rendering only.",
    },
    {
      name: 'options.overwrite',
      type: 'boolean',
      description:
        'Replace the existing page module when reversing (never a protected file, and never a file other than the page, which always goes into a new folder). Rendering replaces an existing HTML file only when a render wrote it.',
      default: 'false',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'Folder relative paths resolve from (default: the current directory).',
    },
  ],
  returns: [
    {
      type: 'render.page',
      description:
        "The page and the HTML file written, its size, the local modules embedded, the stylesheets inlined, the class and image counts, the CSS size, the script's size and how many modules it holds, the files it could not carry (`notCarried`, when there are any), the remote images fetched and not fetched (`remoteImages`, when the page names any), and any warnings.",
    },
    {
      type: 'render.reverse',
      description:
        "How the page came back (`embedded`, exact; or `rebuilt`, text and layout only), the files written; for an embedded page the path-alias imports no alias here names (`aliased`), the render format, the CLI version and packages that rendered it, and whether its markup changed after the render, with each text change; for a rebuilt page the components it uses and what could not be rebuilt.",
    },
  ],
  throws: [
    {code: 'ERR_MISSING_ARGUMENT', when: 'no file is given'},
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'the file or `out` has the wrong kind of extension, `out` is the input itself, `title` is given with `reverse`, or `overwrite` without it; with `reverse`, the page would land under a configuration name (`vite.config.ts`) or where a test, story or benchmark runner would run it (judged from the repository root)',
    },
    {code: 'ERR_FILE_NOT_FOUND', when: 'the file, or a local file the page imports, does not exist'},
    {code: 'ERR_READ_FAILED', when: 'the file is there but cannot be read: no read permission, a folder or a pipe given as the file, or another file-system error; the message names the reason'},
    {code: 'ERR_FILE_EXISTS', when: 'rendering would replace an existing file a render did not write, reversing would replace an existing file and `overwrite` is not set, or an existing file the project protects (generated, vendored or ignored) would be replaced, which `overwrite` never does'},
    {code: 'ERR_WRITE_FAILED', when: 'a file cannot be written, such as when `out` names a folder; with `reverse`, every file is written or none is'},
    {code: 'ERR_RENDER_COMPILE', when: 'the page does not compile, or a stylesheet it imports is not valid CSS (the message names the file)'},
    {code: 'ERR_RENDER_NO_DEFAULT_EXPORT', when: 'the page has no default export'},
    {code: 'ERR_RENDER_MISSING_DEPENDENCY', when: "the page imports a package that is not installed (the suggestion is one install line for every such package, in the project's package manager and with the CLI's version ranges (such as `recharts@\"^3.10.1\"`), and none when the project's lockfiles disagree, which the message then says; for a page in another package than the folder the render runs from, the message names that package and the line to run there; in a folder that no package.json holds, the message says to install them in the project that uses the page, with no install line), or the esbuild the CLI depends on is missing from its install"},
    {code: 'ERR_RENDER_SCRIPT', when: "the page's script cannot be built for the browser: a module it loads needs Node (`fs`, `path`), or cannot be found or compiled for the browser; the message names the module"},
    {code: 'ERR_VERSIONS_UNAVAILABLE', when: 'outside a project, the page imports an Astryx package, React or StyleX, and the Core of the release that answers cannot be downloaded'},
    {code: 'ERR_RENDER_BROWSER_API', when: 'the page reads a browser-only API, such as window or document, while rendering'},
    {code: 'ERR_RENDER_ASSET_TOO_LARGE', when: 'a local file the page uses is over 8 MB'},
    {code: 'ERR_RENDER_TIMEOUT', when: 'the page does not finish rendering within 60 seconds'},
    {code: 'ERR_RENDER_FAILED', when: 'the page throws while rendering for any other reason, or Node itself crashes (a crash signal, or a crash status on Windows) or is stopped by a signal while it renders the page (the message names the Node version and path)'},
    {
      code: 'ERR_RENDER_NOT_ASTRYX',
      when: 'reversing a file a render did not write, with no embedded source and no Astryx markup; the suggestion is `astryx build "<what the page is>"`',
    },
    {code: 'ERR_RENDER_SOURCE_DAMAGED', when: 'reversing a file a render wrote whose embedded source was removed (and that has no Astryx components to rebuild from), a file a render wrote that ends before its embedded source, a file that holds merge conflict markers, a file whose embedded source is cut short or damaged (or names a CLI version that is not a release version), lists a path twice, carries a module, stylesheet or JSON file the page does not reach through its imports, or an image, font or media file whose bytes are not one, or carries a file a render never embeds (a dotfile or dot-folder, `node_modules`, a package manifest, lockfile or tool configuration, or any kind but a module, stylesheet, JSON or image)'},
    {
      code: 'ERR_RENDER_NEWER_FORMAT',
      when: 'reversing a file in a newer render format than this CLI reads; the message and the suggestion name the CLI version that wrote it',
    },
    {code: 'ERR_PATH_TRAVERSAL', when: 'a file would be written outside the current folder (symlinks followed), or through a symbolic link: a relative `out`, or with `reverse` the page or an embedded file; an absolute `out` that is a symbolic link; or, with `reverse`, a file other than the page would go into a folder that already exists'},
  ],
  examples: [
    {label: 'Render a page', code: "const {data} = await render('src/app/page.tsx', {out: 'page.html'});"},
    {label: 'Give it back', code: "await render('page.html', {reverse: true, out: 'page.tsx'});"},
  ],
  command: 'experimental export',
  related: ['template', 'build'],
};
