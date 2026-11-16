// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon imports that do not match the project's icon sets (AST-084):
 * what Doctor reads in the project's own code after the project changes its
 * list of sets or uninstalls a set.
 *
 * An import of an icon from an installed set, or from the library a set wraps
 * (its data's `source`), draws the definitions that set's `map` names for it.
 * Such an import does not match the project's list when the set is not in the
 * list, or when a set earlier in the list draws one of those definitions too:
 * a template copied now imports that set's icon instead, by the same rule as
 * template icon mapping. An import of a package that does not resolve from the
 * file, and that the project's package.json does not declare, breaks the
 * build; it counts as an icon import only when every name it imports follows
 * the icon export contract (`<Name>Icon`). The CLI knows no icon library: it
 * reads only the installed sets' data and the code's imports.
 *
 * @input One source file, the project's icon sets, and how a module resolves
 * @output Each import that does not match, with the icon that replaces it
 * @position packages/cli/foundation/discovery — read by Doctor's
 *   `icon-imports` check
 */

import {parseTemplateSource as parseSource} from './template-source-tree.mjs';
import {ICON_EXPORT_NAME_RE} from './icon-set-discovery.mjs';
import {
  importedName,
  indexSets,
  isAstryxModule,
  isPackageModule,
  matchIcon,
  wrappedIcon,
  wrapsModule,
} from './template-icons.mjs';
import {astryxDefinitionsByName} from './icon-definition-discovery.mjs';
import {definitionsByIcon, iconLookExport} from './icon-set-discovery.mjs';

/** @typedef {import('./icon-set-discovery.mjs').DiscoveredIconSet} DiscoveredIconSet */
/** @typedef {import('./icon-set-discovery.mjs').IconSetChoice} IconSetChoice */

/**
 * One icon import that does not match the project's icon sets.
 * @typedef {object} IconImportFinding
 * @property {number} line the import's line in the file
 * @property {string} module the module it imports from
 * @property {string} export the name it imports (`default` for a default
 *   import)
 * @property {'unlisted' | 'earlier' | 'unresolved'} why `unlisted`: the set
 *   it comes from is not in the project's list; `earlier`: a set earlier in
 *   the list draws the same definition; `unresolved`: its package does not
 *   resolve and the project does not declare it
 * @property {string | null} set the set it comes from, as `<package>/<set>`;
 *   null when its package does not resolve
 * @property {string[]} definitions the Astryx definitions it draws
 * @property {{set: string, module: string, export: string} | null} replacement
 *   the icon a set in the list draws for one of those definitions, the first
 *   set in the list that has one; null when no set in the list has one
 */

/**
 * The imports in one file that do not match the project's icon sets. Empty
 * when the project has no main set; null when the file does not parse.
 * @param {string} source
 * @param {{sets: DiscoveredIconSet[], choice: IconSetChoice}} iconSets
 * @param {(module: string) => boolean} broken whether an import of a module
 *   breaks the build: it does not resolve from the file and the project does
 *   not declare its package
 * @param {Map<DiscoveredIconSet, Map<string, string>>} [wrappedRead] each
 *   set's exports by the library export they re-export, shared between files
 * @returns {IconImportFinding[] | null}
 */
export function iconImportFindings(
  source,
  {sets, choice},
  broken,
  wrappedRead = new Map(),
) {
  const main = choice.set;
  if (!main) return [];
  /** @type {DiscoveredIconSet[]} */
  const order = choice.order ?? [main];
  /** @type {any} */
  let ast;
  try {
    ast = parseSource(source);
  } catch {
    return null;
  }
  const index = indexSets(sets);
  const astryx = astryxDefinitionsByName();
  /** @type {IconImportFinding[]} */
  const findings = [];
  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration' || node.importKind === 'type') {
      continue;
    }
    const module = String(node.source.value);
    if (!isPackageModule(module) || isAstryxModule(module)) continue;
    const specifiers = node.specifiers.filter(
      (/** @type {any} */ each) =>
        each.type !== 'ImportNamespaceSpecifier' && each.importKind !== 'type',
    );
    if (specifiers.length === 0) continue;
    const line = node.loc?.start.line ?? 0;
    const wrapper = sets.find(set => wrapsModule(set, module));
    const fromSet = specifiers.some((/** @type {any} */ each) =>
      index.has(`${module}\0${importedName(each)}`),
    );
    if (!fromSet && !wrapper) {
      if (
        specifiers.every(
          (/** @type {any} */ each) =>
            each.type === 'ImportSpecifier' &&
            ICON_EXPORT_NAME_RE.test(importedName(each)),
        ) &&
        broken(module)
      ) {
        for (const each of specifiers) {
          findings.push({
            line,
            module,
            export: importedName(each),
            why: 'unresolved',
            set: null,
            definitions: [],
            replacement: null,
          });
        }
      }
      continue;
    }
    for (const each of specifiers) {
      const imported = importedName(each);
      const indexed = index.get(`${module}\0${imported}`);
      /** @type {DiscoveredIconSet | undefined} */
      let set = indexed?.set;
      let record = indexed;
      if (!record && wrapper) {
        // The main set's own library is the icon the project chose.
        if (wrapper === main) continue;
        set = wrapper;
        const icon = wrappedIcon(wrapper, module, imported, wrappedRead);
        record = icon
          ? {
              setName: wrapper.name,
              export: icon.export,
              id: icon.id,
              definitions: (
                definitionsByIcon(wrapper.data).get(icon.id) ?? []
              ).filter(name => astryx.has(name)),
              set: wrapper,
            }
          : undefined;
      }
      if (!set || set === main) continue;
      const listed = order.indexOf(set);
      // A set later in the list supplies only what the sets before it lack.
      const earlier = listed === -1 ? order : order.slice(0, listed);
      /** @type {IconImportFinding['replacement']} */
      let replacement = null;
      if (record) {
        for (const target of earlier) {
          const match = matchIcon(record, target);
          if (match) {
            const chosen = iconLookExport(
              match.icon,
              target,
              choice.variant ?? record.variant,
            );
            replacement = {
              set: `${target.package}/${target.name}`,
              ...chosen,
            };
            break;
          }
        }
      }
      if (listed !== -1 && !replacement) continue;
      findings.push({
        line,
        module,
        export: imported,
        why: listed === -1 ? 'unlisted' : 'earlier',
        set: `${set.package}/${set.name}`,
        definitions: record?.definitions ?? [],
        replacement,
      });
    }
  }
  return findings;
}
