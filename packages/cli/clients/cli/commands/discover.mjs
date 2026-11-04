// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file discover command — browse the integrations you have and could add
 *
 * Usage:
 *   astryx discover                           List installed and available packages
 *   astryx discover @scope/name[@version]     One package, with its versions
 *   astryx discover @scope/name/Component     Show docs for an installed component
 *   astryx discover @scope/name/<item>        One item a package adds
 *   astryx discover searchterm                Search every item and package
 */

import {
  formatFull,
  formatBrief,
  formatCompact,
} from '../lib/component-format.mjs';
import {jsonOut} from '../../../foundation/response/json.mjs';
import {
  emit,
  section,
  text,
  record,
  records,
  list,
  code,
} from '../formatters/index.mjs';
import {cliError, rejectEmptyArgument} from '../lib/cli-error.mjs';
import {
  answersQueries,
  discover as discoverApi,
  OFFICIAL_SOURCE_NAME,
} from '../../../api/discover/discover.mjs';
import {isValidSemver} from '../../../foundation/env/semver.mjs';
import {Project} from '../../../foundation/config/project.mjs';
import {warnOnIntegrationIssues} from '../../../foundation/integrations/integration-warnings.mjs';
import {getCliInvocation} from '../../../foundation/env/package-manager.mjs';
import {defineCommand} from '../lib/define-command.mjs';
import {resultSet} from '../../../foundation/debug/index.mjs';
import {doc as discoverCommand} from './discover.doc.mjs';
import {doc as discoverFn} from '../../../api/discover/discover.doc.mjs';

// Max items to list inline per package before summarizing with "+N more".
const MAX_ITEMS_SHOWN = 10;

/** @type {Record<string, string>} */
const KIND_PLURALS = {
  component: 'components',
  template: 'templates',
  doc: 'docs',
  theme: 'themes',
  codemod: 'codemods',
  'agent-doc': 'agent docs',
  'icon-set': 'icon sets',
};

// The list fields that hold item names, summarized in the package list.
const ITEM_FIELDS = [
  'components',
  'templates',
  'docs',
  'themes',
  'codemods',
  'agentDocs',
  'iconSets',
];

/**
 * @typedef {import('../../../api/discover/discover.type.mjs').DiscoverListResponse
 *   | import('../../../api/discover/discover.type.mjs').DiscoverDetailResponse
 *   | import('../../../api/discover/discover.type.mjs').DiscoverDetailDocResponse
 *   | import('../../../api/discover/discover.type.mjs').DiscoverItemResponse
 *   | import('../../../api/discover/discover.type.mjs').DiscoverSearchResponse} DiscoverResult
 */

/** @type {Record<string, import('../../../foundation/debug/command-result.mjs').ResultSetKind>} */
const RESULT_KINDS = {
  package: 'integration',
  component: 'component',
  template: 'template',
  doc: 'doc',
  theme: 'theme',
  codemod: 'migration',
  'agent-doc': 'doc',
  'icon-set': 'mixed',
};

/**
 * The run-log kind for a set of item kinds: the one kind, or `mixed`.
 * @param {string[]} kinds
 * @returns {import('../../../foundation/debug/command-result.mjs').ResultSetKind}
 */
function resultKindOf(kinds) {
  const mapped = new Set(kinds.map(kind => RESULT_KINDS[kind] ?? 'mixed'));
  return mapped.size === 1 ? [...mapped][0] : 'mixed';
}

/**
 * What the run answered with. The list and package views count PACKAGES;
 * naming a component or item answers with that item instead.
 *
 * @param {DiscoverResult} result
 * @returns {import('../../../foundation/debug/command-result.mjs').CommandResult}
 */
function summarize(result) {
  switch (result.type) {
    case 'discover.list':
      return resultSet({
        count: result.data.length + (result.meta?.available?.length ?? 0),
        resultKind: 'integration',
      });
    case 'discover.detail':
      return resultSet({
        count: 1,
        resultKind: 'integration',
        directMatch: true,
      });
    case 'discover.detail.doc':
      return resultSet({count: 1, resultKind: 'component', directMatch: true});
    case 'discover.item':
      return resultSet({
        count: 1,
        resultKind: resultKindOf([result.data.kind]),
        directMatch: true,
      });
    case 'discover.search':
      return resultSet({
        count: result.data.total ?? result.data.matches.length,
        resultKind: resultKindOf(result.data.matches.map(m => m.kind)),
      });
  }
}

/**
 * Record options that summarize each item list to its first names.
 * @param {boolean} full print every name instead
 * @returns {import('../formatters/index.mjs').RecordOptions}
 */
function itemListOptions(full) {
  if (full) return {};
  /** @param {string[]} names */
  const summary = names => {
    const shown = names.slice(0, MAX_ITEMS_SHOWN);
    const remaining = names.length - MAX_ITEMS_SHOWN;
    return remaining > 0
      ? `${shown.join(', ')}, +${remaining} more`
      : shown.join(', ');
  };
  return {
    format: Object.fromEntries(ITEM_FIELDS.map(field => [field, summary])),
  };
}

/**
 * One line per source that did not answer live.
 * @param {import('../../../api/discover/discover.type.mjs').DiscoverSourceState[]} sources
 */
function sourceNotes(sources) {
  return sources
    .filter(s => s.status !== 'fresh')
    .map(s =>
      s.status === 'saved'
        ? text(
            `The discover source from ${s.from} did not answer (${s.error}), so this uses the copy saved ${s.savedAt}.`,
          )
        : text(`The discover source from ${s.from} is unavailable: ${s.error}`),
    );
}

/**
 * @param {import('../../../api/discover/discover.type.mjs').DiscoverSourceState[]} sources
 */
function sourceSubtitle(sources) {
  const answered = sources.filter(s => s.status !== 'failed');
  if (answered.length === 0) return undefined;
  return (
    'from ' +
    answered
      .map(
        s =>
          `${s.name}${s.generatedAt ? ` (${s.generatedAt.slice(0, 10)})` : ''}`,
      )
      .join(', ')
  );
}

/**
 * @param {import('../../../authoring/discover/type').DiscoverVersion[]} versions
 * @param {{shown?: string, installed?: string, latest?: string}} marks
 */
function versionLines(versions, marks) {
  return versions
    .filter(v => !v.prerelease || v.version === marks.shown)
    .map(v => {
      const tags = [
        v.version === marks.latest ? 'latest' : '',
        v.version === marks.installed ? 'installed' : '',
        v.version === marks.shown &&
        v.version !== marks.installed &&
        v.version !== marks.latest
          ? 'shown'
          : '',
        v.status !== 'ok' ? v.status : '',
      ].filter(Boolean);
      const date = v.publishedAt ? v.publishedAt.slice(0, 10) : 'date unknown';
      return `${v.version}  ${date}${tags.length ? `  ${tags.join(', ')}` : ''}`;
    });
}

/**
 * Whether a package entry adds anything besides themes.
 * @param {Record<string, unknown>} entry
 * @returns {boolean}
 */
function addsMoreThanThemes(entry) {
  return ITEM_FIELDS.some(field => {
    const names = entry[field];
    return field !== 'themes' && Array.isArray(names) && names.length > 0;
  });
}

/**
 * What an official entry's add command installs, when that is not the version
 * the page shows: the project's Core version, or the Core range it declares.
 * @param {string} install the package-manager command
 * @param {string | undefined} shown the version the page shows
 * @param {string | undefined} source the entry's source
 * @returns {string | undefined}
 */
function pinNote(install, shown, source) {
  if (source !== OFFICIAL_SOURCE_NAME) return undefined;
  const pin = /\S@([\d^~<>=*xXv][^"]*)"?$/u.exec(install)?.[1];
  if (pin == null || pin === shown) return undefined;
  return isValidSemver(pin)
    ? `This installs ${pin}, the version that matches this project's Core.`
    : `This installs the newest release in ${pin}, the Core range this project declares.`;
}

/**
 * The "Add it" blocks for a package the project does not have: the command
 * that adds it, then what makes its items usable. A theme still needs
 * `theme add` once the package is installed; anything else loads on the next
 * command.
 * @param {string} install the package-manager command
 * @param {string[]} themes theme slugs the package or item adds
 * @param {boolean} addsOther whether it adds anything besides themes
 * @param {string} run how to invoke the CLI
 * @param {string} [note] what the command installs, when the page shows
 *   another version
 * @returns {import('../formatters/index.mjs').Block[]}
 */
function addBlocks(install, themes, addsOther, run, note) {
  /** @type {import('../formatters/index.mjs').Block[]} */
  const blocks = [section('Add it'), code(install)];
  if (note) blocks.push(text(note));
  if (themes.length > 0) {
    blocks.push(
      text(
        themes.length === 1
          ? 'Then use its theme:'
          : 'Then use one of its themes:',
      ),
      code(themes.map(slug => `${run} theme add ${slug}`).join('\n')),
    );
  }
  if (addsOther || themes.length === 0) {
    blocks.push(
      text(
        'Astryx loads an integration on the next command once it is a dependency.',
      ),
    );
  }
  return blocks;
}

/**
 * @param {import('commander').Command} program
 */
export function registerDiscover(program) {
  defineCommand(program, discoverCommand, {
    fn: discoverFn,
    action:
      /**
       * @param {string | undefined} query
       * @param {{components?: boolean, type?: string, installed?: boolean, available?: boolean, limit?: string}} options
       */
      async (query, options) => {
        rejectEmptyArgument('query', query, 'astryx discover');
        const detail = program.opts().detail || 'full';
        const json = program.opts().json || false;
        const lang = program.opts().lang || null;
        const zh = program.opts().zh || false;
        const run = getCliInvocation();

        // Non-blocking nudge: if any configured integration has validation
        // issues, print one compact line to stderr pointing at
        // doctor integration validate. Best-effort; suppressed in --json mode.
        // Whether a query gets its own answer here or the list (FR1); the
        // list's hints must not suggest queries that only return it again.
        let queries = true;
        try {
          const project = await Project.load(process.cwd());
          queries = answersQueries(project);
          await warnOnIntegrationIssues(project, {json});
        } catch {
          // Never let the nudge break the command.
        }

        /** @type {DiscoverResult} */
        let result;
        try {
          result = await discoverApi(query, {
            components: options.components,
            lang,
            zh,
            type: /** @type {any} */ (options.type),
            installed: options.installed,
            available: options.available,
            // Number(), not parseInt(): the API refuses `1.5` and `5abc` itself.
            limit: options.limit != null ? Number(options.limit) : undefined,
          });
        } catch (e) {
          const err =
            /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
          return cliError(err.message, {
            suggestions: err.suggestions,
            code: err.code,
          });
        }

        const answered = summarize(result);
        if (json) {
          // Forward optional meta (e.g. configured flag for discover.list) as a
          // sibling of data via jsonOut, so the envelope still carries
          // apiVersion and goes through the single sanctioned emit path.
          jsonOut(result);
          return answered;
        }

        switch (result.type) {
          case 'discover.list': {
            const listOpts = itemListOptions(Boolean(options.components));
            // Discover always has a source, the official list, so the list
            // always has an Available side.
            const available = result.meta?.available ?? [];
            const sources = result.meta?.sources ?? [];

            const kind = options.type
              ? (KIND_PLURALS[options.type] ?? options.type)
              : null;
            /** @type {import('../formatters/index.mjs').Block[]} */
            const blocks = [];
            if (!options.available) {
              blocks.push(section('Installed'));
              blocks.push(
                result.data.length > 0
                  ? records(result.data, listOpts)
                  : text(
                      kind
                        ? `None of this project's integrations add ${kind}.`
                        : result.meta?.configured
                          ? 'No external components found in configured integrations.'
                          : 'None yet.',
                    ),
              );
            }
            if (!options.installed) {
              blocks.push(section('Available', sourceSubtitle(sources)));
              blocks.push(
                available.length > 0
                  ? records(available, listOpts)
                  : text(
                      !sources.some(s => s.status !== 'failed')
                        ? 'No source answered, so there is nothing to list.'
                        : kind
                          ? `No package you could add adds ${kind}.`
                          : 'Nothing new to add: this project has every integration its sources list.',
                    ),
              );
            }
            blocks.push(...sourceNotes(sources));
            if (!queries) {
              // This project loads no integration and has no discover source
              // of its own, so every query returns this list. Point at the
              // add commands above instead of at queries.
              if (query?.trim()) {
                blocks.push(
                  text(
                    `This project loads no integration and has no discover source of its own, so discover lists everything instead of answering "${query}".`,
                  ),
                );
              }
              const themes = available.flatMap(entry =>
                Array.isArray(entry.themes) ? entry.themes : [],
              );
              blocks.push(
                text(
                  [
                    'To add a package, run its install command.',
                    ...(themes.length > 0
                      ? [
                          `Then use a theme it adds: ${run} theme add <theme>, for example ${run} theme add ${themes[0]}`,
                        ]
                      : []),
                  ].join('\n'),
                ),
              );
            } else {
              blocks.push(
                text(
                  [
                    'Usage:',
                    `  ${run} discover <package>            Browse a package and its versions`,
                    `  ${run} discover <package>/<item>     View one item`,
                    `  ${run} discover <search>             Search every item and package`,
                  ].join('\n'),
                ),
              );
            }
            emit(...blocks);
            break;
          }

          case 'discover.detail': {
            const d = result.data;
            /** @type {import('../formatters/index.mjs').Block[]} */
            const blocks = [record(d, {omit: ['versions', 'install']})];
            if (d.versions && d.versions.length > 0) {
              const shown = d.version;
              const lines = versionLines(d.versions, {
                shown,
                installed: d.installed
                  ? (d.installedVersion ?? d.version)
                  : undefined,
                latest: d.latest,
              });
              // The shown version is listed even when it is a prerelease.
              const prereleases = d.versions.filter(
                v => v.prerelease && v.version !== shown,
              ).length;
              blocks.push(
                section('Versions', `${d.versions.length} known, newest first`),
              );
              if (lines.length > 0) blocks.push(list(lines));
              if (prereleases > 0) {
                blocks.push(
                  text(
                    `${prereleases === 1 ? '1 prerelease is' : `${prereleases} prereleases are`} not listed. See any version: ${run} discover ${d.name}@<version>`,
                  ),
                );
              }
            }
            if (d.install) {
              blocks.push(
                ...addBlocks(
                  d.install,
                  d.themes ?? [],
                  addsMoreThanThemes(
                    /** @type {Record<string, unknown>} */ (
                      /** @type {unknown} */ (d)
                    ),
                  ),
                  run,
                  pinNote(d.install, d.version, d.source),
                ),
              );
            } else if (d.installedAs) {
              blocks.push(
                text(
                  `This project already has this integration as ${d.installedAs}.`,
                ),
              );
            }
            blocks.push(
              text(
                d.installed && d.components.length > 0
                  ? `Usage: ${run} discover ${d.name}/<ComponentName>`
                  : `See one item: ${run} discover ${d.name}/<item>`,
              ),
            );
            emit(...blocks);
            break;
          }

          case 'discover.detail.doc': {
            const docs = result.data;
            const md =
              detail === 'brief'
                ? formatBrief(docs, docs.name, '')
                : detail === 'compact'
                  ? formatCompact(docs, docs.name, '')
                  : formatFull(docs);
            emit(record({package: result.package}), code(md));
            break;
          }

          case 'discover.item': {
            const d = result.data;
            emit(
              record(d, {omit: ['install']}),
              ...(d.install
                ? addBlocks(
                    d.install,
                    d.kind === 'theme' ? [d.name] : [],
                    d.kind !== 'theme',
                    run,
                    pinNote(d.install, d.version, d.source),
                  )
                : []),
              text(`Its package: ${run} discover ${d.package}`),
            );
            break;
          }

          case 'discover.search': {
            const {query: q, matches, total} = result.data;
            const count = total ?? matches.length;
            emit(
              section(
                `Found ${count} ${count === 1 ? 'match' : 'matches'} for "${q}"`,
                total != null
                  ? `showing the first ${matches.length}`
                  : undefined,
              ),
              list(
                matches.map(m => {
                  const target =
                    m.kind === 'package'
                      ? m.package
                      : `${m.package}/${m.component}`;
                  const tags = [
                    m.kind && m.kind !== 'component' ? m.kind : '',
                    m.installed === false ? 'not installed' : '',
                  ].filter(Boolean);
                  return `${run} discover ${target}${tags.length ? `  (${tags.join(', ')})` : ''}`;
                }),
              ),
            );
            break;
          }
        }
        return answered;
      },
  });
}
