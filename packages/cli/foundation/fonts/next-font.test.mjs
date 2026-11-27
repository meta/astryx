// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {nextFontFix, rootLayoutImportsNextFont} from './next-font.mjs';

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-next-font-'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name": "app"}\n');
});
afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string} name @param {string} source */
function write(name, source) {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, source);
}

const layout = from =>
  `import {Geist} from '${from}';\nconst geist = Geist({subsets: ['latin'], variable: '--font-geist-sans'});\nexport default function RootLayout({children}) {\n  return <html className={geist.variable}><body>{children}</body></html>;\n}\n`;

describe('rootLayoutImportsNextFont', () => {
  it('is true when app/layout imports next/font/google', () => {
    write('app/layout.tsx', layout('next/font/google'));
    expect(rootLayoutImportsNextFont(dir)).toBe(true);
  });

  it('is true when src/app/layout imports next/font/local', () => {
    write(
      'src/app/layout.js',
      "import localFont from 'next/font/local';\nconst geist = localFont({src: './Geist.woff2', variable: '--font-geist-sans'});\nexport default function RootLayout({children}) {\n  return <html className={geist.variable}><body>{children}</body></html>;\n}\n",
    );
    expect(rootLayoutImportsNextFont(dir)).toBe(true);
  });

  it("is true when the root layout imports one of the geist package's next/font entries", () => {
    write(
      'app/layout.tsx',
      layout('geist/font/sans').replace('{Geist}', '{GeistSans}'),
    );
    expect(rootLayoutImportsNextFont(dir)).toBe(true);
  });

  it("reads the project's root layout from a folder inside the project", () => {
    write('app/layout.tsx', layout('next/font/google'));
    fs.mkdirSync(path.join(dir, 'src/themes'), {recursive: true});
    expect(rootLayoutImportsNextFont(path.join(dir, 'src/themes'))).toBe(true);
  });

  it('is false for a mention in a comment or a string', () => {
    write(
      'app/layout.tsx',
      "// import {Geist} from 'next/font/google';\nconst note = 'next/font/local';\nexport default function RootLayout({children}) {\n  return <html><body>{children}</body></html>;\n}\n",
    );
    expect(rootLayoutImportsNextFont(dir)).toBe(false);
  });

  it('is false for another next module, and with no root layout', () => {
    expect(rootLayoutImportsNextFont(dir)).toBe(false);
    write(
      'app/layout.tsx',
      'import Link from \'next/link\';\nexport default function RootLayout({children}) {\n  return <html><body><Link href="/">Home</Link>{children}</body></html>;\n}\n',
    );
    expect(rootLayoutImportsNextFont(dir)).toBe(false);
  });

  it('is false for a layout that does not parse', () => {
    write('app/layout.tsx', `${layout('next/font/google')}\n<<<`);
    expect(rootLayoutImportsNextFont(dir)).toBe(false);
  });
});

describe('nextFontFix', () => {
  it('names the CSS variable fix and the recipe', () => {
    expect(nextFontFix('astryx docs font-setup')).toBe(
      "This app loads fonts with next/font, which loads each family under a name of its own: set the theme's font family to the font's CSS variable, for example family: 'var(--font-geist-sans)' (recipe: astryx docs font-setup)",
    );
  });
});
