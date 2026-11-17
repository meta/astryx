// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file disabled-hover-audit.test.mjs
 * Covers the parts of the disabled-hover gate that do not need a browser:
 * the story-scoping contract it shares with the a11y audit, the snapshot
 * diff that decides a verdict, and the report it prints. The Chromium sweep
 * itself is exercised by the CI job that runs it against the real Storybook
 * build.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {describe, it, expect} from 'vitest';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(SCRIPTS_DIR, 'disabled-hover-audit.js');
const {selectStories, diffSnapshots, formatViolations, VISUAL_PROPERTIES} =
  createRequire(import.meta.url)(SCRIPT);

const story = (id, title) => ({id, title, type: 'story'});

describe('selectStories', () => {
  const entries = [
    story('core-button--default', 'Core/Button'),
    story('core-button--disabled', 'Core/Button'),
    story('core-button--docs', 'Core/Button'),
    story('lab-stepper--default', 'Lab/Stepper'),
    story('example-introduction--page', 'Example/Introduction'),
  ];

  it('audits every core and lab story when no components are named', () => {
    expect(selectStories(entries, []).map(e => e.id)).toEqual([
      'core-button--default',
      'core-button--disabled',
      'lab-stepper--default',
    ]);
  });

  it('scopes to the named components, case-insensitively', () => {
    expect(selectStories(entries, ['button']).map(e => e.id)).toEqual([
      'core-button--default',
      'core-button--disabled',
    ]);
  });

  it('covers lab as well as core', () => {
    expect(selectStories(entries, ['Stepper']).map(e => e.id)).toEqual([
      'lab-stepper--default',
    ]);
  });

  it('skips docs entries', () => {
    expect(selectStories(entries, ['button']).some(e => e.id.endsWith('--docs'))).toBe(false);
  });
});

describe('diffSnapshots', () => {
  const node = (label, styles) => ({label, styles});

  it('passes an element that renders identically hovered', () => {
    const snapshot = [node('', {'background-color': 'red', cursor: 'not-allowed'})];
    expect(diffSnapshots(snapshot, structuredClone(snapshot))).toEqual([]);
  });

  it('reports the property that moved', () => {
    const before = [node('', {'background-image': 'none'})];
    const after = [node('', {'background-image': 'linear-gradient(grey, grey)'})];
    expect(diffSnapshots(before, after)).toEqual([
      {
        label: '',
        property: 'background-image',
        from: 'none',
        to: 'linear-gradient(grey, grey)',
      },
    ]);
  });

  it('sees a change on a descendant, not just the disabled element itself', () => {
    const before = [node('', {color: 'grey'}), node(' > svg:nth-child(1)', {fill: 'grey'})];
    const after = [node('', {color: 'grey'}), node(' > svg:nth-child(1)', {fill: 'blue'})];
    expect(diffSnapshots(before, after)).toEqual([
      {label: ' > svg:nth-child(1)', property: 'fill', from: 'grey', to: 'blue'},
    ]);
  });

  it('reports a re-render rather than guessing which nodes line up', () => {
    const deltas = diffSnapshots([node('', {color: 'red'})], []);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].property).toBe('(node count)');
  });

  it('compares the cursor: a pointer on a disabled control is an affordance', () => {
    expect(VISUAL_PROPERTIES).toContain('cursor');
  });
});

describe('formatViolations', () => {
  it('says so plainly when there is nothing to report', () => {
    expect(formatViolations([])).toContain('No disabled element paints a hover state');
  });

  it('groups by component and names the story and the delta', () => {
    const output = formatViolations([
      {
        component: 'Core/Button',
        story: 'core-button--disabled',
        element: '<button.astryx-button>',
        deltas: [{label: '', property: 'background-image', from: 'none', to: 'linear-gradient(grey, grey)'}],
      },
    ]);
    expect(output).toContain('Core/Button (1)');
    expect(output).toContain('core-button--disabled');
    expect(output).toContain('background-image: none -> linear-gradient(grey, grey)');
  });
});

describe('CLI contract', () => {
  /** Run the audit in an empty temp cwd; returns {status, stdout}. */
  function runAudit(args) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'disabled-hover-'));
    try {
      const result = execFileSync(process.execPath, [SCRIPT, ...args], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return {status: 0, stdout: result};
    } catch (error) {
      return {status: error.status, stdout: (error.stdout || '') + (error.stderr || '')};
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }

  // Same contract as accessibility-audit.js so the two CI steps can share one
  // component list: an EMPTY --components means the PR touched no component,
  // and must pass without fanning out into a full sweep.
  it('passes and audits nothing when --components is empty', () => {
    const {status, stdout} = runAudit(['--components', '']);
    expect(status).toBe(0);
    expect(stdout).toContain('skipping');
  });

  it('fails loudly when the storybook build is missing', () => {
    const {status, stdout} = runAudit(['--storybook-dir', 'nope', '--components', 'Button']);
    expect(status).toBe(1);
    expect(stdout).toContain('Storybook build not found');
  });
});
