// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {ARMS} from './arms.mjs';
import {loadTaskSet, renderPrompt, TASKS_ROOT} from './tasks.mjs';

const arms = Object.values(ARMS);

const SETS = {pilot: 5, v1: 15};

describe.each(Object.entries(SETS))('%s task set', (set, size) => {
  const tasks = loadTaskSet(set);

  it('has its fixed size, a probe, and a reference solution for every arm', () => {
    expect(tasks).toHaveLength(size);
    for (const task of tasks) {
      expect(fs.existsSync(task.probePath)).toBe(true);
      for (const arm of arms) {
        expect(fs.existsSync(path.join(TASKS_ROOT, set, 'reference', arm.id, `${task.id}.tsx`))).toBe(true);
      }
    }
  });

  it('never names a library or a component in the task text', () => {
    for (const task of tasks) {
      expect(task.prompt).not.toMatch(/astryx|shadcn|radix|base ui|RadioList|AlertDialog|TabList|TextInput|Typeahead|DropdownMenu/i);
    }
  });

  it('renders the same prompt for every arm except the library name', () => {
    for (const task of tasks) {
      const rendered = arms.map(arm => renderPrompt(task, arm).replaceAll(arm.library, '<library>'));
      expect(new Set(rendered).size).toBe(1);
    }
  });
});

describe('loadTaskSet', () => {
  it('rejects unknown and malformed set names', () => {
    expect(() => loadTaskSet('missing-set')).toThrow(/not found/);
    expect(() => loadTaskSet('../pilot')).toThrow(/bad task set name/);
  });
});
