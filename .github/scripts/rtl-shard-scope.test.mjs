// Copyright (c) Meta Platforms, Inc. and affiliates.

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import componentPackages from '../../scripts/component-packages.cjs';
import {readAnalysis, resolveRtlShardScope} from './rtl-shard-scope.mjs';

const {COMPONENT_PACKAGE_NAMES} = componentPackages;
const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'rtl-shard-scope.mjs',
);
const qualifiedAnalysis = {
  owners: ['charts/ChartLegend', 'core/Button'],
  qualified: true,
};

function runCli(analysisText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-shard-scope-'));
  const analysis = path.join(dir, 'analysis.json');
  const output = path.join(dir, 'github-output');
  const manifest = path.join(dir, 'scope.json');
  try {
    if (analysisText !== null) fs.writeFileSync(analysis, analysisText);
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
        '--analysis',
        analysis,
        '--package',
        'charts',
        '--force-full',
        'false',
        '--has-components',
        'true',
        '--has-harness',
        'false',
        '--manifest',
        manifest,
        '--github-output',
        output,
      ],
      {encoding: 'utf8'},
    );
    return {
      ...result,
      output: fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '',
      manifest: fs.existsSync(manifest)
        ? JSON.parse(fs.readFileSync(manifest, 'utf8'))
        : null,
    };
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

describe('RTL shard scope', () => {
  it('selects only owners from the current package', () => {
    expect(
      resolveRtlShardScope({
        packageName: 'charts',
        forceFull: false,
        hasComponents: true,
        hasHarness: false,
        analysis: qualifiedAnalysis,
      }),
    ).toMatchObject({
      shouldRun: true,
      components: 'charts/ChartLegend',
      filter: 'charts/ChartLegend',
    });
  });

  it('skips a package with no changed owner', () => {
    expect(
      resolveRtlShardScope({
        packageName: 'vega',
        forceFull: false,
        hasComponents: true,
        hasHarness: false,
        analysis: qualifiedAnalysis,
      }),
    ).toMatchObject({shouldRun: false});
  });

  it('runs the full package for policy-sensitive scope', () => {
    expect(
      resolveRtlShardScope({
        packageName: 'vega',
        forceFull: true,
        hasComponents: true,
        hasHarness: false,
        analysis: {owners: [], qualified: true},
      }),
    ).toMatchObject({
      shouldRun: true,
      components: 'full vega roster',
      filter: '',
    });
  });

  it('runs the full package for unresolved component scope', () => {
    expect(
      resolveRtlShardScope({
        packageName: 'core',
        forceFull: false,
        hasComponents: true,
        hasHarness: false,
        analysis: {owners: [], qualified: true},
      }),
    ).toMatchObject({shouldRun: true, components: 'full core roster'});
  });

  it('runs every package fully when analysis found an unresolved source', () => {
    const analysis = {
      ...qualifiedAnalysis,
      forceFullComponentAudits: true,
    };
    for (const packageName of COMPONENT_PACKAGE_NAMES) {
      expect(
        resolveRtlShardScope({
          packageName,
          forceFull: false,
          hasComponents: true,
          hasHarness: false,
          analysis,
        }),
      ).toMatchObject({
        shouldRun: true,
        components: `full ${packageName} roster`,
      });
    }
  });

  it('runs only the canonical harness smoke packages', () => {
    const input = {
      forceFull: false,
      hasComponents: false,
      hasHarness: true,
      analysis: {owners: [], qualified: true},
    };
    expect(resolveRtlShardScope({...input, packageName: 'lab'})).toMatchObject({
      shouldRun: true,
      filter: 'lab/Chart',
    });
    expect(
      resolveRtlShardScope({...input, packageName: 'charts'}),
    ).toMatchObject({
      shouldRun: true,
      filter: 'charts/Chart,charts/ChartLegend',
    });
    expect(resolveRtlShardScope({...input, packageName: 'core'})).toMatchObject(
      {
        shouldRun: false,
      },
    );
  });

  it('fails closed to a full shard for unqualified legacy owner data', () => {
    expect(
      resolveRtlShardScope({
        packageName: 'core',
        forceFull: false,
        hasComponents: true,
        hasHarness: false,
        analysis: {owners: ['Button'], qualified: false},
      }),
    ).toMatchObject({shouldRun: true, components: 'full core roster'});
  });

  it('fails closed to full shards for a noncanonical qualified owner', () => {
    const analysis = {
      owners: ['unknown/Thing'],
      qualified: true,
      invalidOwners: ['unknown/Thing'],
    };
    for (const packageName of COMPONENT_PACKAGE_NAMES) {
      expect(
        resolveRtlShardScope({
          packageName,
          forceFull: false,
          hasComponents: true,
          hasHarness: false,
          analysis,
        }),
      ).toMatchObject({
        shouldRun: true,
        components: `full ${packageName} roster`,
      });
    }
  });
});

describe('RTL shard scope artifact handling', () => {
  it('reads qualified owner arrays', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-analysis-'));
    const file = path.join(dir, 'analysis.json');
    try {
      fs.writeFileSync(
        file,
        JSON.stringify({
          newComponentOwners: ['charts/ChartLegend'],
          modifiedComponentOwners: [],
        }),
      );
      expect(readAnalysis(file)).toEqual({
        owners: ['charts/ChartLegend'],
        qualified: true,
        forceFullComponentAudits: false,
        invalidOwners: [],
      });
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('adds the reverse dependents of a changed shared module', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-analysis-'));
    const file = path.join(dir, 'analysis.json');
    try {
      fs.writeFileSync(
        file,
        JSON.stringify({
          newComponentOwners: [],
          modifiedComponentOwners: ['core/Button'],
          dependentComponentOwners: ['core/Card'],
        }),
      );
      expect(readAnalysis(file).owners).toEqual(['core/Button', 'core/Card']);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it("passes a dependent folder's members to the RTL filter by component name", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-analysis-'));
    const file = path.join(dir, 'analysis.json');
    try {
      fs.writeFileSync(
        file,
        JSON.stringify({
          newComponentOwners: [],
          modifiedComponentOwners: [],
          dependentComponentOwners: ['core/Avatar', 'core/AvatarStatusDot'],
        }),
      );
      const scope = resolveRtlShardScope({
        packageName: 'core',
        forceFull: false,
        hasComponents: true,
        hasHarness: false,
        analysis: readAnalysis(file),
      });
      expect(scope.filter.split(',')).toEqual(
        expect.arrayContaining(['core/Avatar', 'core/AvatarStatusDot']),
      );
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it.each([
    ['missing', null, 'Could not read analysis artifact'],
    ['malformed', '{not json', 'Could not read analysis artifact'],
    [
      'wrong force-full shape',
      JSON.stringify({
        newComponentOwners: [],
        modifiedComponentOwners: [],
        forceFullComponentAudits: 'true',
      }),
      'forceFullComponentAudits must be a boolean',
    ],
    [
      'wrong owner shape',
      JSON.stringify({newComponentOwners: 'charts/ChartLegend'}),
      'newComponentOwners must be an array of strings',
    ],
  ])(
    'rejects %s analysis before writing shard outputs',
    (_name, input, message) => {
      const result = runCli(input);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(message);
      expect(result.output).toBe('');
      expect(result.manifest).toBeNull();
    },
  );

  it('turns a noncanonical qualified owner into full package scope', () => {
    const result = runCli(
      JSON.stringify({
        newComponentOwners: ['unknown/Thing'],
        modifiedComponentOwners: [],
      }),
    );
    expect(result.status).toBe(0);
    expect(result.output).toContain('should_run=true');
    expect(result.output).toContain('components=full charts roster');
    expect(result.output).toContain('reason=noncanonical component scope');
  });

  it('writes explicit outputs only after valid analysis resolves', () => {
    const result = runCli(
      JSON.stringify({
        newComponentOwners: ['charts/ChartLegend'],
        modifiedComponentOwners: [],
      }),
    );
    expect(result.status).toBe(0);
    expect(result.output).toContain('should_run=true');
    expect(result.output).toContain('filter=charts/ChartLegend');
    expect(result.manifest).toEqual({
      package: 'charts',
      shouldRun: true,
      filter: 'charts/ChartLegend',
    });
  });
});
