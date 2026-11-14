// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The lookup commands' shared hint: when `astryx component`, `hook`,
 * `template` or `docs` finds no entry for a name, and the name is exactly an
 * entry another of those commands reads, the not-found error suggests that
 * command first (`astryx hook useHotkeys`).
 *
 * @input  the name the lookup did not find, the command that looked, and the
 *   project's Core folder, integrations and docs
 * @output one `{name, reason}` suggestion or null, and the suggestion list
 *   with that hint in it
 * @position foundation/suggest: called by the not-found path of the
 *   component, hook, template and docs adapters
 */

import {fileURLToPath} from 'node:url';
import {
  builtinDocNamesWhere,
  integrationDocNamesWhere,
} from '../discovery/docs-discovery.mjs';
import {
  coreFilesNaming,
  foldEntryName,
  integrationsDocsSpelling,
  integrationsFilesNaming,
} from '../discovery/entry-name-files.mjs';
import {
  coreTemplateIds,
  integrationTemplateIds,
  listTemplates,
  templateFilesNaming,
} from '../discovery/template-ids.mjs';
import {keptTreeSummary} from '../fs/kept-tree.mjs';
import {findCoreDir} from '../fs/paths.mjs';
import {mayHaveIntegrations} from '../integrations/may-have-integrations.mjs';

/** The code that makes the kept integration component names. */
const NAMES_CODE = [
  fileURLToPath(import.meta.url),
  fileURLToPath(
    new URL('../discovery/component-discovery.mjs', import.meta.url),
  ),
  fileURLToPath(new URL('../discovery/module-exports.mjs', import.meta.url)),
];

/**
 * @typedef {'component' | 'hook' | 'template' | 'docs'} LookupCommand
 * @typedef {{components?: string[], hooks?: string[], templates?: string[], docs?: string[]}} LookupNames
 * @typedef {import('../response/base').Suggestion} Suggestion
 * @typedef {{name: string, reason: string}} Hint
 */

/** The lookup commands, in the order the hint prefers them. */
export const LOOKUP_COMMANDS = /** @type {const} */ ([
  'component',
  'hook',
  'template',
  'docs',
]);

/** What an entry of each command is, as the hint's reason names it. */
const ENTRY_KIND = {
  component: 'a component',
  hook: 'a hook',
  template: 'a template',
  docs: 'a docs topic',
};

/**
 * Whether `name` is the entry `wanted` names for `command`: the same folded
 * name, and for a hook also the folded name with `use` before it.
 * @param {LookupCommand} command
 * @param {string} name
 * @param {string} wanted a folded name
 * @returns {boolean}
 */
function names(command, name, wanted) {
  const folded = foldEntryName(name);
  return folded === wanted || (command === 'hook' && folded === `use${wanted}`);
}

/**
 * The command, other than `from`, that reads the entry `typed` names among
 * `entries`, or null. Only an exact name counts, in any case and with or
 * without spaces and hyphens; a hook also answers to its name without `use`.
 * A component wins over a hook, a hook over a template, and a template over
 * a docs topic. A name with a `/` names none of them.
 * @param {string} typed
 * @param {LookupNames} entries
 * @param {LookupCommand} from the command that did not find `typed`
 * @returns {Hint | null}
 */
export function otherCommand(typed, entries, from) {
  if (typed.includes('/')) return null;
  const wanted = foldEntryName(typed);
  if (wanted === '') return null;
  /** @type {Record<LookupCommand, string[] | undefined>} */
  const listed = {
    component: entries.components,
    hook: entries.hooks,
    template: entries.templates,
    docs: entries.docs,
  };
  for (const command of LOOKUP_COMMANDS) {
    if (command === from) continue;
    const name = (listed[command] ?? []).find(n => names(command, n, wanted));
    if (name) {
      return {
        name: `astryx ${command} ${name}`,
        reason: `${ENTRY_KIND[command]}, not ${ENTRY_KIND[from]}`,
      };
    }
  }
  return null;
}

/**
 * The suggestion list with the hint first. The list never grows: the hint
 * takes the last suggestion's place. It is the only suggestion when `alone`
 * holds or when the list is empty, since then no suggestion shares a word
 * with the name.
 * @template {Suggestion} T
 * @param {T[] | undefined} suggestions
 * @param {Hint | null} hint
 * @param {{alone?: boolean}} [options]
 * @returns {Array<T | Hint> | undefined}
 */
export function withOtherCommand(suggestions, hint, {alone = false} = {}) {
  if (!hint) return suggestions;
  if (alone || !suggestions || suggestions.length === 0) return [hint];
  return [hint, ...suggestions.slice(0, -1)];
}

/**
 * {@link otherCommand} over the names the project's catalogs hold. File names
 * and doc text say first which catalogs can hold the name; a catalog is asked
 * only then, only for the names that fold to it, and only when the one before
 * it has no match. So a name no file carries reads no doc. A check that fails
 * gives no hint.
 * @param {unknown} typed
 * @param {{
 *   from: LookupCommand,
 *   cwd?: string,
 *   coreDir?: string | null,
 *   integrations?: import('../integrations/integrations.mjs').LoadedIntegration[],
 * }} context `coreDir` and `integrations` are the ones the lookup found, if
 *   any
 * @returns {Promise<Hint | null>}
 */
export async function findOtherCommand(
  typed,
  {from, cwd = process.cwd(), coreDir: knownCoreDir, integrations: known},
) {
  if (typeof typed !== 'string' || typed.includes('/')) return null;
  const wanted = foldEntryName(typed);
  if (wanted === '') return null;
  /** @type {import('../integrations/integrations.mjs').LoadedIntegration[] | undefined} */
  let loaded = known;
  const integrationsOnce = async () =>
    (loaded ??= await projectIntegrations(cwd));
  /** @param {string} name */
  const isWanted = name => foldEntryName(name) === wanted;
  /** @param {string} name */
  const isWantedHook = name => names('hook', name, wanted);

  /** @type {string | null} */
  let coreDir = null;
  /** @type {ReturnType<typeof coreFilesNaming> | {component: boolean, hook: boolean, componentTops?: undefined, hookTops?: undefined}} */
  let inCore = {component: false, hook: false};
  try {
    coreDir = knownCoreDir ?? findCoreDir(cwd);
    if (coreDir) inCore = coreFilesNaming(coreDir, wanted);
  } catch {
    inCore = {component: true, hook: true};
  }

  /** @type {Array<[LookupCommand, () => Promise<LookupNames>]>} */
  const catalogs = [
    [
      'component',
      async () => ({
        components:
          coreDir && inCore.component
            ? (await componentDiscovery()).discoverComponentNamesWhere(
                coreDir,
                isWanted,
                inCore.componentTops,
              )
            : [],
      }),
    ],
    [
      'component',
      async () => ({
        components: await integrationComponentNames(
          await integrationsOnce(),
          wanted,
          isWanted,
        ),
      }),
    ],
    [
      'hook',
      async () => ({
        hooks:
          coreDir && inCore.hook
            ? (await import('../discovery/hook-discovery.mjs')).getAllHookNames(
                coreDir,
                isWantedHook,
                inCore.hookTops,
              )
            : [],
      }),
    ],
    [
      'template',
      async () => ({
        templates: templateNames(await integrationsOnce(), wanted),
      }),
    ],
    [
      'docs',
      async () => {
        const builtin = builtinDocNamesWhere(isWanted);
        if (builtin.length > 0) return {docs: builtin};
        const files = integrationsDocsSpelling(
          (await integrationsOnce()).map(integration => integration?.docs),
          wanted,
        );
        return {docs: await integrationDocNamesWhere(files, isWanted)};
      },
    ],
  ];
  for (const [command, load] of catalogs) {
    if (command === from) continue;
    let entries;
    try {
      entries = await load();
    } catch {
      continue;
    }
    const found = otherCommand(typed, entries, from);
    if (found) return found;
  }
  return null;
}

/**
 * Component discovery, loaded only when a file name or doc text can carry
 * the name.
 * @returns {Promise<typeof import('../discovery/component-discovery.mjs')>}
 */
function componentDiscovery() {
  return import('../discovery/component-discovery.mjs');
}

/**
 * The integrations the project at `cwd` loads: those of the project this run
 * already loaded, else a fresh load. Where none can load, the project's
 * modules are not imported.
 * @param {string} cwd
 * @returns {Promise<import('../integrations/integrations.mjs').LoadedIntegration[]>}
 */
async function projectIntegrations(cwd) {
  if (!mayHaveIntegrations(cwd)) return [];
  const {Project} = await import('../config/project.mjs');
  return (Project.lastLoaded(cwd) ?? (await Project.load(cwd)))
    .loadedIntegrations;
}

/**
 * The names of the components `integration` lists, in discovery's order: a
 * summary kept while the integration's components folder, every file
 * discovery read and every path it probed are unchanged.
 * @param {import('../integrations/integrations.mjs').LoadedIntegration} integration
 * @param {typeof import('../discovery/component-discovery.mjs')} discovery
 * @returns {string[]}
 */
function integrationComponentList(
  integration,
  {discoverIntegrationComponents},
) {
  const componentsDir = integration.components;
  if (!componentsDir) return [];
  return keptTreeSummary(
    {
      kind: 'integration-component-list',
      roots: [componentsDir],
      code: NAMES_CODE,
      skip: name => name === 'node_modules' || name === '__tests__',
      key: [
        integration.name,
        integration.__packageDir ?? null,
        integration.__packageExports === undefined
          ? 'read'
          : JSON.stringify(integration.__packageExports),
      ],
      recorded: true,
    },
    () => discoverIntegrationComponents(integration).map(record => record.name),
  );
}

/**
 * The names `isWanted` accepts among the components the loaded integrations
 * list, in project order: the names `astryx component` reads, which answers
 * a component whose doc is not valid with ERR_INVALID_DOC. Only an
 * integration whose files can carry the name is read.
 * @param {import('../integrations/integrations.mjs').LoadedIntegration[]} integrations
 * @param {string} wanted the folded name
 * @param {(name: string) => boolean} isWanted
 * @returns {Promise<string[]>}
 */
async function integrationComponentNames(integrations, wanted, isWanted) {
  const naming = integrationsFilesNaming(
    integrations.map(integration => integration.components),
    wanted,
  );
  /** @type {typeof import('../discovery/component-discovery.mjs') | undefined} */
  let discovery;
  for (const [at, integration] of integrations.entries()) {
    if (!naming[at]) continue;
    discovery ??= await componentDiscovery();
    const found = integrationComponentList(integration, discovery).filter(
      isWanted,
    );
    if (found.length > 0) return found;
  }
  return [];
}

/**
 * The template ids that fold to `wanted`, from file names alone: Core's, then
 * each integration's when an integration ships a template doc with such an
 * id.
 * @param {import('../integrations/integrations.mjs').LoadedIntegration[]} integrations
 * @param {string} wanted the folded name
 * @returns {string[]}
 */
function templateNames(integrations, wanted) {
  /** @param {string} name */
  const isWanted = name => foldEntryName(name) === wanted;
  const {blocks, listed} = templateFilesNaming(integrations, wanted);
  const core = blocks
    ? coreTemplateIds(isWanted)
    : listTemplates().filter(isWanted);
  if (!listed) return core;
  return [
    ...core,
    ...integrations.flatMap(integration =>
      integrationTemplateIds(integration).filter(isWanted),
    ),
  ];
}
