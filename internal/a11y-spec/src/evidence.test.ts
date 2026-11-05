// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file evidence.test.ts
 * @input vitest, node:fs, resetAuditEvidence
 * @output Tests that each copy of an audit file gets its own evidence folder
 *   and clears only that one
 * @position Unit coverage for evidence.ts
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {resetAuditEvidence} from './evidence';

let root = '';

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-evidence-'));
});

afterEach(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

describe('resetAuditEvidence', () => {
  it('gives the first copy the folder itself, emptied and created', () => {
    const folder = path.join(root, 'menu-audit-evidence');
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'stale.sensors.json'), '{}');
    expect(resetAuditEvidence(folder, {repeatEachIndex: 0})).toBe(folder);
    expect(fs.readdirSync(folder)).toEqual([]);
  });

  it('gives each further copy its own folder and leaves the others alone', () => {
    const folder = path.join(root, 'menu-audit-evidence');
    const first = resetAuditEvidence(folder, {repeatEachIndex: 0});
    fs.writeFileSync(path.join(first, 'a.sensors.json'), '{}');
    const second = resetAuditEvidence(folder, {repeatEachIndex: 1});
    fs.writeFileSync(path.join(second, 'a.sensors.json'), '{}');
    const third = resetAuditEvidence(folder, {repeatEachIndex: 2});
    expect(second).toBe(`${folder}-repeat-1`);
    expect(third).toBe(`${folder}-repeat-2`);
    expect(fs.readdirSync(first)).toEqual(['a.sensors.json']);
    expect(fs.readdirSync(second)).toEqual(['a.sensors.json']);
    expect(fs.readdirSync(third)).toEqual([]);
  });
});
