// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file template command — thin CLI wrapper around api/template.mjs
 */

import {jsonOut} from '../../../foundation/response/json.mjs';
import {emit, section, text, records, code, record} from '../formatters/index.mjs';
import {cliError, rejectEmptyArgument} from '../lib/cli-error.mjs';
import {template as templateApi} from '../../../api/template/template.mjs';
import {Project} from '../../../foundation/config/project.mjs';
import {warnOnIntegrationIssues} from '../../../foundation/integrations/integration-warnings.mjs';
import {getCliInvocation} from '../../../foundation/env/package-manager.mjs';
import {defineCommand} from '../lib/define-command.mjs';
import {NO_RESULT_SET, resultSet} from '../../../foundation/debug/index.mjs';
import {doc as templateCommand} from './template.doc.mjs';
import {doc as templateFn} from '../../../api/template/template.doc.mjs';

export {discoverTemplates, listTemplates} from '../../../api/template/template.mjs';

/**
 * The discriminated response returned by the template API. The api layer
 * currently declares `{type: string, data: unknown}`; narrow it here to the
 * precise union so the switch below type-checks. Replace with the api's own
 * return type once it is tightened.
 * @typedef {(
 *   import('../../../api/template/template.type.mjs').TemplateListResponse |
 *   import('../../../api/template/template.type.mjs').TemplateShowResponse |
 *   import('../../../api/template/template.type.mjs').TemplateSkeletonResponse |
 *   import('../../../api/template/template.type.mjs').TemplateCopyResponse |
 *   import('../../../api/template/template.type.mjs').TemplateCdnResponse
 * )} TemplateResponse
 */

/**
 * The icon report as text lines (AST-084 FR10): one line per mapped or kept
 * icon, or one line saying why nothing was mapped. Nothing when the project
 * has no icon set at all (no report: icon sets are experimental).
 * @param {import('../../../api/template/template.type.mjs').TemplateIconsReport | undefined} icons
 * @returns {string[]}
 */
function iconLines(icons) {
  if (icons == null) return [];
  if (icons.status !== 'selected') {
    return icons.status === 'none'
      ? []
      : [`icons: unchanged (${icons.status}): ${icons.reason}`];
  }
  return [
    ...icons.mapped.map(
      each =>
        `icons: mapped ${each.source.export} (${each.source.module}) -> ${each.target.export} (${each.target.module}) by ${each.by}` +
        (each.dropped && each.dropped.length > 0
          ? `; dropped ${each.dropped.join(', ')} (size comes from CSS)`
          : ''),
    ),
    ...icons.kept.map(
      each =>
        `icons: kept ${each.export}${each.module == null ? '' : ` (${each.module})`}: ${each.reason}` +
        (each.suggestion
          ? `; likely match: ${each.suggestion.export} (${each.suggestion.module})`
          : ''),
    ),
  ];
}

/**
 * What the run answered with. Listing and printing a template are lookups;
 * scaffolding one into a project (or writing the CDN starter) is a file
 * written, which is an effect with nothing to count.
 *
 * @param {TemplateResponse} result
 * @returns {import('../../../foundation/debug/command-result.mjs').CommandResult}
 */
function summarize(result) {
  switch (result.type) {
    case 'template.list':
      return resultSet({count: result.data.length, resultKind: 'template'});
    case 'template.show':
    case 'template.skeleton':
      return resultSet({count: 1, resultKind: 'template', directMatch: true});
    case 'template.copy':
    case 'template.cdn':
      return NO_RESULT_SET;
  }
}

/**
 * @param {import('commander').Command} program
 */
export function registerTemplate(program) {
  defineCommand(program, templateCommand, {
    fn: templateFn,
    action:
      /**
       * @param {string | undefined} name
       * @param {string | undefined} targetPath
       * @param {{list?: boolean, type?: string, package?: string, skeleton?: boolean, cdn?: boolean | string, overwrite?: boolean}} options
       */
      async (name, targetPath, options) => {
      const usesName = !options.cdn && !options.list;
      const usesPath = options.cdn
        ? typeof options.cdn !== 'string'
        : !options.list && !options.skeleton;
      if (usesName) rejectEmptyArgument('name', name, 'astryx template');
      if (usesPath) rejectEmptyArgument('path', targetPath, 'astryx template');
      const json = program.opts().json || false;
      const run = getCliInvocation();

      // Non-blocking nudge: if any configured integration has validation
      // issues, print one compact line to stderr pointing at
      // doctor integration validate. Best-effort; suppressed in --json mode.
      try {
        const project = await Project.load(process.cwd());
        await warnOnIntegrationIssues(project, {json});
      } catch {
        // Never let the nudge break the command.
      }

      /** @type {TemplateResponse} */
      let result;
      try {
        result = /** @type {TemplateResponse} */ (
          await templateApi(name, {
            list: options.list,
            skeleton: options.skeleton,
            cdn: options.cdn,
            type: /** @type {'page' | 'block' | undefined} */ (options.type),
            package: options.package,
            targetPath,
            overwrite: options.overwrite,
            cwd: process.cwd(),
          })
        );
      } catch (e) {
        // template API throws structured errors with {name, reason} suggestions —
        // pass them through untouched so the CLI envelope matches the API.
        const err = /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
        return cliError(err.message, {suggestions: err.suggestions || [], code: err.code});
      }

      const answered = summarize(result);
      if (json) {
        jsonOut(result);
        return answered;
      }

      switch (result.type) {
        case 'template.list': {
          const pages = result.data.filter(t => t.type === 'page');
          const blocks = result.data.filter(t => t.type === 'block');

          // Bare `template` (no --list, no name) shows a grouped summary so a
          // no-context agent or terminal doesn't receive 150 KB of catalog. The
          // full catalog stays reachable via `template --list`.
          if (!options.list && !name) {
            /** @param {import('../../../api/template/template.type.mjs').TemplateListEntry[]} items */
            const grouped = items => {
              /** @type {Map<string, string[]>} */
              const groups = new Map();
              for (const t of items) {
                const cat = t.category || 'Other';
                const list = groups.get(cat);
                if (list) {
                  list.push(t.id);
                } else {
                  groups.set(cat, [t.id]);
                }
              }
              /** @type {string[]} */
              const lines = [];
              for (const [cat, ids] of groups) {
                lines.push(`${cat}: ${ids.join(', ')}`);
              }
              return lines.join('\n');
            };
            emit(
              pages.length > 0 && section(`Page Templates (${pages.length})`),
              pages.length > 0 && text(grouped(pages)),
              blocks.length > 0 && section(`Block Templates (${blocks.length})`),
              blocks.length > 0 && text(grouped(blocks)),
              section('Usage'),
              text(
                [
                  `${run} template <id>                  Show full source`,
                  `${run} template <id> [target-path]     Scaffold page or block`,
                  `${run} template <id> --skeleton        Layout reference`,
                  `${run} template --list                 Full catalog with descriptions`,
                  `${run} template --list --type block    List only blocks`,
                  `${run} template --list --package <pkg> List from one package`,
                  `${run} template --cdn                 CDN starter page, no build step`,
                ].join('\n'),
              ),
            );
            break;
          }

          // Project each entry to its JSON-mirroring fields; the WIP marker is
          // folded into `name` (as before) and the package is shown only when it
          // isn't the built-in core package.
          /** @param {import('../../../api/template/template.type.mjs').TemplateListEntry} t */
          const toRow = t => ({
            id: t.id,
            name: t.isReady ? t.name : `${t.name} (WIP)`,
            description: t.description,
            package:
              t.package && t.package !== '@astryxdesign/core' ? t.package : '',
            replaces: t.replaces ?? '',
          });
          const fields = ['id', 'name', 'description', 'package', 'replaces'];
          emit(
            pages.length > 0 && section('Page Templates'),
            pages.length > 0 && records(pages.map(toRow), {fields}),
            blocks.length > 0 && section('Block Templates'),
            blocks.length > 0 && records(blocks.map(toRow), {fields}),
            section('Usage'),
            text(
              [
                `${run} template <id> [target-path]     Scaffold page or block`,
                `${run} template <id> --skeleton        Layout reference`,
                `${run} template --list --type block    List only blocks`,
                `${run} template --list --package <pkg> List from one package`,
                `${run} template --cdn                 CDN starter page, no build step`,
              ].join('\n'),
            ),
          );
          break;
        }

        case 'template.skeleton': {
          const {template: tName, description, components, skeleton} = result.data;
          emit(
            record({package: result.package}),
            text(
              `# ${tName}${description ? ' — ' + description : ''}\n` +
                `# Components: ${components.join(', ')}`,
            ),
            code(skeleton),
          );
          break;
        }

        case 'template.show': {
          // Source must survive piping byte-for-byte, so the package it comes
          // from (cli-surface INV28) and the note about replaced demo media go
          // to stderr, the note in the copy receipt's words. (Text mode only:
          // --json returned above with both in the envelope.)
          const {source, demoMediaReplaced, icons} = result.data;
          console.error(`package: ${result.package}`);
          emit(code(source));
          if (demoMediaReplaced > 0) {
            console.error(
              `Replaced ${demoMediaReplaced} Astryx demo media reference${demoMediaReplaced === 1 ? '' : 's'}: ` +
                'images now show a neutral placeholder and videos have an empty source. Supply your own media there.',
            );
          }
          // The icon report goes to stderr too, so stdout stays the source.
          for (const line of iconLines(icons)) console.error(line);
          break;
        }

        case 'template.copy': {
          const {outputDir, fileName, demoMediaReplaced, notes, icons} =
            result.data;
          const file = `${outputDir}/${fileName}`;
          const iconText = iconLines(icons);
          emit(
            text(`Copied template to ${file}`),
            record({package: result.package}),
            demoMediaReplaced > 0 &&
              text(
                `Replaced ${demoMediaReplaced} Astryx demo media reference${demoMediaReplaced === 1 ? '' : 's'} in ${file}: ` +
                  'images now show a neutral placeholder and videos have an empty source. Supply your own media there.',
              ),
            ...notes.map(/** @param {string} note */ note => text(note)),
            iconText.length > 0 && text(iconText.join('\n')),
          );
          break;
        }

        case 'template.cdn': {
          if (!result.data.written) {
            emit(
              text(`[skip] ${result.data.path} already exists — left as is.`),
              text('Pass --overwrite to replace it with a fresh copy.'),
            );
            break;
          }
          emit(
            text(`[ok] Wrote ${result.data.path}`),
            text(
              `Open it in a browser — no bundler, no install, no build step. Every CDN URL is pinned to ${result.data.version}, and the annotations mark the parts that are load-bearing.`,
            ),
          );
          break;
        }
      }
      return answered;
    },
  });
}
