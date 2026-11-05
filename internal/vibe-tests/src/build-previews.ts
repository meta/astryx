#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Build live preview pages from vibe test results
 *
 * Takes .tsx result files and builds each into a standalone HTML page
 * that renders the component. Supports Astryx, baseline, and raw HTML targets.
 *
 * Usage:
 *   tsx src/build-previews.ts --iterations 8734233a,d4ff8c2c,68ef2a62
 *   tsx src/build-previews.ts --iterations 8734233a --prompts tc-4
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  getResultsDir,
  ensureDir,
  readJson,
  writeJson,
  ensureTsxFiles,
} from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIBE_DIR = path.resolve(__dirname, '..');
const _APP_DIR = path.join(VIBE_DIR, 'app');
const REPO_ROOT = path.resolve(VIBE_DIR, '../..');

/**
 * Browser targets for lightningcss.
 * Prevents lowering native light-dark() into --lightningcss-light/--lightningcss-dark
 * polyfill variables. Astryx tokens use native light-dark() which is baseline 2024:
 * Chrome 123+, Firefox 120+, Safari 17.5+
 *
 * Must match the targets in apps/storybook/.storybook/main.ts and
 * internal/vibe-tests/app/vite.config.*.ts
 */
const LIGHTNINGCSS_TARGETS_JS = `{
  chrome: 123 << 16,
  firefox: 120 << 16,
  safari: (17 << 16) | (5 << 8),
}`;

/**
 * Fix missing Astryx component imports in AI-generated .tsx files.
 * Scans for Astryx* identifiers used in JSX that aren't imported,
 * and prepends the missing import. Returns list of auto-imported components.
 */
function fixMissingXDSImports(filePath: string): string[] {
  const code = fs.readFileSync(filePath, 'utf-8');
  const usedComponents = new Set<string>();
  const jsxPattern = /(?:<|jsxs?\(\s*)(XDS\w+)/g;
  let match;
  while ((match = jsxPattern.exec(code)) !== null) {
    usedComponents.add(match[1]);
  }
  if (usedComponents.size === 0) {
    return [];
  }
  const importedComponents = new Set<string>();
  const importPattern =
    /import\s*\{([^}]+)\}\s*from\s*['"]@astryxdesign\/core[^'"]*['"]/g;
  while ((match = importPattern.exec(code)) !== null) {
    for (const specifier of match[1].split(',')) {
      const name = specifier
        .trim()
        .split(/\s+as\s+/)[0]
        .trim();
      if (name.startsWith('XDS')) {
        importedComponents.add(name);
      }
    }
  }
  const missing = [...usedComponents].filter(c => !importedComponents.has(c));
  if (missing.length === 0) {
    return [];
  }
  const importLine = `import {${missing.sort().join(', ')}} from '@astryxdesign/core';\n`;
  fs.writeFileSync(filePath, importLine + code);
  return missing.sort();
}

/**
 * Validate a built preview HTML for unresolved Astryx component references.
 * Returns list of unresolved component names (empty if clean).
 */
function validatePreviewHtml(htmlPath: string): string[] {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const unresolved = new Set<string>();
  const pattern = /\.jsxs?\((XDS[A-Z]\w+)/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    unresolved.add(match[1]);
  }
  return [...unresolved].sort();
}

interface PreviewManifest {
  [promptId: string]: {
    [target: string]: string; // relative path to preview HTML
  };
}

function parseArgs(): {
  iterations: string[];
  prompts?: string[];
  outDir: string;
  tscOnly: boolean;
} {
  const args = process.argv.slice(2);
  let iterations: string[] = [];
  let prompts: string[] | undefined;
  let outDir = '';
  let tscOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--iterations' && args[i + 1]) {
      iterations = args[++i].split(',');
    } else if (args[i] === '--prompts' && args[i + 1]) {
      prompts = args[++i].split(',');
    } else if (args[i] === '--out' && args[i + 1]) {
      outDir = args[++i];
    } else if (args[i] === '--tsc-only') {
      tscOnly = true;
    }
  }

  if (iterations.length === 0) {
    console.error(
      'Usage: tsx src/build-previews.ts --iterations <id1,id2,...> [--prompts <p1,p2,...>] [--out <dir>]',
    );
    process.exit(1);
  }

  // Default output to first iteration's directory
  if (!outDir) {
    outDir = path.join(getResultsDir(), iterations[0], 'previews');
  }

  return {iterations, prompts, outDir, tscOnly};
}

/**
 * Create a temporary entry file that imports and renders the component
 */
function createEntryFile(
  componentPath: string,
  target: string,
  tmpDir: string,
): string {
  const entryPath = path.join(tmpDir, 'entry.tsx');

  // For Astryx and Astryx+Tailwind targets, wrap in theme provider and import reset
  if (target === 'astryx' || target === 'astryx-tailwind') {
    const tailwindImport =
      target === 'astryx-tailwind'
        ? `\nimport '${path.join(REPO_ROOT, 'packages/core/src/tailwind-theme.css').replace(/\\/g, '/')}';`
        : '';
    fs.writeFileSync(
      entryPath,
      `import React from 'react';
import {createRoot} from 'react-dom/client';
import '@astryxdesign/core/reset.css';${tailwindImport}
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme/neutral';
import Component from '${componentPath.replace(/\\/g, '/')}';

function App() {
  return (
    <Theme theme={neutralTheme} mode="light">
      <Component />
    </Theme>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
`,
    );
  } else {
    // Baseline and HTML: just render directly
    fs.writeFileSync(
      entryPath,
      `import React from 'react';
import {createRoot} from 'react-dom/client';
import Component from '${componentPath.replace(/\\/g, '/')}';

createRoot(document.getElementById('root')!).render(<Component />);
`,
    );
  }

  return entryPath;
}

/**
 * Create a minimal index.html for the preview
 */
function createIndexHtml(
  tmpDir: string,
  title: string,
  target: string,
): string {
  const htmlPath = path.join(tmpDir, 'index.html');

  // Baseline and astryx-tailwind previews need Tailwind CSS for styling
  const tailwindCdn =
    target === 'baseline' || target === 'astryx-tailwind'
      ? `\n  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root {
      --background: 0 0% 100%;
      --foreground: 222.2 84% 4.9%;
      --card: 0 0% 100%;
      --card-foreground: 222.2 84% 4.9%;
      --popover: 0 0% 100%;
      --popover-foreground: 222.2 84% 4.9%;
      --primary: 222.2 47.4% 11.2%;
      --primary-foreground: 210 40% 98%;
      --secondary: 210 40% 96.1%;
      --secondary-foreground: 222.2 47.4% 11.2%;
      --muted: 210 40% 96.1%;
      --muted-foreground: 215.4 16.3% 46.9%;
      --accent: 210 40% 96.1%;
      --accent-foreground: 222.2 47.4% 11.2%;
      --destructive: 0 84.2% 60.2%;
      --destructive-foreground: 210 40% 98%;
      --border: 214.3 31.8% 91.4%;
      --input: 214.3 31.8% 91.4%;
      --ring: 222.2 84% 4.9%;
      --radius: 0.5rem;
    }
  </style>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            border: 'hsl(var(--border))',
            input: 'hsl(var(--input))',
            ring: 'hsl(var(--ring))',
            background: 'hsl(var(--background))',
            foreground: 'hsl(var(--foreground))',
            primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
            secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
            destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
            muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
            accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
            popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
            card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
          },
          borderRadius: {
            lg: 'var(--radius)',
            md: 'calc(var(--radius) - 2px)',
            sm: 'calc(var(--radius) - 4px)',
          },
        },
      },
    }
  </script>`
      : '';

  fs.writeFileSync(
    htmlPath,
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>${tailwindCdn}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; font-family: system-ui, -apple-system, sans-serif; }
    #root { min-height: 100%; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./entry.tsx"></script>
</body>
</html>`,
  );
  return htmlPath;
}

/**
 * Create a Vite config for building the preview
 */
function createViteConfig(tmpDir: string, target: string): string {
  const configPath = path.join(tmpDir, 'vite.config.ts');

  // For Astryx and Astryx+Tailwind previews, the generated component may use
  // patterns that StyleX's babel plugin rejects (e.g. createTheme with
  // type casts). We use a pre-transform plugin to strip TypeScript type
  // assertions before StyleX processes the file.
  const plugins =
    target === 'astryx' || target === 'astryx-tailwind'
      ? `
    {
      name: 'stylex-inline-vars',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('.tsx') || !id.includes('/results/')) return null;

        let result = code;

        // Step 1: Collect all 'const xxxRaw = { ... } as const;' blocks
        // so we can inline them into createTheme calls
        const varBlocks = new Map();
        const blockRe = /const\\s+(\\w+Raw)\\s*=\\s*(\\{[\\s\\S]*?\\})\\s*as\\s+const;/g;
        let match;
        while ((match = blockRe.exec(code)) !== null) {
          varBlocks.set(match[1], match[2]);
        }

        // Step 2: Inline variable references in createTheme calls
        // Pattern: stylex.createTheme(vars, someRaw as unknown as SomeType)
        // Replace with: stylex.createTheme(vars, { ...inlined object... })
        for (const [varName, objLiteral] of varBlocks) {
          // Match the variable reference with optional type cast
          const refRe = new RegExp(
            varName + '(?:\\\\s+as\\\\s+unknown\\\\s+as\\\\s+\\\\w+)?',
            'g'
          );
          // Only replace in createTheme contexts (second arg)
          result = result.replace(
            new RegExp(
              '(createTheme\\\\([^,]+,\\\\s*)' + varName + '(?:\\\\s+as\\\\s+unknown\\\\s+as\\\\s+\\\\w+)?\\\\s*\\\\)',
              'g'
            ),
            '$1' + objLiteral + ')'
          );
        }

        // Step 3: Strip remaining type casts (but not in import lines)
        result = result.split('\\n').map(line => {
          if (line.trimStart().startsWith('import ')) return line;
          line = line.replace(/\\s+as\\s+unknown\\s+as\\s+\\w+/g, '');
          return line;
        }).join('\\n');

        return { code: result, map: null };
      },
    },
    stylex.vite({
      dev: false,
      runtimeInjection: false,
      treeshakeCompensation: true,
      unstable_moduleResolution: {
        type: 'commonJS',
        rootDir: '${REPO_ROOT.replace(/\\/g, '/')}',
      },
      aliases: {
        '@astryxdesign/core/theme/tokens.stylex': '${path
          .resolve(REPO_ROOT, 'packages/core/src/theme/tokens.stylex.ts')
          .replace(/\\/g, '/')}',
      },
      lightningcssOptions: {
        targets: ${LIGHTNINGCSS_TARGETS_JS},
      },
    }),
    react(),
    viteSingleFile(),`
      : `
    react(),
    viteSingleFile(),`;

  const imports =
    target === 'astryx' || target === 'astryx-tailwind'
      ? `import stylex from '@stylexjs/unplugin';
import react from '@vitejs/plugin-react';
import {viteSingleFile} from 'vite-plugin-singlefile';`
      : `import react from '@vitejs/plugin-react';
import {viteSingleFile} from 'vite-plugin-singlefile';`;

  const astryxAliases = `
    alias: {
      '@astryxdesign/core/theme/tokens.stylex': '${path
        .resolve(REPO_ROOT, 'packages/core/src/theme/tokens.stylex.ts')
        .replace(/\\/g, '/')}',
      '@astryxdesign/core': '${path
        .resolve(REPO_ROOT, 'packages/core/src')
        .replace(/\\/g, '/')}',
      '@astryxdesign/theme/neutral': '${path
        .resolve(REPO_ROOT, 'packages/themes/neutral/src/source.ts')
        .replace(/\\/g, '/')}',
    },`;

  const aliases =
    target === 'astryx' || target === 'astryx-tailwind'
      ? astryxAliases
      : target === 'baseline'
        ? `
    alias: {
      '@/components/ui': '${path
        .resolve(VIBE_DIR, '.baseline/components/ui')
        .replace(/\\/g, '/')}',
      '@/lib/utils': '${path
        .resolve(VIBE_DIR, '.baseline/lib/utils')
        .replace(/\\/g, '/')}',
    },`
        : '';

  const cssConfig = '';

  fs.writeFileSync(
    configPath,
    `import {defineConfig} from 'vite';
${imports}

export default defineConfig({
  root: '${tmpDir.replace(/\\/g, '/')}',
  plugins: [${plugins}
  ],${cssConfig}
  resolve: {${aliases}
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Don't use lightningcss for minification — it lowers light-dark()
    // into --lightningcss-light/--lightningcss-dark polyfill variables
    // which breaks Astryx theming.
    cssMinify: false,
  },
  logLevel: 'warn',
});
`,
  );

  return configPath;
}

/**
 * Verify baseline components exist (real shadcn/ui sources in .baseline/).
 * No generation needed — components are checked into the repo.
 */
function ensureBaselineShims(): void {
  const baselineDir = path.join(VIBE_DIR, '.baseline');
  const utilsPath = path.join(baselineDir, 'lib', 'utils.ts');
  if (!fs.existsSync(utilsPath)) {
    throw new Error(
      'Baseline components not found at .baseline/: run pnpm install in internal/vibe-tests',
    );
  }
}

/**
 * Build a single preview page
 */
function buildPreview(
  componentPath: string,
  target: string,
  promptId: string,
  outPath: string,
): boolean {
  // Use a unique temp directory per build to prevent race conditions
  // when multiple build-previews processes run concurrently
  const tmpDir = path.join(VIBE_DIR, `.preview-tmp-${crypto.randomUUID()}`);
  ensureDir(tmpDir);

  try {
    createEntryFile(componentPath, target, tmpDir);
    createIndexHtml(tmpDir, `${promptId} — ${target}`, target);
    createViteConfig(tmpDir, target);

    execFileSync(
      'npx',
      ['vite', 'build', '--config', path.join(tmpDir, 'vite.config.ts')],
      {
        cwd: VIBE_DIR,
        stdio: 'pipe',
        encoding: 'utf-8',
      },
    );

    const distHtml = path.join(tmpDir, 'dist', 'index.html');
    if (!fs.existsSync(distHtml)) {
      console.error(`  ✗ Build produced no output for ${promptId}/${target}`);
      return false;
    }

    // Inline any CSS files
    const assetsDir = path.join(tmpDir, 'dist', 'assets');
    if (fs.existsSync(assetsDir)) {
      let html = fs.readFileSync(distHtml, 'utf-8');
      const cssFiles = fs
        .readdirSync(assetsDir)
        .filter(f => f.endsWith('.css'));
      for (const cssFile of cssFiles) {
        const css = fs.readFileSync(path.join(assetsDir, cssFile), 'utf-8');
        html = html.replace('</head>', `<style>${css}</style>\n</head>`);
      }
      fs.writeFileSync(distHtml, html);
    }

    ensureDir(path.dirname(outPath));
    fs.copyFileSync(distHtml, outPath);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ Failed to build ${promptId}/${target}: ${msg}`);
    return false;
  } finally {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, {recursive: true});
    }
  }
}

// ============================================================
// tsc-based type checking
// ============================================================

interface TscError {
  line: number;
  message: string;
  code: string;
}

interface TscResult {
  target: string;
  errors: TscError[];
  errorCount: number;
  buildSuccess: boolean;
}

type BuildErrors = Record<string, TscResult>;

/**
 * Get the appropriate tsconfig for a target.
 */
function getTsconfigForTarget(target: string): string {
  switch (target) {
    case 'astryx-tailwind':
    case 'astryx':
      return path.join(VIBE_DIR, 'tsconfig.astryx.json');
    case 'baseline':
      return path.join(VIBE_DIR, 'tsconfig.baseline.json');
    default:
      return path.join(VIBE_DIR, 'tsconfig.html.json');
  }
}

/**
 * Parse tsc output into structured errors.
 * tsc output format: "file(line,col): error TSxxxx: message"
 */
function parseTscOutput(output: string, filePath: string): TscError[] {
  const errors: TscError[] = [];
  const basename = path.basename(filePath);
  const lines = output.split('\n');

  for (const line of lines) {
    // Match both tsc output formats:
    // - file.tsx(line,col): error TSxxxx: message
    // - file.tsx:line:col - error TSxxxx: message
    const match =
      line.match(/\((\d+),\d+\):\s*error\s+(TS\d+):\s*(.+)/) ||
      line.match(/:(\d+):\d+\s*-\s*error\s+(TS\d+):\s*(.+)/);
    if (match && line.includes(basename)) {
      errors.push({
        line: parseInt(match[1], 10),
        message: match[3].trim(),
        code: match[2],
      });
    }
  }

  return errors;
}

/**
 * Run tsc --noEmit on a single .tsx file with the appropriate tsconfig.
 * Returns structured error information.
 */
function runTscCheck(filePath: string, target: string): TscResult {
  const tsconfig = getTsconfigForTarget(target);
  const absFilePath = path.resolve(VIBE_DIR, filePath);

  // tsc can't mix --project with file arguments, so we create a temp
  // tsconfig that extends the target config and includes just this file.
  const tmpConfig = path.join(VIBE_DIR, '.tsc-tmp.json');
  fs.writeFileSync(
    tmpConfig,
    JSON.stringify({
      extends: `./${path.relative(VIBE_DIR, tsconfig)}`,
      include: [absFilePath],
    }),
  );

  try {
    execFileSync(
      'npx',
      ['tsc', '--noEmit', '--pretty', 'false', '--project', tmpConfig],
      {
        cwd: VIBE_DIR,
        stdio: 'pipe',
        encoding: 'utf-8',
      },
    );
    // Clean compile
    return {
      target,
      errors: [],
      errorCount: 0,
      buildSuccess: true,
    };
  } catch (err: unknown) {
    const error = err as {stdout?: string; stderr?: string};
    const output = (error.stdout || '') + (error.stderr || '');
    const errors = parseTscOutput(output, filePath);

    return {
      target,
      errors,
      errorCount: errors.length,
      buildSuccess: errors.length === 0,
    };
  } finally {
    // Clean up temp config
    if (fs.existsSync(tmpConfig)) {
      fs.unlinkSync(tmpConfig);
    }
  }
}

/**
 * Run tsc type checking on all .tsx result files for an iteration.
 * Runs BEFORE auto-import fixes to measure the model's raw output quality.
 * Writes build-errors.json to the iteration's results directory.
 */
function runTscChecks(
  codeDir: string,
  iterDir: string,
  target: string,
  files: string[],
  promptFilter?: string[],
): BuildErrors {
  const buildErrors: BuildErrors = {};

  console.log('\n  🔍 Running tsc type checks...');

  for (const file of files) {
    const promptId = path.basename(file, '.tsx');
    if (promptFilter && !promptFilter.includes(promptId)) {
      continue;
    }

    const filePath = path.resolve(codeDir, file);
    const result = runTscCheck(filePath, target);
    buildErrors[promptId] = result;

    if (result.errorCount > 0) {
      console.log(
        `  ⚠ ${promptId}: ${result.errorCount} type error${result.errorCount > 1 ? 's' : ''}`,
      );
    }
  }

  // Write build-errors.json
  const errorsPath = path.join(iterDir, 'build-errors.json');
  writeJson(errorsPath, buildErrors);

  const totalErrors = Object.values(buildErrors).reduce(
    (sum, r) => sum + r.errorCount,
    0,
  );
  const cleanCount = Object.values(buildErrors).filter(
    r => r.buildSuccess,
  ).length;
  console.log(
    `  ✓ tsc: ${cleanCount}/${Object.keys(buildErrors).length} clean, ${totalErrors} total errors`,
  );

  return buildErrors;
}

async function main() {
  const {iterations, prompts, outDir, tscOnly} = parseArgs();
  const resultsDir = getResultsDir();

  console.log('\n🖼️  Building Preview Pages');
  console.log('='.repeat(40));

  const manifest: PreviewManifest = {};
  /** Track which prompts needed auto-imported components (quality signal) */
  const importFixes: Record<string, string[]> = {};

  for (const iterationId of iterations) {
    const iterDir = path.join(resultsDir, iterationId);
    const manifestPath = path.join(iterDir, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      console.error(`  ⚠ No manifest for ${iterationId}, skipping`);
      continue;
    }

    const iterManifest = readJson<{config?: {target?: string}}>(manifestPath);
    const target = iterManifest.config?.target ?? 'astryx';
    const codeDir = path.join(iterDir, 'results');

    if (!fs.existsSync(codeDir)) {
      continue;
    }

    // Extract .tsx from JSON results if no .tsx files exist yet
    ensureTsxFiles(codeDir);

    const files = fs.readdirSync(codeDir).filter(f => f.endsWith('.tsx'));

    // Run tsc type checking on raw generated files BEFORE auto-import fixes
    runTscChecks(codeDir, iterDir, target, files, prompts);

    // --tsc-only mode: stop after type checking (for night watch correction pipeline)
    if (tscOnly) {
      console.log('  ⏭ --tsc-only: skipping preview builds');
      continue;
    }

    for (const file of files) {
      const promptId = path.basename(file, '.tsx');
      if (prompts && !prompts.includes(promptId)) {
        continue;
      }

      const componentPath = path.resolve(codeDir, file);
      const previewFile = `${promptId}/${target}.html`;
      const previewPath = path.join(outDir, previewFile);

      console.log(`  📄 ${promptId} (${target})...`);

      // Auto-fix missing XDS imports before building
      if (target === 'astryx' || target === 'astryx-tailwind') {
        const autoImported = fixMissingXDSImports(componentPath);
        if (autoImported.length > 0) {
          console.log(`  ⚡ Auto-imported: ${autoImported.join(', ')}`);
          importFixes[promptId] = autoImported;
        }
      }

      if (target === 'baseline') {
        ensureBaselineShims();
      }

      const ok = buildPreview(componentPath, target, promptId, previewPath);
      if (ok) {
        // Post-build validation: ensure no unresolved Astryx references
        if (target === 'astryx' || target === 'astryx-tailwind') {
          const unresolved = validatePreviewHtml(previewPath);
          if (unresolved.length > 0) {
            console.error(
              `  ⚠ Unresolved Astryx components in ${previewFile}: ${unresolved.join(', ')}`,
            );
          }
        }

        if (!manifest[promptId]) {
          manifest[promptId] = {};
        }
        manifest[promptId][target] = `previews/${previewFile}`;
        console.log(`  ✓ ${previewFile}`);
      }
    }
  }

  // Merge with existing manifest if present
  const manifestOutPath = path.join(outDir, 'manifest.json');
  ensureDir(outDir);
  if (fs.existsSync(manifestOutPath)) {
    const existing = readJson<PreviewManifest>(manifestOutPath);
    for (const [promptId, targets] of Object.entries(existing)) {
      if (!manifest[promptId]) {
        manifest[promptId] = {};
      }
      for (const [target, url] of Object.entries(targets)) {
        if (!manifest[promptId][target]) {
          manifest[promptId][target] = url;
        }
      }
    }
  }
  writeJson(manifestOutPath, manifest);

  // Write import-fixes sidecar so evaluators can penalize missing imports
  if (Object.keys(importFixes).length > 0) {
    const fixesPath = path.join(outDir, 'import-fixes.json');
    writeJson(fixesPath, importFixes);
    console.log(
      `\n⚠ ${Object.keys(importFixes).length} prompt(s) had missing Astryx imports (auto-fixed):`,
    );
    for (const [promptId, components] of Object.entries(importFixes)) {
      console.log(`   ${promptId}: ${components.join(', ')}`);
    }
  }

  const totalPreviews = Object.values(manifest).reduce(
    (sum, targets) => sum + Object.keys(targets).length,
    0,
  );
  console.log(
    `\n✅ Built ${totalPreviews} preview(s) for ${
      Object.keys(manifest).length
    } prompt(s)`,
  );
  console.log(`   Manifest: ${manifestOutPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
