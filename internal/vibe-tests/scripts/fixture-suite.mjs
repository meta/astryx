#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

import path from 'node:path';
import {
  FIXTURE_IDS,
  buildFixture,
  copyFixture,
  refreshManifest,
  validateCanonicalSuite,
} from '../src/fixture-suite.mjs';

const [command, fixtureId, ...rest] = process.argv
  .slice(2)
  .filter(argument => argument !== '--');

function option(name) {
  const index = rest.indexOf(`--${name}`);
  return index === -1 ? undefined : rest[index + 1];
}

function requireFixture() {
  if (!FIXTURE_IDS.includes(fixtureId)) {
    throw new Error(`fixture must be one of: ${FIXTURE_IDS.join(', ')}`);
  }
}

switch (command) {
  case 'verify': {
    validateCanonicalSuite();
    console.log(`verified ${FIXTURE_IDS.length} canonical fixtures`);
    break;
  }
  case 'prepare': {
    requireFixture();
    const output = option('output');
    if (!output) throw new Error('prepare requires --output <directory>');
    const destination = copyFixture(fixtureId, path.resolve(output));
    console.log(`prepared ${fixtureId} at ${destination}`);
    break;
  }
  case 'refresh': {
    requireFixture();
    refreshManifest(fixtureId);
    console.log(`refreshed ${fixtureId} manifest`);
    break;
  }
  case 'build': {
    const fixtures = fixtureId ? [fixtureId] : FIXTURE_IDS;
    for (const id of fixtures) {
      if (!FIXTURE_IDS.includes(id)) throw new Error(`unknown fixture: ${id}`);
      const result = buildFixture(id);
      console.log(`built ${result.fixtureId} from a copied sandbox`);
    }
    break;
  }
  default:
    throw new Error(
      'usage: fixture-suite.mjs <verify|prepare|refresh|build> [fixture] [--output directory]',
    );
}
