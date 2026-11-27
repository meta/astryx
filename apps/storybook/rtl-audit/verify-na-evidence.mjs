// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Report receipt drift in the RTL verified-N/A registry.
 * @input verified-not-applicable.json and the checkout; optional
 *   `--component <package/Name>` to check one declaration.
 * @output One line per drifted declaration and a total. It always exits 0: the
 *   report changes no coverage status.
 * @position Author tool (`pnpm rtl:audit:verify-na`) for refreshing receipts
 *   after re-reviewing a component's source and stories.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {receiptDrift} from './verified-na-receipts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '../../..');
const REGISTRY_PATH = path.join(HERE, 'verified-not-applicable.json');

const args = process.argv.slice(2);
const componentIndex = args.indexOf('--component');
const component = componentIndex === -1 ? null : args[componentIndex + 1];

const verifiedNa = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
const drift = receiptDrift({
  verifiedNa,
  projectRoot: PROJECT_ROOT,
  components: component == null ? null : [component],
});

for (const entry of drift.drifted) {
  const parts = [
    entry.changed.length > 0 && `changed: ${entry.changed.join(', ')}`,
    entry.missing.length > 0 && `missing: ${entry.missing.join(', ')}`,
    entry.malformed.length > 0 && `malformed: ${entry.malformed.join(', ')}`,
  ].filter(Boolean);
  console.log(`${entry.component} — ${parts.join('; ')}`);
}
console.log(
  `${drift.drifted.length} of ${drift.checked} receipted declarations drifted; ${drift.withoutEvidence} carry no receipts.`,
);
