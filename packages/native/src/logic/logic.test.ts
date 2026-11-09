// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';
import {connectBridge, createLogicCore, type LogicNode} from './index.js';

type Node = LogicNode & {props: Record<string, unknown>; events?: string[]};
type Action = {
  key: string;
  component: string;
  event: string;
  args: readonly unknown[];
};

function settings() {
  return createLogicCore<{wifi: boolean}, Node, Action>({
    initial: {wifi: true},
    view: state => ({
      component: 'VStack',
      key: 'root',
      props: {
        children: [
          {
            component: 'Switch',
            key: 'wifi',
            props: {label: 'Wi-Fi', value: state.wifi},
            events: ['onChange'],
          },
          {
            component: 'Text',
            key: 'status',
            props: {children: state.wifi ? 'Connected' : 'Off'},
          },
        ],
      },
    }),
    reduce: (state, action) =>
      action.key === 'wifi' && action.event === 'onChange'
        ? {wifi: action.args[0] === true}
        : state,
  });
}

describe('logic core', () => {
  it('rebuilds the tree once per change and tells the host', () => {
    const core = settings();
    const changes: string[] = [];
    let version = 0;
    const bridge = connectBridge(core, {
      connected: v => {
        version = v;
      },
      changed: json => changes.push(json),
    });
    expect(version).toBe(1);
    const first = core.getSnapshot();
    expect(core.getSnapshot()).toBe(first);

    bridge.dispatch(
      '{"args":[false],"component":"Switch","event":"onChange","key":"wifi"}',
    );
    expect(core.getState()).toEqual({wifi: false});
    expect(changes).toHaveLength(1);
    expect(changes[0]).toContain('"children":"Off"');

    // An action that changes nothing sends nothing.
    bridge.dispatch(
      '{"args":[],"component":"Button","event":"onClick","key":"other"}',
    );
    expect(changes).toHaveLength(1);
  });

  it('refuses JSON that is not an action', () => {
    const bridge = connectBridge(settings(), {
      connected: () => {},
      changed: () => {},
    });
    expect(() => bridge.dispatch('{"key":"wifi"}')).toThrow(
      'Not an Astryx action',
    );
  });

  const dir = path.dirname(fileURLToPath(import.meta.url));
  const sources = fs
    .readdirSync(dir)
    .filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'));

  it('type-checks with ECMAScript built-ins only', () => {
    const program = ts.createProgram(
      sources.map(file => path.join(dir, file)),
      {
        strict: true,
        noEmit: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        lib: ['lib.es2022.d.ts'],
        types: [],
      },
    );
    const errors = ts
      .getPreEmitDiagnostics(program)
      .map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    expect(errors).toEqual([]);
  });

  it('runs in an engine with no host globals, as in Hermes', () => {
    // Each module as CommonJS, evaluated in a fresh context with no timers,
    // process, require, or DOM. (V8 still exposes `console` there; the
    // ES2022-only type check above is what keeps it out.)
    const modules = new Map<string, Record<string, unknown>>();
    const context = vm.createContext({});
    const load = (file: string): Record<string, unknown> => {
      const cached = modules.get(file);
      if (cached) {
        return cached;
      }
      const exports: Record<string, unknown> = {};
      modules.set(file, exports);
      const {outputText} = ts.transpileModule(
        fs.readFileSync(path.join(dir, file), 'utf8'),
        {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
          },
        },
      );
      const run = vm.runInContext(
        `(function (exports, require) {${outputText}\n})`,
        context,
      ) as (e: unknown, r: (name: string) => unknown) => void;
      run(exports, name =>
        load(name.replace(/^\.\//, '').replace(/\.js$/, '.ts')),
      );
      return exports;
    };
    load('index.ts');
    const run = vm.runInContext(
      `(function (logic) {
        const core = logic.createLogicCore({
          initial: {count: 0},
          view: s => ({component: 'Text', key: 'count', props: {children: String(s.count)}}),
          reduce: (s, a) => a.event === 'onClick' ? {count: s.count + 1} : s,
        });
        const seen = [];
        const bridge = logic.connectBridge(core, {connected() {}, changed(json) { seen.push(json); }});
        bridge.dispatch(JSON.stringify({key: 'add', component: 'Button', event: 'onClick', args: []}));
        return seen;
      })`,
      context,
    ) as (logic: unknown) => string[];
    expect(run(load('index.ts'))).toEqual([
      '{"component":"Text","key":"count","props":{"children":"1"}}',
    ]);
  });
});
