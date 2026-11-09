// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Compact, non-blocking integration-issue nudge for everyday commands.
 *
 * When a CONFIGURED integration (from the Project's `loadedIntegrations`) has
 * validation issues, the everyday commands (component / template / upgrade)
 * should print ONE compact, non-blocking line per integration telling the user
 * to run `doctor integration validate` — instead of silently skipping broken
 * contributions or spamming per-contribution diagnostics.
 *
 * Design constraints (all enforced here):
 *   - Reuses Project.issues() when a Project is available, so cross-package
 *     replacement warnings are visible; accepts loaded integrations for legacy
 *     internal callers and tests.
 *   - Writes to STDERR only, so it never corrupts a --json stdout envelope.
 *   - Suppressed entirely in --json mode.
 *   - Best-effort: never throws, never changes the exit code. Broken
 *     contributions are still skipped downstream exactly as before; this only
 *     ADDS a one-line nudge.
 */

import {validateLoadedIntegration} from './validate-contributions.mjs';
import {formatCliCommand} from '../env/package-manager.mjs';

/**
 * For each configured (already-loaded) integration, compute its issues using
 * the shared integration validators and, if any exist, print exactly
 * ONE line per integration to stderr:
 *
 *   Warning: <pkg> has N integration issue(s). Run: astryx doctor integration validate <pkg>
 *
 * @param {Array<import('./integrations.mjs').LoadedIntegration> | {issues: () => Promise<Array<{package: string, code: string, severity: string, message: string}>>}} source loaded integrations or their Project owner
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
      for (const issue of issues) {
        // A provider-conflict issue carries the specific message that
        // `doctor integration validate` would not explain. Print it directly.
        if (issue.code === 'duplicate_provider') {
          console.error(`Warning: ${issue.message}`);
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
