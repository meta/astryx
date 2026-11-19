// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs cli/experimental/share-a-page`: write a page, render it
 * to one HTML file, share or upload that file, and turn it back into source
 * to change it.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'share-a-page',
  placement: {parent: 'namespace:experimental', slot: 'guides', order: 18},
  stability: 'experimental',
  title: 'Make a shareable page',
  category: 'guide',
  keywords: [
    'share',
    'shareable page',
    'one html file',
    'single file',
    'artifact',
    'upload',
    'report',
    'status page',
    'dashboard',
    'edit a shared page',
    'back to source',
    'render',
  ],
  description:
    'Experimental. Write a page with Astryx components, render it to one HTML file, share or upload that file, and turn it back into source to change it.',
  sections: [
    {
      id: 'overview',
      title: 'Four steps',
      content: [
        {
          type: 'prose',
          text: 'A shareable page is one HTML file. It opens in a browser, as an attachment, or in an artifact viewer that shows HTML in a sandboxed frame. It loads nothing from the network, and it carries the page\u2019s own script, so its controls work as in the app. It also carries its own source, so anyone who has the file can turn it back into code, change it, and render it again. The render command is experimental: its options and its output can change in a patch release.',
        },
        {
          type: 'list',
          style: 'ordered',
          items: [
            'Write the page: one `.tsx` file built from Astryx components.',
            'Render it to one HTML file.',
            'Share or upload that file.',
            'To change it, turn the file back into source, edit the source, and render again.',
          ],
        },
      ],
    },
    {
      id: 'write',
      title: '1. Write the page',
      content: [
        {
          type: 'prose',
          text: 'Make a folder and write one file, such as `page.tsx`. Its default export is a React component built from Astryx components. In a folder that is not an Astryx project, the CLI renders the page with its own Astryx, React and StyleX, so the folder needs no package.json and no install.',
        },
        {
          type: 'code',
          lang: 'tsx',
          code: "import {VStack} from '@astryxdesign/core/VStack';\nimport {HStack} from '@astryxdesign/core/HStack';\nimport {StackItem} from '@astryxdesign/core/Stack';\nimport {Card} from '@astryxdesign/core/Card';\nimport {Heading} from '@astryxdesign/core/Heading';\nimport {Text} from '@astryxdesign/core/Text';\nimport {Badge} from '@astryxdesign/core/Badge';\n\nexport default function Page() {\n  return (\n    <VStack gap={5} padding={6}>\n      <HStack gap={2} vAlign=\"center\">\n        <StackItem size=\"fill\">\n          <Heading level={1}>Project Atlas</Heading>\n        </StackItem>\n        <StackItem size=\"static\">\n          <Badge label=\"At risk\" variant=\"warning\" />\n        </StackItem>\n      </HStack>\n      <Card padding={5}>\n        <Text type=\"body\">38% of traffic is on the new stack.</Text>\n      </Card>\n    </VStack>\n  );\n}",
        },
        {
          type: 'prose',
          text: 'Find a component with `{@command search "progress bar"}` and read its props with `{@command component ProgressBar}` before you use it. Use components and tokens, not colors or CSS of your own: the page then follows the reader\u2019s light or dark setting, and a viewer that sets Astryx theme variables gives it that viewer\u2019s theme.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Readers open the file on phones and on wide screens. Put cards in a row with `<Grid columns={{minWidth: 220, max: 3}}>`, which drops to fewer columns on a narrow screen, down to one. Do not pick a layout with script, such as useMediaQuery: every reader, on any screen, first sees the one layout that the query\u2019s server answer (false) picks, and keeps it in a viewer that blocks scripts; elsewhere it changes once the script runs.',
            'A row runs out of room first. In an HStack, a Badge beside a long heading or text shrinks and cuts off its label. Wrap the badge in `<StackItem size="static">` so it keeps its size, and the text in `<StackItem size="fill">` so the text wraps, as the example does. StackItem comes from `@astryxdesign/core/Stack`.',
            'A VStack stretches each child to its full width, so a Badge or Token on a line of its own becomes a bar across the page. Wrap that one item in `<StackItem crossAlignSelf="start">`. Do not give the VStack `hAlign="start"`: it shrinks every child, Cards and Grids too.',
            'A ListItem `label` or `description` that is a string stays on one line and ends in an ellipsis, and the file cannot show the rest. When readers need the whole text, pass an element: `label={<Text type="body">\u2026</Text>}`.',
            'The file cannot scroll a table sideways, because that needs script: a table wider than the screen is cut off at its edge. Inside the example\u2019s `padding={6}`, a 375 px phone leaves about 327 px, so keep a table that phones must show within about 310 px, and put the other columns in a second table or in Cards. A table is as wide as its `pixel()` columns plus, for its `proportional()` columns, the largest floor divided by that column\u2019s share of all the shares: four `proportional(1)` columns at the default 120 px floor need 480 px. So make each share equal its floor, as in `proportional(148, {minWidth: 148})`, or give the columns `pixel()` widths; then the floors add up. A column with no `width` counts as `proportional(1, {minWidth: 60})`, so give every column of a phone table a width.',
            'A column\u2019s floor includes its cells\u2019 24 px of padding. It must fit the column\u2019s longest word, because wrapped text breaks inside a word that does not fit, and its header, which stays on one line and is cut off with an ellipsis: `width: pixel(64)` holds a short number under a one-word header such as \u201cp95\u201d, and a two-word header such as \u201cError rate\u201d needs about 100 px.',
            'Give each CodeBlock `isWrapped`, so a reader on a phone sees whole lines.',
            'Charts use recharts: install it in the page\u2019s folder first (`{@pm install recharts}`). Size a chart with `<ResponsiveContainer width="100%" aspect={2.5}>`, and color each series with a theme variable, such as `stroke="var(--color-data-categorical-blue)"`, so it follows the theme too.',
            'Controls that need a browser (buttons, filters, tabs, menus) work once the page\u2019s script runs, and do nothing in a viewer that blocks scripts. Keep what a reader must see in the first paint, not behind a click (see `astryx docs cli/experimental/export-pages interactive`).',
          ],
        },
      ],
    },
    {
      id: 'render',
      title: '2. Render it to one file',
      content: [
        {
          type: 'code',
          lang: 'bash',
          code: 'astryx experimental export page.tsx --out page.html',
        },
        {
          type: 'prose',
          text: 'Read what the command prints. A warning names something that can look different from what you meant, such as a component that ignores its children or a remote image the viewer cannot load, and says what to change; fix it and render again. When the command says a package is not installed, install that package in the page\u2019s folder and render again. Then check the file: open it in a browser if you have one, or run the reverse command in step 4 to see that its source comes back.',
        },
      ],
    },
    {
      id: 'share',
      title: '3. Share or upload the file',
      content: [
        {
          type: 'prose',
          text: 'The file is the whole page: send it, put it on a web host, or upload it to an artifact viewer that accepts one HTML file. A viewer that shows HTML in a frame with no network shows it as it is; one that also blocks scripts shows its first paint. In a viewer\u2019s frame that allows scripts, forms work, storage works in memory (what the page saves lasts until the page closes), and copying works through the browser\u2019s copy command. A cookie write throws there, fullscreen and printing do not work, and a link opens only when the viewer allows pop-ups. Upload it with the host\u2019s own command, and keep the link or ID it gives back: you update that same artifact later, so readers keep the same link.',
        },
        {
          type: 'prose',
          text: 'The file carries the page\u2019s source and every local file the page imports. Whoever has the file can read them, so keep secrets out of the page and its imports.',
        },
      ],
    },
    {
      id: 'change',
      title: '4. Change it later',
      content: [
        {
          type: 'prose',
          text: 'Change the page through its source, never by editing the HTML: the source inside the file does not change with the markup, so the next person who turns it back gets the old page.',
        },
        {
          type: 'list',
          style: 'ordered',
          items: [
            'Get the current file, such as the latest version of the artifact: the shared copy can be newer than yours.',
            'Turn it back into source. `astryx experimental import page.html` writes the page and every local file it imports into a new folder beside the file: `page-restored/`, or `page-restored-2/` when that folder exists. The command prints the folder it wrote.',
            'Edit the page in that folder, such as `page-restored/page.tsx`.',
            'Render it over the old file: `astryx experimental export page-restored/page.tsx --out page.html`. The command replaces a file only when a render wrote it.',
            'Share the new file, or upload it as a new version of the same artifact.',
          ],
        },
        {
          type: 'prose',
          text: 'Run each command from the folder that holds the file: a relative `--out` stays inside the folder you run it from, and `experimental import` writes only there. An absolute `--out` can name any folder. When the restored page imports a package, such as recharts or an icon set, install it in that folder first; the render names each package that is missing.',
        },
      ],
    },
    {
      id: 'problems',
      title: 'When a step fails',
      content: [
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`ERR_RENDER_BROWSER_API`: the page reads `window` or `document` while it renders. Move that into an effect, or remove it.',
            'The page looks wrong on a phone: a layout picked by script, a badge stretched across the page or cut off, a list label cut off, or a table cut off or with words broken in the middle. See step 1.',
            'The render refuses to write the output: it replaces only a file a render wrote. Choose another `--out` name.',
          ],
        },
        {
          type: 'prose',
          text: 'Every detail of the command, such as what it carries, its warnings, and files from other CLI versions: {@link generic:export-pages}.',
        },
      ],
    },
  ],
};
