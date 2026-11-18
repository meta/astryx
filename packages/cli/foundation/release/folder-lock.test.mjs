// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {withFolderLock} from './folder-lock.mjs';
import {foreignLockIsSilent, forgetObservedLocks} from './lock-lease.mjs';

afterEach(() => {
  vi.useRealTimers();
  forgetObservedLocks();
});

describe('withFolderLock', () => {
  it('renews the lease while held, so a long command keeps its lock', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-lock-'));
    const lock = path.join(dir, 'x.lock');
    vi.useFakeTimers({toFake: ['setInterval', 'clearInterval', 'Date']});
    await withFolderLock(
      lock,
      async () => {
        const start = Date.now();
        // A waiting run on another computer judges by what it sees change.
        expect(foreignLockIsSilent(lock, start)).toBe(false);
        for (let t = 10_000; t <= 120_000; t += 10_000) {
          vi.advanceTimersByTime(10_000);
          expect(foreignLockIsSilent(lock, start + t), `${t} ms`).toBe(false);
        }
      },
      {
        onBusy: () => {
          throw new Error('busy');
        },
      },
    );
    expect(fs.existsSync(lock)).toBe(false);
    fs.rmSync(dir, {recursive: true, force: true});
  });

  it('releases only its own lock', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-lock-'));
    const lock = path.join(dir, 'y.lock');
    await withFolderLock(
      lock,
      async () => {
        // Another run took it over.
        fs.writeFileSync(
          path.join(lock, 'owner.json'),
          JSON.stringify({pid: 1, host: 'other', at: 1}),
        );
      },
      {
        onBusy: () => {
          throw new Error('busy');
        },
      },
    );
    expect(fs.existsSync(lock)).toBe(true);
    fs.rmSync(dir, {recursive: true, force: true});
  });
});
