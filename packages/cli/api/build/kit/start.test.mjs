// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The app shell a part or an edit starts from when the catalog holds a
 * ready Shell variant besides the default shell. A Shell-family template that
 * is ready and shown in the gallery can be the app shell, so these cases pin
 * that build keeps the default shell for ideas that name no shell, and picks
 * the variant only for an idea that describes it.
 */

import {describe, expect, it} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadTemplates} from '../_adapter.mjs';
import {rankPages} from './rank.mjs';
import {chooseStart} from './start.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
);

/** The shipped catalog plus a ready, shown messaging Shell variant. */
async function catalogWithShellVariant() {
  const pages = (await loadTemplates(REPO)).pages;
  const frame = /** @type {(typeof pages)[number]} */ (
    pages.find(t => t.name === 'shell-side-nav')
  );
  return [
    ...pages,
    {
      ...frame,
      name: 'messaging-shell',
      displayName: 'Messaging Shell',
      category: 'Shell - Messaging',
      keywords: ['messaging', 'inbox', 'conversations'],
      description:
        'An app frame for a messaging product: a conversation list beside a message thread and a composer.',
    },
  ];
}

/**
 * @param {string} idea
 * @param {'part' | 'edit'} kind
 * @param {Awaited<ReturnType<typeof catalogWithShellVariant>>} catalog
 */
const startOf = (idea, kind, catalog) =>
  chooseStart(rankPages(idea, catalog), kind, [], false, catalog, idea)?.name;

describe('the default app shell with a ready Shell variant in the catalog', () => {
  it('keeps the default shell for a part that names no shell', async () => {
    const catalog = await catalogWithShellVariant();
    expect(startOf('a date range picker', 'part', catalog)).toBe(
      'shell-top-nav',
    );
  });

  it('keeps the default shell for an edit that names no shell', async () => {
    const catalog = await catalogWithShellVariant();
    expect(
      startOf('add a filter bar to my existing page', 'edit', catalog),
    ).toBe('shell-top-nav');
  });

  it('picks the variant for a part that describes it', async () => {
    const catalog = await catalogWithShellVariant();
    expect(startOf('a reply box in a messaging shell', 'part', catalog)).toBe(
      'messaging-shell',
    );
  });
});
