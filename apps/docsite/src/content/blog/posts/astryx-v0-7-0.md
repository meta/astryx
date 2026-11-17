---
title: 'Astryx v0.7.0: better mobile experiences, clearer inputs, and stronger foundations'
description: 'What shipped after v0.6.0: easier forms, stronger mobile behavior, composable Markdown, better data display, clearer CLI integrations, and guided migrations.'
date: '2026-10-12'
type: 'update'
draft: false
authors:
  - 'team'
tags:
  - 'Release'
  - 'Theming'
  - 'Components'
  - 'Accessibility'
---

Astryx v0.7.0 brings together everything shipped from v0.6.1 through v0.6.8 and the last updates for this release. The release improves the experiences people touch most—forms, mobile layouts, menus, Markdown, and tables—while making theme and CLI behavior more predictable.

## Forms and inputs

Styling, IDs, and handlers you pass now land on the control people use, and searchable pickers can create a missing choice.

```diff
 <TextInput
   label="Project name"
   value={name}
   onChange={setName}
-  xstyle={styles.projectName}
+  controlXstyle={styles.projectName}
 />

 <Typeahead
   label="Assignee"
   searchSource={peopleSource}
   value={assignee}
   onChange={setAssignee}
-  xstyle={styles.assigneeField}
-  emptySearchResultsText="No people found"
+  containerXstyle={styles.assigneeField}
+  emptySearchText="No people found"
 />
```

### Create a missing choice while searching

![A Reviewers multi-select with one Platform badge. It opens with a search field and three checkbox options; typing Access leaves a single row, Create "Access". Choosing it adds an Access badge to the field and an Access option, checked, at the end of the list.](/blog/astryx-v0-7-0/multiselector-create.webp)

_With `hasSearch` and `hasCreate`, a query that matches no option offers a Create row. `onChange` receives the new value with a `{type: 'create', query}` descriptor so your app can add the option._

```tsx
const [reviewerOptions, setReviewerOptions] = useState(initialReviewerOptions);
const [reviewers, setReviewers] = useState(['platform']);

<MultiSelector
  label="Reviewers"
  options={reviewerOptions}
  value={reviewers}
  onChange={(next, change) => {
    if (change?.type === 'create') {
      setReviewerOptions(current => [
        ...current,
        {value: change.query, label: change.query},
      ]);
    }
    setReviewers(next);
  }}
  hasSearch
  hasCreate
  triggerDisplay="badges"
/>;
```

## Menus and overlays

Menus hold real controls beside their rows and drill into submenus on touch; sheets, dialogs, and toasts stack, dismiss, and pad their content the way people expect.

### Put controls beside menu rows

![An open Assign reviewer dropdown. A Filter reviewers text field sits above the four name rows, and below them a Create team button with a plus icon, all inside the same popover.](/blog/astryx-v0-7-0/menu-header-footer@2x.png)

_Header and footer controls stay outside the menu itself, so screen readers hear a normal menu and Tab reaches each region in order._

```tsx
import {PlusIcon} from '@heroicons/react/24/outline';

<DropdownMenu
  button={{label: 'Assign reviewer'}}
  header={
    <TextInput
      label="Filter reviewers"
      isLabelHidden
      placeholder="Filter reviewers"
      value={query}
      onChange={setQuery}
    />
  }
  footer={
    <Button
      label="Create team"
      variant="secondary"
      icon={<Icon icon={PlusIcon} />}
      onClick={createTeam}
    />
  }
  items={reviewerActions}
/>;
```

### Drill into submenus on a phone

![A phone screen with an Actions menu open under its button. A finger taps the Move to row, which has a chevron, and the menu's rows are replaced in place by a Back to Actions row followed by Backlog and Next release. Tapping Back returns to the first set of rows.](/blog/astryx-v0-7-0/mobile-submenu-drill-in@2x.webp)

_Opened by touch, a sub-menu drills into the current rows, with a Back row named for the menu it returns to. With a mouse it still opens as a flyout; set `presentation` on `DropdownMenuSubMenu` to force either mode._

```tsx
<DropdownMenu button={{label: 'Actions'}}>
  <DropdownMenuItem label="Assign to me" onClick={assign} />
  <DropdownMenuItem label="Snooze" onClick={snooze} />
  <DropdownMenuSubMenu label="Move to">
    <DropdownMenuItem label="Backlog" onClick={moveToBacklog} />
    <DropdownMenuItem label="Next release" onClick={moveToNext} />
  </DropdownMenuSubMenu>
</DropdownMenu>
```

### Keep nested layers in order

- **Layers and dialogs:** Escape closes the top layer first for menus, popovers, and dialogs inside a sheet. Nested layers stay inside their nearest dialog.
- **Toasts:** They stay visible and clickable above open dialogs.

### Give BottomSheet content room

![The same bottom sheet on a phone, before and after. Before, the sheet's text and buttons run flush against the panel edges and start right under the grab handle, and the title is hidden behind it. After, the same content sits inside a comfortable inset on all sides, the title is visible below the handle, and the buttons are clear of the bottom edge.](/blog/astryx-v0-7-0/theme-bottomsheet-padding.png)

_BottomSheet now adds a comfortable content inset by default; `padding={0}` keeps the old flush box._

```diff
 <BottomSheet
   isOpen={isOpen}
   onOpenChange={setIsOpen}
   label="Filters"
+  padding={0}
 >
   <CustomEdgeToEdgeFilters />
 </BottomSheet>
```

## Mobile and touch

Phones get 16px body text, swipe actions on rows, and a choice of date and time pickers.

### Reveal row actions with a swipe

![A phone list of three checklist rows in a card. A finger drags the first row toward the left and two action panels slide out behind it: a neutral Archive and a red Delete. Tapping Archive removes the row and the list closes up.](/blog/astryx-v0-7-0/item-swipe-actions@2x.webp)

_Sideways drags reveal touch actions without hiding them from keyboard and assistive-technology users. Rows without actions do not load the gesture code, saving about 2.7 KB (gzip) on first load._

```tsx
<ListItem
  label={row.label}
  onClick={openRow}
  swipeActions={{
    trailing: [
      {
        label: 'Archive',
        onActivate: () => archive(row.id),
        variant: 'neutral',
        hasRemoval: true,
      },
      {
        label: 'Delete',
        onActivate: () => remove(row.id),
        variant: 'destructive',
        hasRemoval: true,
      },
    ],
  }}
/>
```

### Choose the date and time picker

Date and time fields can explicitly keep Astryx's picker on touch, use a popover, or hand off to the operating system.

```tsx
<DateInput
  label="Release date"
  value={date}
  onChange={setDate}
  presentation="adaptive-bottom-sheet"
/>
<TimeInput
  label="Release time"
  value={time}
  onChange={setTime}
  presentation="adaptive-bottom-sheet"
/>
```

### Read comfortably on a phone

![The same phone screen before and after. Before, the body paragraph, supporting line, field label and button label are small and the paragraph fits in two lines. After, body text and labels are larger and the paragraph wraps to three lines; the headings grow slightly, and the input text stays the same size.](/blog/astryx-v0-7-0/theme-phone-type-scale.png)

_On touch devices narrower than the `lg` breakpoint, Neutral, Chocolate, Butter, and Stone floor their type base to 16px and re-derive the ratio so Display 1 keeps its desktop size. Desktop sizes are unchanged._

To keep Neutral's previous 14px phone scale, append a later rule for the same condition:

```tsx
import {defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';

const appTheme = defineTheme({
  name: 'app',
  extends: neutralTheme,
  adaptations: {
    rules: [
      {
        when: {pointer: 'coarse', width: {below: 'lg'}},
        value: {typography: {scale: {base: 14, ratio: 1.2}}},
      },
    ],
  },
});
```

If your theme extends one of these and sets its own type scale, the phone rule replaces it on touch screens; append your own rule for the same condition with the values you want. For Butter and Stone, use `ratio: 1.25` and also restore `tokens: {'--text-supporting-size': '12px'}` in the rule's `value`.

## Data display

Tables keep expanded rows aligned and make column resizing easy to discover.

### Expand a row without disturbing the table

![An orders table with striped rows. The pointer clicks on a customer name and that row expands: its line items appear in a panel that starts under the Customer column, the chevron turns, and the stripes of the rows below keep alternating as before. The pointer then clicks a Refund button on another row, which does nothing to that row's expansion; clicking the row's text opens it.](/blog/astryx-v0-7-0/table-row-expansion.webp)

_Expanded details align with the first data column, the chevron stays centered in its column, row striping stays stable, and buttons or links inside a row never toggle it._

```tsx
const expansion = useTableRowExpansion<Order>({
  expandedKeys,
  onToggle: key => setExpandedKeys(previous => toggle(previous, key)),
  getRowKey: order => order.id,
  renderExpanded: order => <OrderItems order={order} />,
  hasRowClickExpansion: true,
});

<Table
  data={orders}
  columns={columns}
  idKey="id"
  isStriped
  hasHover
  plugins={{expansion}}
/>;
```

### Resize columns without losing context

![A wide orders table. As the pointer moves up into the header row, a thin line appears at every column boundary. The pointer drags the boundary after Status to the right and the column widens; on release the new width stays.](/blog/astryx-v0-7-0/table-column-resize.webp)

_Column boundaries reveal on header hover, and resized widths stay in place when the drag ends._

```tsx
const columnResize = useTableColumnResize<Order>({
  columnWidths,
  columns,
  onColumnResizeEnd: updates =>
    setColumnWidths(previous => ({...previous, ...updates})),
});

<Table data={orders} columns={columns} idKey="id" plugins={{columnResize}} />;
```

## Markdown and content

Markdown can now turn your own syntax into real components instead of stopping at formatted text. The examples below use the same source before and after, so each feature's effect is visible on its own.

### Keep authored line breaks

![The same four-line Markdown checklist rendered twice. Before plugins, the lines run together into one paragraph. After plugins, each line starts on its own line.](/blog/astryx-v0-7-0/markdown-soft-breaks.png)

_Single line endings become line breaks; code blocks and inline code stay unchanged._

```tsx
import {Markdown} from '@astryxdesign/core/Markdown';
import {markdownSoftBreaksPlugin} from '@astryxdesign/core/Markdown/plugins';

<Markdown plugins={[markdownSoftBreaksPlugin]}>{source}</Markdown>;
```

### Read frontmatter as data

![A document that starts with a YAML frontmatter block, rendered twice. Before plugins, the frontmatter shows as a horizontal rule, a line of raw key: value text, and another rule above the heading. After plugins, the frontmatter is gone from the document and your app shows its parsed values as a draft badge and a title above the same heading.](/blog/astryx-v0-7-0/markdown-frontmatter.png)

_Your app gets the frontmatter as typed data while it stays out of the rendered document._

```tsx
import {Markdown} from '@astryxdesign/core/Markdown';
import {createMarkdownFrontmatter} from '@astryxdesign/core/Markdown/plugins';

const frontmatter = createMarkdownFrontmatter({
  name: 'release-notes',
  parse: fields => ({
    title: typeof fields.title === 'string' ? fields.title : 'Untitled',
    status: typeof fields.status === 'string' ? fields.status : 'draft',
  }),
});

const result = frontmatter.parse(source);
<Markdown plugins={[frontmatter.plugin]}>{source}</Markdown>;
```

### Turn product syntax into links

![One sentence naming two spec ids, rendered twice. Before plugins, AST-064 and AST-069 are plain text. After plugins, both become underlined links, while the same id inside inline code stays as written.](/blog/astryx-v0-7-0/markdown-text-transform.png)

_Text transforms can link product identifiers in prose without touching code spans, existing links, images, or math._

```tsx
import {Markdown} from '@astryxdesign/core/Markdown';
import {
  createMarkdownPlugin,
  createMarkdownTextTransform,
} from '@astryxdesign/core/Markdown/plugins';

const specLinks = createMarkdownPlugin({
  name: 'spec-links',
  apiVersion: 1,
  transform: createMarkdownTextTransform({
    pattern: /\bAST-(\d{3})\b/g,
    requiredSubstrings: ['AST-'],
    replace: match => ({
      type: 'link',
      url: `/specs/${match[0]}`,
      children: [{type: 'text', value: match[0]}],
    }),
  }),
});

<Markdown plugins={[specLinks]}>{source}</Markdown>;
```

### Turn custom fences into components

![A paragraph followed by a fenced code block tagged callout, rendered twice. Before plugins, the fence shows as a code block labelled callout with its two lines of text. After plugins, the same fence renders as a warning banner with the first line as its title and the second as its description.](/blog/astryx-v0-7-0/markdown-fence.png)

_A declared fence language can render as a product component while every other fence keeps its normal code treatment._

```tsx
import {Markdown} from '@astryxdesign/core/Markdown';
import {Banner} from '@astryxdesign/core/Banner';
import {
  createMarkdownFenceTransform,
  createMarkdownPlugin,
  type MarkdownExtensionNode,
} from '@astryxdesign/core/Markdown/plugins';

type CalloutNode = MarkdownExtensionNode<
  'callouts',
  'callout',
  {readonly title: string; readonly body: string},
  'block'
>;

const callouts = createMarkdownPlugin<'callouts', CalloutNode>({
  name: 'callouts',
  apiVersion: 1,
  transform: createMarkdownFenceTransform({
    languages: ['callout'],
    createNode: ({code}) => {
      const [title, ...body] = code.split('\n');
      return {
        type: 'extension',
        plugin: 'callouts',
        name: 'callout',
        display: 'block',
        data: {title, body: body.join(' ')},
      };
    },
  }),
  renderers: {
    callout: {
      render: ({node}) => (
        <Banner
          status="warning"
          title={node.data.title}
          description={node.data.body}
        />
      ),
      toText: node => `${node.data.title}\n${node.data.body}`,
    },
  },
});

<Markdown plugins={[callouts]}>{source}</Markdown>;
```

### Copy links to headings

![Two headings rendered twice. Before plugins, the headings are plain. After plugins, as the pointer moves onto the first heading a small hash button appears beside it; clicking it swaps the hash for a check mark for a moment, and the button fades again when the pointer leaves.](/blog/astryx-v0-7-0/markdown-heading-links.webp)

_Heading links reveal on hover or keyboard focus, copy without navigating, and briefly confirm success._

```tsx
import {Markdown} from '@astryxdesign/core/Markdown';
import {createMarkdownHeadingLinks} from '@astryxdesign/core/Markdown/plugins';

const headingLinks = createMarkdownHeadingLinks({
  permalinkBaseUrl: 'https://astryx.atmeta.com/blog/astryx-v0-7-0',
});

<Markdown plugins={[headingLinks]}>{source}</Markdown>;
```

### Connect rendered blocks to source lines

![A paragraph, a two-item list and a quote rendered twice. Before plugins, the blocks have no annotations. After plugins, a small gutter beside each block names its source line: L1 for the paragraph, L3 and L4 for the list items, L6 for the quote.](/blog/astryx-v0-7-0/markdown-source-lines.png)

_Illustrative gutter: the page reads each block's `data-source-line` and `data-source-line-end` attributes to attach comments, selections, and search results._

```tsx
import {Markdown} from '@astryxdesign/core/Markdown';
import {markdownSourceLinesPlugin} from '@astryxdesign/core/Markdown/plugins';

<Markdown plugins={[markdownSourceLinesPlugin]}>{source}</Markdown>;
```

### Render math with your product's renderer

![A sentence with an inline fraction and a display equation, rendered twice. Before, the dollar-delimited math shows as literal text. After, the inline fraction is typeset within the sentence and the equation is typeset on its own centered line.](/blog/astryx-v0-7-0/markdown-math.png)

_Providing a math renderer turns on dollar-delimited parsing; the typesetting shown is an example renderer, and your app owns the final accessible output._

```tsx
import {Markdown} from '@astryxdesign/core/Markdown';

function MathExpression({
  value,
  display,
}: {
  value: string;
  display: 'inline' | 'block';
}) {
  return <ProductMath source={value} display={display} />;
}

<Markdown components={{math: MathExpression}}>{source}</Markdown>;
```

## Themes and visual foundations

Components read more clearly in every stable theme, and data colors have one StyleX source.

### Use data colors from one StyleX source

_Apps can read the same data-color values that Astryx charts and themes use._

```tsx
import * as stylex from '@stylexjs/stylex';
import {dataVars} from '@astryxdesign/core/theme/dataTokens.stylex';

const styles = stylex.create({
  series: {
    backgroundColor: dataVars['--color-data-categorical-blue'],
  },
});
```

The three comparisons below use the same scene in v0.6.0 and the current release.

### Read keyboard shortcuts clearly

![Three keyboard shortcuts next to their actions, shown before and after. Before, the keycap letters are mid-grey on a light grey cap and the Escape key reads ESC in capitals. After, the same keycaps use the primary text color and the key reads Esc.](/blog/astryx-v0-7-0/theme-kbd-contrast.png)

_Keycap text now meets WCAG AA across every stable theme, and common key aliases render consistently._

```tsx
<Kbd keys="mod+k" />
<Kbd keys="mod+shift+s" />
<Kbd keys="esc" />
```

### Keep Slider marks with the fill

![Two sliders with tick marks, a single value at 65 and a range from 20 to 70, shown before and after. Before, every tick mark is the same light grey, including the ones inside the filled part of the track. After, ticks inside the filled region take the fill color and ticks outside it stay on the track color.](/blog/astryx-v0-7-0/theme-slider-marks.png)

_Marks at or behind the thumb use the fill color, while unfilled marks use the track color across themes._

```tsx
<Slider
  label="Quality"
  value={quality}
  onChange={setQuality}
  min={0}
  max={100}
  step={5}
  marks={[
    {value: 0, label: '0'},
    {value: 25},
    {value: 50, label: '50'},
    {value: 75},
    {value: 100, label: '100'},
  ]}
/>
```

### Size icons with their Button

![Four buttons with leading icons in small, medium and large sizes, shown before and after. Before, the icons are the same large size on every button and crowd the small one. After, each icon matches its button: small on sm and md buttons, medium on the lg button.](/blog/astryx-v0-7-0/theme-button-icon-size.png)

_An Icon without an explicit size now follows its Button, so small buttons no longer look crowded._

```tsx
<Button
  label="Upload"
  variant="primary"
  icon={<Icon icon={ArrowUpTrayIcon} />}
/>
<Button label="Upload" size="lg" icon={<Icon icon={ArrowUpTrayIcon} />} />
```

## Accessibility and localization

Layouts grow with the reader's text size, focus rings follow the input people actually used, and banners announce the async outcome instead of guessing from their color.

### Let layouts follow the reader's text size

Readers who raise their browser font size now get padding and gaps that grow with the text, instead of larger words squeezed into the same fixed spacing.

![The same small form card rendered at a 24px browser font size, before and after, with a second row at the default 16px. Before at 24px, the text is large but the card's padding and the gaps between the field and buttons stay as tight as at 16px. After, padding and gaps grow with the text. At 16px both versions look identical.](/blog/astryx-v0-7-0/theme-rem-spacing.png)

_Spacing tokens use rem (`--spacing-N` = N × 0.25rem), including Matcha and Y2K's own steps; rendered pixel sizes are unchanged at the default 16px root._

### Keep focus cues matched to the last input

![An Edit profile button opens a dialog with a mouse click; nothing shows a focus ring. Pressing Tab shows a ring on the Close button, and pressing it again moves the ring to the Display name field. Escape closes the dialog and the Edit profile button shows a ring. Opening again by mouse and clicking Cancel closes it with no ring on the button.](/blog/astryx-v0-7-0/dialog-focus-indicator.webp)

_The pointer icon is added to show mouse input. Dialog's initial focus and the focus it returns on close follow the last input: the indicator shows after keyboard use and stays hidden after a mouse click or tap._

### Announce an async outcome

Previously, Banner's visual `status` automatically chose a live-region role, so the banner's appearance—not the async action—decided when screen readers heard it. Banners are now quiet by default; announce once from the action that finished, or set a role when the Banner itself is the persistent message.

```tsx
import {Banner} from '@astryxdesign/core/Banner';
import {useAnnounce} from '@astryxdesign/core/hooks';

const announce = useAnnounce();

async function saveSettings() {
  await save();
  announce('Settings saved');
}

<Banner status="success" title="Settings saved" />;
```

## CLI and integrations

Other libraries can now contribute components, docs, templates, upgrade scripts, coding guidance, and source themes through the same Astryx CLI an app already uses. The CLI can add and verify those components.

### Add and verify an integration component

![A terminal. The command npx @astryxdesign/cli integration add component AcmeChart is typed and runs, reporting component contribution added, [ok] AcmeChart, and the four files it created. Then npx @astryxdesign/cli integration verify runs and reports Integration package ready, [ok] @acme/charts@1.2.0, and 5 packed files with 3 of 3 required files present.](/blog/astryx-v0-7-0/cli-integration.webp)

_Real output from the shipped CLI in a package whose `package.json` already declares an `exports` map; the terminal frame is an illustration styled with Astryx tokens._

```bash
npx @astryxdesign/cli integration add component AcmeChart
npx @astryxdesign/cli integration verify
```

## Upgrading to 0.7.0

Start here:

1. **Pin Core and the CLI to 0.7.0**, plus every other stable Astryx package your project uses.

   ```bash
   OLD_VERSION=0.6.8 # replace with the Core version your project uses today
   npm i @astryxdesign/core@0.7.0 @astryxdesign/cli@0.7.0 @astryxdesign/build@0.7.0 @astryxdesign/theme-neutral@0.7.0
   ```

   The example includes Neutral; update every other stable Astryx theme in your project in the same install step.

2. **Run the 0.7.0 upgrade.** It rewrites supported callsites, validates data-color ownership, and leaves a TODO where it cannot choose safely.

   ```bash
   npx @astryxdesign/cli upgrade --from "$OLD_VERSION" --apply --path .
   ```

3. **Check the items below.** Four need a manual code edit, ten affect CLI commands or scripts, four are visual or token changes to inspect in your app, and eight are handled or checked by the upgrade.

> **Biggest risk: props that used to be ignored now reach the DOM.** Layout, MetadataList, NavHeadingMenuItem, and TopNavMegaMenuItem already accepted BaseProps, so there is no type error or codemod. Audit callsites that pass IDs, ARIA or data attributes, event handlers, or style props only if they relied on those props doing nothing.

### Manual code edits — no codemod (4)

- **Banner announcements are no longer inferred from status** → call `useAnnounce()` from the async transition, or add an explicit persistent role.
- **Previously ignored BaseProps now apply** → audit the four components in the risk callout only where a passed prop was meant to stay inert.
- **Complete icon registries require `upload`** → add an `upload` entry and artwork to every custom complete `IconRegistry`.
- **Standalone empty-operator filters no longer save on open** → save at the callsite when opening should commit the filter, or skip opening it.

### CLI commands and scripts — no codemod (10)

- **`theme add` now imports built themes** → change source-copying scripts to `theme eject`; existing `theme add --import` calls need no change.

  ```diff
  - npx @astryxdesign/cli theme add neutral ./src/theme --overwrite
  + npx @astryxdesign/cli theme eject neutral ./src/theme --overwrite
  ```

- **`init --remove-agents` reports `removed: false`** → treat `data.removed` as a boolean, not literal `true`.
- **Conflicting CLI options are refused** → remove the formerly ignored option from affected command pairs.
- **Invalid CLI input now fails** → pass valid types, packages, limits, and arguments, and handle `ERR_AMBIGUOUS_COMPONENT`.
- **Empty positional arguments are rejected** → omit `""` when the intended operation is to list entries.
- **Integration validation needs a package** → run it where `package.json` exists, or handle exit 1.
- **Astryx-prefixed agent variables are removed** → use `AGENT` and `AGENT_SESSION_ID`; agent metadata has no replacement.
- **The `layout` command group is removed** → use `astryx build`, `astryx template`, or `astryx docs layout`.
- **Private theme variables fail the build** → fix every reported private `--_*` input instead of relying on exit 0.
- **Doctor fails on unloadable configured projects** → install or repair the named integration, remove it from config, or fix the reported field.

### Visual and token changes — inspect your app; usually no code (4)

- **`reset.css` now reaches pseudo-elements and search fields** → do nothing unless you need the old browser result; then add a later-layer override.
- **Phone typography starts at 16px in four themes** → take the new Neutral, Chocolate, Butter, and Stone scale, or add a touch-and-narrow override to keep 14px.
- **Core spacing uses rem** → CSS variable users do nothing; code that parses px must convert with the root size or read the computed length.
- **Matcha and Y2K spacing uses rem** → take the pixel-equal default at a 16px root, or override spacing tokens in px for fixed sizing.

### Handled or checked by `astryx upgrade` (8)

- **Data-color defaults move to StyleX** → fix anything `validate-data-token-ownership` reports, then rebuild committed theme CSS.
- **Date and time input styling targets the control** → review the `migrate-field-input-styling` rewrite or TODO.
- **Typeahead, Tokenizer, CheckboxList, RadioList, and Slider styling targets the field** → review the generated `container*` or `control*` prop.
- **Selector styling targets the control** → review the rewritten control styling and forwarded trigger props.
- **Text input styling targets the control** → review the rewritten control styling and native input ID.
- **Theme styling uses current names and data attributes** → review rewritten keys and selectors, especially any TODO for custom CSS.
- **BottomSheet adds default content padding** → review the generated `padding={0}` or TODO; remove the prop when your theme already supplies padding.
- **`emptySearchResultsText` is removed** → review the rename to `emptySearchText` and any TODO on spreads or trigger objects.

### All 26 breaking migrations

1. **`theme add` now imports built themes** ([#7138](https://github.com/meta/astryx/pull/7138)) — copy scripts move from `theme add <slug> <path>` to `theme eject <slug> <path>`; no codemod.
2. **Banner announcements are explicit** ([#6630](https://github.com/meta/astryx/pull/6630)) — move from status-derived live regions to `useAnnounce()` in the async action or an explicit persistent role; no codemod.
3. **Previously ignored DOM props now work** ([#7331](https://github.com/meta/astryx/pull/7331)) — remove props on Layout, MetadataList, NavHeadingMenuItem, or TopNavMegaMenuItem only if your code depended on them doing nothing; no codemod.
4. **Complete icon registries include Upload** ([#7329](https://github.com/meta/astryx/pull/7329)) — add an `upload` entry to every custom `IconRegistry`; bespoke artwork has no codemod.
5. **`init --remove-agents` reports `removed: false`** ([#6623](https://github.com/meta/astryx/pull/6623)) — read `data.removed` as a boolean instead of narrowing it to literal `true`; no codemod.
6. **Conflicting CLI options are refused** ([#7132](https://github.com/meta/astryx/pull/7132)) — remove ignored input from `gap-report --list-categories`, `init --remove-agents`, `upgrade --list`, and `template --cdn`, `--list`, or `--skeleton`; no codemod.
7. **Invalid CLI input no longer succeeds silently** ([#7149](https://github.com/meta/astryx/pull/7149)) — pass valid types, packages, limits, and arguments, and handle `ERR_AMBIGUOUS_COMPONENT`; no codemod.
8. **Empty positional arguments are rejected** ([#6620](https://github.com/meta/astryx/pull/6620)) — omit `""` when the intended operation is to list entries; no codemod.
9. **Integration validation needs a package** ([#7150](https://github.com/meta/astryx/pull/7150)) — run `doctor integration validate` where `package.json` exists or handle exit 1; no codemod.
10. **Data-color defaults move to StyleX** ([#6834](https://github.com/meta/astryx/pull/6834)) — import `dataVars` for CSS and rebuild committed theme CSS; `validate-data-token-ownership` reports unsafe variables and stale output without rewriting them.
11. **Date and time input styling targets the control** ([#7337](https://github.com/meta/astryx/pull/7337)) — root styling becomes `controlXstyle`/`controlClassName`/`controlStyle`; `migrate-field-input-styling` rewrites direct Astryx JSX.
12. **Typeahead, Tokenizer, CheckboxList, RadioList, and Slider styling targets the field** ([#7339](https://github.com/meta/astryx/pull/7339)) — root styling becomes `container*`, except Typeahead inside InputGroup uses `control*`; `migrate-field-input-styling` handles direct JSX.
13. **Selector styling targets the control** ([#7341](https://github.com/meta/astryx/pull/7341)) — root styling becomes `control*`, while DOM props and refs reach the trigger; `migrate-field-input-styling` handles direct JSX.
14. **Text input styling targets the control** ([#7336](https://github.com/meta/astryx/pull/7336)) — root styling becomes `control*`, and IDs you pass reach the native input; `migrate-field-input-styling` handles direct JSX.
15. **Standalone filter editors do not save on open** ([#7347](https://github.com/meta/astryx/pull/7347)) — save at the callsite that opens an already-complete empty-operator filter, or skip opening it; no codemod.
16. **Astryx-prefixed agent variables are removed** ([#7127](https://github.com/meta/astryx/pull/7127)) — replace `ASTRYX_AGENT_ID` and `ASTRYX_AGENT_SESSION_ID` with `AGENT` and `AGENT_SESSION_ID`; metadata has no replacement and no codemod.
17. **Theme styling uses current names and data attributes** ([#7302](https://github.com/meta/astryx/pull/7302)) — replace 21 old styling names and bare state classes; `migrate-deprecated-theme-surface` rewrites known keys and selectors and marks ambiguous cases.
18. **The `layout` command group is removed** ([#7137](https://github.com/meta/astryx/pull/7137)) — use `astryx build`, `astryx template`, and `astryx docs layout`; no codemod.
19. **`reset.css` reaches pseudo-elements and search fields** ([#7355](https://github.com/meta/astryx/pull/7355)) — add your own later-layer `box-sizing`, border, placeholder color, or search appearance only when you need the old browser result; no codemod.
20. **Private theme variables fail the build** ([#6872](https://github.com/meta/astryx/pull/6872)) — fix every reported private `--_*` input instead of relying on exit 0; no codemod.
21. **BottomSheet adds default content padding** ([#6884](https://github.com/meta/astryx/pull/6884)) — remove duplicate caller padding or pass `padding={0}` for the old box; `preserve-bottom-sheet-content-padding` skips a sole Section or Layout, marks nested Layouts with a TODO, and otherwise adds `padding={0}`. Remove that added prop when your theme already sets BottomSheet padding so the theme inset remains.
22. **Phone typography starts at 16px** ([#6699](https://github.com/meta/astryx/pull/6699)) — take the new Neutral, Chocolate, Butter, and Stone scale as-is, or add a later touch-and-narrow rule to keep 14px or your own scale; no codemod.
23. **`emptySearchResultsText` is removed** ([#7289](https://github.com/meta/astryx/pull/7289)) — rename it to `emptySearchText`; `rename-empty-search-results-text` handles supported components and marks ambiguous spreads or trigger objects with a TODO.
24. **Core spacing follows the root font size** ([#7359](https://github.com/meta/astryx/pull/7359)) — CSS variable users need no change; code that parses px converts rem with the root size or reads the computed length; no codemod.
25. **Matcha and Y2K spacing follows the root font size** ([#7374](https://github.com/meta/astryx/pull/7374)) — take the new default, which is pixel-equal at a 16px root, or override the spacing tokens in px to keep fixed sizing; no codemod.
26. **Doctor fails on unloadable configured projects** ([#7130](https://github.com/meta/astryx/pull/7130)) — install or repair the named integration, remove it from config, or fix the config field in the error; no codemod.

## Thank you

Thanks to the contributors behind v0.6.1 through v0.7.0: [@AKnassa](https://github.com/AKnassa), [@aldentan](https://github.com/aldentan), [@andrskr](https://github.com/andrskr), [@athz](https://github.com/athz), [@bhamodi](https://github.com/bhamodi), [@cixzhang](https://github.com/cixzhang), [@Cypher-Aura-19](https://github.com/Cypher-Aura-19), [@ejhammond](https://github.com/ejhammond), [@ernestt](https://github.com/ernestt), [@freddymeta](https://github.com/freddymeta), [@fullstackhacker](https://github.com/fullstackhacker), [@Geervan](https://github.com/Geervan), [@Han5991](https://github.com/Han5991), [@harjothkhara](https://github.com/harjothkhara), [@HelloOjasMutreja](https://github.com/HelloOjasMutreja), [@humbertovirtudes](https://github.com/humbertovirtudes), [@imdreamrunner](https://github.com/imdreamrunner), [@jiunshinn](https://github.com/jiunshinn), [@josephfarina](https://github.com/josephfarina), [@kentonquatman](https://github.com/kentonquatman), [@korkt-kim](https://github.com/korkt-kim), [@ksying](https://github.com/ksying), [@kyu-rong](https://github.com/kyu-rong), [@Kyujenius](https://github.com/Kyujenius), [@Lee-Dongwook](https://github.com/Lee-Dongwook), [@light-merlin-dark](https://github.com/light-merlin-dark), [@ManoharPaturi](https://github.com/ManoharPaturi), [@markselby9](https://github.com/markselby9), [@nynexman4464](https://github.com/nynexman4464), [@oliprovscode](https://github.com/oliprovscode), [@rubyycheung](https://github.com/rubyycheung), [@rupesh-kumar-sah](https://github.com/rupesh-kumar-sah), [@thedjpetersen](https://github.com/thedjpetersen), and [@vjeux](https://github.com/vjeux).

Read the complete package-by-package notes on the [Astryx v0.7.0 release page](https://github.com/meta/astryx/releases/tag/v0.7.0).
