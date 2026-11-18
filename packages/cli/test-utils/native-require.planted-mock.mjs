// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A test that loads its code under test natively and also mocks and
 *   resets modules. `native-require.test.mjs` must report each call.
 */

import {vi} from 'vitest';
import {requireNatively} from './native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('../foundation/fs/paths.mjs')} */
const {findCoreDir} = require('../foundation/fs/paths.mjs');

vi.mock('../foundation/fs/paths.mjs', () => ({findCoreDir: () => null}));
vi.doMock('node:fs');
vi.importActual('../foundation/fs/paths.mjs');
vi.importMock('../foundation/fs/paths.mjs');
vi.resetModules();

export {findCoreDir};
