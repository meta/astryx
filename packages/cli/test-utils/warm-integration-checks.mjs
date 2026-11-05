// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The integration checks' one-time start in a test file, paid while the
 * file is collected.
 *
 * @input Where the test file keeps its fixtures: under the repository root,
 *   or in the system's temporary folder.
 * @output `warmIntegrationChecks()`: one `integrationCheck()` on a tiny
 *   package there. It throws when the checks do not run in full.
 * @position The first check in a test file parses TypeScript's lib files,
 *   and the first in a worker also loads TypeScript. Later checks reuse that
 *   work. A test file awaits this at its top level, which vitest does not
 *   time, so no test carries that start.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {integrationCheck} from '../api/integration/check/check.mjs';

/**
 * Runs the checks once on a tiny component package, laid out like the
 * calling file's own fixtures.
 * @param {{inRepository?: boolean}} [options] `false` for a file whose
 *   fixtures live in the system's temporary folder.
 * @returns {Promise<void>}
 */
export async function warmIntegrationChecks({inRepository = true} = {}) {
  const parent = inRepository ? process.cwd() : os.tmpdir();
  const dir = fs.mkdtempSync(path.join(parent, '.astryx-warm-checks-'));
  try {
    if (inRepository) {
      // As the repository's fixtures do: the root's compiler options, and no
      // file outside the package.
      fs.writeFileSync(
        path.join(dir, 'tsconfig.json'),
        `${JSON.stringify({extends: '../tsconfig.json', include: ['**/*']})}\n`,
      );
    }
    const pkg = path.join(dir, 'pkg');
    fs.mkdirSync(path.join(pkg, 'components'), {recursive: true});
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({name: '@acme/warm', version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(pkg, 'astryx.integration.mjs'),
      "export default {components: './components'};\n",
    );
    fs.writeFileSync(
      path.join(pkg, 'components', 'AcmeWarm.doc.mjs'),
      "export default {type: 'component', name: 'AcmeWarm', displayName: 'AcmeWarm', usage: {description: 'AcmeWarm.'}, props: []};\n",
    );
    fs.writeFileSync(
      path.join(pkg, 'components', 'AcmeWarm.tsx'),
      'export function AcmeWarm() { return null; }\n',
    );
    const result = await integrationCheck({cwd: pkg});
    /** @type {Map<string, any>} */
    const ran = new Map(
      result.data.checks.map(each => [each.check, each.response.data]),
    );
    const validated = ran.get('validate');
    // The package validates with no issue. In the repository both TypeScript
    // checks run too. Outside it no Core resolves, as in the calling file's
    // own fixtures.
    const complete =
      validated?.validated === true &&
      validated.issues.length === 0 &&
      (!inRepository ||
        (result.data.errors === 0 &&
          validated.docTypes?.status === 'checked' &&
          ran.get('components')?.propDrift?.status === 'checked'));
    if (!complete) {
      throw new Error(
        `warmIntegrationChecks: the checks did not run in full on the warm-up package: ${JSON.stringify(result.data.checks)}`,
      );
    }
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}
