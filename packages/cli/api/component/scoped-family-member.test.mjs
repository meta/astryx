// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scoped-family-member.test.mjs
 * @input `component`, against the real @astryxdesign/core registry
 * @output Proof that a package-scoped lookup of a listed family member answers
 *   with that member, as the unscoped lookup does
 * @position Colocated test for api/component/component.mjs
 */

import {describe, it, expect} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {component} from './component.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const cwd = REPO;
const SLOW = 30_000;
const CORE = '@astryxdesign/core';

describe('a package-scoped lookup of a family member', () => {
  for (const member of ['HStack', 'VStack']) {
    it(
      `answers ${member} with ${member}'s own entry, as the unscoped lookup does`,
      async () => {
        const unscoped = await component(member, {cwd});
        const scoped = await component(member, {cwd, package: CORE});
        expect(scoped.type).toBe('component.detail');
        expect(scoped.data.name).toBe(member);
        expect(scoped.data.props.length).toBeGreaterThan(0);
        expect(scoped.data.props.map(prop => prop.name)).toEqual(
          unscoped.data.props.map(prop => prop.name),
        );
      },
      SLOW,
    );
  }
});
