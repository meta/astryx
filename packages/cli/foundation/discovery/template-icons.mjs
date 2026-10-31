// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Template icon mapping (AST-084 FR9, FR10): rewrite a template's icon
 * imports to the project's icon set, by icon definition.
 *
 * Source text, the template's declared icons, and icon-set data in; source
 * text and a report out. The CLI knows no icon library: a template says, in
 * its own descriptor's `icons`, which icon definition each icon it imports
 * draws (`{TrashIcon: 'delete'}`), and an icon an installed set ships draws
 * the definitions that set's `map` names it for. Each such icon maps to the
 * project set's icon that:
 *   1. names it in a reviewed `matches` entry with `exact` or `strong`
 *      confidence (for an icon an installed set ships);
 *   2. otherwise is the icon the project set's `map` names for the Astryx
 *      icon definition the source icon draws.
 * Nothing is guessed from names or words. A `likely` reviewed match is never
 * applied: a kept icon names it as a suggestion.
 * A declared key names a named import by the name it imports
 * (`{Trash as TrashIcon}` is `Trash`) and a default import by its local name
 * (`import DeleteIcon from …` is `DeleteIcon`). A mapped named import and
 * every reference to it use the mapped export, under an alias when that name
 * would collide with another binding in the file; a mapped default import
 * becomes the set's named import aliased to its local name. An icon from an
 * installed set that draws a variant (such as solid) maps to the target's
 * variant of that name, else its default. With a project icon set, every
 * declared key ends up mapped or kept (FR10): an icon with no match keeps its
 * original import, and a key bound only by a namespace import, a type-only
 * import, a re-export, an import from an Astryx package or from the project's
 * own set, or by no import at all, is kept with the reason. A side-effect
 * import binds nothing. Without a project icon set the source is unchanged
 * and the report says why.
 *
 * @input Template source, its declared icons, the installed sets, and the
 *   project's choice
 * @output The rewritten source and the `icons` report
 * @position packages/cli/foundation/discovery — read by template show/copy
 */

import {parse} from '@babel/parser';
import {definitionsByIcon} from './icon-set-discovery.mjs';
import {astryxDefinitionsByName} from './icon-definition-discovery.mjs';

/** @typedef {import('./icon-set-discovery.mjs').DiscoveredIconSet} DiscoveredIconSet */
/** @typedef {import('./icon-set-discovery.mjs').IconSetChoice} IconSetChoice */
/** @typedef {import('../../authoring/doctypes/icon-set/type').IconSetIcon} IconSetIcon */

/**
 * A source icon: what an imported icon means.
 * @typedef {object} SourceIcon
 * @property {string | null} setName the installed set it comes from, as a
 *   reviewed match names it; null for an icon only the template declares
 * @property {string} export the export the template imports
 * @property {string} [variant] which of its set's declared variants the
 *   export draws, as a reviewed match names it
 * @property {string} id
 * @property {string[]} definitions the Astryx definitions it draws
 * @property {DiscoveredIconSet} [set] the set it came from, when installed
 */

/**
 * One mapped icon.
 * @typedef {object} MappedIcon
 * @property {{module: string, export: string}} source
 * @property {{set: string, package: string, id: string, module: string, export: string}} target
 * @property {string[]} [dropped] the library's sizing props (`size`,
 *   `strokeWidth`, `absoluteStrokeWidth`) removed from its elements: an icon
 *   set's icons take their size from CSS
 * @property {'match' | 'definition'} by `match`: a reviewed
 *   `exact` or `strong` match in the project set's data names the source
 *   icon; `definition`: the target's `map` names it for the Astryx icon
 *   definition the source draws
 */

/**
 * One icon kept as the template wrote it.
 * @typedef {object} KeptIcon
 * @property {string | null} module the module it is imported or re-exported
 *   from; null when the template does not import it
 * @property {string} export the name it is imported by: `default` for a
 *   default import, `*` for a namespace import
 * @property {string} reason
 * @property {{set: string, id: string, module: string, export: string, confidence: 'likely'}} [suggestion]
 *   a `likely` reviewed match, suggested and never applied
 */

/**
 * What template icon mapping did.
 * @typedef {object} TemplateIconsReport
 * @property {'selected' | 'none' | 'ambiguous' | 'missing' | 'withdrawn'} status the
 *   project's icon-set state; only `selected` maps anything
 * @property {string | null} set the project set as `<package>/<set>`
 * @property {string} reason
 * @property {MappedIcon[]} mapped
 * @property {KeptIcon[]} kept
 */

/**
 * Index every installed set's exports: `<module>\0<export>` → the icon it
 * draws and the variant that export draws.
 * @param {DiscoveredIconSet[]} sets
 * @returns {Map<string, SourceIcon>}
 */
function indexSets(sets) {
  /** @type {Map<string, SourceIcon>} */
  const index = new Map();
  const astryx = astryxDefinitionsByName();
  for (const set of sets) {
    const byIcon = definitionsByIcon(set.data);
    for (const icon of set.data.icons) {
      const module = icon.module ?? set.data.module;
      const base = {
        setName: set.name,
        id: icon.id,
        // Only Astryx's definitions map between sets: a set's own definition is
        // its own vocabulary, and Astryx's wins a shared name.
        definitions: (byIcon.get(icon.id) ?? []).filter(name =>
          astryx.has(name),
        ),
        set,
      };
      const key = `${module}\0${icon.export}`;
      if (!index.has(key)) {
        const variant = set.data.default?.variant;
        index.set(key, {
          ...base,
          export: icon.export,
          ...(variant ? {variant} : {}),
        });
      }
      for (const entry of icon.variants ?? []) {
        const variantKey = `${entry.module ?? module}\0${entry.export}`;
        if (!index.has(variantKey)) {
          index.set(variantKey, {
            ...base,
            export: entry.export,
            variant: entry.variant,
          });
        }
      }
    }
  }
  return index;
}

/**
 * The target-set icon whose reviewed `matches` name the source icon with one
 * of `confidences`, ties broken by the order the confidences are given and
 * then by id. A match with a `variant` names only that variant of its set; a
 * match without one names every variant.
 * @param {SourceIcon} source
 * @param {DiscoveredIconSet} target
 * @param {readonly string[]} confidences
 * @returns {IconSetIcon | null}
 */
export function reviewedMatch(source, target, confidences) {
  /** @type {{icon: IconSetIcon, rank: number} | null} */
  let best = null;
  for (const icon of target.data.icons) {
    for (const match of icon.matches ?? []) {
      const rank = confidences.indexOf(match.confidence);
      if (
        rank === -1 ||
        match.set !== source.setName ||
        match.export !== source.export ||
        (match.variant != null && match.variant !== source.variant)
      ) {
        continue;
      }
      if (
        !best ||
        rank < best.rank ||
        (rank === best.rank && icon.id < best.icon.id)
      ) {
        best = {icon, rank};
      }
    }
  }
  return best?.icon ?? null;
}

/**
 * The project-set icon a source icon maps to (FR9), or null: a reviewed
 * `exact` or `strong` match, then the icon the project set's `map` names for
 * an Astryx definition the source draws.
 * @param {SourceIcon} source
 * @param {DiscoveredIconSet} target
 * @returns {{icon: IconSetIcon, by: 'match' | 'definition'} | null}
 */
export function matchIcon(source, target) {
  const reviewed = source.setName
    ? reviewedMatch(source, target, ['exact', 'strong'])
    : null;
  if (reviewed) return {icon: reviewed, by: 'match'};
  const icons = target.data.icons;
  for (const name of source.definitions) {
    const id = target.data.map?.[name];
    const icon = id == null ? undefined : icons.find(each => each.id === id);
    if (icon) return {icon, by: 'definition'};
  }
  return null;
}

/**
 * The export a mapped icon uses: the target's variant of the source's
 * variant name when it has one, else the default.
 * @param {IconSetIcon} icon
 * @param {DiscoveredIconSet} set
 * @param {string | undefined} variant
 */
function targetExport(icon, set, variant) {
  const module = icon.module ?? set.data.module;
  if (variant && variant !== set.data.default?.variant) {
    const entry = (icon.variants ?? []).find(each => each.variant === variant);
    if (entry) {
      return {module: entry.module ?? module, export: entry.export};
    }
  }
  return {module, export: icon.export};
}

/** @param {string} source */
function parseSource(source) {
  return parse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
    errorRecovery: false,
  });
}

/**
 * Every node in the tree, with its parent and the key it sits under.
 * @param {any} node
 * @param {(node: any, parent: any, key: string) => void} visit
 * @param {any} [parent]
 * @param {string} [key]
 */
function walk(node, visit, parent = null, key = '') {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent, key);
    return;
  }
  if (
    node == null ||
    typeof node !== 'object' ||
    typeof node.type !== 'string'
  ) {
    return;
  }
  visit(node, parent, key);
  for (const childKey of Object.keys(node)) {
    if (
      childKey === 'loc' ||
      childKey === 'extra' ||
      childKey.endsWith('Comments') ||
      childKey === 'comments' ||
      childKey === 'tokens'
    ) {
      continue;
    }
    const child = node[childKey];
    if (child != null && typeof child === 'object') {
      walk(child, visit, node, childKey);
    }
  }
}

/**
 * Whether an identifier node is a reference to a binding, not a property
 * name or a JSX attribute name.
 * @param {any} node
 * @param {any} parent
 * @param {string} key
 */
function isReference(node, parent, key) {
  if (!parent) return true;
  switch (parent.type) {
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
      return false;
    case 'MemberExpression':
    case 'OptionalMemberExpression':
      return key !== 'property' || parent.computed;
    case 'ObjectProperty':
      return key === 'value' || parent.computed;
    case 'ObjectMethod':
    case 'ClassMethod':
    case 'ClassProperty':
      return key !== 'key' || parent.computed;
    case 'JSXAttribute':
      return false;
    case 'JSXMemberExpression':
      return key === 'object';
    case 'TSPropertySignature':
      return key !== 'key';
    default:
      return true;
  }
}

/**
 * Whether a module is one of Astryx's own packages (`@astryxdesign/core`,
 * its subpaths, and every other `@astryxdesign/` package).
 * @param {string} module
 */
function isAstryxModule(module) {
  return module.startsWith('@astryxdesign/');
}

/**
 * The name an import specifier reads from its module: `default` for a
 * default import, `*` for a namespace import.
 * @param {any} specifier
 */
function importedName(specifier) {
  if (specifier.type === 'ImportDefaultSpecifier') return 'default';
  if (specifier.type === 'ImportNamespaceSpecifier') return '*';
  return specifier.imported.name ?? specifier.imported.value;
}

/**
 * The key a template's `icons` uses for one import specifier: the name a
 * named import reads, or the local name of a default or namespace import.
 * @param {any} specifier
 */
function declaredKey(specifier) {
  return specifier.type === 'ImportSpecifier'
    ? importedName(specifier)
    : specifier.local.name;
}

/**
 * Every binding in a parsed module that a declared key can name: each import
 * specifier (with whether it is type-only) and each named re-export.
 * @param {any} ast
 * @returns {Array<{key: string, module: string, export: string, form: 'named' | 'default' | 'namespace' | 'type' | 're-export'}>}
 */
function iconBindings(ast) {
  /** @type {Array<{key: string, module: string, export: string, form: 'named' | 'default' | 'namespace' | 'type' | 're-export'}>} */
  const found = [];
  for (const node of ast.program.body) {
    if (node.type === 'ImportDeclaration') {
      const module = String(node.source.value);
      for (const specifier of node.specifiers ?? []) {
        const typeOnly =
          node.importKind === 'type' || specifier.importKind === 'type';
        found.push({
          key: declaredKey(specifier),
          module,
          export: importedName(specifier),
          form: typeOnly
            ? 'type'
            : specifier.type === 'ImportDefaultSpecifier'
              ? 'default'
              : specifier.type === 'ImportNamespaceSpecifier'
                ? 'namespace'
                : 'named',
        });
      }
    } else if (node.type === 'ExportNamedDeclaration' && node.source) {
      const module = String(node.source.value);
      for (const specifier of node.specifiers ?? []) {
        const local = specifier.local?.name ?? specifier.local?.value;
        const exported = specifier.exported?.name ?? specifier.exported?.value;
        for (const key of new Set([local, exported])) {
          if (typeof key === 'string') {
            found.push({key, module, export: key, form: 're-export'});
          }
        }
      }
    }
  }
  return found;
}

/**
 * The keys of a template's `icons` that its source binds by no import or
 * re-export at all, so they can never map (`integration check` lists them).
 * Null when the source does not parse.
 * @param {string} source
 * @param {Record<string, string>} declared
 * @returns {string[] | null}
 */
export function iconsNotImported(source, declared) {
  let ast;
  try {
    ast = parseSource(source);
  } catch {
    return null;
  }
  const keys = new Set(iconBindings(ast).map(binding => binding.key));
  return Object.keys(declared).filter(key => !keys.has(key));
}

/**
 * A library's own sizing props, dropped from a mapped icon: an icon set's
 * icons take their size from CSS.
 */
const SIZING_PROPS = new Set(['size', 'strokeWidth', 'absoluteStrokeWidth']);

/** What a template reads with no icon-set state given: nothing is mapped. */
export const NO_ICON_SETS = Object.freeze({
  sets: [],
  choice: /** @type {IconSetChoice} */ ({
    status: 'none',
    reason: 'No icon set is installed.',
  }),
});

/**
 * Rewrite a template's icon imports to the project's icon set (FR9, FR10).
 * @param {string} source
 * @param {{sets: DiscoveredIconSet[], choice: IconSetChoice}} iconSets
 * @param {Record<string, string>} [declared] the template's `icons`: the
 *   icon definition each imported icon draws, by its imported name
 * @returns {{source: string, icons: TemplateIconsReport | undefined}} `icons`
 *   is undefined, and the source unchanged, when no set is given and none is
 *   configured, as for every project without the opt-in, whose state carries
 *   no sets: icon sets are experimental (spec:AST-017 FR27), so a
 *   project that does not use them gets exactly the output it always has.
 */
export function mapTemplateIcons(source, {sets, choice}, declared = {}) {
  if (sets.length === 0 && choice.configured == null) {
    return {source, icons: undefined};
  }
  const target = choice.set ?? null;
  /** @type {TemplateIconsReport} */
  const icons = {
    status: choice.status,
    set: target ? `${target.package}/${target.name}` : null,
    reason: choice.reason,
    mapped: [],
    kept: [],
  };
  if (!target) return {source, icons};

  /** @type {any} */
  let ast;
  try {
    ast = parseSource(source);
  } catch {
    return {source, icons};
  }
  const index = indexSets(sets);
  const targetModules = new Set(
    target.data.icons.flatMap(icon => [
      icon.module ?? target.data.module,
      ...(icon.variants ?? []).map(
        variant => variant.module ?? icon.module ?? target.data.module,
      ),
    ]),
  );

  /** Every name the file writes, to keep aliases collision-free. */
  const written = new Set();
  walk(ast.program, (node, parent, key) => {
    // The name an import specifier reads from its module binds nothing here.
    if (parent?.type === 'ImportSpecifier' && key === 'imported') return;
    if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
      written.add(node.name);
    }
  });

  /** @type {Array<{start: number, end: number, text: string}>} */
  const edits = [];
  /** @type {Map<string, string>} old local name → new local name */
  const renames = new Map();
  /** @type {Map<string, {module: string, imported: string, local: string}>} */
  const added = new Map();
  /**
   * Every local name whose import maps away, found first, so a mapped name
   * may reuse a name another mapped import frees.
   * @type {Set<string>}
   */
  const freed = new Set();
  /**
   * The source record and the match of each mapped import specifier.
   * @type {Map<any, {record: SourceIcon, match: ReturnType<typeof matchIcon>}>}
   */
  const planned = new Map();
  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration' || node.importKind === 'type')
      continue;
    const module = node.source.value;
    if (targetModules.has(module)) continue;
    for (const specifier of node.specifiers) {
      if (
        specifier.type === 'ImportNamespaceSpecifier' ||
        specifier.importKind === 'type'
      ) {
        continue;
      }
      const imported = importedName(specifier);
      const key = declaredKey(specifier);
      const fromSet = index.get(`${module}\0${imported}`);
      // A declared name is the export a template imports from an icon
      // library. Astryx's own packages ship components, not icons, so a
      // declaration never matches an import from one (Core's `Table` is not
      // the icon a template imports as `Table as TableIcon`); an installed
      // set's icons are matched through the set instead.
      const meant =
        !isAstryxModule(module) && Object.hasOwn(declared, key)
          ? declared[key]
          : null;
      /** @type {SourceIcon | null} */
      const record = fromSet
        ? {
            ...fromSet,
            definitions: [
              ...new Set([...(meant ? [meant] : []), ...fromSet.definitions]),
            ],
          }
        : meant
          ? {
              setName: null,
              export: imported,
              id: key,
              definitions: [meant],
            }
          : null;
      if (!record || record.set === target) continue;
      const match = matchIcon(record, target);
      planned.set(specifier, {record, match});
      if (match) freed.add(specifier.local.name);
    }
  }
  /** Where the mapped imports go: where the first rewritten import was. */
  let insertAt = -1;
  /** The declared keys reported as mapped or kept so far. */
  const accounted = new Set();
  /** The local names of mapped imports, as the template wrote them. */
  const mappedLocals = new Set();
  /** @type {Array<[MappedIcon, string]>} each mapped icon and its local name */
  const mappedEntries = [];

  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration') continue;
    if (node.importKind === 'type') continue;
    const module = node.source.value;
    if (targetModules.has(module)) continue;
    if (!node.specifiers.some((/** @type {any} */ each) => planned.has(each))) {
      continue;
    }

    /** @type {any[]} */
    const keep = [];
    for (const specifier of node.specifiers) {
      const plan = planned.get(specifier);
      if (!plan) {
        keep.push(specifier);
        continue;
      }
      const imported = importedName(specifier);
      const local = specifier.local.name;
      const {record, match} = plan;
      accounted.add(declaredKey(specifier));
      if (!match) {
        keep.push(specifier);
        const likely = reviewedMatch(record, target, ['likely']);
        icons.kept.push({
          module,
          export: imported,
          reason:
            record.definitions.length > 0
              ? `${icons.set} maps no icon to the icon definition "${record.definitions.join('", "')}"${record.setName ? ', and none is a reviewed match for it' : ''}`
              : `no icon in ${icons.set} is a reviewed match for it`,
          ...(likely
            ? {
                suggestion: {
                  set: target.name,
                  id: likely.id,
                  ...targetExport(likely, target, record.variant),
                  confidence: /** @type {const} */ ('likely'),
                },
              }
            : {}),
        });
        continue;
      }
      const chosen = targetExport(match.icon, target, record.variant);
      const key = `${chosen.module}\0${chosen.export}`;
      let entry = added.get(key);
      if (!entry) {
        // A default import keeps its local name: it becomes the set's named
        // import under that alias.
        let name =
          specifier.type === 'ImportDefaultSpecifier' ? local : chosen.export;
        const base = name;
        const taken = (/** @type {string} */ candidate) =>
          (written.has(candidate) && !freed.has(candidate)) ||
          [...added.values()].some(each => each.local === candidate);
        for (let n = 2; taken(name); n++) name = `${base}${n}`;
        entry = {module: chosen.module, imported: chosen.export, local: name};
        added.set(key, entry);
      }
      if (local !== entry.local) renames.set(local, entry.local);
      mappedLocals.add(local);
      /** @type {MappedIcon} */
      const mappedIcon = {
        source: {module, export: imported},
        target: {
          set: target.name,
          package: target.package,
          id: match.icon.id,
          module: chosen.module,
          export: chosen.export,
        },
        by: match.by,
      };
      icons.mapped.push(mappedIcon);
      mappedEntries.push([mappedIcon, local]);
    }

    if (keep.length === node.specifiers.length) continue;
    if (insertAt === -1) insertAt = node.start;
    // Comments inside the statement, and one that trails it on its line,
    // survive the rewrite: those a kept specifier does not carry move to
    // their own lines above it.
    // A kept specifier carries a comment beside it with only whitespace
    // between (`Pencil /* pen */`).
    const keptRanges = keep.map(each => {
      let [a, b] = [each.start, each.end];
      for (const comment of ast.comments ?? []) {
        if (comment.start < node.start || comment.end > node.end) continue;
        if (comment.start >= b && /^\s*$/u.test(source.slice(b, comment.start)))
          b = comment.end;
      }
      for (const comment of [...(ast.comments ?? [])].reverse()) {
        if (comment.start < node.start || comment.end > node.end) continue;
        if (comment.end <= a && /^\s*$/u.test(source.slice(comment.end, a)))
          a = comment.start;
      }
      return [a, b];
    });
    const inside = (ast.comments ?? []).filter(
      (/** @type {any} */ comment) =>
        comment.start >= node.start &&
        comment.end <= node.end &&
        !keptRanges.some(([a, b]) => comment.start >= a && comment.end <= b),
    );
    const trailing = /^[ \t]*(\/\/[^\n]*|\/\*[^\n]*?\*\/)[ \t]*(?=\n|$)/u.exec(
      source.slice(node.end),
    );
    /** @type {string[]} */
    const moved = inside.map((/** @type {any} */ comment) =>
      source.slice(comment.start, comment.end),
    );
    const above = moved.map(comment => `${comment}\n`).join('');
    if (keep.length === 0) {
      let end = node.end;
      if (trailing) {
        moved.push(trailing[1]);
        end += trailing[0].length;
      }
      if (source[end] === '\n') end += 1;
      edits.push({
        start: node.start,
        end,
        text: moved.map(comment => `${comment}\n`).join(''),
      });
    } else {
      /** @param {any} each */
      const textOf = each => {
        const [a, b] = keptRanges[keep.indexOf(each)];
        return source.slice(a, b);
      };
      const defaults = keep.filter(each => each.type !== 'ImportSpecifier');
      const named = keep.filter(each => each.type === 'ImportSpecifier');
      const parts = [
        ...defaults.map(textOf),
        ...(named.length > 0 ? [`{${named.map(textOf).join(', ')}}`] : []),
      ];
      edits.push({
        start: node.start,
        end: node.end,
        text: `${above}import ${parts.join(', ')} from ${source.slice(node.source.start, node.source.end)};`,
      });
    }
  }

  // Every other declared key is kept, with why it was not mapped (FR10).
  const bindings = iconBindings(ast);
  for (const key of Object.keys(declared)) {
    if (accounted.has(key)) continue;
    const forms = bindings.filter(binding => binding.key === key);
    const pick = (
      /** @type {(each: (typeof forms)[number]) => boolean} */ test,
    ) => forms.find(test);
    const fromTarget = pick(each => targetModules.has(each.module));
    const fromAstryx = pick(each => isAstryxModule(each.module));
    const namespace = pick(each => each.form === 'namespace');
    const typeOnly = pick(each => each.form === 'type');
    const reExport = pick(each => each.form === 're-export');
    const [binding, reason] = fromTarget
      ? [fromTarget, `it is already imported from ${icons.set}`]
      : namespace
        ? [
            namespace,
            'it is a namespace import, which is not mapped: import the icon by name',
          ]
        : reExport
          ? [
              reExport,
              'the template re-exports it rather than importing it, so it is not mapped',
            ]
          : typeOnly
            ? [typeOnly, 'it is a type-only import, which draws no icon']
            : fromAstryx
              ? [
                  fromAstryx,
                  'it is imported from an Astryx package, which ships components, not icons',
                ]
              : [null, 'the template does not import it'];
    icons.kept.push({
      module: binding ? binding.module : null,
      export: binding ? binding.export : key,
      reason,
    });
  }

  if (added.size === 0) return {source, icons};

  // Every reference to a renamed binding uses the mapped name.
  walk(ast.program, (node, parent, key) => {
    if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
      const next = renames.get(node.name);
      if (!next || !isReference(node, parent, key)) return;
      if (parent?.type === 'ObjectProperty' && parent.shorthand) {
        edits.push({
          start: node.start,
          end: node.end,
          text: `${node.name}: ${next}`,
        });
        return;
      }
      edits.push({start: node.start, end: node.end, text: next});
    }
  });
  // Size comes from CSS in every icon set (its export contract), so a
  // library's own sizing props on a mapped icon are dropped and reported.
  /** @type {Map<string, Set<string>>} local name → props dropped */
  const dropped = new Map();
  walk(ast.program, node => {
    if (node.type !== 'JSXOpeningElement' || node.name.type !== 'JSXIdentifier')
      return;
    const local = node.name.name;
    if (!mappedLocals.has(local)) return;
    for (const attribute of node.attributes) {
      if (
        attribute.type !== 'JSXAttribute' ||
        attribute.name.type !== 'JSXIdentifier' ||
        !SIZING_PROPS.has(attribute.name.name)
      ) {
        continue;
      }
      let start = attribute.start;
      while (start > 0 && /\s/u.test(source[start - 1])) start -= 1;
      edits.push({start, end: attribute.end, text: ''});
      const set = dropped.get(local) ?? new Set();
      set.add(attribute.name.name);
      dropped.set(local, set);
    }
  });
  for (const [entry, local] of mappedEntries) {
    const props = dropped.get(local);
    if (props) entry.dropped = [...props].sort();
  }
  // A shorthand property is visited as both key and value; keep one edit.
  const unique = new Map();
  for (const edit of edits) {
    const at = `${edit.start}:${edit.end}`;
    const prior = unique.get(at);
    if (!prior || edit.text.length > prior.text.length) unique.set(at, edit);
  }

  /** @type {Map<string, string[]>} */
  const byModule = new Map();
  for (const entry of added.values()) {
    const list = byModule.get(entry.module) ?? [];
    list.push(
      entry.local === entry.imported
        ? entry.imported
        : `${entry.imported} as ${entry.local}`,
    );
    byModule.set(entry.module, list);
  }
  const lines = [...byModule.entries()]
    .map(([module, names]) => `import {${names.join(', ')}} from '${module}';`)
    .join('\n');
  unique.set('insert', {start: insertAt, end: insertAt, text: `${lines}\n`});

  let out = source;
  for (const edit of [...unique.values()].sort(
    (a, b) => b.start - a.start || b.end - a.end,
  )) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return {source: out, icons};
}
