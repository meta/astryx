// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file template-icon-loader.mjs
 *
 * Experimental: may change or be removed in a patch release. A Webpack loader
 * that draws template and block previews with a chosen icon set. It runs only
 * when the `DOCSITE_ICON_SET` build setting names a set (next.config.mjs adds
 * it then); without the setting the previews and the bundle stay as they are.
 *
 * The setting names the main set, `<set>` or `<package>/<set>`, and may name
 * backup sets after it, separated by commas. Each preview's icons go through
 * the same rewrite `astryx template` uses: each icon comes from the first set
 * in the list that has its meaning, and an icon no set has draws a
 * placeholder the preview's source declares. The sets must be installed in
 * the docsite.
 *
 * @input A template's `.tsx` source, its sibling doc's `icons`, and the
 *   installed icon sets
 * @output The source with its icon imports rewritten
 * @position Build-time docsite tooling, read by next.config.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Project} from '../../../packages/cli/foundation/config/project.mjs';
import {
  chooseProjectIconSet,
  orderIconSets,
} from '../../../packages/cli/foundation/discovery/icon-set-discovery.mjs';
import {mapTemplateIcons} from '../../../packages/cli/foundation/discovery/template-icons.mjs';

/** The build setting that chooses the preview icon set. */
export const ICON_SET_SETTING = 'DOCSITE_ICON_SET';

/**
 * The sets a `DOCSITE_ICON_SET` value names, main set first. An empty or
 * missing value names none.
 * @param {string | undefined} value
 * @returns {string[]}
 */
export function previewIconSetList(value) {
  return (value ?? '')
    .split(',')
    .map(each => each.trim())
    .filter(Boolean);
}

/**
 * The doc beside a template source: `template.doc.mjs` for a page, the
 * same-stem `.doc.mjs` for a block. Null when there is none.
 * @param {string} file
 * @returns {string | null}
 */
export function templateDocPath(file) {
  const dir = path.dirname(file);
  const candidates =
    path.basename(file) === 'page.tsx'
      ? [path.join(dir, 'template.doc.mjs')]
      : [file.replace(/\.tsx$/u, '.doc.mjs')];
  return candidates.find(each => fs.existsSync(each)) ?? null;
}

/** @type {Map<string, Promise<{sets: any[], choice: any}>>} */
const iconSetsByKey = new Map();

/**
 * The installed sets in list order, and the choice the list makes. Read once
 * per build. Fails the build when the main set is not usable.
 * @param {string} projectDir the docsite folder, where the sets are installed
 * @param {string[]} list
 */
function iconSetsFor(projectDir, list) {
  const key = `${projectDir}\0${list.join(',')}`;
  let found = iconSetsByKey.get(key);
  if (!found) {
    found = (async () => {
      const project = await Project.load(projectDir);
      const {sets, withdrawn} = await project.iconSets({experimental: true});
      const choice = chooseProjectIconSet(sets, list, withdrawn);
      if (choice.status !== 'selected') {
        throw new Error(`${ICON_SET_SETTING}: ${choice.reason}`);
      }
      return {sets: orderIconSets(sets, choice), choice};
    })();
    iconSetsByKey.set(key, found);
  }
  return found;
}

/**
 * Rewrite one template source's icons to the chosen sets. A source with no
 * doc, or a doc that declares no `icons`, is returned unchanged.
 * @param {string} source
 * @param {string} file the source's path
 * @param {{projectDir: string, list: string[], onDoc?: (file: string) => void}} options
 * @returns {Promise<string>}
 */
export async function rewriteTemplatePreview(source, file, options) {
  if (options.list.length === 0) return source;
  const docPath = templateDocPath(file);
  if (!docPath) return source;
  options.onDoc?.(docPath);
  const loaded = await import(pathToFileURL(docPath).href);
  const declared = (loaded.doc ?? loaded.default)?.icons;
  if (declared == null || typeof declared !== 'object') return source;
  const iconSets = await iconSetsFor(options.projectDir, options.list);
  return mapTemplateIcons(source, iconSets, declared).source;
}

/**
 * @this {{async: () => (error: Error | null, out?: string) => void, getOptions: () => {iconSet: string, projectDir: string}, resourcePath: string, addDependency: (file: string) => void}}
 * @param {string} source
 */
export default function templateIconLoader(source) {
  const done = this.async();
  const {iconSet, projectDir} = this.getOptions();
  rewriteTemplatePreview(source, this.resourcePath, {
    projectDir,
    list: previewIconSetList(iconSet),
    onDoc: file => this.addDependency(file),
  }).then(
    out => done(null, out),
    error => done(error),
  );
}
