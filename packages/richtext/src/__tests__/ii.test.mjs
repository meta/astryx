// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every app that installs this package runs the CLI's integration
 * check on it, and the CLI prints a warning on each command when the check
 * reports an issue. This test keeps the package free of issues, so that
 * warning never prints.
 * @input the package root, read as the CLI reads an installed integration
 * @output fails with the issue messages when the check reports any
 * @position packages/richtext/src/__tests__
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {validateIntegration} from '@astryxdesign/cli/api';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

describe('@astryxdesign/richtext integration check', () => {
  it('reports no issues, so apps that install it see no warning', async () => {
    const result = await validateIntegration(undefined, {cwd: packageRoot});
    expect(result.data.validated).toBe(true);
    expect(result.data.issues.map(issue => issue.message)).toEqual([]);
  }, 60_000);
});
