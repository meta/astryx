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
  componentFolderNamed,
  storyFiles,
  storyIdsOpened,
  componentFolderOf,
  componentPathOf,
  localModules,
  parseRouting,
  resolveModule as resolve,
  valueImports,
} from './a11y-pr-contracts.mjs';

/** The story index, for the release-spec plan's tests. */
export {storyFiles};

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

/** A page a spec opens on the served Storybook, other than a story. */
const PAGE = /origin\}\/(?!iframe\.html)([\w.-]+)/g;
/** A spec opens the sandbox app, whose paths name no component folder. */
const OPENS_SANDBOX =
  /apps\/sandbox\/|\bserveSandbox\b|\bsandbox\.origin\b|\bSANDBOX_(?:URL|ORIGIN)\b/;
/** A spec opens Storybook stories, by id. */
const OPENS_STORIES = /iframe\.html\?id=/;
/** A spec's extra visits: `// @visits Markdown Citation`. */
const VISITS = /^\s*(?:\/\/|\/?\*+)\s*@visits\s+(.+?)\s*(?:\*\/)?\s*$/gm;

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
  // A templated id (`core-${component}--`) visits each story its quoted
  // names make; a template that no quoted name fills stays unresolved.
  const opened = storyIdsOpened(spec, {listed, read, stories});
  const ids = new Set(opened.ids);
  const folders = new Set();
  const unresolved = opened.unfilled.map(
    template => `no quoted name fills the story id ${template}`,
  );
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
  if (texts.some(text => OPENS_SANDBOX.test(text)))
    unresolved.push(
      `${spec} opens the sandbox app, whose paths name no component folder`,
    );
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
        ? componentFolderNamed(name, listed)
        : null;
      if (folder) folders.add(folder);
      else unresolved.push(`@visits names ${name}, which no folder holds`);
    }
  return {folders: [...folders].sort(), unresolved: [...new Set(unresolved)]};
}
