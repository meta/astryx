// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Handlers contributed by integrations, alongside the project's own.
 *
 * An integration exports `debug` from its manifest module and every app that
 * installs it starts recording, with no change to the app. The app's own
 * `debug` is unaffected: both are destinations, neither replaces the other.
 * These cover the fan-out and the isolation that fanning out demands.
 *
 * @position packages/cli/foundation/debug — behaviour coverage
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  begin,
  finish,
  setCommand,
  setEventHandler,
  setIntegrationEventHandlers,
  resetRecorder,
} from './recorder.mjs';

/** Run one complete invocation. @returns {boolean} whether anything was delivered. */
function run(command = 'docs') {
  begin({argv: [command]});
  setCommand(command);
  return finish({exitCode: 0});
}

beforeEach(() => {
  resetRecorder();
});

afterEach(() => {
  resetRecorder();
});

describe('an integration can supply the handler', () => {
  it('records a run when only an integration supplied one', () => {
    const fromIntegration = vi.fn();
    setIntegrationEventHandlers([fromIntegration]);

    expect(run()).toBe(true);
    expect(fromIntegration).toHaveBeenCalledTimes(1);
    expect(fromIntegration.mock.calls[0][0].command).toBe('docs');
  });

  it('delivers to every integration, not just the first', () => {
    const one = vi.fn();
    const two = vi.fn();
    const three = vi.fn();
    setIntegrationEventHandlers([one, two, three]);

    run();

    expect(one).toHaveBeenCalledTimes(1);
    expect(two).toHaveBeenCalledTimes(1);
    expect(three).toHaveBeenCalledTimes(1);
  });

  it('records nothing when neither the project nor an integration supplied one', () => {
    setIntegrationEventHandlers([]);
    expect(run()).toBe(false);
  });

  it('ignores entries that are not functions', () => {
    const real = vi.fn();
    setIntegrationEventHandlers(
      /** @type {any} */ ([null, undefined, 'nope', 42, real]),
    );

    expect(run()).toBe(true);
    expect(real).toHaveBeenCalledTimes(1);
  });
});

describe('the project and its integrations both win', () => {
  // The case that motivated the feature. Under fallback semantics an app that
  // set `debug` for its own debugging would silently drop out of every
  // integration's debug logs — invisibly, because nothing reports a handler
  // that was never called.
  it('calls the project handler AND the integration handlers', () => {
    const fromConfig = vi.fn();
    const fromIntegration = vi.fn();
    setEventHandler(fromConfig);
    setIntegrationEventHandlers([fromIntegration]);

    run();

    expect(fromConfig).toHaveBeenCalledTimes(1);
    expect(fromIntegration).toHaveBeenCalledTimes(1);
  });

  it('delivers the project handler first, then integrations in load order', () => {
    /** @type {string[]} */
    const order = [];
    setEventHandler(() => order.push('config'));
    setIntegrationEventHandlers([
      () => order.push('first'),
      () => order.push('second'),
    ]);

    run();

    expect(order).toEqual(['config', 'first', 'second']);
  });

  it('gives each handler its own copy, so one cannot edit what the next is told', () => {
    /** @type {string[]} */
    const seen = [];
    setEventHandler(event => {
      event.command = 'MUTATED';
      seen.push(event.command);
    });
    setIntegrationEventHandlers([event => seen.push(event.command)]);

    run();

    expect(seen).toEqual(['MUTATED', 'docs']);
  });

  it('calls a handler once when the project and an integration share it', () => {
    const shared = vi.fn();
    setEventHandler(shared);
    setIntegrationEventHandlers([shared]);

    run();

    expect(shared).toHaveBeenCalledTimes(1);
  });

  it('calls a handler once when two integrations resolve to it', () => {
    const shared = vi.fn();
    setIntegrationEventHandlers([shared, shared]);

    run();

    expect(shared).toHaveBeenCalledTimes(1);
  });
});

describe('registering twice does not deliver twice', () => {
  // `Project.load` is a plain factory, and a single command can run it more
  // than once — the pre-parse handler load, then the command's own. The setter
  // replaces the set for exactly this reason.
  it('replaces the previous set rather than appending to it', () => {
    const handler = vi.fn();
    setIntegrationEventHandlers([handler]);
    setIntegrationEventHandlers([handler]);

    run();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('drops handlers that the second registration left out', () => {
    const gone = vi.fn();
    const kept = vi.fn();
    setIntegrationEventHandlers([gone]);
    setIntegrationEventHandlers([kept]);

    run();

    expect(gone).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledTimes(1);
  });

  it('is cleared by resetRecorder so nothing leaks between runs', () => {
    const handler = vi.fn();
    setIntegrationEventHandlers([handler]);
    resetRecorder();

    run();

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('one bad handler cannot take the others down', () => {
  it('runs the handlers after one that throws', () => {
    const after = vi.fn();
    setIntegrationEventHandlers([
      () => {
        throw new Error('integration handler exploded');
      },
      after,
    ]);

    expect(() => run()).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('keeps the project handler when an integration throws first', () => {
    const fromConfig = vi.fn();
    setEventHandler(fromConfig);
    setIntegrationEventHandlers([
      () => {
        throw new Error('boom');
      },
    ]);

    run();

    expect(fromConfig).toHaveBeenCalledTimes(1);
  });

  it('leaves the exit code the command chose', () => {
    const before = process.exitCode;
    setIntegrationEventHandlers([
      () => {
        process.exitCode = 77;
        process.exit(3);
      },
    ]);

    begin({argv: ['docs']});
    setCommand('docs');
    finish({exitCode: 0});

    expect(process.exitCode).toBe(before);
  });

  it('still reports delivery when one handler of several failed', () => {
    setIntegrationEventHandlers([
      () => {
        throw new Error('boom');
      },
      () => {},
    ]);

    expect(run()).toBe(true);
  });
});

describe('a Ctrl-C is recorded for an integration handler too', () => {
  // `process.on('exit')` does not run for a signalled death, so the recorder
  // installs signal listeners — but only once it has somewhere to deliver. An
  // integration handler is somewhere.
  const debugDir = path.dirname(fileURLToPath(import.meta.url));

  it('arms the signal handlers when the only handler came from an integration', () => {
    const source = `
      const d = await import(${JSON.stringify(path.join(debugDir, 'index.mjs'))});
      d.begin({argv: ['theme', 'build', '--watch'], cliVersion: '0.0.0'});
      d.setCommand('theme build');
      d.setIntegrationEventHandlers([
        e => process.stderr.write('EVENT ' + JSON.stringify(e) + '\\n'),
      ]);
      process.kill(process.pid, 'SIGINT');
      setTimeout(() => process.exit(7), 2000);
    `;
    const res = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', source],
      {encoding: 'utf8', timeout: 30_000},
    );
    const line = (res.stderr || '')
      .split('\n')
      .find(l => l.startsWith('EVENT '));
    expect(line).toBeTruthy();
    expect(JSON.parse(line.slice(6)).signal).toBe('SIGINT');
  });
});
