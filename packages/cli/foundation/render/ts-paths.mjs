// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A project's `compilerOptions.paths` (tsconfig.json or jsconfig.json),
 * read and matched by TypeScript's rules, for `astryx experimental render`.
 * The config of a file is the nearest tsconfig.json (else jsconfig.json) in
 * its folder or above, read through its `extends`; a config that does not
 * include the file lends the referenced project that does, as a
 * solution-style config (`"files": []` with `references`) does. Matching:
 * an exact key matches only itself; a key may hold one `*` anywhere, and the
 * longest matching prefix wins; a target may hold one `*`, which takes what
 * the key's `*` matched; targets are tried in order, and when none exists the
 * import resolves as a package. Only bare specifiers are matched. Targets
 * resolve from `baseUrl`, else from the folder of the config that writes
 * `paths`.
 *
 * @position foundation/render — used by page-worker.mjs and embedded-imports.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {conditionalExportTarget} from '../discovery/package-exports.mjs';
import {findNodeModulesPackage} from '../fs/paths.mjs';

/**
 * @typedef {object} PathPattern
 * @property {string} key - The key as written.
 * @property {string} prefix - What comes before the key's `*` (all of it, for an exact key).
 * @property {string} suffix - What comes after the key's `*`.
 * @property {boolean} wildcard - Whether the key holds a `*`.
 * @property {string[]} targets - Absolute target patterns, in order.
 */

/** Extensions an extensionless candidate may stand for, in resolution order. */
const EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.mts', '.cts', '.json'];

/** The extensions the render's module loader tries for an extensionless import, in its order. */
export const LOAD_EXTENSIONS = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.json'];

/** The config file names TypeScript looks for in a folder, in its order. */
const CONFIG_NAMES = ['tsconfig.json', 'jsconfig.json'];

/** What a config excludes when it names nothing to exclude. */
const DEFAULT_EXCLUDE = ['node_modules', 'bower_components', 'jspm_packages'];

/** @param {string} file */
const isFile = file => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

/**
 * A config's JSON, with comments and trailing commas allowed, or null.
 * @param {string} file
 * @returns {any}
 */
function readJsonc(file) {
  try {
    const text = fs
      .readFileSync(file, 'utf8')
      .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, str) => str ?? '')
      .replace(/,(\s*[}\]])/g, '$1');
    const json = JSON.parse(text);
    return json && typeof json === 'object' && !Array.isArray(json) ? json : null;
  } catch {
    return null;
  }
}

/** The conditions TypeScript matches in a package's `exports` for a config (`default` always matches). */
const CONFIG_CONDITIONS = ['require', 'types', 'node'];

/** @param {string} file */
const jsonFile = file => (isFile(file) ? file : isFile(`${file}.json`) ? `${file}.json` : null);

/**
 * The config one installed copy of a package holds for a subpath (`''` for
 * the package alone): where its `exports` send it, else the subpath as
 * written, else the file its package.json names in `tsconfig`, else its
 * `tsconfig.json`. A package's `main` is code, never its config.
 * @param {string} packageDir
 * @param {string} sub
 * @returns {string | null}
 */
function packageConfig(packageDir, sub) {
  const pkg = readJsonc(path.join(packageDir, 'package.json')) ?? {};
  if (pkg.exports !== undefined && pkg.exports !== null) {
    const target = conditionalExportTarget(pkg.exports, sub ? `./${sub}` : '.', CONFIG_CONDITIONS);
    return target === null ? null : jsonFile(path.join(packageDir, target));
  }
  if (sub) return jsonFile(path.join(packageDir, sub));
  return jsonFile(path.join(packageDir, typeof pkg.tsconfig === 'string' ? pkg.tsconfig : 'tsconfig.json'));
}

/**
 * The config file an `extends` entry names, from the folder of the config
 * that writes it, as TypeScript finds it: a path (`.json` may be left off);
 * or a package's config, from the nearest installed copy that holds it. A
 * package's config is read where it really is, through any link, so what it
 * names in turn resolves from there.
 * @param {unknown} spec
 * @param {string} fromDir
 * @returns {string | null}
 */
function extendedFile(spec, fromDir) {
  if (typeof spec !== 'string' || !spec) return null;
  if (spec.startsWith('.') || path.isAbsolute(spec)) return jsonFile(path.resolve(fromDir, spec));
  const parts = spec.split('/');
  const scoped = spec.startsWith('@');
  const name = parts.slice(0, scoped ? 2 : 1).join('/');
  const sub = parts.slice(scoped ? 2 : 1).join('/');
  for (let from = fromDir; ; ) {
    const found = findNodeModulesPackage(from, name);
    if (!found) return null;
    const file = packageConfig(found.packageDir, sub);
    if (file) return fs.realpathSync(file);
    const above = path.dirname(found.hostDir);
    if (above === found.hostDir) return null;
    from = above;
  }
}

/**
 * @typedef {object} ReadConfig
 * @property {Record<string, unknown>} options - Compiler options, the extending config's winning key by key.
 * @property {string} baseUrlDir - The folder of the config that writes `baseUrl`.
 * @property {string} pathsDir - The folder of the config that writes `paths`.
 * @property {string | null} pathsFile - The config that writes `paths`, if any does.
 * @property {{list: unknown[], dir: string} | null} files - `files`, from the nearest config that writes it, with that config's folder.
 * @property {{list: unknown[], dir: string} | null} include - `include`, likewise.
 * @property {{list: unknown[], dir: string} | null} exclude - `exclude`, likewise.
 * @property {{path?: unknown}[]} references - The config's own `references`.
 */

/**
 * A config read through its `extends`, as TypeScript merges them: a later
 * entry of a list wins over an earlier one, and the config itself over all.
 * @param {string} file
 * @param {Set<string>} [seen] configs on the way here, so a cycle ends
 * @returns {ReadConfig | null}
 */
function readConfig(file, seen = new Set()) {
  if (seen.has(file)) return null;
  const json = readJsonc(file);
  if (!json) return null;
  const dir = path.dirname(file);
  // A jsconfig.json takes JavaScript files unless it says otherwise.
  /** @type {Record<string, unknown>} */
  const options = path.basename(file) === 'jsconfig.json' ? {allowJs: true} : {};
  /** @type {ReadConfig} */
  const config = {options, baseUrlDir: dir, pathsDir: dir, pathsFile: null, files: null, include: null, exclude: null, references: []};
  const bases = Array.isArray(json.extends) ? json.extends : json.extends === undefined ? [] : [json.extends];
  for (const spec of bases) {
    const baseFile = extendedFile(spec, dir);
    const base = baseFile ? readConfig(baseFile, new Set([...seen, file])) : null;
    if (!base) continue;
    Object.assign(config.options, base.options);
    if ('baseUrl' in base.options) config.baseUrlDir = base.baseUrlDir;
    if ('paths' in base.options) {
      config.pathsDir = base.pathsDir;
      config.pathsFile = base.pathsFile;
    }
    for (const key of /** @type {const} */ (['files', 'include', 'exclude'])) config[key] = base[key] ?? config[key];
  }
  const own = json.compilerOptions && typeof json.compilerOptions === 'object' ? json.compilerOptions : {};
  for (const [key, value] of Object.entries(own)) {
    config.options[key] = value;
    if (key === 'baseUrl') config.baseUrlDir = dir;
    if (key === 'paths') {
      config.pathsDir = dir;
      config.pathsFile = file;
    }
  }
  for (const key of /** @type {const} */ (['files', 'include', 'exclude'])) {
    if (Array.isArray(json[key])) config[key] = {list: json[key], dir};
  }
  config.references = Array.isArray(json.references) ? json.references.filter((/** @type {unknown} */ ref) => ref !== null && typeof ref === 'object') : [];
  return config;
}

/**
 * A path a config writes, with `${configDir}` taken as the folder of the
 * config the project reads, and resolved from `from`.
 * @param {string} value
 * @param {string} from
 * @param {string} configDir
 */
const configPath = (value, from, configDir) => path.resolve(from, value.split('${configDir}').join(configDir));

/**
 * A TypeScript `include` or `exclude` pattern as a regular expression over
 * absolute, `/`-separated paths: `*` matches within a folder name, `?` one
 * character of one, and `**` any number of folders.
 * @param {string} pattern absolute
 */
function patternRegExp(pattern) {
  const segments = pattern.split(path.sep).join('/').split('/');
  const body = segments
    .map((segment, i) =>
      segment === '**'
        ? '(?:/[^/]+)*'
        : `${i === 0 ? '' : '/'}${segment
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '[^/]')}`,
    )
    .join('');
  return new RegExp(`^${body}$`, process.platform === 'win32' || process.platform === 'darwin' ? 'i' : '');
}

/**
 * Whether a config takes `file` as one of its own, by TypeScript's rules: a
 * `files` entry names it; or an `include` pattern matches it (a pattern
 * whose last part has no wildcard and no extension names a folder and all
 * below it), a wildcard matching only TypeScript files (and JavaScript ones
 * with `allowJs`), and no `exclude` pattern matches it or a folder above it.
 * @param {ReadConfig} config
 * @param {string} configDir
 * @param {string} file absolute
 */
function includesFile(config, configDir, file) {
  const at = file.split(path.sep).join('/');
  const files = config.files;
  if (files?.list.some(f => typeof f === 'string' && configPath(f, files.dir, configDir) === file)) return true;
  const include = config.include ?? (files ? null : {list: ['**/*'], dir: configDir});
  if (!include) return false;
  const allowJs = config.options.allowJs === true;
  const typed = /\.(?:tsx?|mts|cts)$/i.test(file) || (allowJs && /\.(?:jsx?|mjs|cjs)$/i.test(file));
  const included = include.list.some(spec => {
    if (typeof spec !== 'string') return false;
    const absolute = configPath(spec, include.dir, configDir);
    const last = path.basename(absolute);
    if (/[*?]/.test(last)) return typed && patternRegExp(absolute).test(at);
    if (path.extname(last)) return patternRegExp(absolute).test(at);
    return typed && patternRegExp(path.join(absolute, '**', '*')).test(at);
  });
  if (!included) return false;
  const exclude = config.exclude ?? {list: DEFAULT_EXCLUDE, dir: configDir};
  return !exclude.list.some(spec => {
    if (typeof spec !== 'string') return false;
    const pattern = patternRegExp(configPath(spec, exclude.dir, configDir));
    for (let d = at; d.includes('/'); d = d.slice(0, d.lastIndexOf('/'))) if (pattern.test(d)) return true;
    return false;
  });
}

/**
 * The path patterns a read config gives.
 * @param {ReadConfig} config
 * @param {string} configDir the folder of the config the project reads
 * @returns {PathPattern[]}
 */
function patternsOf(config, configDir) {
  const {paths, baseUrl} = config.options;
  if (!paths || typeof paths !== 'object') return [];
  const base = typeof baseUrl === 'string' ? configPath(baseUrl, config.baseUrlDir, configDir) : config.pathsDir;
  /** @type {PathPattern[]} */
  const out = [];
  for (const [key, targets] of Object.entries(paths)) {
    if (!Array.isArray(targets)) continue;
    const star = key.indexOf('*');
    if (star !== key.lastIndexOf('*')) continue;
    out.push({
      key,
      prefix: star === -1 ? key : key.slice(0, star),
      suffix: star === -1 ? '' : key.slice(star + 1),
      wildcard: star !== -1,
      targets: targets
        .filter(t => typeof t === 'string' && t.indexOf('*') === t.lastIndexOf('*'))
        .map(t => configPath(t, base, configDir)),
    });
  }
  return out;
}

/**
 * The config TypeScript reads for a file, which need not exist yet: the
 * nearest tsconfig.json (else jsconfig.json) in its folder or above, read
 * through `extends`. When that config does not take the file as its own, a
 * project it references (at any depth) that does, as TypeScript finds a
 * file's project behind a solution-style config; when none does, the nearest
 * config still.
 * @param {string} file absolute
 * @returns {{file: string, config: ReadConfig} | null}
 */
function configFor(file) {
  /** @type {string | null} */
  let nearest = null;
  for (let d = path.dirname(file); !nearest; d = path.dirname(d)) {
    nearest = CONFIG_NAMES.map(name => path.join(d, name)).find(isFile) ?? null;
    if (path.dirname(d) === d) break;
  }
  if (!nearest) return null;
  const visited = new Set();
  /** @type {(configFile: string) => {file: string, config: ReadConfig} | null} */
  const owning = configFile => {
    if (visited.has(configFile)) return null;
    visited.add(configFile);
    const config = readConfig(configFile);
    if (!config) return null;
    const dir = path.dirname(configFile);
    if (includesFile(config, dir, file)) return {file: configFile, config};
    for (const ref of config.references) {
      if (typeof ref.path !== 'string') continue;
      const target = path.resolve(dir, ref.path);
      const next = isFile(target) ? target : path.join(target, 'tsconfig.json');
      const hit = isFile(next) ? owning(next) : null;
      if (hit) return hit;
    }
    return null;
  };
  const found = owning(nearest);
  if (found) return found;
  // No project takes the file as its own: the nearest config still applies,
  // as it always did for a page outside its `include`.
  const config = readConfig(nearest);
  return config ? {file: nearest, config} : null;
}

/**
 * The path patterns that apply to a file, which need not exist yet: those of
 * the config TypeScript reads for it (see configFor).
 * @param {string} file absolute
 * @returns {PathPattern[]}
 */
export function pathsFor(file) {
  const found = configFor(file);
  return found ? patternsOf(found.config, path.dirname(found.file)) : [];
}

/**
 * Where `paths` entries for a file belong: the config TypeScript reads for
 * it, else a new `tsconfig.json` in `fallbackDir`; the folder the entries'
 * targets resolve from there (its `baseUrl`, else that config's own folder,
 * which writes the entries); and the patterns it has now, its own or
 * inherited through `extends` (a `paths` of its own replaces inherited ones).
 * @param {string} file absolute, which need not exist yet
 * @param {string} fallbackDir absolute: where a project with no config would add one
 * @returns {{config: string, base: string, current: PathPattern[]}}
 */
export function pathsHomeFor(file, fallbackDir) {
  const found = configFor(file);
  if (!found) return {config: path.join(fallbackDir, 'tsconfig.json'), base: fallbackDir, current: []};
  const configDir = path.dirname(found.file);
  const {baseUrl} = found.config.options;
  return {
    config: found.file,
    base: typeof baseUrl === 'string' ? configPath(baseUrl, found.config.baseUrlDir, configDir) : configDir,
    current: patternsOf(found.config, configDir),
  };
}

/**
 * The pattern a specifier matches by TypeScript's rules, and what its `*`
 * matched: an exact key first, else the wildcard key with the longest prefix.
 * @param {PathPattern[]} patterns
 * @param {string} spec
 * @returns {{pattern: PathPattern, capture: string} | null}
 */
export function matchPath(patterns, spec) {
  // TypeScript applies `paths` only to bare specifiers.
  if (/^\.{1,2}(\/|$)|^\//.test(spec)) return null;
  const exact = patterns.find(p => !p.wildcard && p.key === spec);
  if (exact) return {pattern: exact, capture: ''};
  /** @type {{pattern: PathPattern, capture: string} | null} */
  let best = null;
  for (const p of patterns) {
    if (!p.wildcard) continue;
    if (spec.length < p.prefix.length + p.suffix.length) continue;
    if (!spec.startsWith(p.prefix) || !spec.endsWith(p.suffix)) continue;
    if (best && best.pattern.prefix.length >= p.prefix.length) continue;
    best = {pattern: p, capture: spec.slice(p.prefix.length, spec.length - p.suffix.length)};
  }
  return best;
}

/**
 * The absolute paths a match names, one per target, in order.
 * @param {{pattern: PathPattern, capture: string}} match
 * @returns {string[]}
 */
export const candidatesOf = match => match.pattern.targets.map(t => t.replace('*', match.capture));

/**
 * The file a candidate path stands for: itself, with an extension, or its
 * folder's index; null when none exists.
 * @param {string} candidate
 * @param {readonly string[]} [extensions] the extensions to try, in order (default: TypeScript's)
 * @returns {string | null}
 */
export function existingFile(candidate, extensions = EXTENSIONS) {
  const isFile = (/** @type {string} */ f) => {
    try {
      return fs.statSync(f).isFile();
    } catch {
      return false;
    }
  };
  if (isFile(candidate)) return candidate;
  for (const ext of extensions) if (isFile(candidate + ext)) return candidate + ext;
  for (const ext of extensions) if (isFile(path.join(candidate, `index${ext}`))) return path.join(candidate, `index${ext}`);
  return null;
}

/**
 * Resolve a specifier through path patterns: the first target that names an
 * existing file wins.
 * @param {PathPattern[]} patterns
 * @param {string} spec
 * @returns {string | null} the file, or null when the specifier matches no
 *   pattern or no target exists
 */
export function resolvePath(patterns, spec) {
  const match = matchPath(patterns, spec);
  if (!match) return null;
  for (const candidate of candidatesOf(match)) {
    const file = existingFile(candidate);
    if (file) return file;
  }
  return null;
}
