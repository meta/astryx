// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What every theme-edit operation shares: the project check, the
 * loaded project with its part data and compiler, pictures, font
 * notes, the styles a change wrote, and the preview after a change.
 *
 * @position api/theme-edit — imported only by the adapter's operation helpers
 */

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
  throw new AstryxError(
    'No package.json found. astryx experimental theme works inside an app project, which it writes the theme into and whose installed Core it checks every change against. Nothing was written.',
    [],
    E.ERR_PROJECT_REQUIRED,
  );
}

/** @param {string} cwd */
export async function context(cwd) {
  requireProject(cwd);
  const project = await openProject(cwd);
  const parts = await partData(project);
  return {project, C: makeCompiler(project, parts), parts};
}

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
    notes.push(
      installed
        ? `the app loads this font with one import: import '${pkg}';`
        : `${family} is not installed, so it does not load: the previews and the app show the next font in the stack. Install it: ${installLine(ctx.project.cwd, [pkg])}. Then the preview imports it on the next set or show, and the app imports it once: import '${pkg}';`,
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
  const preview = await renderPreview(ctx, slug, data);
  const f = themeFiles(ctx.project.cwd, slug);
  const shots = png
    ? await pictures(
        ctx.project,
        [{html: f.preview, png: f.previewPng}],
        modesOf(data),
      )
    : {files: [], problem: null};
  return {preview, pictures: shots.files, pictureProblem: shots.problem};
}

/** @param {string | undefined} group */
export function checkGroup(group) {
  if (group != null && !SHOWCASE_GROUPS.includes(group))
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `--group takes ${SHOWCASE_GROUPS.join(', ')}, not "${group}".`,
      {didYouMean: nearest(group, SHOWCASE_GROUPS)},
    );
}
