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
 * applied: a kept icon names it as a suggestion. The project's list names a
 * main set and backup sets in order: each icon maps to the first set in the
 * list that has a match, and never mixes sets within one icon. An icon with
 * a meaning that no set in the list has loses its library import: each of its
 * uses renders a placeholder component that the file declares once, with a
 * comment that names the meaning, so the copied code needs no new package.
 * An import from the library a listed set wraps (its data's `source`) is an
 * icon the project chose: the main set's own library keeps its imports as
 * written, and another set's library keeps an icon no set maps instead of a
 * placeholder.
 * A declared key names a named import by the name it imports
 * (`{Trash as TrashIcon}` is `Trash`) and a default import by its local name
 * (`import DeleteIcon from …` is `DeleteIcon`). A mapped named import and
 * every reference to it use the mapped export, under an alias when that name
 * would collide with another binding in the file; a mapped default import
 * becomes the set's named import aliased to its local name. An icon from an
 * installed set that draws a variant (such as solid) maps to the target's
 * variant of that name, else its default. With a project icon set, every
 * declared key ends up mapped, a placeholder, or kept (FR10): an icon that
 * draws no Astryx definition and has no match keeps its original import, and
 * a key bound only by a namespace import, a type-only import, a re-export, an
 * import from an Astryx package or from a set in the project's list, or by no
 * import at all, is kept with the reason. A side-effect
 * import binds nothing. Without a project icon set the source is unchanged
 * and the report says why.
 *
 * @input Template source, its declared icons, the installed sets, and the
 *   project's choice
 * @output The rewritten source and the `icons` report
 * @position packages/cli/foundation/discovery — read by template show/copy
 */

import {
  isReference,
  parseTemplateSource as parseSource,
  walk,
  writtenNames,
} from './template-source-tree.mjs';
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
 * @property {{asked: string, used: string | null}} [variant] present when the
 *   source draws a look the target set's icon does not have: the look it
 *   asked for, and the look used (the set's default look)
 */

/**
 * One icon no set in the project's list has: each of its uses in the copied
 * code renders the placeholder component that the file declares.
 * @typedef {object} PlaceholderIcon
 * @property {{module: string, export: string}} source
 * @property {{local: string}} target the name of the placeholder component
 *   in the file
 * @property {string[]} definitions the icon definitions the icon draws
 * @property {string[]} fixes the commands that give it a real icon: map the
 *   definition in the main set, or add a backup set that has it
 * @property {string[]} [dropped] the library's sizing props removed from its
 *   elements, as for a mapped icon
 * @property {{set: string, id: string, module: string, export: string, confidence: 'likely'}} [suggestion]
 *   a `likely` reviewed match in the main set, suggested and never applied
 */

/**
 * One set a template's mapped icons come from.
 * @typedef {object} UsedIconSet
 * @property {string} set `<package>/<set>`
 * @property {string} license
 * @property {number} icons how many mapped icons it gives
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
 * @property {string[]} [order] the main set and each backup, as
 *   `<package>/<set>`, in the order icons are looked up; present when the
 *   project lists backups
 * @property {string} reason
 * @property {MappedIcon[]} mapped
 * @property {PlaceholderIcon[]} placeholder
 * @property {KeptIcon[]} kept
 * @property {UsedIconSet[]} sets each set the mapped icons come from, with
 *   its license
 */

/** The name of the placeholder component, when the file does not use it. */
export const PLACEHOLDER_NAME = 'MissingIcon';

/**
 * The placeholder component the CLI declares once in a copied file. It sizes
 * like an icon (1em, in the current text color). It is hidden from assistive
 * technology unless a use gives it a label.
 * @param {string} name
 */
export function placeholderDeclaration(name) {
  return `/** Stands in for an icon that no icon set in this project has. Replace each use with a real icon. */
function ${name}(props: React.SVGProps<SVGSVGElement>) {
  const labelled =
    props['aria-label'] != null || props['aria-labelledby'] != null;
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden={labelled ? undefined : true}
      role={labelled ? 'img' : undefined}
      {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 2.33" />
    </svg>
  );
}`;
}

/**
 * The comment beside each use of the placeholder, so `astryx doctor` can name
 * the meaning it stands for.
 * @param {string[]} definitions
 */
export function placeholderNote(definitions) {
  return `/* missing icon: ${definitions.join(', ')} */`;
}

/**
 * Read the meanings back from a placeholder use's comment. Null for a
 * comment that is not one.
 * @param {string} comment the comment's text, with or without its markers
 * @returns {string[] | null}
 */
export function placeholderMeanings(comment) {
  const found = /^(?:\/\*)?\s*missing icon:\s*([^*]*?)\s*(?:\*\/)?$/u.exec(
    comment.trim(),
  );
  return found
    ? found[1]
        .split(',')
        .map(each => each.trim())
        .filter(Boolean)
    : null;
}

/** Node keys that position or format a node and never change its shape. */
const FORMAT_KEYS = new Set([
  'start',
  'end',
  'loc',
  'range',
  'extra',
  'leadingComments',
  'trailingComments',
  'innerComments',
]);

/**
 * A declaration's shape: its tree without positions, comments, quote style,
 * whitespace-only JSX text, or its own name. Formatting a file never changes
 * it.
 * @param {any} node a function declaration
 */
function declarationShape(node) {
  const name = node.id?.name;
  return JSON.stringify(node, (key, value) => {
    if (FORMAT_KEYS.has(key)) return undefined;
    if (key === 'id' && value?.name === name) return '<name>';
    if (key === 'children' && Array.isArray(value)) {
      return value.filter(
        child => child?.type !== 'JSXText' || child.value.trim() !== '',
      );
    }
    return value;
  });
}

/** @type {string | undefined} */
let placeholderShape;

/**
 * Whether a top-level statement declares the placeholder component exactly
 * as the CLI writes it, under any name. Returns the name, or null.
 * @param {any} statement
 * @returns {string | null}
 */
function placeholderDeclared(statement) {
  const node =
    statement.type === 'ExportNamedDeclaration'
      ? statement.declaration
      : statement;
  if (node?.type !== 'FunctionDeclaration' || !node.id) return null;
  placeholderShape ??= declarationShape(
    parseSource(placeholderDeclaration(PLACEHOLDER_NAME)).program.body[0],
  );
  return declarationShape(node) === placeholderShape ? node.id.name : null;
}

/**
 * Each use of the placeholder component in a file: the name it is declared
 * under and the meanings its comment names (null when it names none). Only
 * the declaration the CLI writes counts, and only code: commented-out code
 * and text in strings are never uses. A closing JSX tag is part of its
 * element's use. Null when the source does not parse.
 * @param {string} source
 * @returns {Array<{local: string, meanings: string[] | null}> | null}
 */
export function placeholderUses(source) {
  let ast;
  try {
    ast = parseSource(source);
  } catch {
    return null;
  }
  /** @type {Set<any>} */
  const declarations = new Set();
  /** @type {Set<string>} */
  const names = new Set();
  for (const statement of ast.program.body) {
    const name = placeholderDeclared(statement);
    if (name) {
      names.add(name);
      declarations.add(statement.declaration ?? statement);
    }
  }
  if (names.size === 0) return [];
  /** @type {Array<{local: string, meanings: string[] | null}>} */
  const uses = [];
  walk(ast.program, (node, parent, key) => {
    if (node.type !== 'Identifier' && node.type !== 'JSXIdentifier') return;
    if (!names.has(node.name)) return;
    if (declarations.has(parent) && key === 'id') return;
    if (parent?.type === 'JSXClosingElement') return;
    if (!isReference(node, parent, key)) return;
    const note = (ast.comments ?? []).find(
      (/** @type {any} */ comment) =>
        comment.start >= node.end &&
        /^\s*$/u.test(source.slice(node.end, comment.start)),
    );
    uses.push({
      local: node.name,
      meanings: note
        ? placeholderMeanings(source.slice(note.start, note.end))
        : null,
    });
  });
  return uses;
}

/**
 * The text of one import specifier the rewrite adds.
 * @param {{imported: string, local: string}} entry
 */
function specifierText(entry) {
  return entry.local === entry.imported
    ? entry.imported
    : `${entry.imported} as ${entry.local}`;
}

/**
 * The commands that give a placeholder icon a real one.
 * @param {string[]} definitions
 * @param {string} main the main set's name as the list writes it
 * @returns {string[]}
 */
export function placeholderFixes(definitions, main) {
  return [
    `astryx experimental icon map ${definitions[0] ?? '<definition>'} <icon> --set ${main}`,
    `astryx experimental icon use ${main} --backup <set>`,
  ];
}

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

/**
 * The look a mapped icon draws when the source asked for one the target's
 * icon does not have: what it asked for and the target's default look.
 * Undefined when the look is kept, or when the source names no look.
 * @param {IconSetIcon} icon
 * @param {DiscoveredIconSet} set
 * @param {string | undefined} variant
 * @returns {{asked: string, used: string | null} | undefined}
 */
function lookChange(icon, set, variant) {
  if (!variant) return undefined;
  const fallback = set.data.default?.variant ?? null;
  if (variant === fallback) return undefined;
  if ((icon.variants ?? []).some(each => each.variant === variant)) {
    return undefined;
  }
  return {asked: variant, used: fallback};
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
 * Whether a set wraps the library a module belongs to: the module is the
 * package the set's data names as its `source`, or a subpath of it.
 * @param {DiscoveredIconSet} set
 * @param {string} module
 */
function wrapsModule(set, module) {
  const library = set.data.source?.package;
  return (
    library != null && (module === library || module.startsWith(`${library}/`))
  );
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
 * specifier (with its local name and whether it is type-only) and each
 * named re-export.
 * @param {any} ast
 * @returns {Array<{key: string, local?: string, module: string, export: string, form: 'named' | 'default' | 'namespace' | 'type' | 're-export'}>}
 */
function iconBindings(ast) {
  /** @type {Array<{key: string, local?: string, module: string, export: string, form: 'named' | 'default' | 'namespace' | 'type' | 're-export'}>} */
  const found = [];
  for (const node of ast.program.body) {
    if (node.type === 'ImportDeclaration') {
      const module = String(node.source.value);
      for (const specifier of node.specifiers ?? []) {
        const typeOnly =
          node.importKind === 'type' || specifier.importKind === 'type';
        found.push({
          key: declaredKey(specifier),
          local: specifier.local.name,
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
 * The definitions that two different icons in one template's `icons` share.
 * A set draws one icon for each definition, so two different icons with one
 * definition draw the same icon in every set. Two keys that differ only by an
 * `Icon` suffix (`Trash2` and `Trash2Icon`) are one icon and never conflict.
 * @param {Record<string, string>} declared
 * @returns {Array<{definition: string, keys: string[]}>} each shared
 *   definition with its keys, sorted by definition
 */
export function sharedTemplateMeanings(declared) {
  /** @type {Map<string, Map<string, string>>} definition → icon → first key */
  const byDefinition = new Map();
  for (const [key, definition] of Object.entries(declared)) {
    const icons = byDefinition.get(definition) ?? new Map();
    const icon = key.replace(/Icon$/u, '');
    if (!icons.has(icon)) icons.set(icon, key);
    byDefinition.set(definition, icons);
  }
  return [...byDefinition]
    .filter(([, icons]) => icons.size > 1)
    .map(([definition, icons]) => ({definition, keys: [...icons.values()]}))
    .sort((a, b) => a.definition.localeCompare(b.definition));
}

/**
 * Whether a module is a package import: not relative, not absolute, and not
 * a Node built-in.
 * @param {string} module
 */
function isPackageModule(module) {
  return !/^(?:\.|\/|node:)/u.test(module);
}

/** The props that choose which icon a generic renderer draws. */
const ICON_CHOOSING_PROPS = new Set(['icon', 'iconNode', 'name', 'src']);

/**
 * The local names every JSX use of which passes an icon-choosing prop, as
 * `<DynamicIcon name="trash" />` does. A name with no JSX use is left out.
 * @param {any} ast
 * @returns {Set<string>}
 */
function iconPropRenderers(ast) {
  /** @type {Map<string, boolean>} local name → every use passes one */
  const uses = new Map();
  walk(ast.program, node => {
    if (node.type !== 'JSXOpeningElement' || node.name.type !== 'JSXIdentifier')
      return;
    const chooses = node.attributes.some(
      (/** @type {any} */ attribute) =>
        attribute.type === 'JSXAttribute' &&
        attribute.name.type === 'JSXIdentifier' &&
        ICON_CHOOSING_PROPS.has(attribute.name.name),
    );
    const name = node.name.name;
    uses.set(name, (uses.get(name) ?? true) && chooses);
  });
  return new Set([...uses].filter(([, every]) => every).map(([name]) => name));
}

/** Parents under which a reference passes the name on as a value. */
const VALUE_POSITIONS = new Set([
  'JSXExpressionContainer',
  'ArrayExpression',
  'ObjectProperty',
  'VariableDeclarator',
  'AssignmentExpression',
  'AssignmentPattern',
  'ConditionalExpression',
  'LogicalExpression',
  'ReturnStatement',
  'ArrowFunctionExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'ParenthesizedExpression',
  'ExportDefaultDeclaration',
]);

/**
 * Whether a JSX element has no children. Text that is only white space is
 * layout, not a child.
 * @param {any} element
 */
function isChildless(element) {
  return element.children.every(
    (/** @type {any} */ child) =>
      child.type === 'JSXText' && child.value.trim() === '',
  );
}

/**
 * The local names a template uses as an icon: it renders the name as a
 * childless JSX element that passes no icon-choosing prop (`<Trash />`), or it
 * passes the name as a value (`icon={Trash}`, `[Trash]`, `{icon: Trash}`). A
 * type position, a call or its arguments, a spread, a member access, and an
 * element with children are not icon uses: a record of every icon passes
 * through those too.
 * @param {any} ast
 * @returns {Set<string>}
 */
function iconUses(ast) {
  /** @type {Set<string>} */
  const used = new Set();
  walk(ast.program, (node, parent, key) => {
    if (node.type === 'JSXElement') {
      const opening = node.openingElement;
      if (opening.name.type !== 'JSXIdentifier' || !isChildless(node)) return;
      const chooses = opening.attributes.some(
        (/** @type {any} */ attribute) =>
          attribute.type === 'JSXAttribute' &&
          attribute.name.type === 'JSXIdentifier' &&
          ICON_CHOOSING_PROPS.has(attribute.name.name),
      );
      if (!chooses) used.add(opening.name.name);
      return;
    }
    if (node.type !== 'Identifier' || !parent) return;
    if (!VALUE_POSITIONS.has(parent.type) || !isReference(node, parent, key)) {
      return;
    }
    if (parent.type === 'VariableDeclarator' && key !== 'init') return;
    if (parent.type === 'AssignmentExpression' && key !== 'right') return;
    if (parent.type === 'AssignmentPattern' && key !== 'right') return;
    if (parent.type === 'ArrowFunctionExpression' && key !== 'body') return;
    if (parent.type === 'ConditionalExpression' && key === 'test') return;
    used.add(node.name);
  });
  return used;
}

/**
 * The value imports a template takes from other packages, as the keys its
 * `icons` uses: a named import by the name it imports, a default import by
 * its local name. Astryx's own packages, relative files, namespace imports,
 * and type-only imports are left out. `renderer` marks a generic renderer:
 * the key is `Icon`, or every JSX use passes an icon-choosing prop. `icon`
 * marks an import the template uses as an icon: it renders it as a childless
 * element or passes it as a value. Null when the source does not parse.
 * @param {string} source
 * @returns {Array<{key: string, module: string, renderer: boolean, icon: boolean}> | null}
 */
export function packageImports(source) {
  let ast;
  try {
    ast = parseSource(source);
  } catch {
    return null;
  }
  const renderers = iconPropRenderers(ast);
  const uses = iconUses(ast);
  return iconBindings(ast)
    .filter(
      binding =>
        (binding.form === 'named' || binding.form === 'default') &&
        isPackageModule(binding.module) &&
        !isAstryxModule(binding.module),
    )
    .map(({key, local, module}) => ({
      key,
      module,
      renderer: key === 'Icon' || renderers.has(local ?? key),
      icon: uses.has(local ?? key),
    }));
}

/**
 * The icons each template imports but does not declare in its `icons`. An
 * import is undeclared when it comes from a module that some template
 * declares an icon from (an icon library) and the template uses it as an
 * icon: it renders it as a childless element or passes it as a value. Any
 * other import from that module, such as a type, a factory it calls, or a
 * provider with children, is listed as not checked (`use`): declaring it
 * would make a template swap it for an icon. The check also cannot tell that
 * an import draws one icon definition when it is a generic renderer, or when
 * it comes from any other package and only its key ends in `Icon`, so it
 * lists those as not checked (`architecture:cli-surface` DEC-7). Only
 * templates that parse are read.
 * @param {Array<{id: string, source: string, declared: Record<string, string>}>} templates
 * @returns {{undeclared: Array<{id: string, key: string, module: string}>, unchecked: Array<{id: string, key: string, module: string, why: 'renderer' | 'use' | 'name'}>}}
 */
export function undeclaredTemplateIcons(templates) {
  const read = templates.flatMap(template => {
    const imports = packageImports(template.source);
    return imports ? [{...template, imports}] : [];
  });
  /** Modules some template declares an icon from. */
  const iconModules = new Set(
    read.flatMap(template =>
      template.imports
        .filter(each => Object.hasOwn(template.declared, each.key))
        .map(each => each.module),
    ),
  );
  /** @type {Array<{id: string, key: string, module: string}>} */
  const undeclared = [];
  /** @type {Array<{id: string, key: string, module: string, why: 'renderer' | 'use' | 'name'}>} */
  const unchecked = [];
  for (const template of read) {
    for (const each of template.imports) {
      if (Object.hasOwn(template.declared, each.key)) continue;
      const iconLike = iconModules.has(each.module) || /Icon$/u.test(each.key);
      if (!iconLike) continue;
      const found = {id: template.id, key: each.key, module: each.module};
      if (each.renderer) unchecked.push({...found, why: 'renderer'});
      else if (!iconModules.has(each.module))
        unchecked.push({...found, why: 'name'});
      else if (each.icon) undeclared.push(found);
      else unchecked.push({...found, why: 'use'});
    }
  }
  return {undeclared, unchecked};
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
  /** The sets an icon is looked up in, in order: the main set first. */
  const targets = target ? (choice.order ?? [target]) : [];
  /** @type {TemplateIconsReport} */
  const icons = {
    status: choice.status,
    set: target ? `${target.package}/${target.name}` : null,
    ...(targets.length > 1
      ? {order: targets.map(each => `${each.package}/${each.name}`)}
      : {}),
    reason: choice.reason,
    mapped: [],
    placeholder: [],
    kept: [],
    sets: [],
  };
  if (!target) return {source, icons};
  const main = choice.configured ?? target.name;

  /** @type {any} */
  let ast;
  try {
    ast = parseSource(source);
  } catch {
    return {source, icons};
  }
  const index = indexSets(sets);
  const targetModules = new Set(
    targets.flatMap(each =>
      each.data.icons.flatMap(icon => [
        icon.module ?? each.data.module,
        ...(icon.variants ?? []).map(
          variant => variant.module ?? icon.module ?? each.data.module,
        ),
      ]),
    ),
  );

  /** Every name the file writes, to keep aliases collision-free. */
  const written = writtenNames(ast);

  /** @type {Array<{start: number, end: number, text: string}>} */
  const edits = [];
  /** @type {Map<string, string>} old local name → new local name */
  const renames = new Map();
  /** @type {Map<string, {module: string, imported: string, local: string}>} */
  const added = new Map();
  /** @type {Map<string, string>} a placeholder's old local name → the comment each use carries */
  const notes = new Map();
  /** The placeholder component's name, once an icon needs it. */
  let placeholderName = '';
  /**
   * Every local name whose import maps away, found first, so a mapped name
   * may reuse a name another mapped import frees.
   * @type {Set<string>}
   */
  const freed = new Set();
  /**
   * The source record of each mapped import specifier, the first set in the
   * list that matches it, and the match.
   * @type {Map<any, {record: SourceIcon, set: DiscoveredIconSet, match: ReturnType<typeof matchIcon>}>}
   */
  const planned = new Map();
  /**
   * Each import specifier kept because it comes from the library a listed
   * set wraps, and that set.
   * @type {Map<any, DiscoveredIconSet>}
   */
  const wrapped = new Map();
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
      if (!record || (record.set && targets.includes(record.set))) continue;
      // An import from the library a listed set wraps is already an icon
      // the project chose. The main set's own library keeps its icons as
      // written; another set's library keeps an icon that no set maps.
      const wrapper = targets.find(each => wrapsModule(each, module));
      if (wrapper === target) {
        wrapped.set(specifier, wrapper);
        continue;
      }
      /** @type {{set: DiscoveredIconSet, match: ReturnType<typeof matchIcon>}} */
      let found = {set: target, match: null};
      for (const each of targets) {
        const match = matchIcon(record, each);
        if (match) {
          found = {set: each, match};
          break;
        }
      }
      if (!found.match && wrapper) {
        wrapped.set(specifier, wrapper);
        continue;
      }
      planned.set(specifier, {record, ...found});
      if (found.match || record.definitions.length > 0) {
        freed.add(specifier.local.name);
      }
    }
  }
  /** Where the mapped imports go: where the first rewritten import was. */
  let insertAt = -1;
  /** The declared keys reported as mapped or kept so far. */
  const accounted = new Set();
  /** The local names of mapped imports, as the template wrote them. */
  const mappedLocals = new Set();
  /** @type {Array<[MappedIcon | PlaceholderIcon, string]>} each mapped or placeholder icon and its local name */
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
      const {record, set, match} = plan;
      accounted.add(declaredKey(specifier));
      if (!match && record.definitions.length > 0) {
        // No set in the list has this meaning: each use renders the local
        // placeholder, so the file imports nothing new.
        const likely = reviewedMatch(record, target, ['likely']);
        if (!placeholderName) {
          let name = PLACEHOLDER_NAME;
          const taken = (/** @type {string} */ candidate) =>
            written.has(candidate) ||
            [...added.values()].some(each => each.local === candidate);
          for (let n = 2; taken(name); n++) name = `${PLACEHOLDER_NAME}${n}`;
          placeholderName = name;
        }
        renames.set(local, placeholderName);
        notes.set(local, placeholderNote(record.definitions));
        mappedLocals.add(local);
        /** @type {PlaceholderIcon} */
        const placeholderIcon = {
          source: {module, export: imported},
          target: {local: placeholderName},
          definitions: record.definitions,
          fixes: placeholderFixes(record.definitions, main),
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
        };
        icons.placeholder.push(placeholderIcon);
        mappedEntries.push([placeholderIcon, local]);
        continue;
      }
      if (!match) {
        keep.push(specifier);
        const likely = reviewedMatch(record, target, ['likely']);
        icons.kept.push({
          module,
          export: imported,
          reason:
            record.definitions.length > 0
              ? `${icons.set} maps no icon to the icon definition "${record.definitions.join('", "')}"${record.setName ? ', and none is a reviewed match for it' : ''}`
              : `no icon in ${targets.length > 1 ? 'any set in your list' : icons.set} is a reviewed match for it`,
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
      const chosen = targetExport(match.icon, set, record.variant);
      const look = lookChange(match.icon, set, record.variant);
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
          candidate === placeholderName ||
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
          set: set.name,
          package: set.package,
          id: match.icon.id,
          module: chosen.module,
          export: chosen.export,
        },
        by: match.by,
        ...(look ? {variant: look} : {}),
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

  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration') continue;
    for (const specifier of node.specifiers) {
      const wrapper = wrapped.get(specifier);
      if (!wrapper) continue;
      accounted.add(declaredKey(specifier));
      icons.kept.push({
        module: node.source.value,
        export: importedName(specifier),
        reason:
          wrapper === target
            ? `it already comes from ${node.source.value}, which ${icons.set} wraps`
            : `no set in your list maps its icon definition, and it already comes from ${node.source.value}, which ${wrapper.package}/${wrapper.name} wraps`,
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
      ? [
          fromTarget,
          `it is already imported from ${targets.length > 1 ? 'a set in your list' : icons.set}`,
        ]
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

  /** @type {Map<DiscoveredIconSet, number>} */
  const used = new Map();
  for (const plan of planned.values()) {
    if (plan.match) used.set(plan.set, (used.get(plan.set) ?? 0) + 1);
  }
  icons.sets = targets
    .filter(each => used.has(each))
    .map(each => ({
      set: `${each.package}/${each.name}`,
      license: each.license,
      icons: /** @type {number} */ (used.get(each)),
    }));

  if (added.size === 0 && !placeholderName) return {source, icons};

  // Every reference to a renamed binding uses the mapped name. A use of the
  // placeholder carries a comment that names its meaning.
  walk(ast.program, (node, parent, key) => {
    if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
      const renamed = renames.get(node.name);
      if (!renamed || !isReference(node, parent, key)) return;
      const note = notes.get(node.name);
      const next =
        note && parent?.type !== 'JSXClosingElement'
          ? `${renamed} ${note}`
          : renamed;
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

  // The placeholder is declared once, above the file's first statement that
  // is not an import, and after any comment that leads that statement.
  if (placeholderName) {
    const first = ast.program.body.find(
      (/** @type {any} */ node) => node.type !== 'ImportDeclaration',
    );
    const declaration = placeholderDeclaration(placeholderName);
    if (first) {
      const previous = ast.program.body[ast.program.body.indexOf(first) - 1];
      const after = previous ? previous.loc.end.line : 0;
      // A comment on the line of the statement before it trails that
      // statement, so the declaration goes after it.
      const at = Math.min(
        first.start,
        ...(first.leadingComments ?? [])
          .filter(
            (/** @type {any} */ comment) => comment.loc.start.line > after,
          )
          .map((/** @type {any} */ comment) => comment.start),
      );
      unique.set('placeholder', {
        start: at,
        end: at,
        text: `${declaration}\n\n`,
      });
    } else {
      const at = source.length;
      unique.set('placeholder', {
        start: at,
        end: at,
        text: `${source.endsWith('\n') ? '' : '\n'}\n${declaration}\n`,
      });
    }
  }

  /** @type {Map<string, string[]>} */
  const byModule = new Map();
  for (const entry of added.values()) {
    const list = byModule.get(entry.module) ?? [];
    list.push(specifierText(entry));
    byModule.set(entry.module, list);
  }
  const lines = [...byModule.entries()]
    .map(([module, names]) => `import {${names.join(', ')}} from '${module}';`)
    .join('\n');
  if (lines) {
    unique.set('insert', {start: insertAt, end: insertAt, text: `${lines}\n`});
  }

  let out = source;
  for (const edit of [...unique.values()].sort(
    (a, b) => b.start - a.start || b.end - a.end,
  )) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return {source: out, icons};
}
