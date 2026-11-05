// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {validateIntegration} from '../../../api/integration/validate-integration.mjs';

const NO_MANIFEST = 'No astryx.integration.* found next to package.json.';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-doctor-pkgjson-'));
  fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name": "@acme/widgets",}\n');
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.integration.mjs'),
    "export default {\n  templates: './templates',\n};\n",
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('doctor integration with a malformed package.json', () => {
  it('keeps a null name for the no-manifest case only', async () => {
    const result = await validateIntegration(undefined, {cwd: tmpDir});

    expect(result.data.name).toBe('(local package)');
    expect(result.data.issues.map(issue => issue.code)).toEqual([
      'invalid_package_json',
    ]);
  });

  for (const leaf of ['validate', 'templates', 'components', 'docs']) {
    it(`${leaf} prints the package.json error instead of "no manifest"`, async () => {
      const text = await runCli(['doctor', 'integration', leaf], tmpDir);
      const json = await runCli(
        ['doctor', 'integration', leaf, '--json'],
        tmpDir,
      );

      expect(text.status).toBe(1);
      expect(json.status).toBe(1);
      expect(text.stdout).not.toContain(NO_MANIFEST);
      expect(text.stdout).toContain('invalid_package_json');
      expect(JSON.parse(json.stdout).data.issues).toContainEqual(
        expect.objectContaining({code: 'invalid_package_json'}),
      );
    });
  }
});
