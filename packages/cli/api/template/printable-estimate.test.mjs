// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Focused contract tests for the printable-estimate page template
 * @input Reads the shipped single-file template and its authored metadata
 * @output Guards the print rules: page size, screen-only parts, page breaks,
 *   printed separators and light colors on paper
 * @position CLI template regression coverage; runs in the node test project
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {doc} from '../../assets/templates/pages/printable-estimate/template.doc.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.resolve(
    dirname,
    '../../assets/templates/pages/printable-estimate/page.tsx',
  ),
  'utf8',
);
const printBlock = source.match(/@media print \{([\s\S]*?)\n\}\n`;/)?.[1] ?? '';

describe('printable estimate template contract', () => {
  it('is a ready page template in the printable document category', () => {
    expect(doc.type).toBe('page');
    expect(doc.isReady).toBe(true);
    expect(doc.category).toBe('Content - Printable Document');
  });

  it('sets the printed page size from the paper control, for Letter and A4', () => {
    expect(source).toContain("size: 'letter'");
    expect(source).toContain("size: 'A4'");
    expect(source).toContain('size: ${PAPER[paper].size};');
    expect(source).toContain('margin: ${PAGE_MARGIN};');
    expect(source).toContain('<style>{printCss(paper)}</style>');
  });

  it('hides the screen toolbar and the sheet frame in print', () => {
    expect(printBlock).toMatch(/\.estimate-screen-only \{\s*display: none/);
    expect(printBlock).toMatch(/\.estimate-sheet \{[^}]*box-shadow: none/);
    expect(source).toContain('className="estimate-screen-only"');
    expect(source).toContain('onClick={() => window.print()}');
  });

  it('prints with light colors under a dark theme', () => {
    expect(printBlock).toMatch(/\.estimate-sheet \{[^}]*color-scheme: light/);
  });

  it('prints separators, which draw with a fill', () => {
    expect(printBlock).toMatch(
      /\[role='separator'\] \{\s*print-color-adjust: exact;/,
    );
  });

  it('keeps rows and blocks whole across page breaks', () => {
    expect(printBlock).toMatch(
      /\.estimate-sheet tr,\s*\.estimate-keep-together \{\s*break-inside: avoid/,
    );
    expect(source).toContain('className="estimate-keep-together"');
  });

  it('keeps totals out of the table footer, which repeats on every page', () => {
    expect(source).not.toContain('TableFooter');
  });

  it('renders the document in normal flow, not a fixed-height frame', () => {
    expect(source).not.toContain('height="fill"');
    expect(source).not.toMatch(/<Layout[\s>]/);
  });

  it('puts no status in a Badge, whose fill does not print', () => {
    expect(source).not.toContain('@astryxdesign/core/Badge');
  });
});
