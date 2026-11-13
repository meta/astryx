// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file VCS-neutral protection for existing consumer files.
 *
 * Reads declarations from the working tree only. No Git, Sapling, or Mercurial
 * process is invoked, so the same checkout bytes produce the same answer in
 * every supported environment.
 */

import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';

/**
 * The `ignore` matcher factory, loaded on first use: this module is reached
 * from every CLI run through the agent-docs helpers, and only a run that
 * classifies a file needs the matcher.
 * @type {typeof import('ignore') | undefined}
 */
let ignoreFactory;

/** @param {import('ignore').Options} [options] */
function ignore(options) {
  ignoreFactory ??= createRequire(import.meta.url)('ignore');
  return /** @type {typeof import('ignore')} */ (ignoreFactory)(options);
}

const DEPENDENCY_DIRS = new Set([
  'node_modules',
  'bower_components',
  'jspm_packages',
]);
const YARN_DEPENDENCY_DIRS = new Set([
  '__virtual__',
  'cache',
  'sdks',
  'unplugged',
]);
const YARN_DEPENDENCY_FILES = new Set(['install-state.gz']);
const VCS_DIRS = new Set(['.git', '.hg', '.sl']);
const PROTECTION_FILES = new Set(['.gitattributes', '.gitignore', '.hgignore']);

/** A stable failure raised before any consumer write. */
export class ProtectionSourceError extends Error {
  /** @param {string} source @param {string} reason */
  constructor(source, reason) {
    super(`Could not read file-protection source ${source}: ${reason}`);
    this.name = 'ProtectionSourceError';
    this.code = 'ERR_CODEMOD_PROTECTION_SOURCE';
    this.source = source;
  }
}

/** @param {string} value */
function slash(value) {
  return value.split(path.sep).join('/');
}

/** @param {string} candidate @param {string} root */
function relativeWithin(candidate, root) {
  const relative = path.relative(root, candidate);
  if (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  ) {
    return slash(relative);
  }
  return null;
}

/**
 * Translate the path globs used by attributes and Mercurial into a RegExp.
 * `*` and `?` never cross a path separator; `**` does.
 * @param {string} pattern
 * @param {{basename?: boolean}} [options]
 */
function globRegex(pattern, {basename = false} = {}) {
  let out = basename ? '(?:^|/)' : '^';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        while (pattern[i + 1] === '*') i++;
        if (pattern[i + 1] === '/') {
          i++;
          out += '(?:.*/)?';
        } else {
          out += '.*';
        }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else if (c === '[') {
      const end = pattern.indexOf(']', i + 1);
      if (end === -1) throw new Error('unterminated character class');
      let cls = pattern.slice(i + 1, end);
      if (cls.startsWith('!')) cls = `^${cls.slice(1)}`;
      out += `[${cls.replace(/\\/g, '\\\\')}]`;
      i = end;
    } else if (c === '\\' && i + 1 < pattern.length) {
      i++;
      out += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else {
      out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    i++;
  }
  out += '$';
  return new RegExp(out);
}

/** @param {string} line */
function splitAttributeLine(line) {
  /** @type {string[]} */
  const tokens = [];
  let token = '';
  let escaped = false;
  let quoted = false;
  const text = line.trim();
  for (let index = 0; index < text.length; index++) {
    const c = text[index];
    if (escaped) {
      const octal = quoted ? /^[0-7]{1,3}/.exec(text.slice(index)) : null;
      if (octal) {
        token += String.fromCodePoint(Number.parseInt(octal[0], 8));
        index += octal[0].length - 1;
      } else if (quoted) {
        token += c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c;
      } else {
        // Keep pattern escapes so globRegex can distinguish a literal wildcard
        // from a wildcard. Escaped whitespace is only tokenization syntax.
        token += /\s/.test(c) ? c : `\\${c}`;
      }
      escaped = false;
    } else if (c === '\\') {
      escaped = true;
    } else if (c === '"') {
      quoted = !quoted;
    } else if (/\s/.test(c) && !quoted) {
      if (token) {
        tokens.push(token);
        token = '';
      }
    } else {
      token += c;
    }
  }
  if (escaped) token += '\\';
  if (quoted) throw new Error('unterminated quoted pattern');
  if (token) tokens.push(token);
  return tokens;
}

/**
 * @param {string[]} tokens
 * @param {Map<string, Map<string, boolean|null>>} macros
 */
function parseAttributeAssignments(tokens, macros) {
  /** @type {Map<string, boolean|null>} */
  const attributes = new Map();
  for (const token of tokens) {
    const macro = macros.get(token);
    if (macro) {
      for (const [name, value] of macro) attributes.set(name, value);
      continue;
    }
    const decorated = token.startsWith('-') || token.startsWith('!');
    const decoratedName = decorated ? token.slice(1) : token;
    if (token.startsWith('-')) attributes.set(decoratedName, false);
    else if (token.startsWith('!')) attributes.set(decoratedName, null);
    else {
      const equals = token.indexOf('=');
      const name = equals === -1 ? token : token.slice(0, equals);
      const value = equals === -1 ? 'true' : token.slice(equals + 1);
      attributes.set(name, value.toLowerCase() !== 'false');
    }
  }
  return attributes;
}

/**
 * @param {string} source
 * @param {string} contents
 * @param {Map<string, Map<string, boolean|null>>} macros
 * @param {boolean} topLevel
 * @returns {Array<{pattern: RegExp, attributes: Map<string, boolean|null>, line: number}>}
 */
function parseAttributes(source, contents, macros, topLevel) {
  const rules = [];
  const lines = contents.split(/\r?\n/);
  if (topLevel) {
    /** @type {Map<string, {tokens: string[], line: number}>} */
    const definitions = new Map();
    for (let index = 0; index < lines.length; index++) {
      const raw = lines[index].trim();
      if (!raw || raw.startsWith('#')) continue;
      let tokens;
      try {
        tokens = splitAttributeLine(raw);
      } catch (error) {
        throw new ProtectionSourceError(
          source,
          `invalid rule on line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const pattern = tokens.shift();
      if (!pattern?.startsWith('[attr]')) continue;
      const name = pattern.slice('[attr]'.length);
      if (!name || tokens.length === 0) {
        throw new ProtectionSourceError(
          source,
          `invalid attribute macro on line ${index + 1}`,
        );
      }
      definitions.set(name, {tokens, line: index + 1});
    }
    const resolving = new Set();
    /** @param {string} name */
    const resolveMacro = name => {
      if (macros.has(name)) return macros.get(name);
      const definition = definitions.get(name);
      if (!definition) return undefined;
      if (resolving.has(name)) {
        throw new ProtectionSourceError(
          source,
          `cyclic attribute macro on line ${definition.line}`,
        );
      }
      resolving.add(name);
      for (const token of definition.tokens) {
        if (definitions.has(token)) resolveMacro(token);
      }
      const attributes = parseAttributeAssignments(definition.tokens, macros);
      macros.set(name, attributes);
      resolving.delete(name);
      return attributes;
    };
    for (const name of definitions.keys()) resolveMacro(name);
  }
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index].trim();
    if (!raw || raw.startsWith('#')) continue;
    let tokens;
    try {
      tokens = splitAttributeLine(raw);
    } catch (error) {
      throw new ProtectionSourceError(
        source,
        `invalid rule on line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (tokens.length < 2) {
      throw new ProtectionSourceError(
        source,
        `invalid rule on line ${index + 1}`,
      );
    }
    let pattern = tokens.shift();
    if (!pattern || pattern.startsWith('!')) {
      throw new ProtectionSourceError(
        source,
        `invalid pattern on line ${index + 1}`,
      );
    }
    if (pattern.startsWith('[attr]')) {
      const name = pattern.slice('[attr]'.length);
      if (!topLevel || !name) {
        throw new ProtectionSourceError(
          source,
          `invalid attribute macro on line ${index + 1}`,
        );
      }
      continue;
    }
    pattern = pattern.replace(/^\//, '');
    const basename = !pattern.includes('/');
    let matcher;
    try {
      matcher = globRegex(pattern, {basename});
    } catch (error) {
      throw new ProtectionSourceError(
        source,
        `invalid pattern on line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const attributes = parseAttributeAssignments(tokens, macros);
    rules.push({pattern: matcher, attributes, line: index + 1});
  }
  return rules;
}

/** @param {string} contents @param {string} filePath */
function generatedMarker(contents, filePath) {
  const text = contents.slice(0, 65_536);
  const extension = path.extname(filePath).toLowerCase();
  const hashComments =
    text.startsWith('#!') ||
    new Set([
      '.py',
      '.pyi',
      '.rb',
      '.sh',
      '.bash',
      '.zsh',
      '.yaml',
      '.yml',
      '.toml',
    ]).has(extension);
  const dashComments = new Set(['.sql', '.lua']).has(extension);
  let cursor = 0;
  if (text.startsWith('#!')) {
    const end = text.indexOf('\n');
    cursor = end === -1 ? text.length : end + 1;
  }
  /** @type {string[]} */
  const comments = [];
  while (cursor < text.length) {
    const ws = /^\s+/.exec(text.slice(cursor));
    if (ws) cursor += ws[0].length;
    if (
      text.startsWith('//', cursor) ||
      (hashComments && text.startsWith('#', cursor)) ||
      (dashComments && text.startsWith('--', cursor))
    ) {
      const end = text.indexOf('\n', cursor);
      comments.push(text.slice(cursor, end === -1 ? text.length : end));
      cursor = end === -1 ? text.length : end + 1;
      continue;
    }
    const block = text.startsWith('/*', cursor)
      ? ['/*', '*/']
      : text.startsWith('<!--', cursor)
        ? ['<!--', '-->']
        : null;
    if (block) {
      const end = text.indexOf(block[1], cursor + block[0].length);
      if (end === -1) break;
      comments.push(text.slice(cursor, end + block[1].length));
      cursor = end + block[1].length;
      continue;
    }
    break;
  }
  const leading = comments.join('\n');
  if (/(?:^|[^\w-])@partially-generated(?:[^\w-]|$)/i.test(leading))
    return '@partially-generated in the leading comment block';
  if (/(?:^|[^\w-])@generated(?:[^\w-]|$)/i.test(leading))
    return '@generated in the leading comment block';
  if (/Code generated\b[^\r\n]*\bDO NOT EDIT\./.test(leading))
    return 'Code generated ... DO NOT EDIT. in the leading comment block';
  return null;
}

/** @param {string} contents */
function generatedCommand(contents) {
  const match = contents
    .slice(0, 65_536)
    .match(/^\s*(?:\/\/|\*|#|<!--)?\s*Command:\s*(.+?)\s*(?:\*\/|-->)?\s*$/m);
  return match?.[1]?.trim() || undefined;
}

/**
 * @typedef {{file: string, reason: 'generated'|'vendored'|'ignored'|'dependency'|'vcs'|'symlink'|'outside-root', declaration: string, source?: string, line?: number, command?: string}} FileProtection
 */

/**
 * Create an eager, fail-closed resolver. Every declaration under root is parsed
 * before the caller can begin writing consumer files.
 * @param {string} root
 * @param {{overrides?: Map<string, string|null>}} [options]
 */
export function createFileProtectionResolver(
  root,
  {overrides = new Map()} = {},
) {
  const resolvedRoot = path.resolve(root);
  const normalizedOverrides = new Map(
    [...overrides].map(([file, contents]) => [path.resolve(file), contents]),
  );
  /** @type {string} */
  let realRoot;
  try {
    realRoot = fs.realpathSync(resolvedRoot);
  } catch (error) {
    throw new ProtectionSourceError(
      '.',
      error instanceof Error ? error.message : String(error),
    );
  }
  /** @type {Array<{file: string, dir: string, contents: string}>} */
  const rawAttributeSources = [];
  /** @type {Array<{file: string, dir: string, rules: ReturnType<typeof parseAttributes>}>} */
  const attributeSources = [];
  /** @type {Map<string, Map<string, boolean|null>>} */
  const attributeMacros = new Map();
  /** @type {Array<{file: string, dir: string, matcher: ReturnType<typeof ignore>}>} */
  const gitIgnoreSources = [];
  /** @type {Array<{file: string, dir: string, matcher: RegExp, line: number}>} */
  const hgIgnoreRules = [];
  const parsedHgFiles = new Set();
  const seenProtectionFiles = new Set();

  /** @param {string} file */
  function readProtectionFile(file) {
    const relative = slash(path.relative(resolvedRoot, file)) || '.';
    try {
      const override = normalizedOverrides.get(path.resolve(file));
      if (override === null) throw new Error('is deleted by the staged plan');
      const contents =
        override === undefined ? fs.readFileSync(file, 'utf-8') : override;
      if (contents.includes('\0')) throw new Error('contains a NUL byte');
      return {contents, relative};
    } catch (error) {
      if (error instanceof ProtectionSourceError) throw error;
      throw new ProtectionSourceError(
        relative,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /** @param {string} file @param {string} baseDir */
  function parseHgIgnore(file, baseDir) {
    const absolute = path.resolve(file);
    if (parsedHgFiles.has(absolute)) return;
    const within = relativeWithin(absolute, resolvedRoot);
    if (within == null) {
      throw new ProtectionSourceError(
        slash(path.relative(resolvedRoot, absolute)),
        'included source is outside the operation root',
      );
    }
    const virtualSource =
      normalizedOverrides.has(absolute) &&
      normalizedOverrides.get(absolute) !== null;
    if (!virtualSource) {
      let realSource;
      try {
        realSource = fs.realpathSync(absolute);
      } catch (error) {
        throw new ProtectionSourceError(
          within,
          error instanceof Error ? error.message : String(error),
        );
      }
      if (realSource !== path.resolve(realRoot, within)) {
        throw new ProtectionSourceError(
          within,
          'included source is reached through a symbolic link',
        );
      }
    } else {
      let ancestor = path.dirname(absolute);
      while (!fs.existsSync(ancestor) && ancestor !== resolvedRoot) {
        ancestor = path.dirname(ancestor);
      }
      const ancestorWithin = relativeWithin(ancestor, resolvedRoot);
      if (
        ancestorWithin == null ||
        fs.realpathSync(ancestor) !== path.resolve(realRoot, ancestorWithin)
      ) {
        throw new ProtectionSourceError(
          within,
          'staged source is beneath a symbolic link',
        );
      }
    }
    parsedHgFiles.add(absolute);
    const {contents, relative} = readProtectionFile(absolute);
    let syntax = 'regexp';
    const lines = contents.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const raw = lines[index].trim();
      if (!raw || raw.startsWith('#')) continue;
      if (raw.startsWith('syntax:')) {
        syntax = raw.slice('syntax:'.length).trim();
        if (syntax !== 'glob' && syntax !== 'regexp') {
          throw new ProtectionSourceError(
            relative,
            `unknown syntax on line ${index + 1}`,
          );
        }
        continue;
      }
      if (raw.startsWith('include:') || raw.startsWith('subinclude:')) {
        const sub = raw.startsWith('subinclude:');
        const includePath = raw.slice(raw.indexOf(':') + 1).trim();
        if (!includePath)
          throw new ProtectionSourceError(
            relative,
            `empty include on line ${index + 1}`,
          );
        const included = path.resolve(path.dirname(absolute), includePath);
        parseHgIgnore(included, sub ? path.dirname(included) : baseDir);
        continue;
      }
      let kind = syntax;
      let pattern = raw;
      if (raw.startsWith('glob:')) {
        kind = 'glob';
        pattern = raw.slice(5);
      } else if (raw.startsWith('re:')) {
        kind = 'regexp';
        pattern = raw.slice(3);
      }
      try {
        const matcher =
          kind === 'glob'
            ? globRegex(pattern.replace(/^\//, ''), {
                basename: !pattern.includes('/'),
              })
            : new RegExp(pattern);
        hgIgnoreRules.push({
          file: relative,
          dir: baseDir,
          matcher,
          line: index + 1,
        });
      } catch (error) {
        throw new ProtectionSourceError(
          relative,
          `invalid ${kind} pattern on line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /** @param {string} dir */
  function scan(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, {withFileTypes: true});
    } catch (error) {
      throw new ProtectionSourceError(
        slash(path.relative(resolvedRoot, dir)) || '.',
        error instanceof Error ? error.message : String(error),
      );
    }
    // Parent declarations (and attribute macros) must be parsed before child
    // directories regardless of filesystem enumeration order.
    entries.sort((a, b) => Number(a.isDirectory()) - Number(b.isDirectory()));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        const relativeParts = slash(path.relative(resolvedRoot, full)).split(
          '/',
        );
        if (
          DEPENDENCY_DIRS.has(entry.name) ||
          VCS_DIRS.has(entry.name) ||
          (relativeParts[0] === '.yarn' &&
            YARN_DEPENDENCY_DIRS.has(relativeParts[1]))
        )
          continue;
        scan(full);
        continue;
      }
      if (!PROTECTION_FILES.has(entry.name)) continue;
      if (entry.name === '.hgignore' && dir !== resolvedRoot) continue;
      seenProtectionFiles.add(path.resolve(full));
      if (normalizedOverrides.get(path.resolve(full)) === null) continue;
      const {contents, relative} = readProtectionFile(full);
      if (entry.name === '.gitattributes') {
        rawAttributeSources.push({file: relative, dir, contents});
      } else if (entry.name === '.gitignore') {
        try {
          gitIgnoreSources.push({
            file: relative,
            dir,
            matcher: ignore({ignorecase: false}).add(contents),
          });
        } catch (error) {
          throw new ProtectionSourceError(
            relative,
            error instanceof Error ? error.message : String(error),
          );
        }
      } else if (dir === resolvedRoot) {
        // Mercurial reads only the repository-root .hgignore directly. Nested
        // rule files participate through include:/subinclude: directives.
        parseHgIgnore(full, dir);
      }
    }
  }

  scan(resolvedRoot);
  for (const [absolute, contents] of normalizedOverrides) {
    if (contents === null || seenProtectionFiles.has(absolute)) continue;
    const name = path.basename(absolute);
    if (!PROTECTION_FILES.has(name)) continue;
    const relative = relativeWithin(absolute, resolvedRoot);
    if (relative == null) continue;
    const dir = path.dirname(absolute);
    if (name === '.hgignore' && dir !== resolvedRoot) continue;
    if (contents.includes('\0')) {
      throw new ProtectionSourceError(relative, 'contains a NUL byte');
    }
    if (name === '.gitattributes') {
      rawAttributeSources.push({file: relative, dir, contents});
    } else if (name === '.gitignore') {
      try {
        gitIgnoreSources.push({
          file: relative,
          dir,
          matcher: ignore({ignorecase: false}).add(contents),
        });
      } catch (error) {
        throw new ProtectionSourceError(
          relative,
          error instanceof Error ? error.message : String(error),
        );
      }
    } else {
      parseHgIgnore(absolute, dir);
    }
  }
  rawAttributeSources.sort(
    (a, b) => a.dir.length - b.dir.length || a.file.localeCompare(b.file),
  );
  for (const source of rawAttributeSources) {
    attributeSources.push({
      file: source.file,
      dir: source.dir,
      rules: parseAttributes(
        source.file,
        source.contents,
        attributeMacros,
        source.dir === resolvedRoot,
      ),
    });
  }
  attributeSources.sort(
    (a, b) => a.dir.length - b.dir.length || a.file.localeCompare(b.file),
  );
  gitIgnoreSources.sort(
    (a, b) => a.dir.length - b.dir.length || a.file.localeCompare(b.file),
  );

  /** @param {string} target @param {number} end @param {boolean} directory */
  function gitIgnoredBy(
    target,
    end = gitIgnoreSources.length,
    directory = false,
  ) {
    let state = null;
    for (let index = 0; index < end; index++) {
      const source = gitIgnoreSources[index];
      let relative = relativeWithin(target, source.dir);
      if (relative == null || relative === '') continue;
      if (directory) relative += '/';
      // Git never reads a nested ignore file whose parent was excluded by an
      // earlier source. This preserves the "cannot re-include beneath an
      // excluded parent" rule while still allowing lower-file precedence.
      const sourceIndex = gitIgnoreSources.indexOf(source);
      if (
        source.dir !== resolvedRoot &&
        gitIgnoredBy(source.dir, sourceIndex, true)?.ignored
      ) {
        continue;
      }
      const tested = source.matcher.test(relative);
      if (tested.ignored) state = {ignored: true, source, relative};
      else if (tested.unignored) state = {ignored: false, source, relative};
    }
    return state;
  }

  /** @param {string} filePath @returns {FileProtection[]} */
  function classify(filePath) {
    const absolute = path.resolve(filePath);
    const relative = relativeWithin(absolute, resolvedRoot);
    if (relative == null) {
      return [
        {
          file: slash(path.relative(resolvedRoot, absolute)),
          reason: 'outside-root',
          declaration: 'outside the operation root',
        },
      ];
    }
    const parts = relative.split('/').filter(Boolean);
    if (
      (parts.length === 1 &&
        /^\.pnp\.(?:cjs|loader\.mjs|data\.json)$/.test(parts[0])) ||
      (parts[0] === '.yarn' &&
        (YARN_DEPENDENCY_DIRS.has(parts[1]) ||
          (parts.length === 2 && YARN_DEPENDENCY_FILES.has(parts[1]))))
    ) {
      return [
        {
          file: relative,
          reason: 'dependency',
          declaration: `installed dependency metadata ${parts.slice(0, 2).join('/')}`,
        },
      ];
    }
    for (const part of parts) {
      if (DEPENDENCY_DIRS.has(part))
        return [
          {
            file: relative,
            reason: 'dependency',
            declaration: `installed dependency directory ${part}`,
          },
        ];
      if (VCS_DIRS.has(part))
        return [
          {
            file: relative,
            reason: 'vcs',
            declaration: `version-control metadata directory ${part}`,
          },
        ];
    }
    let current = resolvedRoot;
    for (const part of parts) {
      current = path.join(current, part);
      try {
        if (fs.lstatSync(current).isSymbolicLink()) {
          return [
            {
              file: relative,
              reason: 'symlink',
              declaration: `symbolic link at ${slash(path.relative(resolvedRoot, current))}`,
            },
          ];
        }
      } catch (error) {
        if (
          current === absolute &&
          /** @type {any} */ (error).code === 'ENOENT'
        )
          break;
        throw new ProtectionSourceError(
          relative,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    /** @type {FileProtection[]} */
    const protections = [];
    const ignored = gitIgnoredBy(absolute);
    if (ignored?.ignored) {
      protections.push({
        file: relative,
        reason: 'ignored',
        declaration: `excluded by ${ignored.source.file}`,
        source: ignored.source.file,
      });
    }
    for (const rule of hgIgnoreRules) {
      const candidate = relativeWithin(absolute, rule.dir);
      if (candidate != null && rule.matcher.test(candidate)) {
        protections.push({
          file: relative,
          reason: 'ignored',
          declaration: `excluded by ${rule.file}:${rule.line}`,
          source: rule.file,
          line: rule.line,
        });
      }
    }

    /** @type {Map<string, {value: boolean|null, source: string, line: number}>} */
    const attributes = new Map();
    for (const source of attributeSources) {
      const candidate = relativeWithin(absolute, source.dir);
      if (candidate == null || candidate === '') continue;
      for (const rule of source.rules) {
        if (!rule.pattern.test(candidate)) continue;
        for (const [name, value] of rule.attributes) {
          attributes.set(name, {value, source: source.file, line: rule.line});
        }
      }
    }
    for (const [name, reason] of [
      ['linguist-generated', 'generated'],
      ['linguist-vendored', 'vendored'],
    ]) {
      const attribute = attributes.get(name);
      if (attribute?.value === true) {
        protections.push({
          file: relative,
          reason: /** @type {'generated'|'vendored'} */ (reason),
          declaration: `${name} in ${attribute.source}:${attribute.line}`,
          source: attribute.source,
          line: attribute.line,
        });
      }
    }

    const hasContentOverride = normalizedOverrides.has(absolute);
    const contentOverride = normalizedOverrides.get(absolute);
    if (
      contentOverride !== null &&
      (hasContentOverride ||
        (fs.existsSync(absolute) && fs.statSync(absolute).isFile()))
    ) {
      let contents;
      try {
        contents = hasContentOverride
          ? /** @type {string} */ (contentOverride)
          : fs.readFileSync(absolute, 'utf-8');
      } catch (error) {
        throw new ProtectionSourceError(
          relative,
          error instanceof Error ? error.message : String(error),
        );
      }
      const marker = generatedMarker(contents, absolute);
      const command = generatedCommand(contents);
      if (marker) {
        protections.push({
          file: relative,
          reason: 'generated',
          declaration: marker,
          command,
        });
      }
      if (command) {
        for (const item of protections) {
          if (item.reason === 'generated' && !item.command)
            item.command = command;
        }
      }
    }
    return protections;
  }

  return Object.freeze({root: resolvedRoot, classify});
}
