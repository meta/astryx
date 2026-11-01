// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Generate one published package's public API report.
 *
 * @input  a published package after its build: the `exports` map, the built
 *         declarations each entry point's `types` names, its built
 *         stylesheets, its component docs' theming targets, and the public
 *         `data-astryx-*` attributes the INV23 lint rule allows
 * @output one deterministic Markdown report: a section per entry point, then
 *         the package's stylesheets, theme targets, public attributes, and the
 *         reachable members tagged internal
 * @position scripts/api-report — read by `pnpm api:report` and by the pull
 *           request report's API changes (architecture:public-component-api INV24)
 *
 * Every row is one line, so a report diffs line by line and `parseReport()`
 * can key each row by entry point, section, item, and member. Rows sit in
 * `text` fences so Prettier leaves them as written. Types the compiler infers
 * (StyleX objects, token maps) can run to kilobytes; they are capped with a
 * content hash, so a change still shows as a changed row.
 */

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const require = createRequire(import.meta.url);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DISCOVERY = path.join(
  SCRIPT_DIR,
  '../../packages/cli/foundation/discovery',
);
const PRIVATE_ATTRIBUTE_RULE = path.join(
  SCRIPT_DIR,
  '../../internal/eslint-plugin-astryx/no-raw-private-attribute.js',
);

const CODE = /\.(m|c)?(t|j)sx?$/;
const CSS = /\.css$/;
const MAX_TYPE = 200;
const FENCE = '```text';

const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const norm = s =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/import\("[^"]+"\)\./g, '')
    .replace(/\s+/g, ' ')
    .replace(/;\s*}/g, ' }')
    .replace(/;$/, '')
    .trim();
const cap = s =>
  s.length <= MAX_TYPE
    ? s
    : `${s.slice(0, MAX_TYPE - 40)} … #${createHash('sha1').update(s).digest('hex').slice(0, 8)}`;
const kebabAttr = p =>
  `data-${p.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;

/**
 * The file an entry point publishes: its stylesheet for a stylesheet entry,
 * otherwise its built declarations, falling back to the module itself.
 * @param {unknown} target
 * @returns {string|null}
 */
function entryFile(target) {
  if (typeof target === 'string') return target;
  if (!target || typeof target !== 'object') return null;
  const t = /** @type {Record<string, unknown>} */ (target);
  const css = ['default', 'import']
    .map(k => t[k])
    .find(f => typeof f === 'string' && CSS.test(f));
  if (css) return /** @type {string} */ (css);
  for (const k of ['types', 'import', 'default', 'require']) {
    if (t[k]) return entryFile(t[k]);
  }
  return null;
}

/**
 * What a subpath pattern's `*` stands for today, sorted (`./locales/*.json`
 * -> `en-US`, `fr-FR`, …).
 * @param {string} pkgDir
 * @param {string} file - the pattern's target, with one `*`
 * @returns {string[]}
 */
function patternMatches(pkgDir, file) {
  const dir = path.resolve(pkgDir, path.dirname(file));
  const [before, after] = path.basename(file).split('*');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(
      f =>
        f.startsWith(before) &&
        f.endsWith(after) &&
        f.length > before.length + after.length,
    )
    .map(f => f.slice(before.length, f.length - after.length))
    .sort(byName);
}

/**
 * A package's reported entry points, sorted. Core's `./internal/*` subpaths
 * are left out (INV24).
 * @param {string} pkgDir
 * @param {any} pkg - its package.json
 */
function readEntries(pkgDir, pkg) {
  const map =
    typeof pkg.exports === 'string' || pkg.exports == null
      ? {'.': pkg.exports ?? pkg.main}
      : pkg.exports;
  return Object.keys(map)
    .filter(subpath => !/^\.\/internal(\/|$)/.test(subpath))
    .sort(byName)
    .map(subpath => {
      const file = entryFile(map[subpath]);
      if (file && subpath.includes('*'))
        return {
          subpath,
          file,
          abs: null,
          kind: 'pattern',
          matches: patternMatches(pkgDir, file),
        };
      const abs = file ? path.resolve(pkgDir, file) : null;
      const exists = !!abs && fs.existsSync(abs);
      return {
        subpath,
        file,
        abs,
        kind: !exists
          ? 'missing'
          : CODE.test(abs)
            ? 'code'
            : CSS.test(abs)
              ? 'css'
              : 'asset',
      };
    });
}

const COMPILER_OPTIONS = ts => ({
  allowJs: true,
  checkJs: false,
  noEmit: true,
  skipLibCheck: true,
  strict: true,
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  types: [],
});

/**
 * A compiler host that parses each file once per process. Each package still
 * gets its own program — a program over several packages would merge one
 * package's module augmentations into another's report — but the standard
 * library and shared dependencies are parsed only once.
 */
let sharedHost = null;
function compilerHost(ts) {
  if (sharedHost) return sharedHost;
  const host = ts.createCompilerHost(COMPILER_OPTIONS(ts));
  const cache = new Map();
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, ...rest) => {
    const key = `${fileName}\0${typeof languageVersion === 'object' ? languageVersion.languageVersion : languageVersion}`;
    if (!cache.has(key))
      cache.set(key, getSourceFile(fileName, languageVersion, ...rest));
    return cache.get(key);
  };
  sharedHost = host;
  return host;
}

/**
 * @param {{repoRoot: string, packageDir: string}} opts
 * @returns {Promise<string>}
 */
export async function generateReport(opts) {
  const {repoRoot, packageDir} = opts;
  // Report a package on its own: see compilerHost().
  const ts = require('typescript');
  const pkgDir = path.resolve(repoRoot, packageDir);
  const pkg = JSON.parse(
    fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'),
  );
  const rel = f => path.relative(pkgDir, f).split(path.sep).join('/');
  const inPkg = sf =>
    !!sf &&
    sf.fileName.startsWith(pkgDir + path.sep) &&
    !sf.fileName.includes(`${path.sep}node_modules${path.sep}`);

  const entries = readEntries(pkgDir, pkg);
  const bin =
    typeof pkg.bin === 'string' ? {[pkg.name]: pkg.bin} : (pkg.bin ?? {});

  const program = ts.createProgram(
    entries.filter(e => e.kind === 'code').map(e => e.abs),
    COMPILER_OPTIONS(ts),
    compilerHost(ts),
  );
  const checker = program.getTypeChecker();
  const TF =
    ts.TypeFormatFlags.NoTruncation |
    ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType;
  const show = type => cap(norm(checker.typeToString(type, undefined, TF)));
  const declared = node => cap(norm(node.getText()));

  const tag = (decl, name) => {
    if (!decl) return undefined;
    const t = ts.getJSDocTags(decl).find(t => t.tagName.text === name);
    if (!t) return undefined;
    return norm(
      typeof t.comment === 'string'
        ? t.comment
        : (ts.getTextOfJSDocComment(t.comment) ?? ''),
    );
  };
  // `export declare const X` carries its JSDoc on the statement.
  const docHost = decl =>
    decl && ts.isVariableDeclaration(decl) ? decl.parent?.parent : decl;
  const marks = (decl, name) => {
    const host = docHost(decl);
    const out = [];
    if (tag(host, 'deprecated') !== undefined) out.push('@deprecated');
    if (
      tag(host, 'experimental') !== undefined ||
      /experimental/i.test(name ?? '')
    )
      out.push('@experimental');
    if (tag(host, 'internal') !== undefined) out.push('@internal');
    return out.length ? ` ${out.join(' ')}` : '';
  };

  function oneSig(sig) {
    const d = sig.getDeclaration();
    if (!d || !inPkg(d.getSourceFile()) || !d.parameters) {
      return cap(
        norm(
          checker.signatureToString(
            sig,
            undefined,
            TF | ts.TypeFormatFlags.WriteArrowStyleSignature,
          ),
        ),
      );
    }
    const tps = d.typeParameters
      ? `<${d.typeParameters.map(t => norm(t.getText())).join(', ')}>`
      : '';
    const params = d.parameters.map(p => {
      const name = ts.isIdentifier(p.name) ? p.name.text : '{…}';
      const t = p.type ? declared(p.type) : show(checker.getTypeAtLocation(p));
      return `${p.dotDotDotToken ? '...' : ''}${name}${p.questionToken || p.initializer ? '?' : ''}: ${t}`;
    });
    const ret = d.type ? declared(d.type) : show(sig.getReturnType());
    return `${tps}(${params.join(', ')}) => ${ret}`;
  }
  const sigLines = (type, head) => {
    const sigs = type.getCallSignatures().map(oneSig);
    return sigs.length === 1
      ? [`${head}: ${sigs[0]}`]
      : [head, ...sigs.map(s => `  overload ${s}`)];
  };

  function memberType(p, d) {
    if (ts.isMethodSignature(d) || ts.isMethodDeclaration(d)) {
      const t = checker.getNonNullableType(
        checker.getTypeOfSymbolAtLocation(p, d),
      );
      const sigs = t.getCallSignatures();
      return sigs.length ? sigs.map(oneSig).join(' | ') : show(t);
    }
    if (d.type) return declared(d.type);
    return show(checker.getTypeOfSymbolAtLocation(p, d));
  }

  // A unique-symbol key's internal name carries a program-specific id; print
  // the key as the declaration writes it (`[AREA]`, `[Symbol.iterator]`).
  const memberName = p => {
    if (!p.name.startsWith('__@')) return p.name;
    const n = p.declarations?.[0] && ts.getNameOfDeclaration(p.declarations[0]);
    return n ? norm(n.getText()) : p.name.replace(/@\d+$/, '');
  };

  /** Own members one per line; members declared outside the package fold into `inherits`. */
  function members(type, prefix = '') {
    const own = [];
    const inherits = new Set();
    const props = [...checker.getPropertiesOfType(type)].map(p => ({
      p,
      name: memberName(p),
    }));
    for (const {p, name} of props.sort((a, b) => byName(a.name, b.name))) {
      const d = p.declarations?.[0];
      if (d) {
        if (
          ts.getCombinedModifierFlags(d) &
          (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)
        )
          continue;
        if (d.name && ts.isPrivateIdentifier(d.name)) continue;
      }
      if (!d || !inPkg(d.getSourceFile())) {
        const parent = d?.parent;
        inherits.add(
          parent &&
            (ts.isInterfaceDeclaration(parent) ||
              ts.isTypeAliasDeclaration(parent))
            ? parent.name.text
            : '(external)',
        );
        continue;
      }
      const opt = p.flags & ts.SymbolFlags.Optional ? '?' : '';
      const def = tag(d, 'default');
      own.push(
        `  ${prefix}${name}${opt}: ${memberType(p, d)}${def ? ` = ${def}` : ''}${marks(d, name)}`,
      );
    }
    if (inherits.size)
      own.push(`  inherits ${[...inherits].sort(byName).join(', ')}`);
    return own;
  }

  const isContext = type =>
    !!(type.getProperty('Provider') && type.getProperty('Consumer'));
  function componentProps(name, type) {
    if (!/^[A-Z]/.test(name) || isContext(type)) return null;
    const sig = type.getCallSignatures()[0];
    if (!sig || sig.parameters.length > 2) return null;
    const exotic = !!type.getProperty('$$typeof');
    const returnsElement =
      /\b(JSX\.Element|ReactNode|ReactElement|Element)\b/.test(
        checker.typeToString(sig.getReturnType()),
      );
    if (!exotic && !returnsElement) return null;
    const p = sig.parameters[0];
    if (!p) return {propsName: null, propsType: null};
    const propsType = checker.getTypeOfSymbol(p);
    const alias = propsType.aliasSymbol?.name ?? propsType.symbol?.name;
    return {
      propsName: alias && !alias.startsWith('__') ? alias : null,
      propsType,
    };
  }

  // ---- entry point sections; each declaration is detailed once -----------
  const seen = new Map(); // declaration identity -> first entry point
  const propsOf = new Map(); // props type name -> component
  const internal = [];
  const sections = [];
  const ALSO = 'Also exported from an earlier entry point';

  for (const e of entries) {
    const head = `## \`${e.subpath}\``;
    if (e.kind === 'pattern') {
      // One row per module the pattern reaches; each is a separate entry point.
      sections.push({
        head,
        groups: {
          Matches: [[`pattern ${e.file}`, ...e.matches.map(m => `  ${m}`)]],
        },
      });
      continue;
    }
    if (e.kind !== 'code') {
      sections.push({
        head,
        lines: [
          `${e.kind === 'css' ? 'stylesheet' : e.kind} ${e.file ?? '(none)'}`,
        ],
      });
      continue;
    }
    const sf = program.getSourceFile(e.abs);
    // A CommonJS file has a module symbol but no location symbol.
    const modSym = sf && (checker.getSymbolAtLocation(sf) ?? sf.symbol);
    const exported = modSym ? [...checker.getExportsOfModule(modSym)] : [];
    exported.sort((a, b) => byName(a.name, b.name));
    /** @type {Record<string, any[]>} */
    const groups = {
      Components: [],
      Hooks: [],
      Functions: [],
      Classes: [],
      Values: [],
      Types: [],
      [ALSO]: [],
    };
    // A CommonJS entry (`module.exports = …`) exports one value.
    const exportEquals = modSym?.exports?.get(
      ts.InternalSymbolName.ExportEquals,
    );
    if (exportEquals && !exported.length) {
      const type = checker.getTypeOfSymbol(exportEquals);
      groups.Values.push([
        'module.exports',
        ...type.getCallSignatures().map(sig => `  (call): ${oneSig(sig)}`),
        ...members(type),
      ]);
      sections.push({head, groups, empty: false});
      continue;
    }

    for (const ex of exported) {
      const name = ex.name;
      const sym =
        ex.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(ex) : ex;
      const decls = sym.declarations ?? [];
      const decl = sym.valueDeclaration ?? decls[0];
      const identity = `${name}\0${decl ? rel(decl.getSourceFile().fileName) : ''}\0${decl?.pos ?? ''}`;
      if (seen.has(identity)) {
        groups[ALSO].push(`${name} (${seen.get(identity)})`);
        continue;
      }
      seen.set(identity, e.subpath);
      const m = marks(decl, name);
      if (m.includes('@internal')) internal.push(`${name} via ${e.subpath}`);

      if (sym.flags & ts.SymbolFlags.Class) {
        groups.Classes.push([
          `class ${name}${m}`,
          ...members(checker.getDeclaredTypeOfSymbol(sym)),
        ]);
      } else if (
        sym.flags &
        (ts.SymbolFlags.Function | ts.SymbolFlags.Variable)
      ) {
        const type = checker.getTypeOfSymbolAtLocation(sym, decl);
        const comp = componentProps(name, type);
        if (comp) {
          if (comp.propsName) propsOf.set(comp.propsName, name);
          groups.Components.push([
            `component ${name}${comp.propsName ? `(props: ${comp.propsName})` : ''}${m}`,
            ...(comp.propsType ? members(comp.propsType, 'prop ') : []),
          ]);
        } else if (isContext(type)) {
          groups.Values.push([
            `context ${name}${m}: ${decl?.type ? declared(decl.type) : show(type)}`,
          ]);
        } else if (type.getCallSignatures().length) {
          const hook = /^use[A-Z]/.test(name);
          groups[hook ? 'Hooks' : 'Functions'].push(
            sigLines(type, `${hook ? 'hook' : 'function'} ${name}${m}`),
          );
        } else {
          const full = checker.typeToString(type, undefined, TF);
          const named = decl?.type && ts.isTypeReferenceNode(decl.type);
          if (full.length > MAX_TYPE && type.getProperties().length && !named) {
            // A large object value lists its keys, one row each.
            groups.Values.push([
              `const ${name}${m}: object`,
              ...[...type.getProperties()].map(
                p =>
                  `  ${memberName(p)}: ${show(checker.getTypeOfSymbolAtLocation(p, decl))}`,
              ),
            ]);
          } else {
            groups.Values.push([
              `const ${name}${m}: ${decl?.type ? declared(decl.type) : show(type)}`,
            ]);
          }
        }
      }
      if (sym.flags & ts.SymbolFlags.Interface) {
        const d = decls.find(ts.isInterfaceDeclaration);
        const tp = d?.typeParameters
          ? `<${d.typeParameters.map(t => norm(t.getText())).join(', ')}>`
          : '';
        const ext =
          d?.heritageClauses?.flatMap(h =>
            h.types.map(t => norm(t.getText())),
          ) ?? [];
        groups.Types.push({
          name,
          head: `interface ${name}${tp}${ext.length ? ` extends ${ext.join(', ')}` : ''}${marks(d, name)}`,
          body: () => members(checker.getDeclaredTypeOfSymbol(sym)),
        });
      } else if (sym.flags & ts.SymbolFlags.TypeAlias) {
        const d = decls.find(ts.isTypeAliasDeclaration);
        const tp = d?.typeParameters
          ? `<${d.typeParameters.map(t => norm(t.getText())).join(', ')}>`
          : '';
        const literal = !!d && ts.isTypeLiteralNode(d.type);
        const value = d
          ? declared(d.type)
          : show(checker.getDeclaredTypeOfSymbol(sym));
        groups.Types.push({
          name,
          head: `type ${name}${tp}${marks(d, name)}${literal ? '' : ` = ${value}`}`,
          body: () =>
            literal ? members(checker.getDeclaredTypeOfSymbol(sym)) : [],
        });
      } else if (sym.flags & ts.SymbolFlags.Enum) {
        const d = decls.find(ts.isEnumDeclaration);
        groups.Types.push({
          name,
          head: `enum ${name}${marks(d, name)}`,
          body: () => d.members.map(x => `  ${norm(x.getText())}`),
        });
      }
    }
    sections.push({head, groups, empty: !exported.length});
  }

  // A component's props type is listed once, under the component.
  for (const s of sections) {
    if (!s.groups?.Types) continue;
    s.groups.Types = s.groups.Types.map(t =>
      propsOf.has(t.name)
        ? [`${t.head} (props of ${propsOf.get(t.name)})`]
        : [t.head, ...t.body()],
    );
    s.groups[ALSO] = s.groups[ALSO].length ? [s.groups[ALSO]] : [];
  }

  // ---- stylesheets: public custom properties -----------------------------
  const cssLines = [];
  for (const e of entries.filter(e => e.kind === 'css')) {
    const css = fs.readFileSync(e.abs, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const names = new Set();
    for (const m of css.matchAll(/(?:^|[;{\s])(--[A-Za-z][\w-]*)\s*:/g))
      names.add(m[1]);
    for (const n of [...names].sort(byName))
      cssLines.push(`var ${n} (${e.subpath})`);
  }

  // ---- theme targets and public attributes --------------------------------
  const theme = [];
  const attrs = new Map();
  const addAttr = (a, where) =>
    (attrs.get(a) ?? attrs.set(a, new Set()).get(a)).add(where);
  const src = path.join(pkgDir, 'src');
  if (fs.existsSync(src)) {
    // The CLI's enumeration is the one list theme authors see; reuse it.
    const {collectThemingTargets} = await import(
      pathToFileURL(path.join(DISCOVERY, 'theming-targets.mjs')).href
    );
    for (const t of await collectThemingTargets(src)) {
      const props = [...t.props].sort(byName);
      const states = [...t.states].sort(byName);
      theme.push(
        `target ${t.key} (${t.component})` +
          (props.length ? ` props [${props.join(', ')}]` : '') +
          (states.length ? ` states [${states.join(', ')}]` : ''),
      );
      for (const k of new Set([...props.map(p => p.split(':')[0]), ...states]))
        addAttr(kebabAttr(k), t.className);
    }
  }
  // The record names the public data-astryx-* attributes; list the ones this
  // package's built output writes. Every other name in that namespace is private.
  const built = [];
  const walk = dir => {
    for (const ent of fs.readdirSync(dir, {withFileTypes: true})) {
      const f = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(f);
      else if (/\.(m?js|css|d\.ts|d\.mts)$/.test(ent.name))
        built.push(fs.readFileSync(f, 'utf8'));
    }
  };
  for (const dir of new Set(
    entries
      .filter(e => e.abs && e.kind !== 'missing')
      .map(e => path.dirname(e.abs)),
  ))
    walk(dir);
  const haystack = built.join('\n');
  // INV23's list, as the lint rule that enforces it holds it.
  const {PUBLIC_ATTRIBUTES} = await import(
    pathToFileURL(PRIVATE_ATTRIBUTE_RULE).href
  );
  const publicAttributes = [...PUBLIC_ATTRIBUTES]
    .map(name => `data-astryx-${name}`)
    .sort(byName);
  for (const a of publicAttributes) {
    const short = a.slice('data-astryx-'.length);
    if (
      haystack.includes(a) ||
      haystack.includes(`dataAttr('${short}')`) ||
      haystack.includes(`dataAttr("${short}")`)
    ) {
      addAttr(a, 'public data attribute');
    }
  }

  // ---- render --------------------------------------------------------------
  const L = [
    `# API report: ${pkg.name}`,
    '',
    '<!-- Generated by `pnpm api:report` from the built package. Do not edit. -->',
  ];
  for (const [cmd, file] of Object.entries(bin).sort(([a], [b]) =>
    byName(a, b),
  ))
    L.push('', `bin \`${cmd}\`: ${file}`);
  for (const s of sections) {
    L.push('', s.head);
    if (s.lines) L.push('', ...s.lines);
    else if (s.empty) L.push('', 'no exports');
    else {
      for (const [title, items] of Object.entries(s.groups)) {
        if (!items.length) continue;
        L.push('', `### ${title}`, '', FENCE);
        for (const item of items) L.push(...item);
        L.push('```');
      }
    }
  }
  const tail = (title, lines) => {
    if (lines.length) L.push('', `## ${title}`, '', FENCE, ...lines, '```');
  };
  tail('Stylesheets', cssLines);
  tail('Theme targets', theme);
  // Which targets reflect an attribute is listed under Theme targets.
  tail(
    'Public attributes',
    [...attrs]
      .sort(([a], [b]) => byName(a, b))
      .map(([a, w]) =>
        w.has('public data attribute')
          ? `attr ${a} (public data attribute)`
          : `attr ${a} (theme reflection on ${w.size} target${w.size === 1 ? '' : 's'})`,
      ),
  );
  tail(
    'Reachable members tagged internal',
    [...new Set(internal)].sort(byName).map(x => `internal ${x}`),
  );
  return L.map(line => line.trimEnd()).join('\n') + '\n';
}
