// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file serverRender.test.ts
 * @input Loads the directive-free Text and Heading entries under React's
 *   `react-server` build, with each `'use client'` module swapped for a client
 *   reference, then loads the client build to render that output to HTML
 * @output Text and Heading reference only the client parts their props need,
 *   with serializable props; the HTML equals the client render, hydrates with
 *   no mismatch, and keeps its first frame through hydration
 * @position Runtime companion of serverSafeComponents.test.ts, which proves
 *   the import graph. react-dom/server cannot load under the `react-server`
 *   condition, so a small resolver walks the server element tree instead.
 */

import {describe, it, expect, vi, beforeAll, afterAll} from 'vitest';
import {fireEvent, waitFor} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import ts from 'typescript';
import type * as ReactModule from 'react';
import type * as ReactDOMServerModule from 'react-dom/server';
import type * as ReactDOMClientModule from 'react-dom/client';
import type {Text as TextType} from './Text/Text';
import type {Heading as HeadingType} from './Heading/Heading';
import type {Link as LinkType} from './Link/Link';

const SRC_DIR = __dirname;
const nodeRequire = createRequire(import.meta.url);
const reactDir = dirname(nodeRequire.resolve('react/package.json'));

/**
 * The `'use client'` modules that the Text and Heading entries reach, and
 * Link, which the cases nest in Text.
 */
const CLIENT_MODULES = [
  'Text/TruncatableText.tsx',
  'Text/TextClampScope.tsx',
  'Text/useTruncation.ts',
  'Link/Link.tsx',
];
const TRUNCATABLE_TEXT = 'Text/TruncatableText.tsx#TruncatableText';
const TEXT_CLAMP_SCOPE = 'Text/TextClampScope.tsx#TextClampScope';
const LINK = 'Link/Link.tsx#Link';

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
let ServerLink: typeof LinkType;
let isReactServerUnderServerBuild: boolean;

let ClientReact: typeof ReactModule;
let ClientText: typeof TextType;
let ClientHeading: typeof HeadingType;
let ClientLink: typeof LinkType;
let isReactServerUnderClientBuild: boolean;
let renderToStaticMarkup: typeof ReactDOMServerModule.renderToStaticMarkup;
let renderToString: typeof ReactDOMServerModule.renderToString;
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
  ({Link: ServerLink} = await import('./Link/Link'));
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
  ({renderToStaticMarkup, renderToString} = await import('react-dom/server'));
  ({hydrateRoot} = await import('react-dom/client'));
  ({Text: ClientText} = await import('./Text'));
  ({Heading: ClientHeading} = await import('./Heading'));
  ({isReactServer: isReactServerUnderClientBuild} =
    await import('./utils/isReactServer'));
  const linkModule = await import('./Link/Link');
  ClientLink = linkModule.Link;
  clientModules.set(
    'Text/TruncatableText.tsx',
    await import('./Text/TruncatableText'),
  );
  clientModules.set(
    'Text/TextClampScope.tsx',
    await import('./Text/TextClampScope'),
  );
  clientModules.set('Link/Link.tsx', linkModule);
  // Loaded up front, so the truncation tooltip's module loader resolves at
  // once in the first-frame cases.
  await import('./Tooltip/Tooltip');
});

const globals = globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean};
const previousActEnvironment = globals.IS_REACT_ACT_ENVIRONMENT;

beforeAll(() => {
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  globals.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  vi.resetModules();
});

interface Case {
  name: string;
  component: 'Text' | 'Heading';
  props: Record<string, unknown>;
  children: string | {tag: string; text: string} | {link: string};
  /** The client references that the server render must emit. */
  references: string[];
}

const CASES: Case[] = [
  // No client reference: every prop that neither clamps a Text nor turns on
  // the truncation tooltip.
  {
    name: 'Text',
    component: 'Text',
    props: {},
    children: 'Hello',
    references: [],
  },
  {
    name: 'Text type supporting',
    component: 'Text',
    props: {type: 'supporting'},
    children: 'Helper text',
    references: [],
  },
  {
    name: 'Text display type as h1',
    component: 'Text',
    props: {type: 'display-1', as: 'h1'},
    children: 'Hero',
    references: [],
  },
  {
    name: 'Text size, weight and color',
    component: 'Text',
    props: {size: '2xs', weight: 'bold', color: 'accent', as: 'p'},
    children: 'Callout',
    references: [],
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
    references: [],
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
    references: [],
  },
  {
    name: 'Text tooltip off without maxLines',
    component: 'Text',
    props: {hasTruncateTooltip: false},
    children: 'No clamp',
    references: [],
  },
  {
    name: 'Text maxLines 0 with the tooltip off',
    component: 'Text',
    props: {maxLines: 0, hasTruncateTooltip: false},
    children: 'No clamp',
    references: [],
  },
  {
    name: 'Text maxLines 3 with capsize and the tooltip off',
    component: 'Text',
    props: {maxLines: 3, hasCapsize: true, hasTruncateTooltip: false},
    children: 'Capsize removes the clamp',
    references: [],
  },
  {
    name: 'Heading',
    component: 'Heading',
    props: {level: 1},
    children: 'Title',
    references: [],
  },
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
    references: [],
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
    references: [],
  },
  {
    name: 'Heading maxLines 2 with the tooltip off',
    component: 'Heading',
    props: {level: 4, maxLines: 2, hasTruncateTooltip: false},
    children: 'Clipped heading',
    references: [],
  },
  // A clamp with the tooltip off: only the scope that a nested Link reads.
  {
    name: 'Text maxLines 2 with the tooltip off',
    component: 'Text',
    props: {maxLines: 2, hasTruncateTooltip: false},
    children: 'Clipped by CSS',
    references: [TEXT_CLAMP_SCOPE],
  },
  {
    name: 'Text maxLines 1 with the tooltip off and a nested Link',
    component: 'Text',
    props: {maxLines: 1, hasTruncateTooltip: false},
    children: {link: 'Read the guide'},
    references: [LINK, TEXT_CLAMP_SCOPE],
  },
  {
    name: 'Text with a nested Link',
    component: 'Text',
    props: {},
    children: {link: 'Read the guide'},
    references: [LINK],
  },
  // An explicit `maxLines` with the tooltip on: the truncation part.
  {
    name: 'Text maxLines 0',
    component: 'Text',
    props: {maxLines: 0},
    children: 'Short',
    references: [TRUNCATABLE_TEXT],
  },
  {
    name: 'Text maxLines 1',
    component: 'Text',
    props: {maxLines: 1},
    children: 'One line',
    references: [TRUNCATABLE_TEXT],
  },
  {
    name: 'Text maxLines 3 with placement',
    component: 'Text',
    props: {maxLines: 3, hasTruncateTooltip: 'below', as: 'p'},
    children: {tag: 'strong', text: 'Three lines'},
    references: [TRUNCATABLE_TEXT],
  },
  {
    name: 'Text maxLines 3 with capsize',
    component: 'Text',
    props: {maxLines: 3, hasCapsize: true, className: 'caller'},
    children: 'Capsize block',
    references: [TRUNCATABLE_TEXT],
  },
  {
    name: 'Text maxLines 2 with a nested Link',
    component: 'Text',
    props: {maxLines: 2},
    children: {link: 'Read the guide'},
    references: [LINK, TRUNCATABLE_TEXT],
  },
  {
    name: 'Heading maxLines 1',
    component: 'Heading',
    props: {level: 2, maxLines: 1, 'data-testid': 'title'},
    children: 'A long title',
    references: [TRUNCATABLE_TEXT],
  },
  {
    name: 'Heading maxLines 0',
    component: 'Heading',
    props: {level: 5, maxLines: 0, accessibilityLevel: 3},
    children: 'Untruncated',
    references: [TRUNCATABLE_TEXT],
  },
];

function element(
  react: typeof ReactModule,
  types: {Text: unknown; Heading: unknown; Link: unknown},
  {component, props, children}: Case,
) {
  let child: ReactModule.ReactNode;
  if (typeof children === 'string') {
    child = children;
  } else if ('link' in children) {
    child = react.createElement(
      types.Link as never,
      {href: '/guide'} as never,
      children.link,
    );
  } else {
    child = react.createElement(children.tag, null, children.text);
  }
  return react.createElement(types[component] as never, props as never, child);
}

const serverElement = (testCase: Case) =>
  element(
    ServerReact,
    {Text: ServerText, Heading: ServerHeading, Link: ServerLink},
    testCase,
  );

const clientElement = (testCase: Case) =>
  element(
    ClientReact,
    {Text: ClientText, Heading: ClientHeading, Link: ClientLink},
    testCase,
  );

const caseRows = (cases: Case[]) => cases.map(c => [c.name, c] as const);

/** The HTML that a server render of the case sends, before hydration. */
async function serverHtml(testCase: Case) {
  const {tree} = await resolveServerTree(serverElement(testCase));
  return {tree, html: renderToString(toClientElement(tree))};
}

/** Hydrate the server HTML of a case in a fresh container. */
async function hydrateCase(testCase: Case) {
  const {tree, html} = await serverHtml(testCase);
  const container = document.createElement('div');
  document.body.append(container);
  container.innerHTML = html;
  const errors: unknown[] = [];
  let root: ReactDOMClientModule.Root | undefined;
  await ClientReact.act(async () => {
    root = hydrateRoot(container, toClientElement(tree), {
      onRecoverableError: error => errors.push(error),
    });
  });
  const cleanup = async () => {
    await ClientReact.act(async () => root?.unmount());
    container.remove();
  };
  return {container, html, errors, cleanup};
}

/** Text overflows on one line; popovers open as no-ops in jsdom. */
function withOverflow() {
  const proto = window.HTMLElement.prototype;
  const original = {
    scrollWidth: Object.getOwnPropertyDescriptor(proto, 'scrollWidth'),
    offsetWidth: Object.getOwnPropertyDescriptor(proto, 'offsetWidth'),
    showPopover: proto.showPopover,
    hidePopover: proto.hidePopover,
  };
  Object.defineProperty(proto, 'scrollWidth', {
    configurable: true,
    get: () => 400,
  });
  Object.defineProperty(proto, 'offsetWidth', {
    configurable: true,
    get: () => 100,
  });
  proto.showPopover = vi.fn();
  proto.hidePopover = vi.fn();
  return () => {
    if (original.scrollWidth) {
      Object.defineProperty(proto, 'scrollWidth', original.scrollWidth);
    }
    if (original.offsetWidth) {
      Object.defineProperty(proto, 'offsetWidth', original.offsetWidth);
    }
    proto.showPopover = original.showPopover;
    proto.hidePopover = original.hidePopover;
  };
}

const byName = (name: string) => CASES.find(c => c.name === name)!;

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

  it.each(caseRows(CASES))(
    '%s references only its client parts, with serializable props',
    async (_name, testCase) => {
      const {references} = await resolveServerTree(serverElement(testCase));
      expect([...new Set(references)].sort()).toEqual(
        [...testCase.references].sort(),
      );
    },
  );

  it.each(caseRows(CASES))(
    '%s renders the same HTML as the client render',
    async (_name, testCase) => {
      const {tree} = await resolveServerTree(serverElement(testCase));
      const fromServer = renderToStaticMarkup(
        ClientReact.createElement(ClientReact.Fragment, null, [
          toClientElement(tree),
        ]),
      );
      const fromClient = renderToStaticMarkup(clientElement(testCase));
      expect(fromServer).not.toBe('');
      expect(fromServer).toBe(fromClient);
    },
  );

  it.each(caseRows(CASES))(
    '%s hydrates the server HTML with no mismatch',
    async (_name, testCase) => {
      const {container, html, errors, cleanup} = await hydrateCase(testCase);
      try {
        expect(errors).toEqual([]);
        expect(container.innerHTML).toBe(html);
        expect(html).toBe(renderToString(clientElement(testCase)));
      } finally {
        await cleanup();
      }
    },
  );

  // The first paint is the server HTML. Hydration, the truncation
  // measurement and the Tooltip module load must not change or replace any
  // node; only a hover, tap or focus mounts the tooltip.
  it.each([
    ['Text', 'Text'],
    ['Heading', 'Heading'],
    ['Text with the truncation tooltip', 'Text maxLines 1'],
    ['Heading with the truncation tooltip', 'Heading maxLines 1'],
    [
      'clamped Text with the tooltip off',
      'Text maxLines 2 with the tooltip off',
    ],
  ])('%s keeps its first frame through hydration', async (_label, name) => {
    const testCase = byName(name);
    const restore = withOverflow();
    let cleanup = async () => {};
    try {
      const hydrated = await hydrateCase(testCase);
      const {container, html, errors} = hydrated;
      cleanup = hydrated.cleanup;
      const firstFrame = [...container.querySelectorAll('*')];
      // Let the measurement and a lazily loaded tooltip settle.
      await ClientReact.act(async () => {
        await new Promise(resolve => setTimeout(resolve, 300));
      });
      expect(errors).toEqual([]);
      expect(container.innerHTML).toBe(html);
      const finalFrame = [...container.querySelectorAll('*')];
      expect(finalFrame).toHaveLength(firstFrame.length);
      finalFrame.forEach((node, index) => {
        expect(node).toBe(firstFrame[index]);
      });
      expect(document.querySelector('[role="tooltip"]')).toBeNull();
      if (testCase.references.includes(TRUNCATABLE_TEXT)) {
        // The text was measured as truncated: the first hover mounts the
        // tooltip on the same element.
        const text = container.firstElementChild!;
        fireEvent.pointerEnter(text, {pointerType: 'mouse'});
        await waitFor(() => {
          expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
        });
        expect(container.firstElementChild).toBe(firstFrame[0]);
      }
    } finally {
      await cleanup();
      restore();
    }
  });
});
