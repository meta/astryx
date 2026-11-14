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
import {carriesEveryTypedWord} from '../text/suggest-order.mjs';
import {findCoreDir} from '../fs/paths.mjs';
import {mayHaveIntegrations} from '../integrations/may-have-integrations.mjs';

/** The code that makes the kept integration component names. */
const NAMES_CODE = [
  fileURLToPath(import.meta.url),
  fileURLToPath(
    new URL('../discovery/component-discovery.mjs', import.meta.url),
  ),
  fileURLToPath(new URL('../discovery/module-exports.mjs', import.meta.url)),
  fileURLToPath(new URL('../discovery/entry-name-files.mjs', import.meta.url)),
];

/**
 * @typedef {'component' | 'hook' | 'template' | 'docs'} LookupCommand
 * @typedef {{components?: string[], hooks?: string[], templates?: string[], docs?: string[]}} LookupNames
 * @typedef {import('../response/base').Suggestion} Suggestion
 * @typedef {{name: string, reason: string}} Hint
 * @typedef {{hint: Hint, tier: number}} Found a hint and the tier its entry
 *   matches the typed name at
 */

/** The lookup commands, in the order the hint prefers them. */
export const LOOKUP_COMMANDS = /** @type {const} */ ([
  'component',
  'hook',
  'template',
  'docs',
]);

/** The field of {@link LookupNames} that holds each command's entries. */
const LISTED = /** @type {const} */ ({
  component: 'components',
  hook: 'hooks',
  template: 'templates',
  docs: 'docs',
});

/** What an entry of each command is, as the hint's reason names it. */
const ENTRY_KIND = {
  component: 'a component',
  hook: 'a hook',
  template: 'a template',
  docs: 'a docs topic',
};

/**
 * How closely a name matches what a reader typed, best first. A name is an
 * entry's full id: a component, hook or template id, or a docs route.
 */
export const MATCH_TIER = /** @type {const} */ ({
  /** The whole name, in any case. */
  exact: 0,
  /** The whole name without spaces and hyphens, and a hook without `use`. */
  folded: 1,
  /** Only the last segment of a path name, as exact or folded. */
  segment: 2,
  /** A name that carries every typed word. */
  words: 3,
  /** None of the above. */
  none: 4,
});

/**
 * The tier at which `name`, an entry of `command`, matches `typed`, by the
 * name alone ({@link MATCH_TIER}): exact, folded or segment.
 * @param {LookupCommand} command
 * @param {string} name
 * @param {string} typed
 * @returns {number}
 */
function nameTier(command, name, typed) {
  const lower = typed.toLowerCase();
  const wanted = foldEntryName(typed);
  /** @param {string} spelling */
  const folds = spelling => {
    const folded = foldEntryName(spelling);
    return (
      folded === wanted || (command === 'hook' && folded === `use${wanted}`)
    );
  };
  if (name.toLowerCase() === lower) return MATCH_TIER.exact;
  if (folds(name)) return MATCH_TIER.folded;
  const at = name.lastIndexOf('/');
  if (at !== -1) {
    const last = name.slice(at + 1);
    if (last.toLowerCase() === lower || folds(last)) return MATCH_TIER.segment;
  }
  return MATCH_TIER.none;
}

/**
 * The best tier at which any of `names`, the names one suggestion of
 * `command` answers to, matches `typed` ({@link MATCH_TIER}).
 * @param {LookupCommand} command
 * @param {Array<string | undefined>} names
 * @param {string} typed
 * @returns {number}
 */
export function suggestionTier(command, names, typed) {
  /** @type {number} */
  let best = MATCH_TIER.none;
  for (const name of names) {
    if (!name) continue;
    const tier = nameTier(command, name, typed);
    best = Math.min(
      best,
      tier === MATCH_TIER.none && carriesEveryTypedWord(typed, name)
        ? MATCH_TIER.words
        : tier,
    );
  }
  return best;
}

/**
 * The entry of `command` that `typed` names at the best tier, the first such
 * entry in catalog order, or null when none matches by name.
 * @param {LookupCommand} command
 * @param {string[] | undefined} names
 * @param {string} typed
 * @returns {{name: string, tier: number} | null}
 */
function bestMatch(command, names, typed) {
  /** @type {{name: string, tier: number} | null} */
  let best = null;
  for (const name of names ?? []) {
    const tier = nameTier(command, name, typed);
    if (tier < (best?.tier ?? MATCH_TIER.words)) best = {name, tier};
    if (tier === MATCH_TIER.exact) break;
  }
  return best;
}

/**
 * The hint that names `name`, an entry of `command`, for `from`, at `tier`.
 * @param {LookupCommand} command
 * @param {string} name
 * @param {LookupCommand} from
 * @param {number} tier
 * @returns {Found}
 */
function hintFor(command, name, from, tier) {
  return {
    hint: {
      name: `astryx ${command} ${name}`,
      reason: `${ENTRY_KIND[command]}, not ${ENTRY_KIND[from]}`,
    },
    tier,
  };
}

/**
 * The command, other than `from`, that reads the entry `typed` names among
 * `entries`, with the tier it matches at, or null. The entry must match by
 * name: exact, folded, or by the last segment of a path id
 * ({@link MATCH_TIER}). A better tier wins. Inside a tier, a component wins
 * over a hook, a hook over a template, and a template over a docs topic.
 * @param {string} typed
 * @param {LookupNames} entries
 * @param {LookupCommand} from the command that did not find `typed`
 * @returns {Found | null}
 */
export function otherCommand(typed, entries, from) {
  if (foldEntryName(typed) === '') return null;
  /** @type {Found | null} */
  let best = null;
  for (const command of LOOKUP_COMMANDS) {
    if (command === from) continue;
    const match = bestMatch(command, entries[LISTED[command]], typed);
    if (match && match.tier < (best?.tier ?? MATCH_TIER.words)) {
      best = hintFor(command, match.name, from, match.tier);
    }
  }
  return best;
}

/**
 * The suggestion list with the hint in it. The hint goes right after the
 * last suggestion that matches `typed` at the hint's tier or a better one
 * ({@link MATCH_TIER}), so it goes first when no suggestion does. The list
 * never grows: the last suggestion drops, and a hint that would come last is
 * left out. The hint is the only suggestion when `alone` holds or when the
 * list is empty, since then no suggestion shares a word with the name.
 * @template {Suggestion} T
 * @param {T[] | undefined} suggestions
 * @param {Found | null} found
 * @param {string} typed the name the lookup did not find
 * @param {{
 *   from: LookupCommand,
 *   alone?: boolean,
 *   namesOf?: (suggestion: T) => Array<string | undefined>,
 * }} options `namesOf` gives the names the command matched a suggestion by;
 *   by default its name
 * @returns {Array<T | Hint> | undefined}
 */
export function withOtherCommand(
  suggestions,
  found,
  typed,
  {from, alone = false, namesOf = suggestion => [suggestion.name]},
) {
  if (!found) return suggestions;
  if (alone || !suggestions || suggestions.length === 0) return [found.hint];
  let at = 0;
  suggestions.forEach((suggestion, index) => {
    if (suggestionTier(from, namesOf(suggestion), typed) <= found.tier) {
      at = index + 1;
    }
  });
  return [
    ...suggestions.slice(0, at),
    found.hint,
    ...suggestions.slice(at),
  ].slice(0, suggestions.length);
}

/**
 * {@link otherCommand} over the names the project's catalogs hold. File names
 * and doc text say first which catalogs can hold the name; a catalog is asked
 * only then, only for the names that fold to it, and only until a catalog
 * before it has an exact match. So a name no file carries reads no doc.
 * A check that fails gives no hint.
 * @param {unknown} typed
 * @param {{
 *   from: LookupCommand,
 *   cwd?: string,
 *   coreDir?: string | null,
 *   integrations?: import('../integrations/integrations.mjs').LoadedIntegration[],
 * }} context `coreDir` and `integrations` are the ones the lookup found, if
 *   any
 * @returns {Promise<Found | null>}
 */
export async function findOtherCommand(
  typed,
  {from, cwd = process.cwd(), coreDir: knownCoreDir, integrations: known},
) {
  if (typeof typed !== 'string') return null;
  const wanted = foldEntryName(typed);
  if (wanted === '') return null;
  // A name with a `/` can be only an integration template's full id.
  const isPath = typed.includes('/');
  /** @type {import('../integrations/integrations.mjs').LoadedIntegration[] | undefined} */
  let loaded = known;
  const integrationsOnce = async () =>
    (loaded ??= await projectIntegrations(cwd));
  /** @param {string} name */
  const isWanted = name => foldEntryName(name) === wanted;
  /** @param {string} name */
  const isWantedHook = name =>
    foldEntryName(name) === wanted || foldEntryName(name) === `use${wanted}`;

  /** @type {string | null} */
  let coreDir = null;
  /** @type {ReturnType<typeof coreFilesNaming> | {component: boolean, hook: boolean, componentTops?: undefined, hookTops?: undefined}} */
  let inCore = {component: false, hook: false};
  try {
    coreDir = knownCoreDir ?? findCoreDir(cwd);
    if (coreDir && !isPath) inCore = coreFilesNaming(coreDir, wanted);
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
  /** @type {Found | null} */
  let best = null;
  for (const [command, load] of catalogs) {
    if (command === from || (isPath && command !== 'template')) continue;
    let entries;
    try {
      entries = await load();
    } catch {
      continue;
    }
    const match = bestMatch(command, entries[LISTED[command]], typed);
    if (match && match.tier < (best?.tier ?? MATCH_TIER.words)) {
      best = hintFor(command, match.name, from, match.tier);
      if (match.tier === MATCH_TIER.exact) break;
    }
  }
  return best;
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
 * The template ids whose full id or last segment folds to `wanted`, from
 * file names alone: Core's, then
 * each integration's when an integration ships a template doc with such an
 * id.
 * @param {import('../integrations/integrations.mjs').LoadedIntegration[]} integrations
 * @param {string} wanted the folded name
 * @returns {string[]}
 */
function templateNames(integrations, wanted) {
  /** @param {string} name */
  const isWanted = name =>
    foldEntryName(name) === wanted ||
    foldEntryName(name.slice(name.lastIndexOf('/') + 1)) === wanted;
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
