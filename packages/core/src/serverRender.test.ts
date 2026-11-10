// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file serverRender.test.ts
 * @input Loads the directive-free Text and Heading entries under React's
 *   `react-server` build, with each `'use client'` module swapped for a client
 *   reference, then loads the client build to render that output to HTML
 * @output Text and Heading without `maxLines` render with no client reference;
 *   an explicit `maxLines` references only TruncatableText, with serializable
 *   props; the HTML equals the client render and hydrates with no mismatch
 * @position Runtime companion of serverSafeComponents.test.ts, which proves
 *   the import graph. react-dom/server cannot load under the `react-server`
 *   condition, so a small resolver walks the server element tree instead.
 */

import {describe, it, expect, vi, beforeAll, afterAll} from 'vitest';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import ts from 'typescript';
import type * as ReactModule from 'react';
import type * as ReactDOMServerModule from 'react-dom/server';
import type * as ReactDOMClientModule from 'react-dom/client';
import type {Text as TextType} from './Text/Text';
import type {Heading as HeadingType} from './Heading/Heading';

const SRC_DIR = __dirname;
const nodeRequire = createRequire(import.meta.url);
const reactDir = dirname(nodeRequire.resolve('react/package.json'));

/** The `'use client'` modules that the Text and Heading entries reach. */
const CLIENT_MODULES = ['Text/TruncatableText.tsx', 'Text/useTruncation.ts'];
const TRUNCATABLE_TEXT = 'Text/TruncatableText.tsx#TruncatableText';

const CLIENT_REFERENCE = Symbol.for('test.client.reference');

type ClientReference = ((props: unknown) => never) & {
  [CLIENT_REFERENCE]: string;
};

/** Every runtime name that a module exports. */
function runtimeExportNames(file: string): string[] {
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(file, 'utf-8'),
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TSX,
  );
  const names: string[] = [];
  const isExported = (node: ts.Node) =>
    ts.canHaveModifiers(node) &&
    ts
      .getModifiers(node)
      ?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
  for (const statement of sourceFile.statements) {
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      isExported(statement) &&
      statement.name
    ) {
      names.push(statement.name.text);
    } else if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        names.push(declaration.name.getText(sourceFile));
      }
    }
  }
  return names;
}

/** What an RSC bundler hands the server for a `'use client'` module. */
function clientReferenceModule(rel: string): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  for (const name of runtimeExportNames(join(SRC_DIR, rel))) {
    const reference = (() => {
      throw new Error(`client reference ${rel}#${name} ran on the server`);
    }) as unknown as ClientReference;
    reference[CLIENT_REFERENCE] = `${rel}#${name}`;
    exports[name] = reference;
  }
  return exports;
}

/** A host element, or a client reference with the props it receives. */
type ServerNode =
  | string
  | null
  | ServerNode[]
  | {host: string; props: Record<string, unknown>}
  | {client: string; props: Record<string, unknown>};

interface Resolved {
  tree: ServerNode;
  /** Every client reference that the tree renders, `file#export`. */
  references: string[];
}

type AnyElement = {type: unknown; props: Record<string, unknown>};

let ServerReact: typeof ReactModule;
let ServerText: typeof TextType;
let ServerHeading: typeof HeadingType;
let isReactServerUnderServerBuild: boolean;

let ClientReact: typeof ReactModule;
let ClientText: typeof TextType;
let ClientHeading: typeof HeadingType;
let isReactServerUnderClientBuild: boolean;
let renderToStaticMarkup: typeof ReactDOMServerModule.renderToStaticMarkup;
let hydrateRoot: typeof ReactDOMClientModule.hydrateRoot;
const clientModules = new Map<string, Record<string, unknown>>();

function isServerElement(value: unknown): value is AnyElement {
  return ServerReact.isValidElement(value);
}

/**
 * Props that cross into a client reference must survive React Flight: plain
 * data, arrays, objects and already rendered elements.
 */
function assertSerializable(value: unknown, where: string): void {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
    return;
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new Error(`${where} receives a non-serializable ${typeof value}`);
  }
  if (Array.isArray(value)) {
    value.forEach(item => assertSerializable(item, where));
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${where} receives a class instance`);
  }
  for (const item of Object.values(value)) {
    assertSerializable(item, where);
  }
}

/**
 * Render a server tree: call server components, keep host elements, and stop
 * at client references. Elements passed to a client reference render on the
 * server first, as React Flight renders them.
 */
async function resolveServerTree(node: unknown): Promise<Resolved> {
  const references: string[] = [];
  const resolveProps = async (props: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      out[key] =
        isServerElement(value) || Array.isArray(value)
          ? await walk(value)
          : value;
    }
    return out;
  };
  const walk = async (value: unknown): Promise<ServerNode> => {
    if (value == null || typeof value === 'boolean') {
      return null;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return Promise.all(value.map(walk));
    }
    if (!isServerElement(value)) {
      throw new Error(`unexpected child of type ${typeof value}`);
    }
    const {type, props} = value;
    if (type === ServerReact.Fragment) {
      return walk(props.children);
    }
    if (typeof type === 'string') {
      return {host: type, props: await resolveProps(props)};
    }
    if (typeof type === 'function' && CLIENT_REFERENCE in type) {
      const id = (type as ClientReference)[CLIENT_REFERENCE];
      references.push(id);
      const resolved = await resolveProps(props);
      assertSerializable(resolved, id);
      return {client: id, props: resolved};
    }
    if (typeof type === 'function') {
      return walk(await (type as (p: unknown) => unknown)(props));
    }
    throw new Error(`unexpected element type ${String(type)}`);
  };
  const tree = await walk(node);
  return {tree, references};
}

/**
 * The client side of the server output: host elements stay, and each client
 * reference becomes the client module it names, as the browser loads it.
 */
function toClientElement(node: ServerNode): ReactModule.ReactNode {
  if (node == null || typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(toClientElement);
  }
  const {children, ...props} = node.props;
  const kids = (Array.isArray(children) ? children : [children]).map(
    (child): ReactModule.ReactNode => toClientElement(child as ServerNode),
  );
  let type: ReactModule.ElementType;
  if ('host' in node) {
    type = node.host as ReactModule.ElementType;
  } else {
    const [file, name] = node.client.split('#');
    type = clientModules.get(file)?.[name] as ReactModule.ElementType;
  }
  return ClientReact.createElement(type, props, ...kids);
}

beforeAll(async () => {
  vi.resetModules();
  // React's server JSX runtimes `require('react')` and insist on the server
  // build. In this jsdom project the plain specifier resolves the client
  // build, so load them with the server build in its place, as the
  // `react-server` condition would.
  const serverReact = nodeRequire(
    join(reactDir, 'react.react-server.js'),
  ) as Record<string, unknown>;
  const withServerReact = (file: string): Record<string, unknown> => {
    const reactIndex = nodeRequire.resolve('react');
    const previous = nodeRequire.cache[reactIndex];
    nodeRequire.cache[reactIndex] = {
      id: reactIndex,
      filename: reactIndex,
      loaded: true,
      exports: serverReact,
    } as NodeJS.Module;
    try {
      return nodeRequire(join(reactDir, file)) as Record<string, unknown>;
    } finally {
      nodeRequire.cache[reactIndex] = previous;
    }
  };
  const jsxRuntime = withServerReact('jsx-runtime.react-server.js');
  const jsxDevRuntime = withServerReact('jsx-dev-runtime.react-server.js');
  vi.doMock('react', () => ({...serverReact, default: serverReact}));
  vi.doMock('react/jsx-runtime', () => jsxRuntime);
  vi.doMock('react/jsx-dev-runtime', () => jsxDevRuntime);
  for (const rel of CLIENT_MODULES) {
    vi.doMock(join(SRC_DIR, rel), () => clientReferenceModule(rel));
  }
  ServerReact = await import('react');
  ({Text: ServerText} = await import('./Text'));
  ({Heading: ServerHeading} = await import('./Heading'));
  ({isReactServer: isReactServerUnderServerBuild} =
    await import('./utils/isReactServer'));

  // The browser's side: the client build, and the real client modules.
  vi.doUnmock('react');
  vi.doUnmock('react/jsx-runtime');
  vi.doUnmock('react/jsx-dev-runtime');
  for (const rel of CLIENT_MODULES) {
    vi.doUnmock(join(SRC_DIR, rel));
  }
  vi.resetModules();
  ClientReact = await import('react');
  ({renderToStaticMarkup} = await import('react-dom/server'));
  ({hydrateRoot} = await import('react-dom/client'));
  ({Text: ClientText} = await import('./Text'));
  ({Heading: ClientHeading} = await import('./Heading'));
  ({isReactServer: isReactServerUnderClientBuild} =
    await import('./utils/isReactServer'));
  clientModules.set(
    'Text/TruncatableText.tsx',
    await import('./Text/TruncatableText'),
  );
});

afterAll(() => {
  vi.resetModules();
});

interface Case {
  name: string;
  component: 'Text' | 'Heading';
  props: Record<string, unknown>;
  children: string | {tag: string; text: string};
}

/** Every prop that does not truncate, so each renders on the server. */
const SERVER_CASES: Case[] = [
  {name: 'Text', component: 'Text', props: {}, children: 'Hello'},
  {
    name: 'Text type supporting',
    component: 'Text',
    props: {type: 'supporting'},
    children: 'Helper text',
  },
  {
    name: 'Text display type as h1',
    component: 'Text',
    props: {type: 'display-1', as: 'h1'},
    children: 'Hero',
  },
  {
    name: 'Text size, weight and color',
    component: 'Text',
    props: {size: '2xs', weight: 'bold', color: 'accent', as: 'p'},
    children: 'Callout',
  },
  {
    name: 'Text layout and decoration',
    component: 'Text',
    props: {
      display: 'block',
      justify: 'center',
      textWrap: 'balance',
      wordBreak: 'break-all',
      hasCapsize: true,
      hasStrikethrough: true,
      hasTabularNumbers: true,
    },
    children: '1,234.56',
  },
  {
    name: 'Text caller props',
    component: 'Text',
    props: {
      className: 'caller',
      style: {marginTop: 4},
      id: 'note',
      role: 'note',
      'aria-label': 'Note',
      'data-testid': 'note',
    },
    children: {tag: 'strong', text: 'Nested'},
  },
  {
    name: 'Text tooltip off without maxLines',
    component: 'Text',
    props: {hasTruncateTooltip: false},
    children: 'No clamp',
  },
  {name: 'Heading', component: 'Heading', props: {level: 1}, children: 'Title'},
  {
    name: 'Heading display type and accessibility level',
    component: 'Heading',
    props: {
      level: 3,
      type: 'display-2',
      accessibilityLevel: 2,
      color: 'secondary',
      weight: 'medium',
    },
    children: '$1.2M',
  },
  {
    name: 'Heading layout and caller props',
    component: 'Heading',
    props: {
      level: 2,
      display: 'inline',
      justify: 'end',
      textWrap: 'pretty',
      hasCapsize: true,
      hasStrikethrough: true,
      className: 'caller',
      style: {color: 'red'},
      'data-testid': 'section',
    },
    children: {tag: 'em', text: 'Section'},
  },
];

/** Each explicit `maxLines`: the client part renders, on the server too. */
const TRUNCATION_CASES: Case[] = [
  {
    name: 'Text maxLines 0',
    component: 'Text',
    props: {maxLines: 0},
    children: 'Short',
  },
  {
    name: 'Text maxLines 1',
    component: 'Text',
    props: {maxLines: 1},
    children: 'One line',
  },
  {
    name: 'Text maxLines 3 with placement',
    component: 'Text',
    props: {maxLines: 3, hasTruncateTooltip: 'below', as: 'p'},
    children: {tag: 'strong', text: 'Three lines'},
  },
  {
    name: 'Text maxLines 2 with the tooltip off',
    component: 'Text',
    props: {maxLines: 2, hasTruncateTooltip: false},
    children: 'Clipped by CSS',
  },
  {
    name: 'Text maxLines 3 with capsize',
    component: 'Text',
    props: {maxLines: 3, hasCapsize: true, className: 'caller'},
    children: 'Capsize block',
  },
  {
    name: 'Heading maxLines 1',
    component: 'Heading',
    props: {level: 2, maxLines: 1, 'data-testid': 'title'},
    children: 'A long title',
  },
  {
    name: 'Heading maxLines 2 with the tooltip off',
    component: 'Heading',
    props: {level: 4, maxLines: 2, hasTruncateTooltip: false},
    children: 'Clipped heading',
  },
  {
    name: 'Heading maxLines 0',
    component: 'Heading',
    props: {level: 5, maxLines: 0, accessibilityLevel: 3},
    children: 'Untruncated',
  },
];

function serverElement({component, props, children}: Case) {
  const type = component === 'Text' ? ServerText : ServerHeading;
  const child =
    typeof children === 'string'
      ? children
      : ServerReact.createElement(children.tag, null, children.text);
  return ServerReact.createElement(type as never, props as never, child);
}

function clientElement({component, props, children}: Case) {
  const type = component === 'Text' ? ClientText : ClientHeading;
  const child =
    typeof children === 'string'
      ? children
      : ClientReact.createElement(children.tag, null, children.text);
  return ClientReact.createElement(type as never, props as never, child);
}

const caseRows = (cases: Case[]) => cases.map(c => [c.name, c] as const);
const ALL_CASES = [...SERVER_CASES, ...TRUNCATION_CASES];

describe('Text and Heading under the react-server build', () => {
  it('loads the react-server build, and isReactServer reads each build', () => {
    // The client-only surface is absent, so a hook call cannot pass silently.
    const names = Object.keys(ServerReact);
    expect(names).toContain('createElement');
    expect(names).not.toContain('useState');
    expect(names).not.toContain('useContext');
    expect(isReactServerUnderServerBuild).toBe(true);
    expect(isReactServerUnderClientBuild).toBe(false);
  });

  it.each(caseRows(SERVER_CASES))(
    '%s renders with no client reference',
    async (_name, testCase) => {
      const {references} = await resolveServerTree(serverElement(testCase));
      expect(references).toEqual([]);
    },
  );

  it.each(caseRows(TRUNCATION_CASES))(
    '%s references only TruncatableText, with serializable props',
    async (_name, testCase) => {
      const {references} = await resolveServerTree(serverElement(testCase));
      expect(references).toEqual([TRUNCATABLE_TEXT]);
    },
  );

  it.each(caseRows(ALL_CASES))(
    '%s renders the same HTML as the client render',
    async (_name, testCase) => {
      const {tree} = await resolveServerTree(serverElement(testCase));
      const serverHtml = renderToStaticMarkup(
        ClientReact.createElement(ClientReact.Fragment, null, [
          toClientElement(tree),
        ]),
      );
      const clientHtml = renderToStaticMarkup(clientElement(testCase));
      expect(serverHtml).not.toBe('');
      expect(serverHtml).toBe(clientHtml);
    },
  );

  it.each(caseRows(ALL_CASES))(
    '%s hydrates the server HTML with no mismatch',
    async (_name, testCase) => {
      const {tree} = await resolveServerTree(serverElement(testCase));
      const container = document.createElement('div');
      document.body.append(container);
      container.innerHTML = renderToStaticMarkup(clientElement(testCase));
      const html = container.innerHTML;
      const errors: unknown[] = [];
      const globals = globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean};
      const previousActEnvironment = globals.IS_REACT_ACT_ENVIRONMENT;
      globals.IS_REACT_ACT_ENVIRONMENT = true;
      let root: ReactDOMClientModule.Root | undefined;
      try {
        await ClientReact.act(async () => {
          root = hydrateRoot(container, toClientElement(tree), {
            onRecoverableError: error => errors.push(error),
          });
        });
        expect(errors).toEqual([]);
        expect(container.innerHTML).toBe(html);
      } finally {
        await ClientReact.act(async () => root?.unmount());
        container.remove();
        globals.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
      }
    },
  );
});
