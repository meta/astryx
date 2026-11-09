# @astryxdesign/richtext

# 0.7.11

#### Fixes

- In `RichTextEditor`, Backspace at the very start of a code block turns it into a paragraph holding its lines, with the caret at its start. It used to merge the code into the block above, so a heading above took the code in, and the Markdown read back as a longer heading and a stray paragraph. A code block with nothing above it, which already became a paragraph, now keeps its lines when its Markdown is read back. (#8581)
- RichText: an image in Markdown, inline (`![alt](url)`) or by reference (`![alt][ref]`), comes back exactly as written after you edit the text around it; a shortcut reference image (`![alt]`) followed directly by a link is written in its collapsed form (`![alt][]`), so the link stays a link. Before, an edit in an image's paragraph could escape its brackets (`!\[\](…)`), so other Markdown readers saw text instead of an image. RichText has no image node: an image shows as its Markdown source, one token that Backspace deletes whole and autolinking leaves alone. A caret placed inside it moves to its edge, so typing adds text beside the image instead of replacing it. Copying it, or splitting or joining its paragraph, keeps the source. (#10356)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @emilyhorsman
- @ernestt

---

# 0.7.10

---

# 0.7.9

#### Fixes

- RichTextExtensionNode is constructible with no arguments, as a registered node class must be. A Yjs collaboration binding builds one instance of every registered node class, with no arguments, to read its default properties, so creating a binding over an editor with this package's default nodes threw `TypeError: Cannot read properties of undefined (reading 'display')` before any document was loaded. Its `facts` now default to the same empty values the class already reads for damaged stored state, so a no-argument node reports an empty inline extension instead of throwing. A node built with facts is unchanged.

#### Contributors

Thanks to everyone who contributed to this release:

- @potatowagon

---

# 0.7.8

#### New Features

- In `RichTextEditor`, Cmd+A (Ctrl+A on other platforms) in a code block or a table cell now selects the code or the cell text first, and the whole document on the next press. Anywhere else it still selects the whole document at once.

#### Contributors

Thanks to everyone who contributed to this release:

- @emilyhorsman
- @ernestt

---

# 0.7.7

#### Fixes

- RichTextEditorToolbar: Insert link with nothing selected did not insert a link at the caret. In an empty paragraph nothing was inserted, and with the caret inside text the whole text around it was linked, while the dialog closed as if it had worked. Now, with the caret outside a link, Insert link inserts the entered URL as link text at the caret; with a non-empty selection it links the selected text, and with the caret inside a link it updates that link, as before.

#### Performance

- Typing in a `RichTextEditor` code block no longer re-tokenizes the whole block. In TypeScript, JavaScript, Python, and shell code, an edit inside one line re-tokenizes that line, plus at most the line above it, and replaces only the color ranges inside the text node it edited, so a keystroke in a 2,000-line block tokenizes as little code as one in a short block. Edits that open or close a string or comment across lines, and other languages, still re-tokenize the whole block. Colors are unchanged, except that a block whose text nodes are replaced by others with the same text is now recolored instead of left uncolored.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @emilyhorsman
- @ernestt

---

# 0.7.6

#### Fixes

- RichTextEditor's `toolbar` now treats `''` as empty, as it already treated `null`, `undefined` and booleans, so `toolbar=""` no longer adds the toolbar's top border to the editing surface. RichTextEditorToolbar's `endContent` treats `''`, `false` and `true` as empty, so it no longer adds a trailing separator. `0` still counts as content and shows "0". (#9265)
- Published packages no longer include repository test and benchmark files, reducing install size without changing exports. (#9153)

#### Other Changes

- RichTextEditor: `statusVariant` names `'tooltip'` in its own type, so it keeps accepting `statusVariant="tooltip"` after FieldStatus drops its deprecated `tooltip` variant in the next minor release. No behavior change. (#9196)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @ernestt
- @parinith-web
- @potatowagon

---

# 0.7.5

#### New Features

- Status colors are readable everywhere they appear, and Info is a status of its own. Each status (info, success, warning, error) now has a strong fill (`--color-<status>`) with content on it (`--color-on-<status>`, at least 4.5:1), a pale fill (`--color-<status>-muted`) with its content (`--color-on-<status>-muted`), and readable text for the page and cards (`--color-text-<status>`). Status icons (`--color-icon-<status>`) and borders (`--color-border-<status>`) default to the readable text color. The Info roles (`--color-info`, `--color-on-info`, `--color-info-muted`, …) are new and no longer borrow your accent color.

  `--color-success`, `--color-warning`, and `--color-error` and `bg-<status>` keep their meaning as the strong fills. In Tailwind, `bg-info`, `bg-info-muted`, `text-on-<status>`, `text-on-<status>-muted`, and `text-status-<status>` are new; `text-`, `decoration-`, `placeholder-`, and `caret-<status>` now use the readable text shade, and `border-`, `divide-`, `outline-`, and `ring-<status>` use the border shade, while `bg-`, `accent-`, `fill-`, `stroke-<status>`, shadows, and gradients keep the strong fill. For example, Core's light `text-warning` is now `#753F07` instead of `#E9AF08`. To keep the fill color on text, write `text-[var(--color-warning)]`.

  What changes on screen:

  - Core's dark Error content (`--color-on-error`) is now `#0A1317` instead of white, so text on dark-mode error fills reaches 4.5:1. Core's Info Badge uses `#0064E0` instead of the accent (`#2694FE` in dark mode).
  - Status icons (Icon `color="info|success|warning|error"`), Stepper status glyphs, and Chat tool-call status icons use the readable shades. Core's light success icon is now `#09441F` instead of `#0D8626`.
  - Input and FileInput status borders use the border shades. Core's light warning border is now `#753F07` instead of `#E9AF08`, and Butter's light success and warning input borders reach 3:1.
  - Banner draws its title, description, icon, and controls in the on-muted colors, and fills Info with `--color-info-muted`.
  - Status fills keep a visible edge in forced-colors mode.
  - Content on Chocolate and Matcha success and error fills, and on Stone success, warning, and error fills, now reaches 4.5:1.
  - Every first-party theme sets a blue Info. Chocolate and Matcha Info Badges move from the accent to that blue; Butter keeps its own Info Badge colors.
  - Neutral's `--color-success`, `--color-warning`, and `--color-error` are now the fills its Badges already showed, and its `--color-info` is `#0074E2` (`#6D9CFE` in dark mode). Its Badges, StatusDots, progress fills, and Stepper badges look the same; its accent ProgressBar, StatusDot, and Stepper now use Neutral's accent instead of blue.
  - Neutral no longer defines its undocumented local status tokens. Use the standard roles instead: `--astryx-theme-neutral-color-status-fill-success`, `-status-fill-warning`, and `-status-fill-error` → `--color-success`, `--color-warning`, `--color-error`; `-status-muted-accent` → `--color-info-muted`; `-on-tint-neutral` → `--color-neutral`; the `-on-tint-overlay-*` and `-destructive-overlay-*` tokens → `--color-overlay-hover` and `--color-overlay-pressed`. `--astryx-theme-neutral-color-status-fill-accent` keeps its value but is deprecated.

  Custom themes get the content and text roles they don't set: they are derived from the theme's status fills. To keep a component's previous color, set the matching role, for example `--color-icon-success` to your old `--color-success`.

- `RichTextEditor` and `RichTextView` take `codeLanguages`, the same list `Markdown` takes, so code looks the same while reading and editing.

#### Fixes

- Type declarations resolve in projects that use `moduleResolution: NodeNext`.
- In `RichTextEditor` and `RichTextView`, a code block with no language leaves room for its Copy button, so long lines wrap before it. The block is as tall as in `Markdown`, so switching between reading and editing no longer shifts the page.

#### Documentation

- Package links now point to the project's GitHub home, `meta/astryx`.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @harjothkhara
- @rubyycheung

---

# 0.7.4

---

# 0.7.3

---

# 0.7.2

#### New Features

- Tables draw a line on every cell edge, not only between rows, on both `Markdown` and the RichText surfaces, and the grid closes at the table's rim. A reader following one row across never needed vertical lines, but someone editing a table has to aim at a cell and judge where a selection stops, and the empty 3×3 a toolbar insert produces was three horizontal rules with no sign it had three columns. The line is the same `--color-border` already used between rows, the rim merges with it into one rule rather than doubling at the edge, and both surfaces move together — the read and edit renderings match block for block, more closely than before.

#### Documentation

- The `RichTextEditor` docs now list `isOptional`, `isRequired`, `labelTooltip` and `namespace`, four props the editor already accepted, so `astryx component RichTextEditor` and the docsite props table show the Required/Optional indicator, `aria-required`, the label tooltip and the Lexical namespace.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @potatowagon

---

# 0.7.1

#### New Features

- `@astryxdesign/richtext` is now a stable package, released together with `@astryxdesign/core` at the same version. Install it without the `@canary` tag: `npm install @astryxdesign/richtext`. It provides `RichTextEditor`, `RichTextView`, `RichTextEditorToolbar`, `RichTextEditorAutoLinkPlugin`, the headless Markdown serializers (also at `@astryxdesign/richtext/markdown`), and Markdown plugin support through `createRichTextExtension`. `RichTextView` and core `Markdown` render the same document the same way, and Markdown that is imported and exported without edits comes back byte for byte. `lexical` and the `@lexical/*` packages remain optional peer dependencies. (#7224)

#### Fixes

- `@astryxdesign/richtext` (and the Lab and Charts packages) now declare their stylesheet as a side effect, so a bundler that removes side-effect-free imports keeps `import '@astryxdesign/richtext/richtext.css'` instead of dropping it and leaving the editor unstyled. JavaScript modules stay tree-shakable. (#7586)
- `astryx.css`, `reset.css`, and every other package stylesheet (`richtext.css`, `lab.css`, `charts.css`) now open with `@layer reset, astryx-base, astryx-theme;`, the same line theme stylesheets carry. The Astryx layer order holds whichever Astryx stylesheet loads first: loading `reset.css` after `astryx.css` no longer lets the reset override component styles, and theme overrides keep winning. Setups that already declare the order on their own first line are unchanged. (#7585)

#### Documentation

- The `@astryxdesign/richtext` README shows the full stylesheet setup: Core's `reset.css` and `astryx.css`, your theme's CSS, and `richtext.css`. It says the package ships prebuilt CSS, so you never compile its source, and that `richtext.css` sits in `@layer astryx-base`, so theme overrides win once `reset.css` (or the layer-order line) loads first. (#7582)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang

---

# 0.1.9
