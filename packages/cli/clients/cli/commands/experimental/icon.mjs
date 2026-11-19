// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental icon` — find an icon by meaning in the installed
 * icon sets, and author a set (AST-084 FR6, FR7). Experimental (spec:AST-017
 * FR27): it is registered only under the `experimental` group.
 *
 * The command surface comes from the colocated `icon.doc.mjs` CommandDoc via
 * `defineCommand`; this file parses flags, calls `icon()`, and renders.
 *
 * Usage:
 *   astryx experimental icon delete              Ranked matches with import lines
 *   astryx experimental icon outline/trash       One icon and every variant's import
 *   astryx experimental icon --list              Installed sets and the names they fill
 *   astryx experimental icon arrow --set outline --limit 3
 */

import {
  formatCliCommand,
  getCliInvocation,
  prefixCliCommands,
} from '../../../../foundation/env/package-manager.mjs';
import {jsonOut} from '../../../../foundation/response/json.mjs';
import {definitionCoverageText} from '../../../../foundation/text/definition-coverage.mjs';
import {logger} from '../../../../api/logger.mjs';
import {resultSet} from '../../../../foundation/debug/index.mjs';
import {
  emit,
  section,
  text,
  record,
  records,
  list,
} from '../../formatters/index.mjs';
import {cliError} from '../../lib/cli-error.mjs';
import {
  answerBareSubcommand,
  defineCommand,
} from '../../lib/define-command.mjs';
import {icon as iconApi} from '../../../../api/icon/icon.mjs';
import {definitionMatches} from '../../../../api/icon/search/search.mjs';
import {iconAdd} from '../../../../api/icon/add/add.mjs';
import {iconMap} from '../../../../api/icon/map/map.mjs';
import {iconUse} from '../../../../api/icon/use/use.mjs';
import {iconNewSet} from '../../../../api/icon/new-set/new-set.mjs';
import {iconNewDefinition} from '../../../../api/icon/new-definition/new-definition.mjs';
import {doc as iconCommand} from '../experimental-icon.doc.mjs';
import {doc as iconUseCommand} from '../experimental-icon-use.doc.mjs';
import {doc as iconMapCommand} from '../experimental-icon-map.doc.mjs';
import {doc as iconAddCommand} from '../experimental-icon-add.doc.mjs';
import {doc as iconNewSetCommand} from '../experimental-icon-new-set.doc.mjs';
import {doc as iconNewDefinitionCommand} from '../experimental-icon-new-definition.doc.mjs';
import {doc as iconFn} from '../../../../api/icon/icon.doc.mjs';
import {doc as iconUseFn} from '../../../../api/icon/iconUse.doc.mjs';
import {doc as iconMapFn} from '../../../../api/icon/iconMap.doc.mjs';
import {doc as iconAddFn} from '../../../../api/icon/iconAdd.doc.mjs';
import {doc as iconNewSetFn} from '../../../../api/icon/iconNewSet.doc.mjs';
import {doc as iconNewDefinitionFn} from '../../../../api/icon/iconNewDefinition.doc.mjs';
import {NO_RESULT_SET} from '../../../../foundation/debug/index.mjs';
import {templateMeaningsLine} from '../../../../foundation/text/template-meanings-line.mjs';
import {defaultVariantText} from '../../../../foundation/text/default-variant.mjs';

/**
 * The lowest search score of a whole-word match: an exact name or meaning
 * (80 or 90), or a definition the set maps to the icon (100).
 */
const WHOLE_WORD = 80;

/** How many missing icons an `add --all` receipt names in text. */
const MISSING_SHOWN = 10;

/** @param {unknown} value */
const variantsText = value => (Array.isArray(value) ? value.join('/') : '');

/**
 * The receipt line for a data file whose `module` the command rewrote after
 * a package rename.
 * @param {{moduleUpdate?: {previous: string, module: string}, dryRun?: boolean}} data
 */
const moduleUpdateLines = data =>
  data.moduleUpdate
    ? [
        text(
          `${data.dryRun ? '[plan] Would update' : '[ok] Updated'} module to "${data.moduleUpdate.module}" (was "${data.moduleUpdate.previous}"), from the package name in package.json.`,
        ),
      ]
    : [];

/**
 * The receipt lines for `map` keys a write renamed: each named a replaced
 * definition, and the data file now names the definition that replaced it.
 * @param {{replacedKeys?: Array<{key: string, definition: string}>}} data
 */
const replacedKeyLines = data =>
  (data.replacedKeys ?? []).map(each =>
    text(
      `[ok] Renamed map key "${each.key}" to "${each.definition}": "${each.definition}" replaced that definition.`,
    ),
  );

/**
 * The receipt's last line when the set leaves template meanings unmapped.
 * @param {{templateMeanings?: {unmapped: Array<{definition: string, templates: number}>}}} data
 * @param {string} set the set's name
 */
const templateMeaningsLines = (data, set) => {
  const line = data.templateMeanings
    ? templateMeaningsLine(
        data.templateMeanings.unmapped,
        set,
        getCliInvocation(),
      )
    : null;
  return line ? [text(`[next] ${line}`)] : [];
};

/** The most related definitions a text answer names. */
const RELATED_SHOWN = 4;

/**
 * Related definitions as one short line: up to four, each with what it means.
 * @param {import('../../../../api/icon/icon.type.mjs').IconDefinitionRelative[]} relatives
 * @returns {string}
 */
function relatedText(relatives) {
  const shown = relatives
    .slice(0, RELATED_SHOWN)
    .map(
      each => `${each.definition} (${each.description.replace(/\.$/u, '')})`,
    );
  const more = relatives.length - shown.length;
  return `${shown.join('; ')}${more > 0 ? `; ${more} more` : ''}`;
}

/**
 * Register `icon` and its subcommands under the `experimental` group.
 * @param {import('commander').Command} group the `experimental` command
 * @param {import('commander').Command} program the root program
 */
export function registerExperimentalIcon(group, program) {
  /**
   * Print the finder's answer, as JSON or as text, and return what it
   * answered.
   * @param {Awaited<ReturnType<typeof iconApi>>} result
   * @returns {import('../../../../foundation/debug/command-result.mjs').CommandResult}
   */
  const printAnswer = result => {
    const json = program.opts().json || false;
    const answered =
      result.type === 'icon.search'
        ? resultSet({
            count: result.data.matchCount,
            resultKind: 'mixed',
            empty: result.data.matchCount === 0,
          })
        : result.type === 'icon.definitions'
          ? resultSet({
              count: result.data.definitions.length,
              resultKind: 'mixed',
            })
          : result.type === 'icon.setIcons'
            ? resultSet({
                count: result.data.icons.length,
                resultKind: 'mixed',
                empty: result.data.icons.length === 0,
              })
            : result.type === 'icon.list'
              ? resultSet({
                  count: result.data.sets.length,
                  resultKind: 'mixed',
                  empty: result.data.sets.length === 0,
                })
              : resultSet({count: 1, resultKind: 'mixed', directMatch: true});

    if (json) {
      jsonOut(result);
      return answered;
    }

    const run = getCliInvocation();
    if (result.type === 'icon.definitions') {
      const {definitions, set} = result.data;
      const unmappedUsed = definitions.filter(
        each => each.mapped === false && each.templates > 0,
      ).length;
      emit(
        section(
          `Icon definitions (${definitions.length}, ${definitions.filter(each => each.builtIn).length} built-in)${set ? `, checked against ${set}` : ''}`,
        ),
        list(
          definitions.map(each => {
            const marks = [
              each.builtIn ? 'built-in' : 'optional',
              ...(each.group ? [`group ${each.group}`] : []),
              ...(each.templates > 0
                ? [
                    `${each.templates} ${each.templates === 1 ? 'template' : 'templates'}`,
                  ]
                : []),
              ...(each.mapped == null
                ? []
                : [each.mapped ? 'mapped' : 'not mapped']),
              ...(each.replaces ? [`replaces ${each.replaces}`] : []),
            ];
            return `${each.name} [${marks.join(', ')}]: ${each.description} Words: ${each.words.join(', ')}.`;
          }),
        ),
        ...(set && unmappedUsed > 0
          ? [
              text(
                `${set} does not map ${unmappedUsed} ${unmappedUsed === 1 ? 'definition' : 'definitions'} that templates use; a copied template shows a placeholder for each.`,
              ),
            ]
          : []),
        text(
          `Built-in definitions are the ones every set maps; "N templates" counts the bundled templates that use one. Map one: ${run} experimental icon map <definition> <icon id> --set <set>`,
        ),
      );
      return answered;
    }
    if (result.type === 'icon.setIcons') {
      const {set, iconCount, icons} = result.data;
      emit(
        section(`Icons in ${set} (${iconCount})`),
        // One line each, so a whole library reads at a glance:
        // id, then its words, then the definitions it draws.
        list(
          icons.map(
            each =>
              `${each.id}: ${each.words.join(', ')}${each.definitions.length > 0 ? ` = ${each.definitions.join(', ')}` : ''}`,
          ),
        ),
        text(
          `Map one: ${run} experimental icon map <definition> <id> --set ${set}`,
        ),
      );
      return answered;
    }
    if (result.type === 'icon.search') {
      const {query: q, matchCount, matches} = result.data;
      if (result.data.next) {
        const definitions = result.data.definitions ?? [];
        const builtIn = definitions.filter(each => each.builtIn);
        const others = definitions.filter(each => !each.builtIn);
        emit(
          text(`No icon set is installed, so no icon matches "${q}".`),
          ...(builtIn.length > 0
            ? [
                text(
                  "Core draws these names with no set; pass one to a component's icon prop:",
                ),
                list(builtIn.map(each => `${each.name}: ${each.description}`)),
              ]
            : []),
          ...(others.length > 0
            ? [
                text(
                  'Icon definitions that match; an icon set draws them once one is installed:',
                ),
                list(others.map(each => `${each.name}: ${each.description}`)),
              ]
            : []),
          ...(definitions[0]?.relatives
            ? [
                text(
                  `Related to ${definitions[0].name}: ${relatedText(definitions[0].relatives)}`,
                ),
              ]
            : []),
          text(
            `[next] ${prefixCliCommands(result.data.next, getCliInvocation())}`,
          ),
        );
        return answered;
      }
      if (matches.length === 0) {
        emit(
          text(`No icons match "${q}".`),
          text(`See the installed sets: ${run} experimental icon --list`),
        );
        return answered;
      }
      emit(
        section(
          matchCount > matches.length
            ? `Icons for "${q}" (${matches.length} of ${matchCount})`
            : `Icons for "${q}" (${matches.length})`,
        ),
        // The import draws the project's look where the icon has it, else
        // its default look; its other variants are named with their
        // exports and read with `icon <set>/<id>`.
        records(
          matches.map(({variants, look, relatives, ...match}, at) => ({
            ...match,
            // Only the first match names its related definitions, so the
            // answer stays short.
            ...(at === 0 && relatives
              ? {relatives: relatedText(relatives)}
              : {}),
            ...(look
              ? {
                  look: `no ${look.asked} look; draws ${look.used ?? 'its one look'}`,
                }
              : {}),
            ...(variants.length > 0
              ? {
                  variant: variants
                    .map(each => `${each.variant} (${each.export})`)
                    .join(', '),
                }
              : {}),
          })),
          {
            fields: [
              'set',
              'id',
              'package',
              'import',
              'look',
              'words',
              'definitions',
              'relatives',
              'variant',
              'reason',
            ],
          },
        ),
        text(`Read one with its variants: ${run} experimental icon <set>/<id>`),
      );
      return answered;
    }

    if (result.type === 'icon.detail') {
      const {variants, ...rest} = result.data;
      emit(
        record(rest, {
          fields: [
            'set',
            'id',
            'package',
            'module',
            'export',
            'import',
            'words',
            'definitions',
          ],
        }),
        ...(variants.length > 0
          ? [
              section('Other variants'),
              records(variants, {
                fields: ['variant', 'module', 'export', 'import'],
              }),
            ]
          : []),
        text(
          `More icons: ${formatCliCommand(`astryx experimental icon ${rest.words[0]}`)}`,
        ),
      );
      return answered;
    }

    const {status, projectSet, reason, sets, withdrawn, order, next, variant} =
      result.data;
    emit(
      section('Icon sets'),
      record({
        status,
        projectSet,
        ...(order.length > 1 ? {order: order.join(' > ')} : {}),
        ...(variant ? {variant} : {}),
        reason,
      }),
      ...(next
        ? [
            text(
              sets.length === 0
                ? `[next] ${prefixCliCommands(next, getCliInvocation())}`
                : `[warn] ${next}`,
            ),
          ]
        : []),
      ...(sets.length > 0
        ? [
            records(
              sets.map(({coverage, ...set}) => ({
                ...set,
                default: defaultVariantText(set.default),
                builtIn: `${coverage.builtIn.mapped}/${coverage.builtIn.total}`,
                definitions: definitionCoverageText(coverage.astryx),
                own: coverage.own,
                missing: coverage.builtIn.missing,
              })),
              {
                fields: [
                  'name',
                  'displayName',
                  'package',
                  'license',
                  'iconCount',
                  'default',
                  'variants',
                  ...(variant ? ['look'] : []),
                  'builtIn',
                  'definitions',
                  'own',
                  'missing',
                  'role',
                  'project',
                  'description',
                ],
                format: {variants: variantsText},
              },
            ),
          ]
        : []),
      ...(withdrawn.length > 0
        ? [
            section('Withdrawn'),
            list(
              withdrawn.map(
                each => `${each.package}/${each.name}: ${each.reason}`,
              ),
            ),
          ]
        : []),
      // With no set installed, the finder has nothing to find: `next` says
      // what to do.
      ...(next && sets.length === 0
        ? []
        : [text(`Find one: ${run} experimental icon <words>`)]),
    );
    return answered;
  };

  const iconCli = defineCommand(group, iconCommand, {
    fn: iconFn,
    action: async (
      /** @type {string[] | string | undefined} */ words,
      /** @type {{list?: boolean, set?: string, limit?: string, allIcons?: boolean, definitions?: boolean}} */ options,
    ) => {
      const query = Array.isArray(words) ? words.join(' ') : words;
      // Number(), not parseInt(): the API refuses `1.5` and `5abc`.
      const limit = options.limit != null ? Number(options.limit) : undefined;

      /** @type {Awaited<ReturnType<typeof iconApi>>} */
      let result;
      try {
        result = await iconApi(query, {
          cwd: process.cwd(),
          list: options.list ?? false,
          set: options.set,
          limit,
          allIcons: options.allIcons ?? false,
          definitions: options.definitions ?? false,
        });
      } catch (e) {
        const err =
          /** @type {import('../../../../api/error.mjs').AstryxError} */ (e);
        return cliError(err.message, {
          suggestions: err.suggestions,
          code: err.code,
        });
      }
      return printAnswer(result);
    },
    // A subcommand called bare is also an icon ask for its own name ("add"
    // is a common one). The finder answers it only when an icon or, with no
    // set installed, a definition matches the whole name; a word that only
    // starts or contains it ("user" for `use`) is no answer. Else the
    // subcommand keeps its error and names the search.
    bareSubcommand: async subcommand => {
      const name = subcommand.name();
      const result = await iconApi(name, {cwd: process.cwd()}).catch(
        () => null,
      );
      const found =
        result?.type === 'icon.search' &&
        (result.data.next
          ? definitionMatches(name).some(match => match.score >= WHOLE_WORD)
          : result.data.matches.some(match => match.score >= WHOLE_WORD));
      if (!result || !found)
        return {
          suggestion: {
            name: 'astryx experimental icon <words>',
            reason: 'find an icon by meaning',
          },
        };
      const answered = printAnswer(result);
      if (!program.opts().json)
        emit(
          text(
            `\`${name}\` is also a subcommand: ${formatCliCommand(`astryx experimental icon ${name} ${subcommand.usage()}`)}`,
          ),
        );
      return {result: answered};
    },
  });

  /**
   * The set an authoring subcommand edits. `experimental icon` declares
   * `--set` too, so Commander gives the parent a `--set` written after a
   * subcommand's name; the subcommand reads it there.
   * @param {{set?: unknown}} options the subcommand's own options
   * @returns {string | undefined}
   */
  const setOf = options => {
    const value = options.set ?? iconCli.opts().set;
    return typeof value === 'string' ? value : undefined;
  };

  /**
   * Run one authoring call and print its receipt, or its error. A call made
   * bare that fails gets the group's answer for it instead, when it has one.
   * @param {import('commander').Command} cmd the subcommand that runs
   * @param {() => Promise<any>} call
   * @param {(result: any) => void} print
   */
  const run = async (cmd, call, print) => {
    // Reading a large library reports its progress through the shared
    // logger: on stderr in text mode, never under --json.
    logger.setSilent(Boolean(program.opts().json));
    let result;
    try {
      result = await call();
    } catch (e) {
      const err =
        /** @type {import('../../../../api/error.mjs').AstryxError} */ (e);
      const bare = await answerBareSubcommand(cmd);
      if (bare && 'result' in bare) return bare.result;
      return cliError(err.message, {
        suggestions: [
          ...(err.suggestions ?? []),
          ...(bare ? [bare.suggestion] : []),
        ],
        code: err.code,
      });
    }
    if (program.opts().json) jsonOut(result);
    else print(result);
    return NO_RESULT_SET;
  };

  defineCommand(iconCli, iconUseCommand, {
    fn: iconUseFn,
    action: (
      /** @type {string} */ set,
      /** @type {{backup?: string[], variant?: string}} */ options,
      /** @type {import('commander').Command} */ cmd,
    ) =>
      run(
        cmd,
        () =>
          iconUse(set, {
            cwd: process.cwd(),
            backups: options.backup ?? [],
            variant: options.variant,
          }),
        ({data}) => {
          /** @type {Array<{iconSet: string, set: string}>} */
          const backups = data.backups;
          const shown = (/** @type {string | string[]} */ value) =>
            Array.isArray(value) ? JSON.stringify(value) : `"${value}"`;
          const main = `"${data.iconSet}" (${data.set})`;
          const order =
            backups.length > 0
              ? `main set ${main}, then ${backups.map(each => `"${each.iconSet}" (${each.set})`).join(', then ')}`
              : main;
          const written =
            backups.length > 0
              ? [data.iconSet, ...backups.map(each => each.iconSet)]
              : data.iconSet;
          const setChanged =
            JSON.stringify(data.previous) !== JSON.stringify(written);
          const variantChanged = data.previousVariant !== data.variant;
          /** @type {Array<{set: string, variant: string | null}>} */
          const looks = data.looks ?? [];
          emit(
            text(
              setChanged
                ? `[ok] experimental.iconSet is now ${order} in ${data.config}${data.created ? ', created' : ''}.`
                : `[ok] experimental.iconSet already names ${order} in ${data.config}.`,
            ),
            ...(backups.length > 0
              ? [
                  text(
                    'A copied template takes each icon from the first set in this order that has its meaning.',
                  ),
                ]
              : []),
            ...(data.previous && setChanged
              ? [text(`It was ${shown(data.previous)}.`)]
              : []),
            ...(data.variant
              ? [
                  text(
                    variantChanged
                      ? `[ok] experimental.iconVariant is now "${data.variant}"${data.previousVariant ? ` (it was "${data.previousVariant}")` : ''}: every icon draws its ${data.variant} look where its set has one.`
                      : `[ok] experimental.iconVariant already names "${data.variant}".`,
                  ),
                ]
              : data.previousVariant
                ? [
                    text(
                      `[ok] Removed experimental.iconVariant (it was "${data.previousVariant}"): each set draws its default look.`,
                    ),
                  ]
                : []),
            ...looks
              .filter(look => look.variant !== data.variant)
              .map(look =>
                text(
                  look.variant
                    ? `[note] ${look.set} declares no "${data.variant}" variant: its icons draw its default look, ${look.variant}.`
                    : `[note] ${look.set} declares no variants: its icons draw its one look.`,
                ),
              ),
            ...(data.themeMap
              ? [
                  text(
                    `A theme draws the built-in icons in this look with \`icons: ${data.themeMap.export}\` (import {${data.themeMap.export}} from '${data.themeMap.module}').`,
                  ),
                ]
              : []),
            ...(data.next ? [text(`[warn] ${data.next}`)] : []),
            ...(data.warning ? [text(`[warn] ${data.warning}`)] : []),
          );
        },
      ),
  });

  defineCommand(iconCli, iconMapCommand, {
    fn: iconMapFn,
    action: (
      /** @type {string | undefined} */ definition,
      /** @type {string | undefined} */ iconId,
      /** @type {{set?: string, remove?: boolean, pairs?: string}} */ options,
      /** @type {import('commander').Command} */ cmd,
    ) =>
      run(
        cmd,
        () =>
          iconMap(definition, iconId, {
            cwd: process.cwd(),
            set: setOf(options),
            remove: options.remove ?? false,
            pairs: options.pairs,
          }),
        (/** @type {any} */ {type, data}) =>
          type === 'icon.mapMany'
            ? emit(
                text(
                  `[ok] ${data.entries.filter((/** @type {{changed: boolean}} */ each) => each.changed).length} of ${data.entries.length} map entries changed in ${data.file}.`,
                ),
                list(
                  data.entries.map(
                    (
                      /** @type {{definition: string, icon: string, previous: string | null}} */ each,
                    ) =>
                      `${each.definition} = "${each.icon}"${each.previous === each.icon ? ' (unchanged)' : each.previous ? ` (was "${each.previous}")` : ' (was not mapped)'}`,
                  ),
                ),
                ...moduleUpdateLines(data),
                ...replacedKeyLines(data),
                ...templateMeaningsLines(data, data.set),
              )
            : emit(
                // The entry line reads `previous` and `icon`: a write can
                // come from a package rename alone.
                text(
                  data.icon == null
                    ? data.previous != null
                      ? `[ok] Removed map.${data.definition} (was "${data.previous}") from ${data.file}.`
                      : `[ok] ${data.file} has no map.${data.definition}.`
                    : data.previous !== data.icon
                      ? `[ok] map.${data.definition} = "${data.icon}" in ${data.file}${data.previous ? ` (was "${data.previous}")` : ''}.`
                      : `[ok] map.${data.definition} is already "${data.icon}".`,
                ),
                ...moduleUpdateLines(data),
                ...replacedKeyLines(data),
                ...templateMeaningsLines(data, data.set),
              ),
      ),
  });

  defineCommand(iconCli, iconAddCommand, {
    fn: iconAddFn,
    action: (
      /** @type {string | undefined} */ exportName,
      /** @type {Record<string, string | boolean | undefined>} */ options,
      /** @type {import('commander').Command} */ cmd,
    ) =>
      run(
        cmd,
        () =>
          iconAdd(exportName, {
            cwd: process.cwd(),
            from: /** @type {string} */ (options.from),
            set: setOf(options),
            definition: /** @type {string | undefined} */ (options.definition),
            newDefinition: /** @type {string | undefined} */ (
              options.newDefinition
            ),
            description: /** @type {string | undefined} */ (
              options.description
            ),
            words:
              typeof options.words === 'string'
                ? options.words.split(',')
                : undefined,
            useDefault: options.default === true,
            variant: /** @type {string | undefined} */ (options.variant),
            id: /** @type {string | undefined} */ (options.id),
            all: options.all === true,
          }),
        result => {
          const cli = getCliInvocation();
          if (result.type === 'icon.addVariants') {
            const {data} = result;
            emit(
              text(
                `[ok] ${data.variant}: ${data.added} icons gained it${data.already > 0 ? `, ${data.already} already had it` : ''}, read from ${data.from}.`,
              ),
              ...moduleUpdateLines(data),
              ...(data.files.length > 0 ? [list(data.files)] : []),
              ...(data.missing.length > 0
                ? [
                    text(
                      `${data.missing.length} icons have no ${data.variant} export in ${data.from} and keep none: ${data.missing.slice(0, MISSING_SHOWN).join(', ')}${data.missing.length > MISSING_SHOWN ? `, and ${data.missing.length - MISSING_SHOWN} more (--json lists every one)` : ''}`,
                    ),
                  ]
                : []),
            );
            return;
          }
          if (result.type === 'icon.definitionMatches') {
            const {matches, newDefinition, variant} = result.data;
            emit(
              section(
                `Icon definitions for ${result.data.export} (${matches.length})`,
              ),
              ...(matches.length > 0
                ? [
                    records(matches, {
                      fields: [
                        'name',
                        'source',
                        'score',
                        'reason',
                        'description',
                        'command',
                      ],
                      format: {
                        command: (/** @type {string} */ value) =>
                          formatCliCommand(value),
                      },
                    }),
                  ]
                : [text('No icon definition fits it.')]),
              ...(newDefinition
                ? [
                    text(
                      `None fits well? Add your own: ${formatCliCommand(newDefinition)}`,
                    ),
                  ]
                : []),
              ...(variant
                ? [
                    text(
                      `The set already has this glyph in another look. Add this one as its variant: ${formatCliCommand(variant)}`,
                    ),
                  ]
                : []),
              text(
                `All icon definitions: ${cli} docs cli/experimental/icon-definitions`,
              ),
            );
            return;
          }
          const {data} = result;
          emit(
            text(
              data.added
                ? `[ok] Added ${data.icon.export} as "${data.icon.id}"${data.variant ? ` (variant ${data.variant})` : ''}${data.definition ? `, map.${data.definition} = "${data.icon.id}"` : ''}.`
                : `[ok] ${data.icon.export} is already "${data.icon.id}"${data.definition ? ` and map.${data.definition} names it` : ''}.`,
            ),
            ...moduleUpdateLines(data),
            ...(data.files.length > 0 ? [list(data.files)] : []),
            ...(data.note ? [text(`[next] ${data.note}`)] : []),
            ...templateMeaningsLines(data, data.set),
          );
        },
      ),
  });

  /**
   * Print a new-set or new-definition receipt: what it wrote and where.
   * @param {string} what `icon set` or `icon definition`
   */
  const printNew =
    (/** @type {string} */ what) =>
    (
      /** @type {import('../../../../api/icon/icon.type.mjs').IconNewResponse} */ {
        data,
      },
    ) => {
      const {root, manifest, files, written, dryRun} = data;
      const state = dryRun ? 'plan' : written ? 'ok' : 'unchanged';
      const refreshed = data.refreshed === true;
      const updated = data.updated === true;
      const What = `${what[0].toUpperCase()}${what.slice(1)}`;
      emit(
        section(
          refreshed
            ? dryRun
              ? `Refresh ${what} plan`
              : `${What} refreshed`
            : updated
              ? dryRun
                ? `${What} update plan`
                : written && files.length > 0
                  ? `${What} updated`
                  : `${What} unchanged`
              : what === 'icon set'
                ? dryRun
                  ? `${What} plan: it would be created`
                  : written
                    ? `${What} created`
                    : `${What} unchanged`
                : dryRun
                  ? `New ${what} plan`
                  : written
                    ? `New ${what} added`
                    : `New ${what} unchanged`,
        ),
        text(`[${state}] ${data.name}`),
        // What the command did (or, in a dry run, would do): never a step
        // left for the author.
        text(
          root != null
            ? root.created
              ? `${dryRun ? 'Would declare' : 'Declared'} the experimental.iconSets root ${root.path} in ${manifest}.`
              : `The experimental.iconSets root ${root.path} in ${manifest} is unchanged.`
            : `${dryRun ? 'Would update' : 'Updated'} ${manifest}.`,
        ),
        ...moduleUpdateLines(data),
        ...(files.length > 0 ? [list(files)] : []),
        // What to do next comes before the long lists, so it never scrolls
        // away.
        ...(data.notes ?? []).map(note => text(`[next] ${note}`)),
        ...(data.mapped && data.mapped.length > 0
          ? [
              section(`Mapped by name (${data.mapped.length}, check each)`),
              list(
                data.mapped.map(each => `${each.definition} = ${each.icon}`),
              ),
            ]
          : []),
        ...(data.suggestions && data.suggestions.length > 0
          ? [
              section(
                `Suggestions (${data.suggestions.length} for ${new Set(data.suggestions.map(each => each.definition)).size} definitions, not written)`,
              ),
              list(
                data.suggestions.map(
                  each =>
                    `${each.definition} -> ${each.icon} (${each.word}): ${formatCliCommand(`astryx experimental icon map ${each.definition} ${each.icon} --set ${data.name}`)}`,
                ),
              ),
            ]
          : []),
        // Last, so the author sees which template meanings still show a
        // placeholder.
        ...templateMeaningsLines(data, data.name),
      );
    };

  defineCommand(iconCli, iconNewSetCommand, {
    fn: iconNewSetFn,
    action: (
      /** @type {string} */ name,
      /** @type {{dryRun?: boolean, from?: string, exclude?: string, adapter?: string, variants?: string, defaultVariant?: string, displayName?: string, description?: string}} */ options,
      /** @type {import('commander').Command} */ cmd,
    ) =>
      run(
        cmd,
        () =>
          iconNewSet(name, {
            cwd: process.cwd(),
            dryRun: options.dryRun,
            from: options.from,
            exclude: options.exclude,
            adapter: options.adapter,
            variants: options.variants,
            defaultVariant: options.defaultVariant,
            displayName: options.displayName,
            description: options.description,
          }),
        printNew('icon set'),
      ),
  }).allowExcessArguments(false);

  defineCommand(iconCli, iconNewDefinitionCommand, {
    fn: iconNewDefinitionFn,
    action: (
      /** @type {string} */ name,
      /** @type {{dryRun?: boolean, set?: string, description?: string, words?: string, icon?: string}} */ options,
      /** @type {import('commander').Command} */ cmd,
    ) =>
      run(
        cmd,
        () =>
          iconNewDefinition(name, {
            cwd: process.cwd(),
            dryRun: options.dryRun,
            set: setOf(options),
            description: options.description,
            words: options.words,
            icon: options.icon,
          }),
        printNew('icon definition'),
      ),
  }).allowExcessArguments(false);
}
