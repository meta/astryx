// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {execFileSync} from 'node:child_process';
import nodeModule from 'node:module';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import {
  findPresentFiles,
  importThemeArtifact,
  importUserModule,
  loadModuleWithParser,
} from './module-loader.mjs';
import {importUrl} from './import-url.mjs';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';

// Node runs module hooks in the loading thread from 22.15. On an older Node
// the CLI supports (its oldest is 22.13), a theme module load matches a
// stylesheet import by its text, from the theme module's folder, as the
// fallback case below shows.
const hasModuleHooks =
  typeof (/** @type {any} */ (nodeModule).registerHooks) === 'function';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-module-loader-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('findPresentFiles', () => {
  const basenames = ['a.ts', 'b.mjs', 'c.js'];

  it('returns [] when none of the basenames are present', () => {
    expect(findPresentFiles(tmpDir, basenames)).toEqual([]);
  });

  it('returns only the present files, in basenames precedence order', () => {
    // Create out of order to prove the result follows `basenames`, not disk order.
    fs.writeFileSync(path.join(tmpDir, 'c.js'), '');
    fs.writeFileSync(path.join(tmpDir, 'a.ts'), '');
    const present = findPresentFiles(tmpDir, basenames);
    expect(present.map(p => path.basename(p))).toEqual(['a.ts', 'c.js']);
  });

  it('returns absolute paths joined to the given directory', () => {
    fs.writeFileSync(path.join(tmpDir, 'b.mjs'), '');
    const present = findPresentFiles(tmpDir, basenames);
    expect(present).toEqual([path.join(tmpDir, 'b.mjs')]);
    expect(path.isAbsolute(present[0])).toBe(true);
  });

  it('does not match files in nested subdirectories', () => {
    const nested = path.join(tmpDir, 'nested');
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(nested, 'a.ts'), '');
    expect(findPresentFiles(tmpDir, basenames)).toEqual([]);
  });
});

describe('importUserModule', () => {
  it('imports a .mjs file and returns its module namespace', async () => {
    const file = path.join(tmpDir, 'mod.mjs');
    fs.writeFileSync(
      file,
      `export default {answer: 42};\nexport const named = 'hi';\n`,
    );
    const mod = await importUserModule(file);
    expect(mod.default).toEqual({answer: 42});
    expect(mod.named).toBe('hi');
  });

  it.each(['mjs', 'js', 'ts'])(
    'freshly reloads a changed .%s module while normal loading stays cached',
    async extension => {
      const file = path.join(tmpDir, `fresh.${extension}`);
      fs.writeFileSync(file, `export default {answer: 1};\n`);
      const first = await importUserModule(file);
      expect(first.default).toEqual({answer: 1});

      fs.writeFileSync(file, `export default {answer: 2};\n`);
      const fresh = await importUserModule(file, {fresh: true});
      expect(fresh.default).toEqual({answer: 2});
    },
  );

  const probeFreshJavaScript = (
    dir,
    firstSource,
    secondSource,
    name = 'fresh.js',
  ) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, firstSource);
    const loaderUrl = pathToFileURL(
      path.join(process.cwd(), 'packages/cli/foundation/fs/module-loader.mjs'),
    ).href;
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import fs from 'node:fs';
import {importUserModule} from ${JSON.stringify(loaderUrl)};
const first = await importUserModule(process.env.TEST_MODULE);
fs.writeFileSync(process.env.TEST_MODULE, ${JSON.stringify(secondSource)});
const fresh = await importUserModule(process.env.TEST_MODULE, {fresh: true});
const sameExports = Object.keys(first).sort().join() === Object.keys(fresh).sort().join();
process.stdout.write(JSON.stringify({first: first.default?.answer, fresh: fresh.default?.answer, sameExports}));`,
      ],
      {
        encoding: 'utf-8',
        env: {...process.env, TEST_MODULE: file},
      },
    );
    return JSON.parse(output);
  };

  it('freshly reloads a changed CommonJS .js module in a real Node process', () => {
    const commonjsDir = path.join(tmpDir, 'commonjs');
    fs.mkdirSync(commonjsDir);
    fs.writeFileSync(
      path.join(commonjsDir, 'package.json'),
      JSON.stringify({type: 'commonjs'}),
    );
    expect(
      probeFreshJavaScript(
        commonjsDir,
        `module.exports = {answer: 1};\n`,
        `module.exports = {answer: 2};\n`,
      ),
    ).toEqual({first: 1, fresh: 2, sameExports: true});
  });

  it('freshly reloads a changed ESM .js module in a real Node process', () => {
    const esmDir = path.join(tmpDir, 'esm');
    fs.mkdirSync(esmDir);
    fs.writeFileSync(
      path.join(esmDir, 'package.json'),
      JSON.stringify({type: 'module'}),
    );
    expect(
      probeFreshJavaScript(
        esmDir,
        `export default {answer: 1};\n`,
        `export default {answer: 2};\n`,
      ),
    ).toEqual({first: 1, fresh: 2, sameExports: true});
  });

  it('freshly reloads a changed ES module .js in a package without a "type", in a real Node process', () => {
    const typelessDir = path.join(tmpDir, 'typeless');
    fs.mkdirSync(typelessDir);
    fs.writeFileSync(
      path.join(typelessDir, 'package.json'),
      JSON.stringify({name: 'typeless'}),
    );
    expect(
      probeFreshJavaScript(
        typelessDir,
        `export default {answer: 1};\n`,
        `export default {answer: 2};\n`,
      ),
    ).toEqual({first: 1, fresh: 2, sameExports: true});
  });

  it.each([
    [
      'fresh.cjs',
      `module.exports = {answer: 1};\n`,
      `module.exports = {answer: 2};\n`,
    ],
    [
      'fresh.mjs',
      `export default {answer: 1};\n`,
      `export default {answer: 2};\n`,
    ],
  ])(
    'freshly reloads a changed %s in a real Node process',
    (name, firstSource, secondSource) => {
      const kindDir = path.join(tmpDir, name.replace('.', '-'));
      fs.mkdirSync(kindDir);
      fs.writeFileSync(
        path.join(kindDir, 'package.json'),
        JSON.stringify({name: 'typeless'}),
      );
      expect(
        probeFreshJavaScript(kindDir, firstSource, secondSource, name),
      ).toEqual({first: 1, fresh: 2, sameExports: true});
    },
  );

  it.each([
    ['in a CommonJS package', {type: 'commonjs'}],
    ['in a package without a "type"', {name: 'typeless'}],
  ])(
    'reads one CommonJS module in two reads at once, first or fresh, %s, in a real Node process',
    (_where, packageJson) => {
      const dir = path.join(tmpDir, 'at-once');
      fs.mkdirSync(dir);
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify(packageJson),
      );
      const file = path.join(dir, 'm.js');
      const loaderUrl = pathToFileURL(
        path.join(
          process.cwd(),
          'packages/cli/foundation/fs/module-loader.mjs',
        ),
      ).href;
      const output = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import fs from 'node:fs';
import {importUserModule} from ${JSON.stringify(loaderUrl)};
const file = process.env.TEST_MODULE;
const read = async reads => {
  try {
    return (await Promise.all(reads())).map(mod => mod.default.answer).join();
  } catch (error) {
    return error.code ?? error.name;
  }
};
fs.writeFileSync(file, 'module.exports = {answer: 1};\\n');
const firstAndFresh = await read(() => [importUserModule(file), importUserModule(file, {fresh: true})]);
fs.writeFileSync(file, 'module.exports = {answer: 2};\\n');
const twoFresh = await read(() => [importUserModule(file, {fresh: true}), importUserModule(file, {fresh: true})]);
const target = file.replace(/m\\.js$/, 'target.js');
const link = file.replace(/m\\.js$/, 'link.js');
fs.writeFileSync(target, 'module.exports = {answer: 3};\\n');
fs.symlinkSync(target, link);
const linkAndTarget = await read(() => [importUserModule(link), importUserModule(target, {fresh: true})]);
process.stdout.write(JSON.stringify({firstAndFresh, twoFresh, linkAndTarget}));`,
        ],
        {encoding: 'utf-8', env: {...process.env, TEST_MODULE: file}},
      );
      expect(JSON.parse(output)).toEqual({
        firstAndFresh: '1,1',
        twoFresh: '2,2',
        linkAndTarget: '3,3',
      });
    },
  );

  it('defaults .js to CommonJS when no package.json exists', () => {
    const noPackageDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-commonjs-no-package-'),
    );
    try {
      expect(
        probeFreshJavaScript(
          noPackageDir,
          `module.exports = {answer: 1};\n`,
          `module.exports = {answer: 2};\n`,
        ),
      ).toEqual({first: 1, fresh: 2, sameExports: true});
    } finally {
      fs.rmSync(noPackageDir, {recursive: true, force: true});
    }
  });
});

describe('importThemeArtifact', () => {
  const STYLESHEET_RAN = '__astryxThemeArtifactStylesheetRan';

  /** @param {string} file @param {string} content */
  function write(file, content) {
    const target = path.join(tmpDir, file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, content);
  }

  beforeEach(() => {
    write('package.json', JSON.stringify({type: 'module'}));
    write(
      'ocean.css',
      '[data-astryx-theme="ocean"] { --color-text: black; }\n',
    );
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, STYLESHEET_RAN);
  });

  it('loads a built module that imports its stylesheet, without running the stylesheet', async () => {
    // Valid JavaScript, so running this stylesheet would leave a trace.
    write('ran.css', `globalThis.${STYLESHEET_RAN} = true;\n`);
    write(
      'ocean.js',
      "import './ocean.css';\nimport './ran.css';\nexport const oceanTheme = {name: 'ocean'};\n",
    );

    const mod = await importThemeArtifact('./ocean.js', tmpDir);

    expect(mod.oceanTheme).toEqual({name: 'ocean'});
    expect(Reflect.get(globalThis, STYLESHEET_RAN)).toBeUndefined();
  });

  it('loads a CommonJS built module that requires its stylesheet', async () => {
    write('commonjs/package.json', JSON.stringify({type: 'commonjs'}));
    write(
      'commonjs/ocean.css',
      '[data-astryx-theme="ocean"] { --color-text: black; }\n',
    );
    write(
      'commonjs/ocean.js',
      "require('./ocean.css');\nexports.oceanTheme = {name: 'ocean'};\n",
    );

    const mod = await importThemeArtifact('./commonjs/ocean.js', tmpDir);

    expect(mod.oceanTheme).toEqual({name: 'ocean'});
  });

  it('loads stylesheets imported by a nested module, through a package export, and dynamically', async () => {
    const packageDir = 'node_modules/@acme/themes';
    write(
      `${packageDir}/package.json`,
      JSON.stringify({
        name: '@acme/themes',
        type: 'module',
        exports: {
          './themes/ocean': './dist/ocean.js',
          './themes/ocean.css': './dist/ocean.css',
        },
      }),
    );
    write(
      `${packageDir}/dist/ocean.css`,
      '[data-astryx-theme="ocean"] { --color-text: black; }\n',
    );
    write(
      `${packageDir}/dist/tokens.js`,
      "import '@acme/themes/themes/ocean.css';\nexport const tokens = {};\n",
    );
    write(
      `${packageDir}/dist/ocean.js`,
      "import {tokens} from './tokens.js';\nawait import('./ocean.css');\nexport const oceanTheme = {name: 'ocean', tokens};\n",
    );

    const mod = await importThemeArtifact('@acme/themes/themes/ocean', tmpDir);

    expect(mod.oceanTheme).toEqual({name: 'ocean', tokens: {}});
  });

  it('still resolves an extensionless import to its directory index beside a same-named stylesheet', async () => {
    write('ocean/index.js', "export const oceanTheme = {name: 'ocean'};\n");
    write(
      'entry.js',
      "import './ocean.css';\nexport {oceanTheme} from './ocean';\n",
    );

    const mod = await importThemeArtifact('./entry.js', tmpDir);

    expect(mod.oceanTheme).toEqual({name: 'ocean'});
  });

  it('loads a module whose import ends in .css but names a JavaScript file', async () => {
    write('tokens.css.js', "export const vars = {accent: 'blue'};\n");
    write(
      'ocean.js',
      "import './ocean.css';\nimport {vars} from './tokens.css';\nexport const oceanTheme = {name: 'ocean', vars};\n",
    );

    const mod = await importThemeArtifact('./ocean.js', tmpDir);

    expect(mod.oceanTheme).toEqual({name: 'ocean', vars: {accent: 'blue'}});
  });

  it.each([
    ['a missing file', "import './fonts.css';\n", /fonts\.css/],
    [
      'a package that is not installed',
      "import '@acme/missing-fonts/inter.css';\n",
      /@acme\/missing-fonts\/inter\.css/,
    ],
  ])(
    'still rejects a stylesheet import of %s',
    async (_label, stylesheetImport, expected) => {
      write(
        'ocean.js',
        `import './ocean.css';\n${stylesheetImport}export const oceanTheme = {name: 'ocean'};\n`,
      );

      await expect(importThemeArtifact('./ocean.js', tmpDir)).rejects.toThrow(
        expected,
      );
    },
  );

  it('still rejects a theme module path that names a stylesheet', async () => {
    await expect(importThemeArtifact('./ocean.css', tmpDir)).rejects.toThrow(
      /Unknown file extension "\.css"/,
    );
  });

  it('still rejects a stylesheet import that its package does not export', async () => {
    const packageDir = 'node_modules/@acme/themes';
    write(
      `${packageDir}/package.json`,
      JSON.stringify({
        name: '@acme/themes',
        type: 'module',
        exports: {'./themes/ocean': './dist/ocean.js'},
      }),
    );
    write(
      `${packageDir}/dist/ocean.css`,
      '[data-astryx-theme="ocean"] { --color-text: black; }\n',
    );
    write(
      `${packageDir}/dist/ocean.js`,
      "import '@acme/themes/themes/ocean.css';\nexport const oceanTheme = {name: 'ocean'};\n",
    );

    await expect(
      importThemeArtifact('@acme/themes/themes/ocean', tmpDir),
    ).rejects.toThrow(/not defined by "exports"/);
  });

  it.each([
    [
      'a missing dependency',
      "import './missing.js';\nexport const oceanTheme = {name: 'ocean'};\n",
      /missing\.js/,
    ],
    [
      'a syntax error in a module it imports',
      "import './broken.js';\nexport const oceanTheme = {name: 'ocean'};\n",
      /ParseError/,
    ],
    [
      'a throwing module',
      "throw new Error('broken theme module');\n",
      /broken theme module/,
    ],
    [
      'an asset that is not a stylesheet',
      "import './logo.svg';\nexport const oceanTheme = {name: 'ocean'};\n",
      /Unknown file extension "\.svg"/,
    ],
  ])(
    'still rejects a built module that imports its stylesheet and has %s',
    async (_label, rest, expected) => {
      write('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
      write('broken.js', 'export const broken = ;\n');
      write('ocean.js', `import './ocean.css';\n${rest}`);

      await expect(importThemeArtifact('./ocean.js', tmpDir)).rejects.toThrow(
        expected,
      );
    },
  );

  describe('a stylesheet that a package module imports from its own folder', () => {
    const packageDir = 'node_modules/@acme/brand';

    /**
     * A package whose `./themes/<slug>` entry imports a stylesheet by a path
     * relative to itself, in another folder than the built module that
     * imports the entry.
     * @param {string} stylesheet the stylesheet import the entry writes
     */
    function writeStyledPackage(stylesheet) {
      write(
        `${packageDir}/package.json`,
        JSON.stringify({
          name: '@acme/brand',
          type: 'module',
          exports: {'./themes/brand': './dist/themes/brand.mjs'},
        }),
      );
      write(
        `${packageDir}/dist/Theme/brand-theme.mjs`,
        "export const brandTheme = {name: 'brand'};\n",
      );
      write(
        `${packageDir}/dist/themes/brand.mjs`,
        `import '${stylesheet}';\nexport {brandTheme} from '../Theme/brand-theme.mjs';\n`,
      );
      write(
        'built.js',
        "import {brandTheme} from '@acme/brand/themes/brand';\nexport const builtTheme = {name: 'built', base: brandTheme.name};\n",
      );
    }

    it.skipIf(!hasModuleHooks)('loads it without running it', async () => {
      writeStyledPackage('../Theme/brand.css');
      write(
        `${packageDir}/dist/Theme/brand.css`,
        `globalThis.${STYLESHEET_RAN} = true;\n`,
      );

      const mod = await importThemeArtifact('./built.js', tmpDir);

      expect(mod.builtTheme).toEqual({name: 'built', base: 'brand'});
      expect(Reflect.get(globalThis, STYLESHEET_RAN)).toBeUndefined();
    });

    it.skipIf(!hasModuleHooks)(
      "rejects it when it is missing beside the module, though the path exists from the theme module's folder",
      async () => {
        writeStyledPackage('./fonts.css');
        write('fonts.css', 'body { font-family: serif; }\n');

        await expect(importThemeArtifact('./built.js', tmpDir)).rejects.toThrow(
          /fonts\.css/,
        );
      },
    );

    it.skipIf(!hasModuleHooks)(
      'leaves a stylesheet that a module loaded at the same time outside the theme load imports failing',
      async () => {
        writeStyledPackage('../Theme/brand.css');
        write(`${packageDir}/dist/Theme/brand.css`, 'body {}\n');
        write('elsewhere/package.json', JSON.stringify({type: 'module'}));
        write('elsewhere/page.css', 'body {}\n');
        write(
          'elsewhere/page.js',
          "import './page.css';\nexport const page = 1;\n",
        );

        const [theme, outside] = await Promise.allSettled([
          importThemeArtifact('./built.js', tmpDir),
          importUrl(pathToFileURL(path.join(tmpDir, 'elsewhere/page.js')).href),
        ]);

        expect(theme.status).toBe('fulfilled');
        expect(outside).toMatchObject({
          status: 'rejected',
          reason: {code: 'ERR_UNKNOWN_FILE_EXTENSION'},
        });
      },
    );

    it.skipIf(hasModuleHooks)(
      'fails on a Node without module hooks, naming the stylesheet',
      async () => {
        writeStyledPackage('../Theme/brand.css');
        write(`${packageDir}/dist/Theme/brand.css`, 'body {}\n');

        await expect(importThemeArtifact('./built.js', tmpDir)).rejects.toThrow(
          /Unknown file extension "\.css".*brand\.css/,
        );
      },
    );
  });
});

describe('loadModuleWithParser', () => {
  // Temp module files live under a repo-local dir (not /tmp): Vite's dynamic
  // import blocks /tmp, so we mirror the existing repo-local temp pattern.
  const schema = z
    .object({
      name: z.string(),
      count: z.number().optional(),
    })
    .strict();

  /**
   * A stand-in authoring parser: validates via a sealed schema and, on failure,
   * throws the same `<label> is invalid: …` line the real parsers throw. Zod
   * stays inside the parser — `loadModuleWithParser` never sees it.
   * @param {unknown} input
   * @param {string} [label]
   */
  function parse(input, label = 'value') {
    const result = schema.safeParse(input);
    if (!result.success) {
      const issues = result.error.issues
        .map(i => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
        .join('; ');
      throw new Error(`${label} is invalid: ${issues}`);
    }
    return result.data;
  }

  it('returns the parsed default export when it satisfies the parser', async () => {
    const file = path.join(tmpDir, 'valid.mjs');
    fs.writeFileSync(file, `export default {name: 'ok', count: 3};\n`);
    const value = await loadModuleWithParser(file, parse, {label: 'thing'});
    expect(value).toEqual({name: 'ok', count: 3});
  });

  it('throws a readable error when there is no default export', async () => {
    const file = path.join(tmpDir, 'no-default.mjs');
    fs.writeFileSync(file, `export const named = {name: 'x'};\n`);
    await expect(
      loadModuleWithParser(file, parse, {label: 'thing'}),
    ).rejects.toThrow(/thing is invalid/i);
  });

  it('throws a readable error when the default export fails the parser', async () => {
    const file = path.join(tmpDir, 'invalid.mjs');
    fs.writeFileSync(file, `export default {count: 'not-a-number'};\n`);
    await expect(
      loadModuleWithParser(file, parse, {label: 'thing'}),
    ).rejects.toThrow(/thing is invalid:.*name/i);
  });

  it('falls back to the file path in the message when no label is given', async () => {
    const file = path.join(tmpDir, 'unlabeled.mjs');
    fs.writeFileSync(file, `export default {bogus: true};\n`);
    await expect(loadModuleWithParser(file, parse)).rejects.toThrow(
      new RegExp(`${path.basename(file)} is invalid`),
    );
  });
});
