// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file headingLinks.ssr.test.tsx
 * @input Markdown server markup and React hydration
 * @output Proves heading fragments are deterministic across instances and hydration
 * @position SSR acceptance test for module:Markdown/headingLinks
 */

import {act} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {Markdown} from '../Markdown';
import {createMarkdownPlugin} from './protocol';
import type {MarkdownPluginEntry} from './protocol';

const SOURCE = '# Overview\n\n> ## Details';

afterEach(() => {
  document.body.replaceChildren();
});

describe('Markdown heading links — SSR', () => {
  it('keeps duplicate-copy ids and buttons stable across SSR and hydration', async () => {
    vi.resetModules();
    const duplicateCore = await import('./headingLinks');
    const articleAHeadingLinks = duplicateCore.createMarkdownHeadingLinks({
      headingIdPrefix: 'article-a',
    });
    const articleBHeadingLinks = duplicateCore.createMarkdownHeadingLinks({
      headingIdPrefix: 'article-b',
    });
    const tree = (
      <>
        <Markdown id="article-a" plugins={[articleAHeadingLinks]}>
          {SOURCE}
        </Markdown>
        <Markdown id="article-b" plugins={[articleBHeadingLinks]}>
          {SOURCE}
        </Markdown>
      </>
    );
    const serverHTML = renderToString(tree);
    expect(serverHTML).toContain('id="article-a--overview"');
    expect(serverHTML).toContain('id="article-b--overview"');
    expect(serverHTML).toContain('aria-label="Copy link to Details"');
    expect(serverHTML).not.toContain('href="#article-');

    const container = document.createElement('div');
    container.innerHTML = serverHTML;
    document.body.appendChild(container);
    const before = Array.from(container.querySelectorAll('h1,h2')).map(
      heading => heading.id,
    );

    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const recoverableErrors: unknown[] = [];
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, tree, {
        onRecoverableError: error => recoverableErrors.push(error),
      });
    });

    expect(
      consoleError.mock.calls.filter(call =>
        String(call[0] ?? '')
          .toLowerCase()
          .includes('hydrat'),
      ),
    ).toEqual([]);
    expect(recoverableErrors).toEqual([]);
    expect(
      Array.from(container.querySelectorAll('h1,h2')).map(
        heading => heading.id,
      ),
    ).toEqual(before);
    expect(new Set(before).size).toBe(before.length);

    await act(async () => {
      root.unmount();
    });
    consoleError.mockRestore();
  });

  it('fails soft across SSR and hydration for unsupported same-name entries', async () => {
    const missingConfig = createMarkdownPlugin({
      name: 'heading-links',
      apiVersion: 1,
      transform: root => root,
    });
    const malformed = Object.freeze({
      name: 'heading-links',
      apiVersion: 2,
    }) as unknown as MarkdownPluginEntry;
    const tree = (
      <Markdown plugins={[missingConfig, malformed]}>{SOURCE}</Markdown>
    );

    const serverHTML = renderToString(tree);
    const container = document.createElement('div');
    container.innerHTML = serverHTML;
    document.body.appendChild(container);
    const headings = container.querySelectorAll('h1,h2');
    expect(headings).toHaveLength(2);
    expect(headings[0]).toHaveAttribute('id', 'overview');
    expect(headings[1]).not.toHaveAttribute('id');
    expect(container.querySelector('button, a[href*="#"]')).toBeNull();

    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const recoverableErrors: unknown[] = [];
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, tree, {
        onRecoverableError: error => recoverableErrors.push(error),
      });
    });

    expect(recoverableErrors).toEqual([]);
    expect(
      consoleError.mock.calls.filter(call =>
        String(call[0] ?? '')
          .toLowerCase()
          .includes('hydrat'),
      ),
    ).toEqual([]);
    expect(
      Array.from(container.querySelectorAll('h1,h2')).map(heading =>
        heading.getAttribute('id'),
      ),
    ).toEqual(['overview', null]);

    await act(async () => {
      root.unmount();
    });
    consoleError.mockRestore();
  });
});
