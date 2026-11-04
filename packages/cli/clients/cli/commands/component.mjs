// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file component command — List components and print component docs
 *
 * Global options: --detail full|compact|brief, --lang en|zh|dense
 */

import {findCoreDir} from '../../../foundation/fs/paths.mjs';
import {
  resolveImportPath,
} from '../../../foundation/discovery/component-discovery.mjs';
import {
  formatFull,
  formatCompact,
  formatBrief,
  formatProps,
  formatBriefAll,
} from '../lib/component-format.mjs';
import {resolveTheme} from '../lib/resolve-theme.mjs';
import {getCliInvocation} from '../../../foundation/env/package-manager.mjs';
import {jsonOut} from '../../../foundation/response/json.mjs';
import {emit, section, text, list, record, records, code} from '../formatters/index.mjs';
import {cliError} from '../lib/cli-error.mjs';
import {defineCommand} from '../lib/define-command.mjs';
import {resultSet} from '../../../foundation/debug/index.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {component as componentApi} from '../../../api/component/component.mjs';
import {Project} from '../../../foundation/config/project.mjs';
import {warnOnIntegrationIssues} from '../../../foundation/integrations/integration-warnings.mjs';
import {doc as componentCommand} from './component.doc.mjs';
import {doc as componentFn} from '../../../api/component/component.doc.mjs';

/**
 * The api layer's component() widens its return to `{type: string, data: unknown}`,
 * so annotate the command-local result with the precise discriminated union from
 * src/types/component to get narrowing + typed data.
 *
 * @typedef {(
 *   | import('../../../api/component/component.type.mjs').ComponentListResponse
 *   | import('../../../api/component/component.type.mjs').ComponentBatchResponse
 *   | import('../../../api/component/component.type.mjs').ComponentDetailResponse
 *   | import('../../../api/component/component.type.mjs').ComponentDetailPropsResponse
 *   | import('../../../api/component/component.type.mjs').ComponentDetailSourceResponse
 *   | import('../../../api/component/component.type.mjs').ComponentDetailShowcaseResponse
 *   | import('../../../api/component/component.type.mjs').ComponentDetailBlocksResponse
 * )} ComponentResult
 */

/**
 * What the run answered with, read off the response the api returned.
 *
 * Naming a component resolves it or fails, so every detail view is a direct
 * match of exactly one component. `--blocks` is the exception, twice over: it
 * answers with the block templates that USE the component, so the set it
 * reports is theirs — and a list of those has nothing to direct-match, since
 * the thing that resolved (the component) is not the thing being counted.
 *
 * @param {ComponentResult} result
 * @returns {import('../../../foundation/debug/command-result.mjs').CommandResult}
 */
function summarize(result) {
  switch (result.type) {
    case 'component.list': {
      const count = Object.values(result.data.components).reduce(
        (total, items) => total + items.length,
        0,
      );
      return resultSet({count, resultKind: 'component'});
    }
    case 'component.batch':
      return resultSet({
        count: result.data.results.filter(row => row.status === 'found').length,
        resultKind: 'component',
      });
    case 'component.detail':
    case 'component.detail.props':
    case 'component.detail.source':
    case 'component.detail.showcase':
      return resultSet({count: 1, resultKind: 'component', directMatch: true});
    case 'component.detail.blocks': {
      const {showcase, examples, related} = result.data;
      return resultSet({
        count: (showcase ? 1 : 0) + examples.length + related.length,
        resultKind: 'template',
      });
    }
  }
}

/**
 * Project one single-component API result through the existing formatter kit.
 * @param {import('../../../api/component/component.type.mjs').ComponentSingleResponse} result
 * @param {string} requestedName
 * @param {'full'|'compact'|'brief'} detail
 * @param {Awaited<ReturnType<typeof resolveTheme>>} themeData
 * @returns {import('../formatters/index.mjs').Block[]}
 */
function componentDetailBlocks(result, requestedName, detail, themeData) {
  const requested = (requestedName.split('/').pop() ?? requestedName).replace(
    /^XDS/,
    '',
  );
  // A replacement answers to the Core name it replaces (spec:AST-035 FR11),
  // but its package exports it under its own name: print that one.
  const resolvedName =
    result.type === 'component.detail' &&
    typeof result.data.name === 'string' &&
    result.data.replaces === requested
      ? result.data.name
      : requested;
  switch (result.type) {
    case 'component.detail': {
      /** @type {import('../formatters/index.mjs').Block[]} */
      const out = [record({package: result.package})];
      if (result.data.parentDoc) {
        out.push(record(result.data, {fields: ['parentDoc']}));
      }
      out.push(
        detail === 'brief'
          ? code(
              formatBrief(result.data, resolvedName, result.data.import, {
                themeData,
              }),
            )
          : detail === 'compact'
            ? code(
                formatCompact(result.data, resolvedName, result.data.import),
              )
            : code(
                formatFull(result.data, {
                  themeData,
                  importHint: result.data.import,
                }),
              ),
      );
      return out;
    }
    case 'component.detail.props':
      return [
        record({package: result.package}),
        code(formatProps({props: result.data}, resolvedName)),
      ];
    case 'component.detail.source':
    case 'component.detail.showcase':
      return [code(result.data.source)];
    case 'component.detail.blocks': {
      const {showcase, examples, related} = result.data;
      // A block another package owns says which one.
      /** @param {{package: string}} block @param {string} label */
      const owned = (block, label) =>
        block.package === result.package ? label : `${label} (${block.package})`;
      /** @type {import('../formatters/index.mjs').Block[]} */
      const out = [record({package: result.package})];
      if (showcase) {
        out.push(
          section('Showcase'),
          record(
            {...showcase, displayName: owned(showcase, showcase.displayName)},
            {fields: ['displayName', 'description']},
          ),
        );
      }
      if (examples.length > 0) {
        out.push(
          section('Examples'),
          records(
            examples.map(block => ({...block, name: owned(block, block.name)})),
            {fields: ['name', 'description']},
          ),
        );
      }
      if (related.length > 0) {
        out.push(
          section(
            `Related: ${related.length} blocks that use ${result.data.component}`,
          ),
          list(related.map(block => owned(block, block.name))),
        );
      }
      if (!showcase && examples.length === 0 && related.length === 0) {
        out.push(text(`No blocks found for ${result.data.component}`));
      }
      return out;
    }
    default:
      return [];
  }
}

/**
 * @param {import('commander').Command} program
 */
export function registerComponent(program) {
  defineCommand(program, componentCommand, {
    fn: componentFn,
    action: async (
      /** @type {string[] | undefined} */ names,
      /** @type {{list?: boolean, category?: string, props?: boolean, source?: boolean, showcase?: boolean, blocks?: boolean, package?: string}} */ options,
    ) => {
      const run = getCliInvocation();
      const name = names?.length === 1 ? names[0] : undefined;
      const apiInput = !names?.length ? undefined : name ?? names;
      const zh = program.opts().zh || false;
      const dense = program.opts().dense || false;
      const lang = program.opts().lang || null;
      const detailSource = program.getOptionValueSource('detail');
      const isListView = options.list || options.category || !names?.length;
      // Default detail level is full for single-component view, brief for list views.
      // (List views are scannable name lists; users can opt into compact/full.)
      let detail = program.opts().detail || 'full';
      if (isListView && detailSource === 'default') detail = 'brief';
      const json = program.opts().json || false;

      const validDetails = ['full', 'compact', 'brief'];
      if (!validDetails.includes(detail)) {
        return cliError(`Invalid --detail value "${detail}". Valid levels: ${validDetails.join(', ')}`, {code: ERROR_CODES.ERR_INVALID_DETAIL});
      }

      // Non-blocking nudge: if any configured integration has validation
      // issues, print one compact line to stderr pointing at
      // doctor integration validate. Best-effort; suppressed in --json mode.
      try {
        const project = await Project.load(process.cwd());
        await warnOnIntegrationIssues(project, {json});
      } catch {
        // Never let the nudge break the command.
      }

      /** @type {ComponentResult} */
      let result;
      try {
        result = /** @type {ComponentResult} */ (await componentApi(apiInput, {
          cwd: process.cwd(),
          list: options.list,
          category: options.category,
          package: options.package,
          props: options.props,
          source: options.source,
          showcase: options.showcase,
          blocks: options.blocks,
          detail,
          lang, zh, dense,
        }));
      } catch (e) {
        const err = /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
        return cliError(err.message, {suggestions: err.suggestions, code: err.code});
      }

      const answered = summarize(result);
      if (
        result.type === 'component.batch' &&
        result.data.results.some(row => row.status !== 'found')
      ) {
        process.exitCode = 1;
      }
      if (json) {
        jsonOut(result);
        return answered;
      }

      // ── Text output ────────────────────────────────────────────
      // The api layer already resolved against core (result exists), so core is
      // present on this path; narrow away the null branch findCoreDir allows.
      const coreDir = /** @type {string} */ (findCoreDir(process.cwd()));
      let themeData;
      try {
        themeData = await resolveTheme(process.cwd());
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message.split('\n', 1)[0]?.trim() || error.name
            : String(error);
        return cliError(`Could not load the recorded theme: ${message}`, {
          code: ERROR_CODES.ERR_THEME_LOAD,
        });
      }

      // Footer shared by the compact + names list views (prose → text()).
      const listFooter = text(
        [
          `Import from the path shown (e.g. import {Button} from '@astryxdesign/core/Button')`,
          `Usage: ${run} component <name> [name...]`,
        ].join('\n'),
      );

      switch (result.type) {
        case 'component.list': {
          // One list type across all three detail levels; the depth is carried
          // in result.data.detail and the grouped map in result.data.components.
          if (result.data.detail === 'full') {
            // --detail full — dense per-component docs (signature, props, theming,
            // examples). Verbatim doc block from the shared formatter. A Core slot
            // an integration component replaces prints that component, from the
            // list result (spec:AST-035 FR11). Only the result's groups print, so
            // `--category` text shows what its JSON shows and every printed slot
            // is covered by the replacement map built from that result.
            /** @type {Map<string, any>} */
            const replacements = new Map();
            for (const items of Object.values(result.data.components)) {
              for (const item of /** @type {any[]} */ (items)) {
                if (
                  item.package !== '@astryxdesign/core' &&
                  typeof item.replaces === 'string'
                ) {
                  replacements.set(item.replaces, item);
                }
              }
            }
            emit(
              code(
                await formatBriefAll(coreDir, {
                  zh,
                  lang,
                  themeData,
                  replacements,
                  categories: Object.keys(result.data.components),
                }),
              ),
            );
            break;
          }

          if (result.data.detail === 'compact') {
            // --detail compact — one record per entry (name + import + 1-line
            // description), grouped by category. Fields mirror the JSON keys.
            const groups = result.data.components;
            const entries = Object.entries(groups);
            /** @type {import('../formatters/index.mjs').Block[]} */
            const out = [];
            for (const [cat, items] of entries) {
              // Skip the synthetic group header when there's only one ungrouped category
              const isUngrouped =
                entries.length === 1 && items.length === 1 && items[0]?.name === cat;
              if (!isUngrouped) out.push(section(cat));
              // An entry from another package says which one (cli-surface INV28).
              const named = items.map(item =>
                item.package === '@astryxdesign/core'
                  ? item
                  : {...item, import: `${item.import}  [${item.package}]`},
              );
              out.push(records(named, {fields: ['name', 'import', 'description']}));
            }
            out.push(listFooter);
            emit(...out);
            break;
          }

          // --detail names (default for list views): one record per component
          // (name + import), sorted A-Z. The import field already conveys
          // families, so we skip the choppy per-family grouping that interleaved
          // headerless singletons with "(group)" sections. External or
          // name-colliding entries stay package-qualified.
          const groups = result.data.components;
          const CORE_PKG = '@astryxdesign/core';
          /** @type {Map<string, Set<string>>} */
          const nameCounts = new Map();
          for (const items of Object.values(groups)) {
            for (const item of items) {
              const set = nameCounts.get(item.name) ?? new Set();
              set.add(item.package);
              nameCounts.set(item.name, set);
            }
          }
          /** @param {import('../../../api/component/component.type.mjs').ComponentListEntry} item */
          const importCell = item => {
            // Use a precomputed import when the API supplies one (integration
            // components carry it); only fall back to the core resolver for
            // core components.
            const importPath = item.import ?? resolveImportPath(coreDir, item.name);
            const qualify =
              item.package !== CORE_PKG || (nameCounts.get(item.name)?.size ?? 0) > 1;
            return qualify ? `${importPath}  [${item.package}]` : importPath;
          };

          const firstGroup = Object.entries(groups)[0];
          const entries =
            options.category && firstGroup ? firstGroup[1] : Object.values(groups).flat();
          const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));

          emit(
            options.category && firstGroup
              ? section(firstGroup[0])
              : section(`Components (${sorted.length})`),
            records(
              sorted.map(item => ({name: item.name, import: importCell(item)})),
              {fields: ['name', 'import']},
            ),
            listFooter,
          );
          break;
        }

        case 'component.batch': {
          /** @type {import('../formatters/index.mjs').Block[]} */
          const out = [
            section('Component batch'),
            record({count: result.data.count}),
            section('Results'),
          ];
          for (const row of result.data.results) {
            out.push(section(row.selector));
            if (row.status === 'found') {
              out.push(
                record(row, {fields: ['selector', 'status']}),
                section('Result'),
                // A batch is not piped as one file, so a source row names its
                // package here; the other rows name it themselves.
                ...(row.result.type === 'component.detail.source' ||
                row.result.type === 'component.detail.showcase'
                  ? [record({package: row.result.package})]
                  : []),
                ...componentDetailBlocks(
                  row.result,
                  row.selector,
                  detail,
                  themeData,
                ),
              );
              continue;
            }
            out.push(
              record(row, {
                fields: ['selector', 'status', 'code', 'error'],
              }),
            );
            if (row.status === 'ambiguous') {
              out.push(
                section('Candidates'),
                records(row.candidates, {
                  fields: ['package', 'component', 'kind', 'installed'],
                }),
              );
            } else if (row.suggestions?.length) {
              out.push(
                section('Suggestions'),
                records(row.suggestions, {fields: ['name', 'reason']}),
              );
            }
          }
          emit(...out);
          break;
        }

        case 'component.detail':
        case 'component.detail.props':
        case 'component.detail.source':
        case 'component.detail.showcase':
        case 'component.detail.blocks':
          // Source and showcase print the file alone so it pipes byte for
          // byte; the package they come from goes to stderr (cli-surface
          // INV28).
          if (
            result.type === 'component.detail.source' ||
            result.type === 'component.detail.showcase'
          ) {
            console.error(`package: ${result.package}`);
          }
          emit(
            ...componentDetailBlocks(
              result,
              name ?? '',
              detail,
              themeData,
            ),
          );
          break;
      }
      return answered;
    },
  });
}


// Re-export lib functions for backward compatibility
// (agent-docs.mjs, tests, and generate-skill-doc.sh import from here)
export {discoverComponents, discoverExternalComponentsGrouped, findComponentReadme, findComponentSource, findExternalComponentDoc, resolveImportPath} from '../../../foundation/discovery/component-discovery.mjs';
export {discoverExternalPackages} from '../../../foundation/fs/paths.mjs';
export {loadDocs} from '../../../foundation/discovery/component-loader.mjs';
export {formatFull, formatCompact, formatBrief, formatProps, formatBriefAll} from '../lib/component-format.mjs';
export {levenshteinDistance, findClosestComponents, searchComponents} from '../../../foundation/text/string-utils.mjs';
