// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The CLI takes the render host's answer even when the host exits
 * before this process has handled the answer, and says why when no answer
 * arrives: sent but not received, ended while it sent, or the stage it ended
 * in. A fake host fixes the order of its events, so no case needs load.
 */

import {EventEmitter} from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, describe, expect, it, vi} from 'vitest';
import {awaitHost, withHostStateFile} from './render-page.mjs';
import {HOST_EXIT} from './host-exit.mjs';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'await-host-test-'));
afterAll(() => fs.rmSync(scratch, {recursive: true, force: true}));

function fakeHost() {
  const host = /** @type {any} */ (new EventEmitter());
  host.kill = vi.fn();
  return host;
}

/** @param {object} state */
function stateFileWith(state) {
  const file = path.join(
    scratch,
    `state-${Math.random().toString(36).slice(2)}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(state));
  return file;
}

const ANSWER = {html: '<!doctype html>', warnings: []};

describe('the answer from the render host', () => {
  it('is taken when the host exits before this process handles the answer', async () => {
    const host = fakeHost();
    const answer = awaitHost(host, {
      timeoutMs: 60_000,
      withoutSegmenter: false,
    });
    // The host sent its answer and exited at once: Node may report the exit
    // before the answer, and the channel closes after both.
    host.emit('exit', 0, null);
    host.emit('message', ANSWER);
    host.emit('close', 0, null);
    await expect(answer).resolves.toEqual(ANSWER);
  });

  it('is taken in the usual order too: the answer, the exit, then the close', async () => {
    const host = fakeHost();
    const answer = awaitHost(host, {
      timeoutMs: 60_000,
      withoutSegmenter: false,
    });
    host.emit('message', ANSWER);
    host.emit('exit', 0, null);
    host.emit('close', 0, null);
    await expect(answer).resolves.toEqual(ANSWER);
  });
});

describe('a host that ends with no answer reaching this process', () => {
  /** @param {number} code @param {string} [stateFile] */
  function endWithout(code, stateFile) {
    const host = fakeHost();
    const answer = awaitHost(host, {
      timeoutMs: 60_000,
      withoutSegmenter: false,
      stateFile,
    });
    host.emit('exit', code, null);
    host.emit('close', code, null);
    return answer;
  }

  it('says the answer was sent but not received when the host recorded a sent answer', async () => {
    const file = stateFileWith({
      stage: 'rendering',
      elapsedMs: 4200,
      rssMb: 300,
      freeMb: 900,
      answered: 'sent',
    });
    await expect(endWithout(0, file)).rejects.toMatchObject({
      code: 'ERR_RENDER_FAILED',
      message:
        "The page's process sent its answer, but this process did not receive it (exit 0).",
    });
  });

  it('says the host ended while it sent its answer', async () => {
    const file = stateFileWith({
      stage: 'rendering',
      elapsedMs: 4200,
      rssMb: 300,
      freeMb: 900,
      answered: 'sending',
    });
    await expect(endWithout(0, file)).rejects.toMatchObject({
      message: "The page's process ended while it sent its answer (exit 0).",
    });
  });

  it("adds the page's last output line when the host left one", async () => {
    const file = stateFileWith({
      stage: 'rendering',
      elapsedMs: 3000,
      rssMb: 200,
      freeMb: 700,
      answered: 'no',
      stderrTail: 'warming up\nReferenceError: window is not defined',
    });
    await expect(endWithout(0, file)).rejects.toMatchObject({
      message:
        "The page's process ended without an answer (exit 0) while rendering, after 3 seconds, with 700 MB of memory free. Its last output: ReferenceError: window is not defined",
    });
  });

  it('names the stage, the time and the free memory when the host had not answered', async () => {
    const file = stateFileWith({
      stage: 'loading the page module',
      elapsedMs: 12_400,
      rssMb: 640,
      freeMb: 512,
      answered: 'no',
    });
    await expect(endWithout(0, file)).rejects.toMatchObject({
      message:
        "The page's process ended without an answer (exit 0) while loading the page module, after 12 seconds, with 512 MB of memory free.",
    });
  });

  it('says a failed send failed, by its own exit code', async () => {
    await expect(endWithout(HOST_EXIT.sendFailed)).rejects.toMatchObject({
      message: "The page's process could not send its answer to this process.",
    });
  });
});

describe("the host's state file", () => {
  it('is in a new folder under the system temporary folder, removed after the run', async () => {
    let seen = '';
    await withHostStateFile(async file => {
      seen = file;
      expect(path.dirname(path.dirname(file))).toBe(path.resolve(os.tmpdir()));
      expect(path.resolve(file).startsWith(process.cwd())).toBe(false);
      fs.writeFileSync(file, '{}');
    });
    expect(fs.existsSync(path.dirname(seen))).toBe(false);
  });

  it('is left out when no temporary folder can be made, and the render still runs', async () => {
    /** @type {string | undefined | null} */
    let given = null;
    const result = await withHostStateFile(
      async file => {
        given = file;
        return 'rendered';
      },
      {
        makeTempDir: () => {
          throw Object.assign(
            new Error('ENOENT: no such file or directory, mkdtemp'),
            {code: 'ENOENT'},
          );
        },
      },
    );
    expect(result).toBe('rendered');
    expect(given).toBeUndefined();
  });

  it('is removed after a run that fails, too', async () => {
    let seen = '';
    await expect(
      withHostStateFile(async file => {
        seen = file;
        throw new Error('render failed');
      }),
    ).rejects.toThrow('render failed');
    expect(fs.existsSync(path.dirname(seen))).toBe(false);
  });
});
