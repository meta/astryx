// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CLI bindings for integration authoring and package verification. */

import {integrationAdd} from '../../../api/integration/add-contribution.mjs';
import {integrationCheck} from '../../../api/integration/check/check.mjs';
import {integrationPackCheck} from '../../../api/integration/pack-check.mjs';
import {jsonOut} from '../../../foundation/response/json.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {NO_RESULT_SET} from '../../../foundation/debug/index.mjs';
import {emit, list, records, section, text} from '../formatters/index.mjs';
import {cliError} from '../lib/cli-error.mjs';
import {defineCommand} from '../lib/define-command.mjs';
import {doc as integrationGroup} from './integration.doc.mjs';
import {doc as integrationAddCommand} from './integration-add.doc.mjs';
import {doc as integrationCheckCommand} from './integration-check.doc.mjs';
import {doc as integrationVerifyCommand} from './integration-verify.doc.mjs';
import {doc as integrationPackCommand} from './integration-pack.doc.mjs';
import {doc as integrationAddFn} from '../../../api/integration/integrationAdd.doc.mjs';
import {doc as integrationCheckFn} from '../../../api/integration/integrationCheck.doc.mjs';
import {printIntegrationCheckResponse} from './doctor.mjs';
import {doc as integrationPackCheckFn} from '../../../api/integration/integrationPackCheck.doc.mjs';
import {formatCliCommand} from '../../../foundation/env/package-manager.mjs';

/**
 * @param {import('commander').Command} command
 * @param {string} label
 * @param {unknown} options
 * @param {import('commander').Command} invoked
 */
function showGroupOrUnknown(command, label, options, invoked) {
  const extras = invoked?.args ?? [];
  // allowUnknownOption keeps an unknown flag among the args: a word there is
  // an unknown subcommand, and a flag alone is an unknown option.
  const word = extras.find(arg => !String(arg).startsWith('-'));
  if (word == null && extras.length > 0) {
    return cliError(`unknown option '${String(extras[0])}'`, {
      code: ERROR_CODES.ERR_INVALID_OPTION,
    });
  }
  if (word != null) {
    return cliError(`unknown subcommand '${label} ${String(word)}'`, {
      suggestions: (command.commands ?? []).map(child => ({
        name: child.name(),
        reason: 'available subcommand',
      })),
      code: ERROR_CODES.ERR_UNKNOWN_SUBCOMMAND,
    });
  }
  command.outputHelp();
  return NO_RESULT_SET;
}

/**
 * Run `integration verify` and print its result, as text or JSON.
 * @param {import('commander').Command} program
 */
async function verifyPackage(program) {
  const result = await integrationPackCheck({cwd: process.cwd()});
  if (program.opts().json) {
    jsonOut(result);
  } else {
    const {name, version, packable, tarball, inventory, issues} = result.data;
    const identity = [name, version].filter(Boolean).join('@');
    const blocks = [
      section(
        packable
          ? 'Integration package ready'
          : 'Integration package check failed',
      ),
      text(`${packable ? '[ok]' : '[fail]'} ${identity || 'local package'}`),
    ];
    if (tarball != null) {
      blocks.push(
        text(
          `${tarball.fileCount} packed files; ${inventory.packedFiles}/${inventory.expectedFiles} required files present.`,
        ),
      );
    }
    // Only a package that ships an experimental icon set gets this line;
    // every other package's output is unchanged.
    const local = result.data.contributions?.local;
    if (local && (local.iconSets ?? []).length > 0) {
      const counts = [
        ['component', local.components.length],
        ['template', local.templates.length],
        ['theme', local.themes.length],
        ['doc topic', local.docs.length],
        ['codemod', local.codemods.length],
        ['icon set', (local.iconSets ?? []).length],
      ]
        .filter(([, count]) => Number(count) > 0)
        .map(([word, count]) => `${count} ${word}${count === 1 ? '' : 's'}`);
      if (counts.length > 0) {
        blocks.push(text(`Contributes ${counts.join(', ')}.`));
      }
    }
    if (issues.length > 0) {
      blocks.push(
        list(
          issues.map(issue => [
            `[${issue.severity === 'error' ? 'fail' : 'warn'}] ${issue.message}`,
            // Every field the JSON issue carries.
            ...(issue.file != null
              ? [
                  `file: ${issue.file}${issue.line != null ? `:${issue.line}` : ''}`,
                ]
              : []),
            ...(issue.fix != null ? [`fix: ${issue.fix}`] : []),
          ]),
        ),
      );
    }
    emit(...blocks);
  }
  if (!result.data.packable) process.exitCode = 1;
  return NO_RESULT_SET;
}

/**
 * Run `integration check` and print each check as its own subcommand prints
 * it, then one summary: each check's errors, warnings and skipped work, and
 * what decided the exit code.
 * @param {import('commander').Command} program
 * @param {{strict?: boolean, next?: boolean}} options
 */
async function checkPackage(program, options) {
  const result = await integrationCheck({
    strict: options.strict === true,
    next: options.next === true,
  });
  if (program.opts().json) {
    jsonOut(result);
  } else {
    const {data} = result;
    const noPackage = data.checks[0]?.response.data.issues.some(
      issue => issue.code === 'no_package',
    );
    if (noPackage) {
      emit(
        text(
          'Nothing was checked: no package.json found. Run this command inside a package directory.',
        ),
      );
    } else if (!data.validated) {
      emit(
        text(
          'Nothing was checked: no astryx.integration.* found next to package.json. ' +
            "Run this command in an integration package's folder.",
        ),
      );
    } else {
      // A package-wide issue every check reports is printed once, under the
      // first check; the counts below are unchanged.
      /** @type {Set<string>} */
      const seen = new Set();
      data.checks.forEach((check, index) => {
        // A blank line keeps each check's output apart from the next.
        if (index > 0) emit(text(''));
        printIntegrationCheckResponse(check.response, seen);
      });
    }
    const plural = (/** @type {number} */ n, /** @type {string} */ word) =>
      `${n} ${word}${n === 1 ? '' : 's'}`;
    const counts =
      `${plural(data.errors, 'error')}, ${plural(data.warnings, 'warning')}, ` +
      `${data.skipped.length} skipped`;
    const notCompared =
      data.unchecked > 0
        ? ` ${plural(data.unchecked, 'item')} could not be compared; the checks above list them.`
        : '';
    const closing = noPackage
      ? `[fail] ${counts}. No package.json was found here, so nothing was checked.`
      : data.checks.some(check => check.failed)
        ? `[fail] ${counts}. Address the items marked [fail] above.`
        : data.failed
          ? `[fail] ${counts}. --strict fails on every warning and on skipped work; fix them, or drop --strict to fail only on errors.`
          : data.warnings > 0 || data.skipped.length > 0
            ? `[ok] ${counts}. No check failed; review the warnings and skipped work above (--strict fails on them).${notCompared}`
            : notCompared
              ? `[ok] ${counts}. No check failed.${notCompared}`
              : `[ok] ${counts}. Every check passed.`;
    const identity = noPackage
      ? '(no package.json)'
      : data.version != null
        ? `${data.name}@${data.version}`
        : data.name;
    emit(
      // --strict lists each warning and each skipped check again, as the
      // error it now is: by check, code and place only, since the check's own
      // output above already printed its message and fix once.
      ...(data.failures.length > 0
        ? [
            section('Failing under --strict'),
            records(data.failures, {
              fields: [
                'severity',
                'check',
                'code',
                'component',
                'prop',
                'file',
                'line',
              ],
              format: {severity: () => '[fail]'},
            }),
          ]
        : []),
      section(
        `Integration check: ${identity ?? '(local package)'}${data.strict ? ' (strict)' : ''}${data.next ? ' (next)' : ''}`,
      ),
      records(data.checks, {
        fields: ['check', 'failed', 'errors', 'warnings', 'skipped'],
      }),
      text(closing),
      // Every build runs this check, so this is where a package learns what
      // the next minor release will fail.
      ...(data.upcoming > 0 && !data.next
        ? [
            text(
              `${plural(data.upcoming, 'finding')} above (the notes) will fail --strict from the next minor release. Fix ${data.upcoming === 1 ? 'it' : 'them'} ahead: ${formatCliCommand('astryx integration check --strict --next')}`,
            ),
          ]
        : []),
    );
  }
  if (result.data.failed) process.exitCode = 1;
  return NO_RESULT_SET;
}

/** @param {import('commander').Command} program */
export function registerIntegration(program) {
  /** @type {import('commander').Command} */
  let integration;
  integration = defineCommand(program, integrationGroup, {
    action: (options, command) =>
      showGroupOrUnknown(integration, 'integration', options, command),
  });
  // An unknown subcommand given with a flag reports the unknown subcommand
  // and lists the ones the group has, not the unknown option. Each subcommand
  // still parses its own options.
  integration.allowUnknownOption(true);

  const addCmd = defineCommand(integration, integrationAddCommand, {
    fn: integrationAddFn,
    action: async (kind, name, options) => {
      const json = program.opts().json || false;
      let result;
      try {
        result = await integrationAdd(kind, name, {
          cwd: process.cwd(),
          dryRun: options.dryRun,
          templateType: options.type,
          replaces: options.replaces,
          extends: options.extends,
          parent: options.parent,
          to: options.to,
          from: options.from,
        });
      } catch (error) {
        const err =
          /** @type {import('../../../api/error.mjs').AstryxError} */ (error);
        return cliError(err.message, {
          suggestions: err.suggestions ?? [],
          code: err.code,
        });
      }

      if (json) {
        jsonOut(result);
        return NO_RESULT_SET;
      }

      const {root, manifest, files, written, dryRun} = result.data;
      const state = dryRun ? 'plan' : written ? 'ok' : 'unchanged';
      const blocks = [
        section(
          dryRun
            ? `${kind} contribution plan`
            : written
              ? `${kind} contribution added`
              : `${kind} contribution unchanged`,
        ),
        text(`[${state}] ${result.data.name}`),
      ];
      if (root != null) {
        blocks.push(
          text(
            `${root.created ? 'Declare' : 'Use'} ${kind} root ${root.path} in ${manifest}.`,
          ),
        );
      } else {
        blocks.push(text(`Update ${manifest}.`));
      }
      if (files.length > 0) blocks.push(list(files));
      emit(...blocks);
      return NO_RESULT_SET;
    },
  });
  addCmd.allowExcessArguments(false);

  // It takes no package name, so a name passed by mistake is an error, not a
  // silent check of the current folder.
  defineCommand(integration, integrationCheckCommand, {
    fn: integrationCheckFn,
    action: async options => checkPackage(program, options),
  }).allowExcessArguments(false);
  defineCommand(integration, integrationVerifyCommand, {
    fn: integrationPackCheckFn,
    action: async () => verifyPackage(program),
  });
  // The name this check had before `integration verify`. It stays as a
  // deprecated alias, listed as one in help, so scripts that call it keep
  // working; it runs the same check with the same output and exit codes.
  defineCommand(integration, integrationPackCommand, {
    fn: integrationPackCheckFn,
    action: async options => {
      if (!options.check) {
        // One way forward: the new name. `npm pack` is what builds a tarball.
        return cliError(
          `\`integration pack\` is now \`integration verify\`: run \`${formatCliCommand('integration verify')}\` to check the package the way npm will publish it. To build the tarball, run \`npm pack\`.`,
          {code: ERROR_CODES.ERR_INVALID_ARGUMENT},
        );
      }
      // stderr, and only in text: JSON callers get the same envelope as verify.
      if (!program.opts().json) {
        console.error(
          `Note: \`integration pack --check\` is deprecated. Run \`${formatCliCommand('integration verify')}\`: it runs the same check.`,
        );
      }
      return verifyPackage(program);
    },
  });
}
