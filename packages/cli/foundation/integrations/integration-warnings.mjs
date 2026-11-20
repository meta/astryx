// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Compact, non-blocking integration-issue nudge for everyday commands.
 *
 * When a loaded integration has validation issues, the everyday commands
 * print ONE compact, non-blocking line per integration that names the check
 * to run (`doctor` for a Project's issues, `doctor integration validate` for
 * a bare list of integrations), instead of silently skipping broken
 * contributions or printing each diagnostic. An issue that check cannot show
 * gets its own line instead: a provider conflict, and a comparison with Core
 * components where doctor reads no Core.
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
 * Print the issues of the loaded integrations to stderr: ONE line per
 * integration with issues, naming the check that shows them,
 *
 *   Warning: <pkg> has N integration issue(s). Run: astryx doctor
 *
 * (`doctor integration validate <pkg>` for a bare list of integrations), and
 * a line of its own for each issue that check cannot show:
 *
 *   Warning: <pkg>: <message>
 *
 * @param {Array<import('./integrations.mjs').LoadedIntegration> | {cwd?: string, issues: () => Promise<Array<{package: string, code: string, severity: string, message: string, needsCore?: boolean}>>}} source loaded integrations or their Project owner
 * @param {{json?: boolean}} [options]
 * @returns {Promise<void>}
 */
export async function warnOnIntegrationIssues(source, {json = false} = {}) {
  try {
    if (json) return;

    /** @type {Map<string, number>} */
    const issueCounts = new Map();
    const fromProject =
      source != null &&
      !Array.isArray(source) &&
      typeof source.issues === 'function';

    if (fromProject) {
      const issues = await source.issues();
      // Doctor reads only the project's installed Core, never the one the
      // answering CLI carries. Asked only for an issue that needs a Core.
      /** @type {boolean | undefined} */
      let projectCore;
      const doctorReadsCore = () =>
        (projectCore ??=
          findProjectCoreDir(source.cwd ?? process.cwd()) != null);
      for (const issue of issues) {
        if (issue.code === 'duplicate_provider') {
          console.error(`Warning: ${issue.message}`);
          continue;
        }
        if (
          issue.needsCore === true &&
          !pointsToDoctor(issue, {doctorReadsCore: doctorReadsCore()})
        ) {
          // Name the package unless the message already does.
          const named = issue.message.includes(issue.package);
          console.error(
            `Warning: ${named ? '' : `${issue.package}: `}${issue.message}`,
          );
          continue;
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

    for (const [pkg, count] of issueCounts) {
      const command = fromProject
        ? formatCliCommand('doctor')
        : formatCliCommand(`doctor integration validate ${pkg}`);
      console.error(
        `Warning: ${pkg} has ${count} integration issue(s). Run: ${command}`,
      );
    }
  } catch {
    // Never throw, never change the exit code.
  }
}
