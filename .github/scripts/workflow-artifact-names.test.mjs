// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file workflow-artifact-names.test.mjs
 * Contract: no job uploads two artifacts under one name. A second upload of a
 * name fails the job, so a duplicated step (as a merge can leave behind) would
 * fail every run of it.
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const dir = path.resolve(import.meta.dirname, '../workflows');
const workflows = fs
  .readdirSync(dir)
  .filter(name => /\.ya?ml$/.test(name))
  .map(name => [
    name,
    yaml.parse(fs.readFileSync(path.join(dir, name), 'utf8')),
  ]);

describe('artifact names', () => {
  it.each(workflows)(
    '%s uploads each artifact name once per job',
    (_name, workflow) => {
      for (const [id, job] of Object.entries(workflow.jobs || {})) {
        const names = (job.steps || [])
          .filter(step =>
            String(step.uses || '').startsWith('actions/upload-artifact@'),
          )
          .map(step => step.with?.name)
          .filter(Boolean);
        expect(names, id).toEqual([...new Set(names)]);
      }
    },
  );
});
