// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file release-spec-visits.mjs
 * @description Which release specs there are, and which component folders
 *   each one visits (spec:AST-030 FR32).
 * @input Every file of the merge commit, a reader for their text, and
 *   `.github/release-spec-visits.json`: the `a11y-*` story ids and fixture
 *   pages, to the component folders each one tests.
 * @output `releaseSpecs`, `storyFiles` and `specVisits`.
 * @position Part of the release-specs plan. A spec visits the component a
 *   story id names: the story file's own component. An `a11y-*` id or a
 *   fixture page names a component only through the checked-in map. A
 *   `@visits <Component>` line in a spec adds a component it renders through
 *   another one's story; it never removes one. A visit that cannot be
 *   resolved makes the spec run on every pull request the plan applies to.
 *   An escape that a `@visits` line would have caught gets that line in the
 *   pull request that fixes it.
 */

import path from 'node:path';

import {
  componentFolderOf,
  componentPathOf,
  parseRouting,
  resolveModule as resolve,
  valueImports,
} from './a11y-pr-contracts.mjs';

/** A release file: FR32's release spec by name. */
export const isReleaseFile = file => /\.release\.[^/]*\.spec\.ts$/.test(file);

const SPEC = /^(?:packages\/[^/]+\/src|internal\/[^/]+\/src)\/.+\.spec\.ts$/;

/**
 * Every release spec: a release file, or a spec tagged
 * `@pr-a11y release-only`.
 * @param {string[]} listed
 * @param {(file: string) => string} read
 * @returns {string[]}
 */
export function releaseSpecs(listed, read) {
  return listed
    .filter(
      file =>
        isReleaseFile(file) ||
        (SPEC.test(file) &&
          /@pr-a11y\s+release-only/.test(read(file)) &&
          parseRouting(read(file)).mode === 'release-only'),
    )
    .sort();
}

/**
 * Storybook's id for a title: lower case, each run of other characters a
 * single `-`, as Storybook's own `sanitize` makes it.
 * @param {string} title
 */
export function storyIdOf(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const STORY_FILE = /^apps\/storybook\/.+\.stories\.[cm]?[jt]sx?$/;
const TITLE = /^\s*title:\s*['"`]([^'"`]+)['"`]/m;
/** A meta's own `id`, which replaces the title's id, on the lines after it. */
const META_ID =
  /^\s*title:\s*['"`][^'"`]+['"`],?\s*\n(?:\s*\/\/[^\n]*\n)*\s*id:\s*['"`]([a-z0-9-]+)['"`]/m;

/**
 * Each story id prefix (a title's id, or a meta's own id), to the story files
 * that make it.
 * @param {string[]} listed
 * @param {(file: string) => string} read
 * @returns {Map<string, string[]>}
 */
export function storyFiles(listed, read) {
  const byId = new Map();
  for (const file of listed.filter(each => STORY_FILE.test(each))) {
    const text = read(file);
    const title = TITLE.exec(text)?.[1];
    if (title == null) continue;
    const ids = new Set([storyIdOf(title)]);
    const own = META_ID.exec(text)?.[1];
    if (own) ids.add(own);
    for (const id of ids) byId.set(id, [...(byId.get(id) ?? []), file]);
  }
  return byId;
}

/** A story id prefix in a spec or its helpers: `core-bottomsheet--…`. */
const STORY_ID = /(?:id=|['"`])([a-z0-9][a-z0-9-]*?)--(?:[a-z0-9$]|['"`])/g;
/** A story id whose component part a template fills: `core-${name}--`. */
const TEMPLATED_ID = /([a-z0-9]+)-\$\{[^}]+\}--/g;
/** A quoted name a template can fill. */
const NAME = /['"`]([a-z0-9][a-z0-9-]*)['"`]/g;
/** A page a spec opens on the served Storybook, other than a story. */
const PAGE = /origin\}\/(?!iframe\.html)([\w.-]+)/g;
/** A spec opens Storybook stories, by id. */
const OPENS_STORIES = /iframe\.html\?id=/;
/** A spec's extra visits: `// @visits Markdown Citation`. */
const VISITS = /^\s*(?:\/\/|\/?\*+)\s*@visits\s+(.+?)\s*(?:\*\/)?\s*$/gm;

/**
 * The files a module loads through relative value imports, itself included.
 * @param {string} file
 * @param {Set<string>} known
 * @param {(file: string) => string} read
 */
function localModules(file, known, read) {
  const seen = new Set([file]);
  const queue = [file];
  while (queue.length > 0) {
    const current = queue.pop();
    for (const {specifier} of valueImports(read(current))) {
      if (!specifier.startsWith('.')) continue;
      const target = resolve(
        known,
        path.posix.normalize(`${path.posix.dirname(current)}/${specifier}`),
      );
      if (target && !seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return [...seen];
}

/**
 * The folder that holds a component: the one named for it, else the one with
 * its source file (`SideNavCollapseButton` lives in `SideNav/`).
 * @param {string} name
 * @param {string[]} listed
 */
function componentFolder(name, listed) {
  const own = listed.find(file =>
    new RegExp(`^packages/[^/]+/src/${name}/`).test(file),
  );
  if (own) return componentPathOf(own);
  const source = listed.find(file =>
    new RegExp(`^packages/[^/]+/src/[A-Z][^/]*/${name}\\.tsx$`).test(file),
  );
  return source ? componentPathOf(source) : null;
}

/**
 * A story file's own component folder: where its meta's `component` comes
 * from, else the folder the story id names.
 * @param {string} file
 * @param {string} id the story id prefix
 * @param {string[]} listed
 * @param {(file: string) => string} read
 * @returns {string | null}
 */
function subjectFolder(file, id, listed, read) {
  const text = read(file);
  const component = /^\s*component:\s*([A-Z]\w*)/m.exec(text)?.[1];
  if (component) {
    for (const {specifier, names} of valueImports(text)) {
      if (!names.includes(component)) continue;
      const pkg = /^@astryxdesign\/([^/]+)\/([A-Z][^/]*)/.exec(specifier);
      if (pkg) return `packages/${pkg[1]}/src/${pkg[2]}/`;
      if (specifier.startsWith('.')) {
        const target = resolve(
          new Set(listed),
          path.posix.normalize(`${path.posix.dirname(file)}/${specifier}`),
        );
        const folder =
          target && componentFolderOf(target) && componentPathOf(target);
        if (folder) return folder;
      }
    }
  }
  // The longest folder name the id's words begin with: `core-link-navigation`
  // is Link's, `core-tablerowexpansion` Table's. A package with no component
  // folders (Rich Text) is one component: its source file names it.
  const [pkg, ...words] = id.split('-');
  const named = words.join('');
  let best = null;
  for (const each of listed) {
    const folder = new RegExp(`^(packages/${pkg}/src/([A-Z][^/]*)/)`).exec(
      each,
    );
    const flat = new RegExp(`^(packages/${pkg}/src/)([A-Z][^/.]*)\\.tsx$`).exec(
      each,
    );
    const match = folder ?? flat;
    if (!match) continue;
    const name = match[2].toLowerCase();
    if (
      named.startsWith(name) &&
      (best == null || name.length > best.name.length)
    )
      best = {name, folder: componentPathOf(each)};
  }
  if (best) return best.folder;
  return null;
}

/**
 * The component folders one release spec visits.
 * @param {string} spec
 * @param {object} options
 * @param {string[]} options.listed
 * @param {(file: string) => string} options.read
 * @param {Map<string, string[]>} options.stories `storyFiles`'s map
 * @param {{stories: Record<string, string[]>, pages: Record<string, string[]>}} options.map
 *   `.github/release-spec-visits.json`
 * @returns {{folders: string[], unresolved: string[]}}
 */
export function specVisits(spec, {listed, read, stories, map}) {
  const known = new Set(listed);
  const texts = localModules(spec, known, read).map(read);
  const ids = new Set(
    texts.flatMap(text => [...text.matchAll(STORY_ID)].map(m => m[1])),
  );
  const folders = new Set();
  const unresolved = [];
  // A templated id (`core-${component}--`) visits each story its quoted
  // names make; a template that no quoted name fills stays unresolved.
  for (const text of texts)
    for (const [template, prefix] of text.matchAll(TEMPLATED_ID)) {
      const filled = [...text.matchAll(NAME)]
        .map(m => `${prefix}-${m[1]}`)
        .filter(id => stories.has(id));
      if (filled.length === 0)
        unresolved.push(`no quoted name fills the story id ${template}`);
      for (const id of filled) ids.add(id);
    }
  for (const id of ids) {
    if (id.startsWith('a11y-')) {
      const mapped = map.stories[id];
      if (mapped == null)
        unresolved.push(`the story id ${id}-- is missing from the visit map`);
      else for (const folder of mapped) folders.add(folder);
      continue;
    }
    const files = stories.get(id);
    const subjects = (files ?? []).map(file =>
      subjectFolder(file, id, listed, read),
    );
    if (!files || subjects.includes(null))
      unresolved.push(`no story file names the component of ${id}--`);
    for (const folder of subjects) if (folder) folders.add(folder);
  }
  if (ids.size === 0 && texts.some(text => OPENS_STORIES.test(text)))
    unresolved.push(`${spec} opens a story whose id it does not name`);
  for (const text of texts)
    for (const [, page] of text.matchAll(PAGE)) {
      const mapped = map.pages[page];
      if (mapped == null)
        unresolved.push(`the page ${page} is missing from the visit map`);
      else for (const folder of mapped) folders.add(folder);
    }
  for (const [, line] of read(spec).matchAll(VISITS))
    for (const name of line.split(/[\s,]+/).filter(Boolean)) {
      const folder = /^[A-Z]\w*$/.test(name)
        ? componentFolder(name, listed)
        : null;
      if (folder) folders.add(folder);
      else unresolved.push(`@visits names ${name}, which no folder holds`);
    }
  return {folders: [...folders].sort(), unresolved: [...new Set(unresolved)]};
}
