// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The theme commands on a base other than Core: what each passes to the
 * base's `themes` adapter, how it checks what comes back, and what it writes.
 * @input the step call the requirement check prepared, and the command's own
 *   inputs
 * @output theming targets, a build receipt with its files written, and a
 *   renderer for the generated app module
 * @position api/theme/base — the CLI computes every path, name, and
 *   overwrite rule; the adapter only returns data
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {AstryxError} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {findPackageRoot} from '../../../foundation/fs/paths.mjs';
import {projectPath} from '../../../foundation/config/theme-state.mjs';
import {applyWrites} from '../../integration/add-helpers.mjs';
import {callStep, isStringList} from '../../base/call-step.mjs';
import {loadThemeSource} from '../build/build.mjs';

/** @typedef {import('../../base/call-step.mjs').StepCall} StepCall */

const THEME_CODES = {
  invalid: ERROR_CODES.ERR_THEME_INVALID,
  notFound: ERROR_CODES.ERR_UNKNOWN_THEME,
};

/** The file names a compiled module may take, so `theme add` finds it. */
const MODULE_EXTENSIONS = ['.js', '.mjs', '.ts', '.tsx'];

/**
 * The base's theming targets, in the shape Core's targets take.
 * @param {StepCall} call
 * @returns {Promise<Array<{key: string, component: string, className: string, props: string[], states: string[]}>>}
 */
export async function baseThemingTargets(call) {
  /** @type {{value: import('../../../authoring/integration/adapter').ThemesTargetsOutput}} */
  const {value} = await callStep(call, 'themes.targets', {}, {
    codes: {invalid: ERROR_CODES.ERR_THEME_INVALID, notFound: ERROR_CODES.ERR_UNKNOWN_COMPONENT},
    check: value =>
      Array.isArray(value.targets) &&
      value.targets.every(
        target =>
          target != null &&
          typeof target.key === 'string' &&
          typeof target.component === 'string' &&
          (target.className === undefined || typeof target.className === 'string') &&
          isStringList(target.props) &&
          isStringList(target.states),
      )
        ? null
        : 'targets is not a list of {key, component, props, states}.',
  });
  return value.targets.map(target => ({
    key: target.key,
    component: target.component,
    className: target.className ?? '',
    props: target.props,
    states: target.states,
  }));
}

/**
 * What is wrong with a `themes.compile` value, or null.
 * @param {Record<string, unknown>} value
 * @param {string} name the theme name the CLI passed
 * @returns {string | null}
 */
function compileProblem(value, name) {
  if (typeof value.name !== 'string') return 'name is not a string.';
  if (typeof value.tokenCount !== 'number' || typeof value.componentCount !== 'number') {
    return 'tokenCount and componentCount are not numbers.';
  }
  const files = value.files;
  if (
    !Array.isArray(files) ||
    !files.every(
      file =>
        file != null &&
        typeof file.name === 'string' &&
        typeof file.role === 'string' &&
        typeof file.contents === 'string',
    )
  ) {
    return 'files is not a list of {name, role, contents}.';
  }
  for (const file of files) {
    if (file.name !== path.basename(file.name) || file.name.startsWith('.')) {
      return `file "${file.name}" names a folder or a hidden file; return a plain file name.`;
    }
  }
  if (new Set(files.map(file => file.name)).size !== files.length) {
    return 'two files have one name.';
  }
  const modules = files.filter(file => file.role === 'module');
  if (modules.length !== 1) return `files holds ${modules.length} files with role "module"; it needs exactly one.`;
  const allowed = MODULE_EXTENSIONS.map(ext => `${name}${ext}`);
  if (!allowed.includes(modules[0].name)) {
    return `the module file is "${modules[0].name}"; name it ${allowed.join(', ')}, so theme add finds it.`;
  }
  return null;
}

/**
 * Build one theme source with the base's `themes.compile` step. The CLI
 * loads the source, writes every file the step returns into one folder (the
 * source's own, or `out`), and with `check` only compares them.
 * @param {string} file the source, as given
 * @param {{out?: string, check?: boolean, iconsSpecifier?: string}} options
 * @param {StepCall} call
 * @returns {Promise<import('../theme.type.mjs').ThemeBaseBuildResponse | import('../theme.type.mjs').ThemeBuildCheckResponse>}
 */
export async function themeBuildOnBase(file, options, call) {
  const {cwd} = call;
  const source = path.resolve(cwd, file);
  /** @type {{theme: unknown, exportName: string}} */
  let loaded;
  try {
    loaded = await loadThemeSource(source);
  } catch (error) {
    throw new AstryxError(
      error instanceof Error ? error.message : String(error),
      undefined,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  const declared = /** @type {{name?: unknown}} */ (loaded.theme)?.name;
  const name =
    typeof declared === 'string' && declared.length > 0
      ? declared
      : path.basename(source).replace(/\.[^.]+$/u, '');
  const root = findPackageRoot(cwd) ?? cwd;
  const outDir = options.out ? path.resolve(cwd, options.out) : path.dirname(source);
  const rel = path.relative(root, outDir);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new AstryxError(
      `--out ${options.out} is outside the project. Name a folder inside it.`,
      undefined,
      ERROR_CODES.ERR_PATH_TRAVERSAL,
    );
  }
  /** @type {{value: import('../../../authoring/integration/adapter').ThemesCompileOutput, warnings: string[], notices: string[]}} */
  const {value, warnings, notices} = await callStep(
    call,
    'themes.compile',
    {
      theme: {
        file: projectPath(path.relative(cwd, source)),
        exportName: loaded.exportName,
        value: loaded.theme,
      },
      name,
      ...(options.iconsSpecifier ? {iconsSpecifier: options.iconsSpecifier} : {}),
    },
    {codes: THEME_CODES, check: value => compileProblem(value, name)},
  );
  const writes = value.files.map(out => ({
    role: out.role,
    path: path.join(outDir, out.name),
    shown: projectPath(path.relative(cwd, path.join(outDir, out.name))),
    contents: out.contents,
  }));
  if (options.check) {
    /** @type {Array<{path: string, reason: 'missing' | 'outdated'}>} */
    const stale = [];
    for (const write of writes) {
      let current = null;
      try {
        current = fs.readFileSync(write.path, 'utf8');
      } catch {
        // A file that cannot be read is missing.
      }
      if (current == null) stale.push({path: write.shown, reason: 'missing'});
      else if (current !== write.contents) stale.push({path: write.shown, reason: 'outdated'});
    }
    return {
      type: 'theme.build.check',
      data: {
        name: value.name,
        upToDate: stale.length === 0,
        stale,
        checked: writes.map(write => write.shown),
        ...(stale.length > 0 ? {code: 'ERR_THEME_STALE'} : {}),
      },
    };
  }
  try {
    applyWrites(
      writes.map(write => ({
        path: write.path,
        contents: write.contents,
        createOnly: false,
      })),
    );
  } catch (error) {
    if (error instanceof AstryxError) throw error;
    throw new AstryxError(
      `Failed to write the built theme: ${error instanceof Error ? error.message : String(error)}`,
      undefined,
      ERROR_CODES.ERR_WRITE_FAILED,
    );
  }
  return {
    type: 'theme.build.base',
    data: {
      name: value.name,
      base: call.base.name,
      tokenCount: value.tokenCount,
      componentCount: value.componentCount,
      outputs: writes.map(write => ({role: write.role, path: write.shown})),
      warnings,
      notices,
    },
  };
}

/**
 * Render the generated app module's body with the base's `themes.appModule`
 * step. The CLI adds the generated header itself, so every base's module
 * keeps a record theme commands can read.
 * @param {StepCall} call
 * @returns {(themes: import('../../../foundation/config/theme-state.mjs').ResolvedAppTheme[], defaultSlug: string) => Promise<string>}
 */
export function baseAppModuleRenderer(call) {
  return async (themes, defaultSlug) => {
    /** @type {{value: import('../../../authoring/integration/adapter').ThemesAppModuleOutput}} */
    const {value} = await callStep(
      call,
      'themes.appModule',
      {
        defaultSlug,
        themes: themes.map(theme => ({
          slug: theme.slug,
          owner: theme.owner,
          exportName: theme.exportName,
          module: theme.module,
          stylesheet: theme.stylesheet,
          ...(theme.fontStylesheet ? {fontStylesheet: theme.fontStylesheet} : {}),
        })),
      },
      {
        codes: THEME_CODES,
        check: value => {
          if (typeof value.source !== 'string') return 'source is not a string.';
          for (const name of ['themes', 'defaultThemeSlug']) {
            if (!new RegExp(`\\bexport\\s+(?:const|let|var)\\s+${name}\\b`, 'u').test(value.source)) {
              return `source does not export ${name}.`;
            }
          }
          return null;
        },
      },
    );
    return value.source;
  };
}
