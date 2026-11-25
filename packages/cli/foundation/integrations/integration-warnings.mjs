// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Compact, non-blocking integration-issue nudge for everyday commands.
 *
 * When a loaded integration has validation issues, the everyday commands
 * print ONE compact, non-blocking line per integration that names the check
 * to run, instead of silently skipping broken contributions or printing each
 * diagnostic. For a Project's issues the check is `doctor`. Outside a
 * project, doctor checks the computer. There, an integration that doctor
 * does not check gets `doctor integration validate <pkg>`: one the folder
 * loads itself, or one installed for the computer that cannot load because
 * a package it imports is missing. A bare list of integrations gets the same
 * command. An issue that the named check cannot show gets its own line
 * instead: a provider conflict, a comparison with Core components where
 * doctor reads no Core, and a replacement finding where the line names
 * `doctor integration validate`, which does not resolve replacements.
 *
 * Design constraints (all enforced here):
 *   - Reuses Project.issues() when a Project is available, so cross-package
 *     replacement warnings are visible; accepts loaded integrations for legacy
 *     internal callers and tests.
 *   - Writes to STDERR only, so it never corrupts a --json stdout envelope.
 *   - Suppressed entirely in --json mode.
 *   - Best-effort: never throws, never changes the exit code. Broken
 *     contributions are still skipped downstream exactly as before; this only
 *     ADDS lines to stderr.
 */

import {validateLoadedIntegration} from './validate-contributions.mjs';
import {formatCliCommand} from '../env/package-manager.mjs';
import {findProjectCoreDir} from '../fs/paths.mjs';
import {isOutsideProject} from '../env/project-scope.mjs';
import {isPackageName} from '../identity/provider-identity.mjs';
import {shellArg} from '../text/shell-arg.mjs';

/**
 * Whether the nudge counts `issue` and points to doctor for it. A provider
 * conflict carries the specific message that `doctor integration validate`
 * would not explain, so the nudge prints it instead. So does an issue that
 * compares a component with Core components (`needsCore`) where doctor reads
 * no Core (outside a project, or in a project with no Core installed): doctor
 * cannot name one there.
 * @param {{code: string, needsCore?: boolean}} issue
 * @param {{doctorReadsCore?: boolean}} [where]
 * @returns {boolean}
 */
export function pointsToDoctor(issue, {doctorReadsCore = true} = {}) {
  if (issue.code === 'duplicate_provider') return false;
  return doctorReadsCore || issue.needsCore !== true;
}

/**
 * Whether doctor outside a project names the issues of `integration`, a
 * record the folder loads: doctor checks the computer there, so only an
 * integration installed for the computer that loads (spec AST-081 FR4, FR12).
 * @param {{__computer?: boolean, __loadError?: string}} integration
 * @returns {boolean}
 */
export function doctorChecksOutside(integration) {
  return integration.__computer === true && integration.__loadError == null;
}

/**
 * `doctor integration validate` for the integration labelled `pkg`. A local
 * integration whose package.json has no name has a placeholder label, so its
 * command names no package and validates the package in the current folder.
 * Any other label stays, as one shell word, so the command reports what is
 * wrong with it, such as a configured entry that is not a bare package name.
 * @param {string} pkg
 * @param {ReadonlySet<string>} unnamedLocal the placeholder labels
 * @returns {string}
 */
function validateCommand(pkg, unnamedLocal) {
  return unnamedLocal.has(pkg)
    ? 'doctor integration validate'
    : `doctor integration validate ${shellArg(pkg)}`;
}

/**
 * The labels of the local integrations among `records` whose package.json
 * has no name.
 * @param {ReadonlyArray<{name?: string, __local?: boolean}>} records
 * @returns {Set<string>}
 */
function unnamedLocalLabels(records) {
  return new Set(
    records.flatMap(record =>
      record?.__local === true &&
      typeof record.name === 'string' &&
      !isPackageName(record.name)
        ? [record.name]
        : [],
    ),
  );
}

/**
 * Print the issues of the loaded integrations to stderr: ONE line per
 * integration with issues, naming the check that shows them,
 *
 *   Warning: <pkg> has N integration issue(s). Run: astryx doctor
 *
 * (`doctor integration validate <pkg>` for a bare list of integrations, and
 * outside a project for an integration doctor does not check there), and a
 * line of its own for each issue that check cannot show:
 *
 *   Warning: <pkg>: <message>
 *
 * @param {Array<import('./integrations.mjs').LoadedIntegration> | {cwd?: string, loadedIntegrations?: ReadonlyArray<{name?: string, __computer?: boolean, __loadError?: string, __local?: boolean}>, issues: () => Promise<Array<{package: string, code: string, severity: string, message: string, needsCore?: boolean, needsCatalog?: boolean}>>}} source loaded integrations or their Project owner
 * @param {{json?: boolean}} [options]
 * @returns {Promise<void>}
 */
export async function warnOnIntegrationIssues(source, {json = false} = {}) {
  try {
    if (json) return;

    /** @type {Map<string, number>} */
    const issueCounts = new Map();
    /** @type {Set<string>} packages whose line names their own check */
    const checkedAlone = new Set();
    const fromProject =
      source != null &&
      !Array.isArray(source) &&
      typeof source.issues === 'function';

    if (fromProject) {
      const issues = await source.issues();
      const cwd = source.cwd ?? process.cwd();
      // Doctor reads only the project's installed Core, never the one the
      // answering CLI carries. Asked only for an issue that needs a Core.
      /** @type {boolean | undefined} */
      let projectCore;
      const doctorReadsCore = () =>
        (projectCore ??= findProjectCoreDir(cwd) != null);
      // Outside a project doctor checks the computer: of the integrations
      // the folder loads, it names the issues of those installed for the
      // computer that load.
      /** @type {Set<string> | null} */
      let doctorNames = null;
      let scoped = false;
      const doctorCovers = (/** @type {string} */ pkg) => {
        if (!scoped) {
          scoped = true;
          if (isOutsideProject(cwd)) {
            doctorNames = new Set(
              (source.loadedIntegrations ?? []).flatMap(i =>
                doctorChecksOutside(i) && i.name ? [i.name] : [],
              ),
            );
          }
        }
        return doctorNames == null || doctorNames.has(pkg);
      };
      /** @param {{package: string, message: string}} issue */
      const printOwnLine = issue => {
        // Name the package unless the message already does.
        const named = issue.message.includes(issue.package);
        console.error(
          `Warning: ${named ? '' : `${issue.package}: `}${issue.message}`,
        );
      };
      for (const issue of issues) {
        if (issue.code === 'duplicate_provider') {
          console.error(`Warning: ${issue.message}`);
          continue;
        }
        if (
          issue.needsCore === true &&
          !pointsToDoctor(issue, {doctorReadsCore: doctorReadsCore()})
        ) {
          printOwnLine(issue);
          continue;
        }
        if (!doctorCovers(issue.package)) {
          // `doctor integration validate` does not resolve replacements, so
          // it cannot show a replacement finding.
          if (issue.needsCatalog === true) {
            printOwnLine(issue);
            continue;
          }
          checkedAlone.add(issue.package);
        }
        issueCounts.set(
          issue.package,
          (issueCounts.get(issue.package) ?? 0) + 1,
        );
      }
    } else if (Array.isArray(source)) {
      for (const integration of source) {
        if (!integration || typeof integration !== 'object') continue;
        // A package set aside for a provider-ID conflict is fine in isolation,
        // so `doctor integration validate` would not explain it. Say it here.
        if (integration.__providerConflict) {
          console.error(`Warning: ${integration.__providerConflict.message}`);
          continue;
        }
        let issues;
        try {
          issues = await validateLoadedIntegration(integration);
        } catch {
          continue;
        }
        if (!Array.isArray(issues) || issues.length === 0) continue;
        const pkg = integration.name ?? integration.__spec ?? '(integration)';
        issueCounts.set(pkg, issues.length);
      }
    }

    const unnamedLocal = unnamedLocalLabels(
      Array.isArray(source) ? source : (source?.loadedIntegrations ?? []),
    );
    for (const [pkg, count] of issueCounts) {
      const command =
        fromProject && !checkedAlone.has(pkg)
          ? formatCliCommand('doctor')
          : formatCliCommand(validateCommand(pkg, unnamedLocal));
      console.error(
        `Warning: ${pkg} has ${count} integration issue(s). Run: ${command}`,
      );
    }
  } catch {
    // Never throw, never change the exit code.
  }
}
