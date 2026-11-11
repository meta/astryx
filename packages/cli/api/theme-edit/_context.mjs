// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What every theme-edit operation shares: the project check, the
 * loaded project with its part data and compiler, pictures, font
 * notes, the styles a change wrote, and the preview after a change.
 *
 * @position api/theme-edit — imported only by the adapter's operation helpers
 */

import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {AstryxError} from '../error.mjs';
import {isOutsideProject} from '../../foundation/env/project-scope.mjs';
import {CLOSEST_OPEN_FONT, OPEN_FONTS, P, SYSTEM_FONTS} from './_tables.mjs';
import {makeCompiler} from './_compiler.mjs';
import {openProject, installLine} from './_project.mjs';
import {partData} from './_parts.mjs';
import {
  fontOf,
  fontPackages,
  modesOf,
  nearest,
  refuse,
  themeFiles,
} from './_settings.mjs';
import {SHOWCASE_GROUPS, renderPreview, screenshot} from './_preview.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';

const E = ERROR_CODES;

/**
 * Refuse outside a project: a theme is written into an app, and every check
 * reads the app's own Core.
 * @param {string} cwd
 */
export function requireProject(cwd) {
  if (!isOutsideProject(cwd)) return;
  const pkg = path.join(cwd, 'package.json');
  // Yarn Plug'n'Play has no node_modules for the editor to read Core from.
  if (fs.existsSync(path.join(cwd, '.pnp.cjs')))
    throw new AstryxError(
      "This app uses Yarn Plug'n'Play, which astryx experimental theme does not support: it reads the installed Core from node_modules. Set `nodeLinker: node-modules` in .yarnrc.yml and run yarn install. Nothing was written.",
      [],
      E.ERR_PROJECT_REQUIRED,
    );
  // A package.json with no Core: an app (or a workspace root) that needs it.
  if (fs.existsSync(pkg))
    throw new AstryxError(
      `@astryxdesign/core is not installed in this app (package.json here does not use it). astryx experimental theme checks every change against the installed Core: install it, or run the command from the package that uses it. Nothing was written.`,
      [{name: 'npm install @astryxdesign/core', reason: 'do this first'}],
      E.ERR_PROJECT_REQUIRED,
    );
  throw new AstryxError(
    'No package.json found. astryx experimental theme works inside an app project, which it writes the theme into and whose installed Core it checks every change against. Nothing was written.',
    [],
    E.ERR_PROJECT_REQUIRED,
  );
}

/**
 * The project, its part data and the compiler. When the components cannot
 * be rendered, the part data is empty and `unchecked` says why: changes are
 * then saved without the checks that need it, and say so.
 * @param {string} cwd
 */
export async function context(cwd) {
  requireProject(cwd);
  const project = await openProject(cwd);
  /** @type {import('./_parts.mjs').PartData} */
  let parts;
  /** @type {string | null} */
  let unchecked = null;
  try {
    parts = await partData(project);
  } catch (e) {
    if (!isRenderFailure(e)) throw e;
    unchecked = renderCause(project, /** @type {Error} */ (e).message);
    parts = {
      version: 0,
      coreKey: project.coreKey,
      map: {},
      pairs: [],
      rendered: 0,
      items: 0,
    };
  }
  return {project, C: makeCompiler(project, parts), parts, unchecked};
}

/** @param {unknown} e */
const isRenderFailure = e =>
  e instanceof AstryxError &&
  (e.code === E.ERR_RENDER_FAILED ||
    e.code === E.ERR_RENDER_MISSING_DEPENDENCY);

/**
 * Why the components did not render, with the likely cause: two copies of
 * React (the app's and the one Core resolves) break every hook.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {string} message
 */
function renderCause(project, message) {
  /** @param {(id: string) => string} resolve */
  const reactOf = resolve => {
    try {
      return fs.realpathSync(path.dirname(resolve('react/package.json')));
    } catch {
      return null;
    }
  };
  const app = reactOf(project.req.resolve);
  let core = null;
  try {
    core = reactOf(
      createRequire(project.req.resolve('@astryxdesign/core/package.json'))
        .resolve,
    );
  } catch {
    // No Core package file: nothing to compare.
  }
  return app && core && app !== core
    ? `${message} The likely cause: two copies of React, the app's (${app}) and the one Core resolves (${core}). Make Core resolve the app's React.`
    : message;
}

/**
 * The "saved, not checked" report of a change, or null when it was checked.
 * @param {string | null} cause
 */
const notChecked = cause =>
  cause ? {code: E.ERR_THEME_NOT_CHECKED, cause} : null;

/**
 * Pictures of HTML files, on request.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {Array<{html: string, png: string}>} shots
 * @param {Array<'light' | 'dark'>} modes
 * @returns {Promise<{files: string[], problem: string | null}>}
 */
export async function pictures(project, shots, modes) {
  /** @type {string[]} */
  const files = [];
  for (const {html, png} of shots) {
    for (const m of modes) {
      const out =
        modes.length > 1 && m === 'dark'
          ? png.replace(/\.png$/, '-dark.png')
          : png;
      const r = await screenshot(project, html, out, m);
      if (!r.ok) return {files, problem: r.reason};
      files.push(r.file);
    }
  }
  return {files, problem: null};
}

/**
 * Font notes for the settings: the import line for an open font, the
 * install line when its package is missing, and a warning for a family no
 * package loads, naming the closest open font.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {import('./_settings.mjs').ThemeData} data
 * @returns {string[]}
 */
export function fontNotes(ctx, data) {
  /** @type {string[]} */
  const notes = [];
  for (const {pkg, family, installed} of fontPackages(ctx, data)) {
    const fallbacks =
      Object.values(OPEN_FONTS).find(f => f.pkg === pkg)?.fallbacks ?? '';
    const near = /monospace/.test(fallbacks)
      ? 'mono'
      : /serif/.test(fallbacks.replace('sans-serif', ''))
        ? 'serif'
        : 'system';
    notes.push(
      installed
        ? `${family} is installed (${pkg}), so the previews load it; the app loads it with one import: import '${pkg}';`
        : `${family} is not installed, so it does not load: the previews and the app show the next font in the stack. Install it: ${installLine(ctx.project.cwd, [pkg])}. Then the preview imports it on the next set or show, and the app imports it once: import '${pkg}'; Until then, the closest font that needs no install is ${near}: ${P} set ${data.name} font ${near}`,
    );
  }
  for (const s of data.settings) {
    if (
      s.thing !== 'font' ||
      SYSTEM_FONTS.includes(s.value) ||
      OPEN_FONTS[s.value] ||
      fontOf(s.value).pkg ||
      s.value === 'rounded' ||
      s.value === 'comic'
    )
      continue;
    const family = fontOf(s.value).family.replace(/["']/g, '').toLowerCase();
    const near = CLOSEST_OPEN_FONT[family];
    notes.push(
      `"${fontOf(s.value).family.replace(/["']/g, '')}" is not a system font and no package loads it: the app must load it, or it falls back.${near ? ` The closest open font is ${near}: ${P} set ${data.name} font ${near}${s.on ? ` --on ${s.on}` : ''}` : ''}`,
    );
  }
  return notes;
}

/**
 * What a change did to part styles (component settings), one line each.
 * @param {any} before
 * @param {any} after
 * @returns {string[]}
 */
export function styledChanges(before, after) {
  /** @type {string[]} */
  const out = [];
  const a = before?.components ?? {};
  const b = after?.components ?? {};
  for (const target of new Set([...Object.keys(a), ...Object.keys(b)])) {
    for (const key of new Set([
      ...Object.keys(a[target] ?? {}),
      ...Object.keys(b[target] ?? {}),
    ])) {
      const x = a[target]?.[key] ?? {};
      const y = b[target]?.[key] ?? {};
      for (const prop of new Set([...Object.keys(x), ...Object.keys(y)])) {
        if (JSON.stringify(x[prop]) === JSON.stringify(y[prop])) continue;
        const name = prop.startsWith('--')
          ? prop
          : prop.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
        out.push(
          `${target}${key === 'base' ? '' : ` ${key}`}: ${name} ${y[prop] === undefined ? '(removed)' : typeof y[prop] === 'string' ? y[prop] : JSON.stringify(y[prop])}`,
        );
      }
    }
  }
  const ta = JSON.stringify(before?.typography ?? {});
  const tb = JSON.stringify(after?.typography ?? {});
  if (ta !== tb) {
    for (const role of ['body', 'heading', 'code']) {
      const x = after?.typography?.[role];
      if (
        JSON.stringify(before?.typography?.[role] ?? null) !==
        JSON.stringify(x ?? null)
      )
        out.push(
          `typography ${role}: ${
            x
              ? Object.entries(x)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(', ')
              : '(removed)'
          }`,
        );
    }
    if (
      JSON.stringify(before?.typography?.scale ?? null) !==
      JSON.stringify(after?.typography?.scale ?? null)
    )
      out.push(
        `typography scale: base ${after?.typography?.scale?.base ?? 'default'}`,
      );
  }
  return out;
}

/**
 * Previews after a change: the sample page always, pictures on request.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {boolean} png
 */
export async function previewAfter(ctx, slug, data, png) {
  /** @type {string | null} */
  let preview = null;
  let cause = ctx.unchecked ?? null;
  try {
    preview = await renderPreview(ctx, slug, data);
  } catch (e) {
    // The change is already saved: any failure here leaves it unchecked.
    cause ??= isRenderFailure(e)
      ? renderCause(ctx.project, /** @type {Error} */ (e).message)
      : `checking it failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  const f = themeFiles(ctx.project.cwd, slug);
  const shots =
    png && preview
      ? await pictures(
          ctx.project,
          [{html: f.preview, png: f.previewPng}],
          modesOf(data),
        )
      : {files: [], problem: null};
  return {
    preview,
    pictures: shots.files,
    pictureProblem: shots.problem,
    notChecked: notChecked(cause),
  };
}

/**
 * The section of the sheet, in lower case, or undefined; a refusal for one
 * that is not a section.
 * @param {string | undefined} section
 * @param {string} [theme] the theme the suggestions name
 * @returns {string | undefined}
 */
export function checkSection(section, theme = 'my') {
  if (section === '')
    refuse(E.ERR_MISSING_ARGUMENT, '--section was given no value.', {
      run: [`${P} show ${theme} --section ${SHOWCASE_GROUPS[0]}`],
    });
  const s = section?.toLowerCase();
  if (s != null && !SHOWCASE_GROUPS.includes(s))
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `--section takes ${SHOWCASE_GROUPS.join(', ')}, not "${section}".`,
      {
        didYouMean: nearest(s, SHOWCASE_GROUPS),
        run: [
          `${P} show ${theme} --section ${nearest(s, SHOWCASE_GROUPS)[0] ?? SHOWCASE_GROUPS[0]}`,
        ],
      },
    );
  return s;
}
