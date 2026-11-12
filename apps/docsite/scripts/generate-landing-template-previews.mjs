// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Renders the landing templates card previews to static HTML files.
 * @input The tile rows, the page templates, the neutral theme, the CLI's
 *   experimental page renderer, the image and icon rewrites of the template
 *   previews, and the experimental DOCSITE_ICON_SET setting.
 * @output public/landing/template-previews/<slug>.html: each tile's template
 *   as one self-contained page with no script. `#light` or `#dark` in its URL
 *   sets its color mode.
 * @position Part of `pnpm generate`, before the docsite build and dev server.
 *   TemplatesPreview shows the files in frames.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {render} from '@astryxdesign/cli/api/experimental';
import {
  ICON_SET_SETTING,
  previewIconSetList,
  rewriteTemplatePreview,
} from './template-icon-loader.mjs';
import {optimizeTemplateImages} from './template-image-loader.mjs';

const docsiteDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const rowsFile = path.join(
  docsiteDir,
  'src/app/(site)/_landing/landingTemplateRows.json',
);
const outDir = path.join(docsiteDir, 'public/landing/template-previews');
// The renderer inlines an image that the page's project serves. This folder
// is a project of its own with no `public` folder, so the previews keep the
// image URLs that the staged copies name.
const workDir = path.join(docsiteDir, '.landing-template-previews');
const templatesDir = path.resolve(
  docsiteDir,
  '../../packages/cli/assets/templates/pages',
);
const themeFontsFile = path.resolve(
  docsiteDir,
  '../../packages/themes/neutral/fonts.css',
);

// A tile shows its page at less than half size, so this width is enough on a
// high-density screen. It must be a width the image optimizer allows.
export const PREVIEW_IMAGE_WIDTH = 640;

// The page fills the frame and never scrolls, as a live template preview
// fills its tile: without this, a template taller than the frame shows a
// scrollbar where scrollbars are always visible. The card cannot run script
// in the page, so the URL fragment carries the site's color mode: `#light` or
// `#dark` targets one of two hidden anchors, and these rules follow it.
const PREVIEW_STYLE = [
  'html,body{height:100%;overflow:hidden}',
  'body>[data-astryx-theme]{height:100%}',
  'body>[data-astryx-theme]>:first-child{height:100%!important;min-height:100%!important}',
  ...['light', 'dark'].map(
    mode =>
      `:root:has(#${mode}:target),:root:has(#${mode}:target) [data-astryx-theme]{color-scheme:${mode}!important}`,
  ),
].join('');
const COLOR_MODE_ANCHORS = '<a id="light" hidden></a><a id="dark" hidden></a>';

const SOURCE_BLOCK =
  /<script type="application\/x-astryx-source">[\s\S]*?<\/script>/u;

/**
 * The page that the renderer renders for a tile: the template inside the
 * neutral theme, as the live template previews show it.
 * @param {string} templatePage the template's page module, relative to the wrapper
 * @returns {string}
 */
export function previewPageSource(templatePage) {
  return `import '@astryxdesign/theme-neutral/theme.css';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import Page from ${JSON.stringify(templatePage)};

export default function Preview() {
  return (
    <Theme theme={neutralTheme} mode="system">
      <Page />
    </Theme>
  );
}
`;
}

/**
 * The stylesheet URL that loads the theme's fonts, read from the theme's
 * `fonts.css`.
 * @param {string} fontsCss
 * @returns {string | null}
 */
export function fontStylesheetOf(fontsCss) {
  return (
    /@import\s+url\(\s*['"]?([^'")]+)['"]?\s*\)/u.exec(fontsCss)?.[1] ?? null
  );
}

/**
 * Turns a rendered page into a preview document. It drops the embedded
 * source, which only `render --reverse` reads, and loads the theme's fonts.
 * It makes the page fill its frame, and lets the URL fragment set the color
 * mode. Search engines must not index the file.
 * @param {string} html
 * @param {{fontStylesheet: string | null}} options
 * @returns {string}
 */
export function previewDocument(html, {fontStylesheet}) {
  const head = [
    '<meta name="robots" content="noindex">',
    fontStylesheet ? `<link rel="stylesheet" href="${fontStylesheet}">` : '',
    `<style>${PREVIEW_STYLE}</style>`,
  ].join('');
  return html
    .replace(SOURCE_BLOCK, '')
    .replace('</head>', `${head}</head>`)
    .replace(/<body[^>]*>/u, body => `${body}${COLOR_MODE_ANCHORS}`);
}

/**
 * Writes the page that the renderer renders for one tile into `pageDir`: a
 * copy of the template with the rewrites that the Webpack loaders give every
 * other template preview. Each photo that the docsite serves loads through
 * the image optimizer at preview size. With icon sets named, the icons come
 * from those sets.
 * @param {object} input
 * @param {string} input.slug
 * @param {string} input.pageDir an empty folder for this tile
 * @param {string} input.templatesDir the folder of the page templates
 * @param {string[]} input.iconSets the sets DOCSITE_ICON_SET names
 * @param {string} input.projectDir the docsite, where the sets are installed
 * @param {(path: string) => boolean} [input.isServed] whether the docsite's
 *   `public` folder serves a file at the path
 * @param {typeof rewriteTemplatePreview} [input.rewrite]
 */
export async function stagePreviewPage({
  slug,
  pageDir,
  templatesDir,
  iconSets,
  projectDir,
  isServed = file => fs.existsSync(path.join(projectDir, 'public', file)),
  rewrite = rewriteTemplatePreview,
}) {
  const templateDir = path.join(templatesDir, slug);
  const copyDir = path.join(pageDir, 'template');
  fs.cpSync(templateDir, copyDir, {recursive: true});
  const sources = fs
    .readdirSync(copyDir, {recursive: true, encoding: 'utf8'})
    .filter(file => file.endsWith('.tsx'));
  for (const relative of sources) {
    let source = optimizeTemplateImages(
      fs.readFileSync(path.join(copyDir, relative), 'utf8'),
      isServed,
      PREVIEW_IMAGE_WIDTH,
    );
    if (iconSets.length > 0) {
      // The rewrite finds the template's doc by the path of the original.
      source = await rewrite(source, path.join(templateDir, relative), {
        projectDir,
        list: iconSets,
      });
    }
    fs.writeFileSync(path.join(copyDir, relative), source);
  }
  fs.writeFileSync(
    path.join(pageDir, 'page.tsx'),
    previewPageSource('./template/page'),
  );
}

async function main() {
  /** @type {string[]} */
  const slugs = JSON.parse(fs.readFileSync(rowsFile, 'utf8')).flat();
  const fontStylesheet = fontStylesheetOf(
    fs.readFileSync(themeFontsFile, 'utf8'),
  );
  const iconSets = previewIconSetList(process.env[ICON_SET_SETTING]);
  fs.rmSync(workDir, {recursive: true, force: true});
  fs.rmSync(outDir, {recursive: true, force: true});
  fs.mkdirSync(outDir, {recursive: true});
  fs.mkdirSync(workDir, {recursive: true});
  fs.writeFileSync(
    path.join(workDir, 'package.json'),
    '{"name": "landing-template-previews", "private": true}\n',
  );
  try {
    for (const slug of slugs) {
      const pageDir = path.join(workDir, slug);
      fs.mkdirSync(pageDir);
      await stagePreviewPage({
        slug,
        pageDir,
        templatesDir,
        iconSets,
        projectDir: docsiteDir,
      });
      await render('page.tsx', {cwd: pageDir, out: 'page.html'});
      const html = previewDocument(
        fs.readFileSync(path.join(pageDir, 'page.html'), 'utf8'),
        {fontStylesheet},
      );
      fs.writeFileSync(path.join(outDir, `${slug}.html`), html);
      console.log(
        `landing preview ${slug}.html ${(html.length / 1024).toFixed(0)} KB`,
      );
    }
  } finally {
    fs.rmSync(workDir, {recursive: true, force: true});
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
