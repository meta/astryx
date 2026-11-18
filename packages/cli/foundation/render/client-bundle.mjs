// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The page's script in a rendered file: the page's modules and the
 * modules they use, bundled by esbuild (a dependency of the CLI, loaded only
 * here) into one script that draws the page in the browser over its server
 * markup, so state, effects and event handlers work. No network, no `eval`,
 * no other file.
 * @input The page's entry file, esbuild, and how the server compiled and
 *   resolved the page's modules
 * @output One script's text, safe inside an HTML `<script>` element
 * @position foundation/render — used by page-worker.mjs
 */

import * as fs from 'node:fs';
import {builtinModules} from 'node:module';
import * as path from 'node:path';
import {stripVTControlCharacters} from 'node:util';
import vm from 'node:vm';
import {SOURCE_TYPE} from './source-block.mjs';

/** The id of the element that holds the page's markup in a rendered file. */
export const ROOT_ID = 'astryx-render-root';

/** The module the page's script reads a carried file from. */
export const CARRIED_MODULE = 'astryx:carried';

/** An address that leaves the file: another site, mail or a phone call. */
export const LINK_OUT = /^(https?:|mailto:|tel:|\/\/)/i;

/**
 * What the file does so that the page works in a viewer's sandboxed frame as
 * it works in an app. A link out of the file opens in a new tab, since the
 * frame cannot follow it; a link the page handles itself (it cancels the
 * click) or gives a target keeps its way. A form submits through its submit
 * event: the file cancels the browser's own submission and fires the event
 * itself, since a frame that blocks form submission never fires it, and a
 * file has no server to send a form to; a form whose action is another
 * site's address submits as the browser submits it. A link to a place in the
 * page (`#id`) stays in the file: in a frame whose document is given inline
 * (`srcdoc`), the address resolves against the viewer's own page, so the
 * click would navigate the frame away; the file moves to the place instead,
 * which also sets `:target` and fires `hashchange`, as in a browser tab. Enter in a form's only text field
 * submits a form with no submit button, as a browser does; with a button,
 * the browser clicks it.
 */
export const IN_A_VIEWER = `{
const out = ${LINK_OUT};
const typed = /^(text|search|url|tel|email|password|date|month|week|time|datetime-local|number)$/;
const elsewhere = (form, submitter) =>
  out.test(((submitter && submitter.getAttribute('formaction')) ?? form.getAttribute('action') ?? '').trim());
const submit = (form, submitter) => {
  if (!form.noValidate && !(submitter && submitter.formNoValidate) && !form.reportValidity()) return;
  form.dispatchEvent(typeof SubmitEvent === 'function'
    ? new SubmitEvent('submit', {bubbles: true, cancelable: true, submitter})
    : new Event('submit', {bubbles: true, cancelable: true}));
};
document.addEventListener('click', event => {
  if (event.defaultPrevented || !(event.target instanceof Element)) return;
  const link = event.target.closest('a[href]');
  if (link) {
    const href = link.getAttribute('href').trim();
    if (!link.hasAttribute('target') && out.test(href)) {
      link.target = '_blank';
      link.rel = [...new Set([...link.rel.split(/\\s+/).filter(Boolean), 'noopener', 'noreferrer'])].join(' ');
    }
    return;
  }
  const button = event.target.closest('button, input');
  if (!button || !button.form || (button.type !== 'submit' && button.type !== 'image')) return;
  if (elsewhere(button.form, button)) return;
  event.preventDefault();
  submit(button.form, button);
});
// The move to a place is decided after every click listener the page has,
// on the document or the window, even one it adds later: a capture listener
// on the window, which runs first, adds a one-time listener for this click
// that runs last, so a page that handles the link itself cancels the move.
// Whether a click on this link is one the file moves itself: a link to a
// place in the page, in a frame whose address is not the document's own.
const movesInFile = (event, link) => {
  const href = link.getAttribute('href').trim();
  return (
    href.startsWith('#') &&
    !link.hasAttribute('target') &&
    !link.hasAttribute('download') &&
    event.button === 0 &&
    !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) &&
    document.baseURI.split('#')[0] !== location.href.split('#')[0]
  );
};
// The browser moves to the place against the frame's own address, so it
// scrolls, sets :target, fires hashchange, moves focus and adds a history
// entry as in a tab. The same address again is replaced, which a browser also
// treats as a move to the place, never a load of the file again.
const moveTo = link => {
  const place = new URL(link.getAttribute('href').trim(), location.href).href;
  if (place !== location.href) location.href = place;
  else location.replace(place);
};
// The move is decided after every click listener the page has, even one it
// adds later: a capture listener on the window, which runs first, waits for
// this click to reach the window. A page that stops the click on its way (a
// card's handler that calls stopPropagation) has the browser's own move held
// at that point, and the file decides once every handler has run: it moves
// unless the page cancelled the click, by preventDefault, \`returnValue =
// false\` or an onclick handler that returns false.
window.addEventListener('click', event => {
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!link || !movesInFile(event, link)) return;
  const cancel = Event.prototype.preventDefault;
  let cancelled = false;
  let held = false;
  let decided = false;
  // An onclick handler's \`return false\` cancels without calling
  // preventDefault, so each one on the click's way is read as it returns.
  const onclicks = event.composedPath().flatMap(node => {
    const handler = node.onclick;
    if (typeof handler !== 'function') return [];
    const read = function (...args) {
      const result = handler.apply(this, args);
      if (result === false) cancelled = true;
      return result;
    };
    node.onclick = read;
    return [[node, handler, read]];
  });
  const restore = () => {
    for (const [node, handler, read] of onclicks) if (node.onclick === read) node.onclick = handler;
  };
  const decide = () => {
    if (decided) return;
    decided = true;
    window.removeEventListener('click', last);
    restore();
    if (cancelled || (event.defaultPrevented && !held)) return;
    cancel.call(event);
    moveTo(link);
  };
  event.preventDefault = function () {
    cancelled = true;
    return cancel.call(this);
  };
  const returnValue = Object.getOwnPropertyDescriptor(Event.prototype, 'returnValue');
  Object.defineProperty(event, 'returnValue', {
    get() {
      return returnValue.get.call(this);
    },
    set(value) {
      if (value === false) this.preventDefault();
    },
  });
  for (const name of ['stopPropagation', 'stopImmediatePropagation']) {
    const stop = Event.prototype[name];
    event[name] = function () {
      stop.call(this);
      if (decided || held) return;
      held = true;
      cancel.call(event);
      setTimeout(decide);
    };
  }
  // The old way to stop a click, \`cancelBubble = true\`, stops it the same way.
  const bubble = Object.getOwnPropertyDescriptor(Event.prototype, 'cancelBubble');
  Object.defineProperty(event, 'cancelBubble', {
    get() {
      return bubble.get.call(this);
    },
    set(value) {
      if (value) this.stopPropagation();
    },
  });
  const last = later => {
    // A click the page dispatches while this one is still on its way (a
    // handler that clicks another element first) leaves it waiting.
    if (later === event) decide();
    else if (event.eventPhase === Event.NONE && !decided) {
      decided = true;
      window.removeEventListener('click', last);
      restore();
    }
  };
  window.addEventListener('click', last);
}, true);
document.addEventListener('keydown', event => {
  const field = event.target;
  if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return;
  if (!(field instanceof HTMLInputElement) || !field.form || !typed.test(field.type)) return;
  const controls = [...field.form.elements];
  if (controls.some(c => c.type === 'submit' || c.type === 'image')) return;
  if (controls.filter(c => c instanceof HTMLInputElement && typed.test(c.type)).length !== 1) return;
  if (elsewhere(field.form, null)) return;
  event.preventDefault();
  submit(field.form, null);
});
}`;

/**
 * Storage for a page in a viewer that blocks it. A frame without
 * allow-same-origin has an opaque origin, where touching `localStorage` or
 * `sessionStorage` throws. Then the page gets an in-memory storage for each
 * one that acts as the browser's does: its methods, and its items read,
 * written, listed and deleted as properties (`localStorage.theme`,
 * `Object.keys(localStorage)`). What it saves lasts until the page closes.
 * A file opened from disk or on a real origin keeps its real storage. This
 * runs as the script's first module, before any of the page's own modules.
 */
export const VIEWER_STORAGE = `for (const name of ['localStorage', 'sessionStorage']) {
  let usable = true;
  try {
    window[name].getItem('');
  } catch {
    usable = false;
  }
  if (usable) continue;
  const items = new Map();
  const methods = {
    get length() {
      return items.size;
    },
    key: index => [...items.keys()][index] ?? null,
    getItem: key => (items.has(String(key)) ? items.get(String(key)) : null),
    setItem: (key, value) => {
      items.set(String(key), String(value));
    },
    removeItem: key => {
      items.delete(String(key));
    },
    clear: () => {
      items.clear();
    },
  };
  const storage = new Proxy(methods, {
    get: (target, key, receiver) =>
      key in target || typeof key !== 'string' ? Reflect.get(target, key, receiver) : items.get(key),
    set: (target, key, value) => {
      if (typeof key === 'string' && !(key in target)) items.set(key, String(value));
      return true;
    },
    has: (target, key) => (typeof key === 'string' && items.has(key)) || key in target,
    deleteProperty: (target, key) => {
      if (typeof key === 'string' && !(key in target)) items.delete(key);
      return true;
    },
    ownKeys: () => [...items.keys()],
    getOwnPropertyDescriptor: (target, key) =>
      typeof key === 'string' && items.has(key)
        ? {value: items.get(key), writable: true, enumerable: true, configurable: true}
        : undefined,
  });
  try {
    Object.defineProperty(window, name, {configurable: true, enumerable: true, get: () => storage});
  } catch {
    // A window that refuses the property keeps the storage it has.
  }
}`;

/**
 * Copying for a page in a viewer that blocks the Clipboard API. It falls
 * back to the copy command where Core's clipboard hook does: when the frame's
 * permissions policy refuses clipboard-write, when `writeText` refuses the
 * write (NotAllowedError), and also when the frame leaves `navigator.clipboard`
 * out or `writeText` throws at once. The copy command runs only in a click or
 * a key press, as in the hook. A write that resolves copied the text; a
 * failed fallback rejects with the browser's own refusal, or NotAllowedError,
 * so the page's own error path runs. `readText` rejects with NotAllowedError,
 * as a browser does. The hook's helpers are private to Core and run only in
 * pages that use the hook; this runs in the file's script before any of the
 * page's modules, for every page.
 */
export const VIEWER_CLIPBOARD = `{
const refused = message => new DOMException(message, 'NotAllowedError');
const copy = text =>
  new Promise((resolve, reject) => {
    if (navigator.userActivation?.isActive === false) {
      reject(refused('The copy command runs only in a click or a key press.'));
      return;
    }
    let written = false;
    const write = event => {
      if (event.clipboardData == null) return;
      event.clipboardData.setData('text/plain', String(text));
      event.preventDefault();
      event.stopImmediatePropagation();
      written = true;
    };
    window.addEventListener('copy', write, true);
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    } finally {
      window.removeEventListener('copy', write, true);
    }
    if (copied && written) resolve();
    else reject(refused('The browser did not copy the text.'));
  });
const policy = document.permissionsPolicy ?? document.featurePolicy;
const writeAllowed = () =>
  typeof policy?.allowsFeature === 'function' ? policy.allowsFeature('clipboard-write') : true;
const clipboard = navigator.clipboard;
if (clipboard == null) {
  const fallback = {
    writeText: copy,
    readText: () => Promise.reject(refused('This frame does not let a page read the clipboard.')),
  };
  try {
    Object.defineProperty(navigator, 'clipboard', {configurable: true, enumerable: true, get: () => fallback});
  } catch {
    // A navigator that refuses the property keeps what it has.
  }
} else if (typeof clipboard.writeText === 'function') {
  const writeText = clipboard.writeText;
  try {
    clipboard.writeText = function (text) {
      if (!writeAllowed()) return copy(text);
      let asked;
      try {
        asked = writeText.call(this, text);
      } catch {
        return copy(text);
      }
      return Promise.resolve(asked).catch(error =>
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? copy(text).catch(() => Promise.reject(error))
          : Promise.reject(error),
      );
    };
  } catch {
    // A clipboard that refuses the property keeps its own writeText.
  }
}
}`;

/** The namespace of the module that fills in what a viewer's frame blocks: storage and the clipboard. */
const VIEWER = 'astryx-viewer';
const PAGE = 'astryx-page';

/** The namespace of the module that mounts the page. */
const MOUNT = 'astryx-mount';

/** An import of a module that is part of Node. */
const NODE_MODULE = new RegExp(
  `^(node:.*|(${builtinModules.filter(name => !name.startsWith('_')).map(escapeRegExp).join('|')})(/.*)?)$`,
);

/**
 * An import of one of `names`, or of a file inside one.
 * @param {string[]} names
 */
const packageFilter = names => new RegExp(`^(${names.map(escapeRegExp).join('|')})(/.*)?$`);

/** @param {string} text */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * The file an esbuild message names: a page file is named with its
 * namespace (`astryx-page:/…/page.tsx`), and the mount is the render's own,
 * so it names none.
 * @param {string} file
 * @returns {string | null}
 */
function locatedFile(file) {
  if (file.startsWith(`${MOUNT}:`)) return null;
  if (file.startsWith(`${PAGE}:`)) return file.slice(PAGE.length + 1);
  return path.resolve(file);
}

/** @param {string} file */
const loaderFor = file =>
  /\.[cm]?tsx$/.test(file) ? 'tsx' : /\.[cm]?ts$/.test(file) ? 'ts' : 'jsx';

/**
 * Reads a carried file from the page's embedded source, once, by its
 * SHA-256, as a data: URI with the `prefix` it needs (`data:image/png;base64`).
 */
const CARRIED_SOURCE = `let files;
export function carried(sha256, prefix) {
  if (files === undefined) {
    files = new Map();
    // The CLI writes its source block last, as readSourceBlock reads it.
    const blocks = document.querySelectorAll('script[type="${SOURCE_TYPE}"]');
    const block = blocks[blocks.length - 1];
    for (const file of block ? JSON.parse(block.textContent).files : []) files.set(file.sha256, file.base64);
  }
  return prefix + ',' + (files.get(sha256) ?? '');
}
`;

/** Files a package may import for their address; the page's own are inlined before esbuild sees them. */
const ASSET_LOADERS = Object.fromEntries(
  [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.avif',
    '.svg',
    '.ico',
    '.woff',
    '.woff2',
    '.ttf',
    '.otf',
    '.mp3',
    '.mp4',
    '.webm',
  ].map(ext => [ext, /** @type {const} */ ('dataurl')]),
);

/**
 * Why the page's script cannot run in one file.
 */
export class BundleError extends Error {
  /**
   * @param {string} message
   * @param {Record<string, unknown>} [detail]
   * @param {unknown} [compile] the error of one of the page's own files that
   *   does not compile, which the render reports as a static import's
   * @param {{source: string, line: number, names: string[], module?: string}} [missingExport]
   *   a named import or a package subpath that its module does not export:
   *   the page's file that imports it, the line, the names and the module
   */
  constructor(message, detail = {}, compile = undefined, missingExport = undefined) {
    super(message);
    this.detail = detail;
    this.compile = compile;
    this.missingExport = missingExport;
  }
}

/**
 * Text that runs the same as `code` and cannot end its `<script>` element or
 * be read as the render's embedded source. `</script` and `<!--` only appear
 * in strings, template literals and regular expressions, where `\x3C` is the
 * same `<`.
 * @param {string} code
 */
export function scriptSafe(code) {
  return code
    .replace(/<(?=\/script)/gi, '\\x3C')
    .replace(/<!--/g, '\\x3C!--')
    .replace(/x-astryx-source/g, 'x-astryx\\x2dsource');
}

/**
 * Build the page's script.
 * @param {{
 *   esbuild: any,
 *   entry: string,
 *   source: (file: string) => {contents: string, loader: 'tsx' | 'ts' | 'jsx'} | null,
 *   isPageFile: (file: string) => boolean,
 *   resolveFile: (name: string, dir: string) => string | null,
 *   packageDir: (name: string, importerDir: string) => string | null,
 *   builtin: (name: string) => boolean,
 *   describe: (file: string) => string,
 *   oneCopy?: string[],
 * }} options
 *   `source` compiles one of the page's own files as the server compiled it
 *   (null for any other file, which esbuild loads); `isPageFile` tells the
 *   files `source` compiles (the page's own, and a module outside
 *   node_modules that the project's path aliases reach), which alone go
 *   through the build's plugin; `resolveFile` finds a relative import of one of them with
 *   the extensions the server tries; `packageDir`
 *   names the folder a package import resolves from when it must come from
 *   the copy the server loaded (React outside a project), else null;
 *   `builtin` tells a Node built-in; `describe` names a file for a message;
 *   `oneCopy` names the packages every module, a package's too, takes from
 *   the one copy `packageDir` names (React outside a project).
 * @returns {Promise<{code: string, modules: number}>}
 */
export async function bundleForBrowser({
  esbuild,
  entry,
  source,
  isPageFile,
  resolveFile,
  packageDir,
  builtin,
  describe,
  oneCopy = [],
}) {
  // A page whose script throws, in render or in an effect (a cookie write in
  // a frame that blocks cookies, say), keeps its first paint: React would
  // empty the root.
  const mount =
    `import 'astryx:viewer';import {Component, createElement} from 'react';import {createRoot} from 'react-dom/client';import Page from ${JSON.stringify(entry)};` +
    `${IN_A_VIEWER}` +
    `const root = document.getElementById(${JSON.stringify(ROOT_ID)});const painted = root.innerHTML;` +
    `class FirstPaint extends Component {constructor(props) {super(props);this.state = {failed: false};}` +
    `static getDerivedStateFromError() {return {failed: true};}` +
    `render() {return this.state.failed ? createElement('div', {style: {display: 'contents'}, dangerouslySetInnerHTML: {__html: painted}}) : this.props.children;}}` +
    `createRoot(root).render(createElement(FirstPaint, null, createElement(Page)));`;
  // Only the page's own files and the mount go through this plugin: esbuild
  // resolves and loads every package file itself, which keeps the build fast.
  // A package file comes back here only for an import every module must take
  // from one copy (`oneCopy`) or for a Node module, which is refused.
  /** @param {any} args */
  const resolveImport = async args => {
    if (args.pluginData?.astryx) return undefined;
    const name = args.path.split('?')[0];
    if (name.startsWith('.') || path.isAbsolute(name)) {
      const file = resolveFile(name, args.resolveDir);
      if (!file) return undefined;
      return isPageFile(file) ? {path: file, namespace: PAGE} : {path: file};
    }
    const resolveDir = packageDir(name, args.resolveDir) ?? args.resolveDir;
    // A package can map a Node module for the browser (`"browser": {"fs":
    // false}`), and an installed package can stand in for one (`events`),
    // so a Node module is refused only when nothing resolves it.
    const found = await build.resolve(name, {
      kind: args.kind,
      resolveDir,
      importer: args.importer,
      pluginData: {astryx: true},
    });
    // A module a package maps to `false` comes back with no namespace:
    // esbuild's own resolution gives it as an empty module.
    if (found.errors.length === 0) {
      if (found.namespace === '') return undefined;
      return found.namespace === 'file' && isPageFile(found.path)
        ? {...found, namespace: PAGE}
        : found;
    }
    if (builtin(name)) {
      return {
        errors: [
          {
            text: `${describe(args.importer && args.namespace !== MOUNT ? args.importer : entry)} loads ${name}, which is part of Node and not of a browser.`,
          },
        ],
      };
    }
    return {errors: found.errors};
  };
  /** @type {any} */
  let build;
  /** @type {any} */
  const plugin = {
    name: 'astryx-page',
    setup(/** @type {any} */ setupBuild) {
      build = setupBuild;
      // An image the page imports comes from the embedded source, which
      // carries it already, so the script holds no copy of its own.
      build.onResolve({filter: /^astryx:carried$/}, () => ({
        path: 'carried',
        namespace: 'astryx-carried',
      }));
      build.onLoad({filter: /.*/, namespace: 'astryx-carried'}, () => ({
        contents: CARRIED_SOURCE,
        loader: 'js',
      }));
      build.onResolve({filter: /^astryx:mount$/}, () => ({path: 'mount', namespace: MOUNT}));
      build.onResolve({filter: /^astryx:viewer$/, namespace: MOUNT}, () => ({path: 'viewer', namespace: VIEWER}));
      build.onLoad({filter: /.*/, namespace: VIEWER}, () => ({contents: `${VIEWER_STORAGE}\n${VIEWER_CLIPBOARD}`, loader: 'js'}));
      build.onLoad({filter: /.*/, namespace: MOUNT}, () => ({
        contents: mount,
        loader: 'js',
        resolveDir: path.dirname(entry),
      }));
      build.onResolve({filter: /.*/, namespace: MOUNT}, resolveImport);
      build.onResolve({filter: /.*/, namespace: PAGE}, resolveImport);
      if (oneCopy.length > 0) {
        build.onResolve({filter: packageFilter(oneCopy)}, resolveImport);
      }
      build.onResolve({filter: NODE_MODULE}, resolveImport);
      build.onLoad({filter: /.*/, namespace: PAGE}, (/** @type {any} */ args) => {
        const resolveDir = path.dirname(args.path);
        // Stylesheets are already in the page.
        if (/\.(css|scss|sass|less)$/i.test(args.path)) return {contents: '', loader: 'js'};
        if (/\.json$/i.test(args.path)) {
          return {contents: fs.readFileSync(args.path), loader: 'json', resolveDir};
        }
        const asset = ASSET_LOADERS[path.extname(args.path).toLowerCase()];
        if (asset) return {contents: fs.readFileSync(args.path), loader: asset, resolveDir};
        try {
          const compiled = source(args.path);
          return compiled
            ? {...compiled, resolveDir}
            : {contents: fs.readFileSync(args.path), loader: loaderFor(args.path), resolveDir};
        } catch (e) {
          // A page file that does not compile, such as one the page loads
          // lazily: the render reports it as a static import's.
          return {errors: [{text: describe(args.path), detail: {compile: e}}]};
        }
      });
      // A package's own stylesheet import adds nothing to the script.
      build.onLoad({filter: /\.(css|scss|sass|less)$/i}, () => ({
        contents: '',
        loader: 'js',
      }));
    },
  };
  /** @type {any} */
  let result;
  try {
    result = await esbuild.build({
      entryPoints: ['astryx:mount'],
      bundle: true,
      write: false,
      metafile: true,
      format: 'iife',
      platform: 'browser',
      // Browsers that viewers run; syntax newer than this, such as a class
      // decorator, is lowered.
      target: 'es2022',
      minify: true,
      charset: 'ascii',
      legalComments: 'eof',
      jsx: 'automatic',
      define: {'process.env.NODE_ENV': '"production"'},
      loader: ASSET_LOADERS,
      logLevel: 'silent',
      plugins: [plugin],
    });
  } catch (e) {
    const first = /** @type {any} */ (e)?.errors?.[0];
    if (!first) throw e;
    if (first.detail?.compile) {
      throw new BundleError(first.text, {}, first.detail.compile);
    }
    const located = first.location?.file ? locatedFile(first.location.file) : null;
    // A named import its module does not export, in one of the page's own
    // files: refused as a build refuses it. The worker names the file and
    // the module, as for the same import on the server.
    const noExport = /^No matching export in "[^"]+" for import "([^"]+)"$/.exec(first.text);
    if (noExport && located && isPageFile(located)) {
      throw new BundleError(first.text, {}, undefined, {
        source: located,
        line: first.location.line,
        names: [noExport[1]],
      });
    }
    // A package subpath the package's `exports` do not list, likewise.
    const notes = (first.notes ?? []).map((/** @type {any} */ note) => note.text).join('\n');
    const unexported = /^Could not resolve "[^"]+"$/.test(first.text)
      ? /The path "([^"]+)" is not exported by package "([^"]+)"/.exec(notes)
      : null;
    if (unexported && located && isPageFile(located)) {
      throw new BundleError(first.text, {}, undefined, {
        source: located,
        line: first.location.line,
        names: [unexported[1]],
        module: unexported[2],
      });
    }
    const where = located ? `${describe(located)}:${first.location.line}: ` : '';
    // A message that leads with a file's absolute path names it as the page does.
    const text = stripVTControlCharacters(first.text).replace(
      /^(\S+): /,
      (lead, file) => (path.isAbsolute(file) ? `${describe(file)}: ` : lead),
    );
    throw new BundleError(
      `The page's script cannot be built for the browser: ${where}${text}`,
      {
        ...(located ? {module: describe(located), line: first.location.line} : {}),
      },
    );
  } finally {
    esbuild.stop?.();
  }
  const code = scriptSafe(result.outputFiles[0].text);
  try {
    // Parsed here, so a script that would not run never reaches the file.
    new vm.Script(code, {filename: 'page-script.js'});
  } catch (e) {
    throw new BundleError(
      `The page's script could not be written safely into the file: ${/** @type {Error} */ (e).message}`,
    );
  }
  // The modules the script holds: those esbuild kept any of.
  const output = Object.values(result.metafile?.outputs ?? {})[0];
  const modules = Object.values(output?.inputs ?? {}).filter(
    (/** @type {any} */ input) => input.bytesInOutput > 0,
  ).length;
  return {code, modules};
}
