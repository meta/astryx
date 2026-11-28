// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Receipt drift for the RTL verified-N/A registry.
 * @input Registry declarations, their `evidence` receipts (repository path to
 *   `sha256:<hex>`), and the checkout they describe.
 * @output Per component, the receipts whose recorded bytes changed, whose file
 *   is missing, or that are malformed.
 * @position Informational only. It never changes a component's coverage status,
 *   never sets the registry error, and never fails a run.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const HASH_RE = /^sha256:[a-f0-9]{64}$/;

/**
 * The receipt for one repository file, or null when the file does not exist.
 * Throws when the path leaves the repository.
 */
export function fileReceipt(projectRoot, relativePath) {
  const root = path.resolve(projectRoot);
  const absolute = path.resolve(root, relativePath);
  const relative = path.relative(root, absolute);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`receipt path leaves the repository: ${relativePath}`);
  }
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    return null;
  }
  return `sha256:${crypto
    .createHash('sha256')
    .update(fs.readFileSync(absolute))
    .digest('hex')}`;
}

/**
 * Compare each declaration's recorded receipts with the checkout. `components`
 * limits the result to those components (case-insensitive); omit it to check
 * the whole registry.
 */
export function receiptDrift({verifiedNa, projectRoot, components = null}) {
  const scope =
    components == null
      ? null
      : new Set(components.map(component => component.toLowerCase()));
  const drifted = [];
  let checked = 0;
  let withoutEvidence = 0;
  for (const declaration of Array.isArray(verifiedNa) ? verifiedNa : []) {
    const component = declaration?.component;
    if (typeof component !== 'string') {
      continue;
    }
    if (scope != null && !scope.has(component.toLowerCase())) {
      continue;
    }
    const evidence = declaration.evidence;
    if (evidence == null) {
      withoutEvidence += 1;
      continue;
    }
    checked += 1;
    const changed = [];
    const missing = [];
    const malformed = [];
    if (typeof evidence !== 'object' || Array.isArray(evidence)) {
      malformed.push('evidence is not a path-to-receipt map');
    } else {
      for (const [file, recorded] of Object.entries(evidence)) {
        if (typeof recorded !== 'string' || !HASH_RE.test(recorded)) {
          malformed.push(file);
          continue;
        }
        let current;
        try {
          current = fileReceipt(projectRoot, file);
        } catch {
          malformed.push(file);
          continue;
        }
        if (current == null) {
          missing.push(file);
        } else if (current !== recorded) {
          changed.push(file);
        }
      }
    }
    if (changed.length > 0 || missing.length > 0 || malformed.length > 0) {
      drifted.push({component, changed, missing, malformed});
    }
  }
  drifted.sort((left, right) => left.component.localeCompare(right.component));
  return {checked, withoutEvidence, drifted};
}
