// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The app shell a part or an edit starts from when the messaging shell,
 * a Shell-family template, is ready and shown in the gallery. Build may then
 * start from it, so these cases pin that a part or an edit whose words the
 * messaging shell does not use keeps the default shell, while one that names
 * what the messaging shell is made of may start from it.
 */

import {describe, expect, it} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadTemplates} from '../_adapter.mjs';
import {doc as messagingShell} from '../../../assets/templates/pages/messaging-shell/template.doc.mjs';
import {rankPages} from './rank.mjs';
import {chooseStart} from './start.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
);

/**
 * The shipped catalog plus the messaging shell as if it were ready and shown,
 * read from its own template doc.
 */
async function catalogWithMessagingShell() {
  const pages = (await loadTemplates(REPO)).pages;
  const frame = /** @type {(typeof pages)[number]} */ (
    pages.find(t => t.name === 'shell-side-nav')
  );
  return [
    ...pages,
    {
      ...frame,
      name: 'messaging-shell',
      displayName: messagingShell.displayName ?? messagingShell.name,
      description: messagingShell.description ?? '',
      category: messagingShell.category ?? '',
      keywords: messagingShell.keywords ?? [],
      hidden: false,
    },
  ];
}

/**
 * @param {string} idea
 * @param {'part' | 'edit'} kind
 * @param {Awaited<ReturnType<typeof catalogWithMessagingShell>>} catalog
 */
const startOf = (idea, kind, catalog) =>
  chooseStart(rankPages(idea, catalog), kind, [], false, catalog, idea)?.name;

describe('the default app shell with the messaging shell ready', () => {
  it('keeps the default shell for a part whose words it does not use', async () => {
    const catalog = await catalogWithMessagingShell();
    expect(startOf('a date range picker', 'part', catalog)).toBe(
      'shell-top-nav',
    );
    expect(startOf('a file upload field', 'part', catalog)).toBe(
      'shell-top-nav',
    );
  });

  it('keeps the default shell for an edit whose words it does not use', async () => {
    const catalog = await catalogWithMessagingShell();
    expect(
      startOf('add a filter bar to my existing dashboard', 'edit', catalog),
    ).toBe('shell-top-nav');
  });

  it('may start a part that names what it is made of from it', async () => {
    const catalog = await catalogWithMessagingShell();
    expect(startOf('a direct message list', 'part', catalog)).toBe(
      'messaging-shell',
    );
  });
});
