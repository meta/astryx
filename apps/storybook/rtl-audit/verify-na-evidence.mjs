// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Report receipt drift in the RTL verified-N/A registry.
 * @input verified-not-applicable.json and the checkout; optional
 *   `--component <package/Name>` to check one declaration.
 * @output One line per drifted declaration, with the current receipt of each
 *   changed file, and a total. Drift never changes the exit code; a registry
 *   that is missing or does not parse as a JSON array exits 1, as the audit's
 *   reader rejects it.
 * @position Author tool (`pnpm rtl:audit:verify-na`) for refreshing receipts
 *   after re-reviewing a component's source and stories.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fileReceipt, receiptDrift} from './verified-na-receipts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '../../..');
const REGISTRY_PATH = path.join(HERE, 'verified-not-applicable.json');

const args = process.argv.slice(2);
const componentIndex = args.indexOf('--component');
const component = componentIndex === -1 ? null : args[componentIndex + 1];

const verifiedNa = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
if (!Array.isArray(verifiedNa)) {
  // Same rule as the audit's registry reader in rtl-audit.mjs.
  console.error('verified-not-applicable registry must be a JSON array');
  process.exitCode = 1;
} else {
  const drift = receiptDrift({
    verifiedNa,
    projectRoot: PROJECT_ROOT,
    components: component == null ? null : [component],
  });

  for (const entry of drift.drifted) {
    const parts = [
      entry.changed.length > 0 &&
        `changed: ${entry.changed
          .map(file => `${file} (now ${fileReceipt(PROJECT_ROOT, file)})`)
          .join(', ')}`,
      entry.missing.length > 0 && `missing: ${entry.missing.join(', ')}`,
      entry.malformed.length > 0 && `malformed: ${entry.malformed.join(', ')}`,
    ].filter(Boolean);
    console.log(`${entry.component} — ${parts.join('; ')}`);
  }
  console.log(
    `${drift.drifted.length} of ${drift.checked} receipted declarations drifted; ${drift.withoutEvidence} carry no receipts.`,
  );
}
