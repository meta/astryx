# @xds/core

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

- BottomSheets stack in the order they open. A modal sheet opened over another now sits on top of it: the sheet underneath keeps its state, moves back slightly, and can't be used until it is on top again; only one backdrop dims the page; and Escape, a backdrop tap, a swipe, or the system close gesture closes only the top sheet. Closing the top sheet returns focus to the sheet below, and closing a whole stack returns focus once, to where the flow started. A sheet inside another sheet's content now closes with it. Non-modal sheets (`hasScrim={false}`) never stack. No props change, and a single sheet behaves as before.
- Multi-step sheet flows no longer need a wrapper. When the top BottomSheet closes and another opens in the same update, for example from one state value that names the open step, the new sheet replaces the old one: it rises into place, the backdrop stays steady, focus moves into the new sheet, and closing the flow later returns focus to whatever opened it. This happens when the step change comes from inside the closing sheet, such as its own Continue or Back button. Non-modal sheets (`hasScrim={false}`) replace each other the same way, and now open above all page content in the browser's top layer instead of relying on a `z-index`.
- `BottomSheetSwitcher` and BottomSheet's `sheetId` prop are deprecated and keep working until a future minor release. Write each step as its own `BottomSheet` instead:
  1. Replace `activeSheet` / `onActiveSheetChange` with one `step` state value.
  2. On each step, replace `sheetId="id"` with `isOpen={step === 'id'}` and `onOpenChange={isOpen => !isOpen && setStep(current => (current === 'id' ? null : current))}`.
  3. Remove the `BottomSheetSwitcher` wrapper and move its `hasScrim` onto every step.
  4. Keep your step buttons as they are, for example `setStep('next')`.

  To keep a step open, ignore `false` in its `onOpenChange` (this replaces `onCancel`); to keep Escape but block the backdrop tap and swipe, use `purpose="form"`. A consumer `aria-label` becomes each step's `label`. Dialog-level `ref`, `id`, `className`, and styling props have no direct replacement: a standalone sheet's `ref` and props reach its panel. Flows that keep the switcher work as before, now with toasts above the flow and reduced-motion support.

- Popover takes `presentation`, like DropdownMenu and Selector: `'popover'` (the default) anchors it to its trigger, `'bottom-sheet'` shows its content in a modal BottomSheet named by `label`, and `'adaptive'` uses the sheet on phones and the anchored popover elsewhere. In a sheet, positioning props such as `placement` and `width` don't apply, and `xstyle`, `className`, and `style` style the sheet's panel. The sheet code loads only when it can be used.
- Menus and selectors with `presentation="adaptive"` (DropdownMenu, ContextMenu, MoreMenu, Selector, MultiSelector) and sub-menus that drill in on phones now switch to a bottom sheet by the shared phone-size rule on touch screens. A touch screen exactly 768px wide now keeps the anchored popover, and a phone in landscape (wider than 768px but shorter than 500px) now gets the sheet. A theme that moves its `md` breakpoint moves this edge too. To keep a fixed presentation, pass `presentation="popover"` or `"bottom-sheet"`, or `presentation="flyout"` on `DropdownMenuSubMenu`. Desktop mouse and keyboard users see no change.
- `@astryxdesign/core/theme` exports `compactDefinition(widthBreakpoints?)` and `DEFAULT_COMPACT_DEFINITION`: one shared rule for a phone-sized screen, narrower than the theme's `md` breakpoint (768px by default) or shorter than 500px, with ready-made media queries.
- `CodeBlock` highlights C, C++, SQL, Rust, Kotlin, Swift, and Go with no setup, so you only ship the languages you use.

  Every other language is opt in, one at a time:

  - Import that language on its own and pass it as `language`, for example `graphql` from `@astryxdesign/core/CodeBlock/languages/graphql`.
  - Modules ship for `graphql`, `java`, `thrift`, `objectiveC` (path `languages/objective-c`), `toml`, `powershell`, `ruby`, `lua`, and `dockerfile`.
  - A string such as `language="graphql"` still selects only a built-in language.

  Your own languages work the same way. `createCodeLanguage({name, identifiers, fileExtensions, fileNames, tokenize})` makes a language from your own tokenize function.

  The built-in tokenizer stays within 4,608 bytes gzipped. Each module adds at most 512 bytes, and only when you import it.

- `CodeBlock` takes `endContent` for your own controls, such as a "Run in terminal" button. They sit just before Copy, in the header when there is one, otherwise beside the code, never over it. For a one-line command, leave out the title and pass `hasLanguageLabel={false}` to get a single row with its controls beside it.
- CodeBlock's `tokenizer` prop is deprecated in favor of a custom language: pass `language={createCodeLanguage({name, identifiers, tokenize})}` with the same function. The prop still works. `astryx upgrade` rewrites it when the block has a fixed `language`, and leaves a TODO comment where it can't safely rewrite it.
- `Markdown` takes `codeLanguages`, a list of CodeBlock languages, so fenced code in Markdown can use the extra or custom languages too. A listed language wins over a built-in language of the same name, and `diff-<name>` fences get diff coloring on top.
- Expanding and collapsing can glide instead of jump. Create a handle with `useAnimatedLayout({containerRef})` and pass it to Collapsible or TreeList as `animatedLayout`: when one opens or closes, the content around it inside that container glides to its new place, revealed content fades in, and the chevron turns, all as one motion. Fixed and sticky elements stay put and the container never scrolls. Under Reduce Motion the change cross-fades on touch and is immediate with a mouse. Without the prop, nothing changes.
- Table: `useTableRowExpansion` accepts the same `animatedLayout` handle, so opening or closing a row's panel glides the rows after it, dividers included, instead of jumping. Under Reduce Motion rows fade on touch and change at once with a mouse; tables with column lines change at once.
- TreeList chevrons and guide lines sit 4px closer to the start of the row, and the gap between chevron and label widens from 4px to 8px. Labels stay where they were.
- `Icon` takes an optional `variant` to ask the active theme for alternate artwork, for example `<Icon icon="info" variant="filled" />`. The theme's icon receives the variant only when the theme lists it in `iconVariants`; otherwise it draws its normal artwork. Icons you pass as components never receive `variant`, and it is never written to the page. Icons without `variant` render as before.
- A theme icon can now pick its artwork by size: an entry in `defineTheme({icons})` or `registerIcons()` can be a function of `{size, variant}`, and `Icon` calls it with the size it renders at. Returning `null` draws no icon. `getIcon`, `getExtendedIcon`, `getIconRegistry`, `useIcon`, and a theme's `icons` field still return nodes, reading a function at `{size: 'md'}`. Existing icon entries are unchanged.
- A theme can list the icon variants it supports, such as `filled`, with `defineTheme({iconVariants})`, and read them back from `theme.iconVariants`. Child themes inherit the list unless they set their own. `@astryxdesign/core/Icon` exports `IconVariantMap` and `IconVariant` for typing variants. Themes without `iconVariants` are unchanged.
- `astryx theme build` keeps function icons and icon variant lists, so a built theme draws each icon at the same size and variant as the live theme, including icons inherited from another theme. A theme that lists `iconVariants` gets matching types in `<theme>.variants.d.ts`. Themes without these features build exactly as before.
- Themes can set the real size of each Icon size: `width` and `height` in `px` or `rem` on `components.icon['size:sm']` (or `xsm`, `md`, `lg`) now resize the glyph itself, for named icons and SVG components, in live and built themes. Before, they sized only the box around the icon. Sizes a theme does not style still render at 12, 16, 20, or 24px at a 16px root. `astryx docs theme` gains an Icon sizes section.
- `useCombobox` (from `@astryxdesign/core/Selector`) can now build an accessible search-with-results on your own text field, such as a search box whose results replace part of the page, or an "add people" field in a dialog. Spread `getFieldProps` on your input, `getListboxProps` on your list, and `getOptionProps` on each option. Focus stays in the field, arrow keys move through results, Enter picks, and Escape hides the list without closing a surrounding dialog. Announce result counts yourself with `useAnnounce`. Existing uses behave as before.
- Navigation menus support press-and-slide, as DropdownMenu does: in NavHeadingMenu, TopNavMenu, SideNavHeading's menu, TopNavHeading's product menu, BreadcrumbItem's menu, and TabMenu, a press that slides across the items picks the one it lifts on, with the highlight following the pointer. Link items are no longer draggable. Keyboard and screen-reader behavior is unchanged.
- On touch screens, `ScrollableArea` shows the phone's own scroll indicator, which is easier to see than the faint bar it drew before. Mouse and trackpad scrollbars keep the neutral color. To keep the neutral color on touch screens too, set `scrollbarColor` through `xstyle`.
- New `--ease-exit` motion token for things leaving the screen, beside `--ease-standard` for things arriving. BottomSheet already closes on it, so nothing looks different, but a theme can now tune the exit. `astryx docs motion` and the theme template list it.

#### Fixes

- With an `animatedLayout` handle, content before a Collapsible or TreeList change now glides too when the layout moves it, for example items in a centered or end-aligned row.
- With an `animatedLayout` handle, content after a change now glides even when it carries a resting transform, such as a Button or a swipeable row at rest, instead of jumping.
- With an `animatedLayout` handle in a right-to-left container, content after a Collapsible or TreeList change now glides instead of jumping.
- Screen readers now hear announcements made inside an open Dialog, modal BottomSheet, modal Drawer, Lightbox, MobileNav, or CommandPalette. Before, `useAnnounce` messages went to a page region the open dialog hid. Messages sent as a dialog closes are spoken once it has closed. Your code needs no change. Not yet covered: CommandPalette's result counts, Lightbox's position and zoom messages, and Selector's and MultiSelector's sheet messages.
- `useAnnounce`: messages announced at the same moment are now read together, in order, instead of the last one replacing the others, and an identical repeat is read once. A screen reader no longer misses a result count announced next to a confirmation.
- A disabled ChatComposerInput keeps focus and its place in the tab order instead of sending focus to the page, and blocks editing and sending while keeping the draft.
- A disabled ComplexSelector ignores selections from a popup that was already open.
- Disabling an InputGroup now disables the inputs and Button addons inside it, unless a child sets its own state.
- A disabled Tokenizer blocks adding, creating, and removing tokens, and leaves its values out of form submission.
- Banner's status text color no longer leaks into your `endContent`, including dialogs opened from it.
- BottomSheet renders fewer page elements, with no visual change.
- With Reduce Motion on, BottomSheets (including `BottomSheetSwitcher` steps) no longer slide or scale: on touch screens they fade in place within 200 ms, and with a mouse or keyboard they change at once. A swipe-to-dismiss fades out in place.
- When a shorter BottomSheet replaces a taller one, the taller sheet moves down to meet it before fading, so the switch looks like one sheet changing height.
- Toasts shown from a `BottomSheetSwitcher` step appear above the flow and can be pressed. Before, the step covered them.
- Toasts appear above an open BottomSheet and can be pressed. Before, the sheet covered them, and pressing a toast's action could dismiss the sheet instead.
- Typeahead and CommandPalette no longer announce "Loading" after the results have already arrived.
- ClickableCard, SelectableCard, and interactive Thumbnails show their pressed state under a finger in apps that compile Astryx from source (the Vite and PostCSS integrations, and Storybook). Mouse hover and press, and the precompiled stylesheet, are unchanged.
- `ChatComposer`'s status bar announces each error and warning once, without its decorative icon, and no longer announces a status that is already showing when the page loads.
- Tapping the clear button of an unfocused TextInput or NumberInput now brings up the iPhone keyboard, without scrolling the page.
- In a CodeBlock with no title or language label, the Copy button no longer covers code. It sits in its own column beside the first line, so long lines stop before it, whether scrolled, wrapped, or right-to-left. Blocks with a header are unchanged.
- A long unbroken word, such as a URL or file path, in CommandPalette's empty message now wraps instead of spilling past both edges.
- ComplexSelector's trigger is now a combobox, so screen readers hear when the field is required. A custom `renderTrigger` control gets the same role and states, and a disabled one keeps its tab stop without opening. Tests that find the trigger with `getByRole('button')` should use `getByRole('combobox')`.
- ComplexSelector: your `aria-label` or `aria-labelledby` now names the built-in trigger instead of being ignored.
- A ContextMenu opened by a long press stays open when the finger lifts.
- With Reduce Motion on a touch screen, Dialog fades in within 200 ms instead of appearing abruptly. With a mouse it still appears at once.
- `DropdownMenuRadioItem` now runs your `onClick` and `onPointerMove` handlers, after it selects its value. Disabled rows still select nothing and don't call `onClick`. Its docs now mark `value` and `label` as required.
- EmptyState announces reliably: it no longer uses `role="status"`, which screen readers read inconsistently. An EmptyState that appears or changes after the page loads announces its title and description once; one present at load announces nothing. A `role` you pass now reaches it. Your code needs no change.
- Clearing a FileInput returns focus to its visible button, so screen readers announce the field again.
- On touch screens, Tooltip and HoverCard open only on a real tap. Starting a scroll on an info icon no longer pops them open.
- Rows with `swipeActions` no longer block pinch-zoom, and a second finger hands the gesture to the browser.
- With Reduce Motion on, tooltips, popovers, menus, and other layers opened by a finger fade in within 200 ms instead of appearing abruptly. With a mouse they still appear at once.
- `Layout` no longer uses a selector that could make the browser restyle the whole layout on every change, which slowed long documents. It looks the same.
- Lightbox fills the visible screen, so Safari's toolbar on iPhone no longer covers the caption.
- A Lightbox opened before its first item arrives now opens when the item does.
- In right-to-left pages, Lightbox's arrow keys now match its Next and Previous buttons.
- Multi-digit numbers in List and Markdown stay on one line in a shared number column, so text and nested lists stay aligned. Bullet lists keep their spacing.
- Numbered List and Markdown markers end on the same edge with even-width digits, so every period lines up.
- Pasted-text counts, spoken shortcut names, Ctrl and Esc key caps, and file-size limits are now translated and use local number formats.
- DropdownMenu and ContextMenu rows under the mouse no longer show a keyboard focus ring after a click.
- DropdownMenu, MoreMenu, and ContextMenu shown as bottom sheets no longer keep the sheet and every item on the page while closed.
- `MobileNav` is never wider than 85% of the screen, as documented, so even a 320px phone keeps a strip of page to tap to close it.
- MultiSelector keeps your `aria-labelledby`, read after the field's label.
- A disabled `NavHeadingMenuItem` with `href` no longer navigates when clicked or activated.
- Sliding the mouse across NavHeadingMenu or TabMenu items no longer selects their text.
- NumberInput keeps your `aria-labelledby`, read after the field's label.
- A disabled NumberInput stays in the tab order, so keyboard and screen-reader users can reach it and hear that it is unavailable. It is read-only and marked `aria-disabled="true"` instead of using the native `disabled` attribute. Part of #7814.
- `Overlay`, `DropdownMenuGroup`, and `MobileNavToggle` pass `id`, `data-*`, `aria-*`, and event handlers through to the page, so test ids and analytics attributes work on them.
- Pressing Escape right after opening a Popover or a collapsed SideNav submenu leaves focus on the trigger instead of moving it into hidden content.
- An open Popover no longer captures Tab presses made elsewhere on the page. Tab inside the popover still cycles, and Escape still closes it.
- A Popover rendered into an iframe or a picture-in-picture window now focuses, keeps Tab inside, closes on Escape, and returns focus as it does on the page.
- PowerSearch no longer announces its starting result count when it mounts in React StrictMode.
- On phones and tablets, presses made with a mouse, trackpad, or the Space key now show the pressed state.
- Type declarations resolve in projects that use `moduleResolution: NodeNext`.
- `RadioList` no longer makes large pages restyle every row's contents on each change. It looks and behaves the same.
- Scrollable areas (`ScrollableArea`, and Table, CodeBlock, BottomSheet, and Schedule viewports) join the tab order as soon as their content overflows, including content that loads already overflowing.
- SegmentedControl keeps your `aria-describedby`, read before the disabled reason.
- Selector keeps your `aria-labelledby`, read after the field's label.
- Selector's phone sheet no longer points screen readers at an option that hasn't appeared yet.
- A collapsed SideNav item's tooltip now belongs to the link or button itself, so keyboard focus shows the label and screen readers read it.
- SideNavHeading: `headerEndContent` now sits beside the heading link instead of inside it, so pressing a button there no longer also follows the link.
- SideNav's rail collapses and expands smoothly instead of snapping, and the page content inside AppShell moves with it. Under Reduce Motion it cross-fades on touch and changes at once otherwise.
- Skeleton keeps pulsing in Safari while the page runs JavaScript. It looks and times the same.
- Slider keeps your `aria-labelledby`, read after its label.
- An idle Slider no longer keeps a page-wide listener running.
- A Slider drag belongs to the finger that started it: a second finger can't take it over or end it, and two fingers can still drag two sliders at once.
- A clickable Step reads as "1 Account" instead of "1Account". Nothing changes on screen. Fixes #7966.
- A Switch with long content in its row no longer makes the row restyle on every change. Its focus ring looks the same; a link inside the label or description keeps its own focus ring.
- Tabs and TabMenu triggers no longer shrink below their labels on pages that reset `min-width`; the tab strip scrolls instead.
- Pinned Table columns keep their row dividers while the table scrolls sideways, including theme and custom border colors.
- A disabled TextInput or TextArea stays in the tab order, so keyboard and screen-reader users can reach it and hear that it is unavailable. It is read-only and marked `aria-disabled="true"` instead of using the native `disabled` attribute. Part of #7814.
- TextInput keeps your `aria-labelledby`, read after the field's label.
- Thumbnail's Open and Remove buttons stay in place, focusable and announced as disabled, while they can't act, so keyboard focus no longer drops to the page.
- A toast dismissed while hidden, or before it first appeared, now really leaves the stack instead of taking an empty slot later.
- Tokenizer and PowerSearch put the text cursor right after the last token, on the last row.
- Tokenizer and PowerSearch tokens wrap before the clear-all button and loading indicator instead of running under them, and rows don't shift when a search starts or ends.
- A Tooltip that moved clear of its trigger stays clear when the trigger moves or the page scrolls.
- A Tooltip taller than the space above and below its trigger no longer covers the trigger: it opens beside it, or on the side with more room and scrolls.
- With Reduce Motion on, TopNav's mega menu fades on touch screens and opens at once with a mouse, instead of rising.
- Sliding the mouse across TopNavMenu action items no longer selects their text.
- Typeahead and Tokenizer hide an old "no results" row while the next search is running.
- Tapping a Typeahead's selected value to edit it, or the clear button in a Selector or MultiSelector search row, now brings up the phone keyboard on the first tap.
- In Typeahead, Tokenizer, and PowerSearch menus, an option is highlighted only when the pointer moves over it, not when it slides under a resting mouse, so Enter no longer picks an option you didn't point at.
- `VisuallyHidden` content can no longer be made visible by accident: `xstyle`, `className`, and `style` no longer reach the element.

  Measured prop by prop against `main`'s implementation, before and after this change:

  - `xstyle` arrived as the attribute only — the `style` attribute was unaffected — so passing it left a stray attribute on the page and changed nothing you could see.
  - `className` never reached the element, before or after.
  - `style` did reach the element, and an inline style could un-hide the content. It no longer does; this is the one visible change.

  None of the three is styling surface on `VisuallyHiddenProps`: `className` and `style` reach the element only through a cast or an untyped spread, and `xstyle` is documented as ignored, so typed code loses nothing.

  `xstyle` stays declared on `VisuallyHiddenProps`, documented as ignored, so existing code keeps compiling.

- Pinch-zoom works again over the TimeInput, DateTimeInput, and DateInput picker wheels.

#### Performance

- With an `animatedLayout` handle, a change in a long Collapsible or TreeList measures the page once instead of once per row.
- Pages with many closed popovers, tooltips, and menus load faster.
- Closed Tooltips, Selectors, and ComplexSelectors render once when they mount, and Popovers and DropdownMenus render less.
- Scrolling a `ScrollableArea`, Table, CodeBlock, or BottomSheet body does less work on each frame, so scrolling stays smooth on busy pages.

#### Documentation

- EmptyState now announces through the page's shared announcer regions. In tests, `getByRole('status')` or `getByRole('alert')` may match those regions; scope the query with `within(container)`.
- Badge's docs mark `label` as required, matching its types.
- `DropdownMenuSubMenu`'s docs mark `label` and `children` as required, document `menuDataTestId`, and state that `presentation` defaults to `'adaptive'`.
- `ListItem`'s docs now say that `isSelected` marks the row as the current item with `aria-current="true"`.
- Package links now point to the project's GitHub home, `meta/astryx`.
- SelectableCard's guidance no longer recommends it for single-choice groups, since each card is a checkbox.
- TabList's description no longer promises a built-in "more" menu (a narrow tab strip scrolls), and the library page template describes `MobileNav` as the slide-out drawer it is.

#### Contributors

Thanks to everyone who contributed to this release:

- @aashish254
- @cixzhang
- @ejhammond
- @ernestt
- @harjothkhara
- @HelloOjasMutreja
- @imdreamrunner
- @kentonquatman
- @korkt-kim
- @kyu-rong
- @light-merlin-dark
- @nynexman4464
- @parinith-web
- @rubyycheung
- @thewebartisan7
- @vjeux

---

# 0.7.4

#### New Features

- `BottomSheetSwitcher` presents each step in its own native `<dialog>`. Every child `BottomSheet` owns a dialog exactly like a standalone sheet; the switcher presents the selected sheet's dialog (`showModal()` with a scrim, `show()` without), keeps the previous sheet's dialog open and inert beneath the entering one through the handoff, and closes it once its panel has faded. One backdrop paints at a time: the retained dialog keeps the scrim until it closes, then the new dialog takes it over without a fade, so the page is never dimmed twice and the previous panel is never dimmed. Focus containment is the browser's own modal-dialog containment (as for `Dialog`) instead of a script trap; the page scroll lock (the shared body lock, held once by the switcher for the whole modal flow, through a handoff and until after the exit), Escape and platform-close routing, `purpose` dismissal rules, and focus return to the opener are unchanged. Going back to a sheet whose dialog is still fading closes and re-presents that dialog so the interactive sheet is the topmost layer again. (#7720)
  Public props, defaults, and exports are unchanged. Two observable details move with the structure: The switcher's `ref` resolves to the dialog hosting the flow — the active sheet's dialog, which changes on a handoff; the exiting sheet's through its exit; and, while the flow is closed, the dialog that hosted it last (or the first mounted sheet's) — instead of one persistent element; it is never `null` while a sheet is mounted, from the first commit on, and a callback ref's returned cleanup runs on each detach. `onCancel` and the forwarded dialog props apply to each sheet's dialog (a `role` given to the switcher included, except on a `required` step, which is an `alertdialog` as before), except `id` and `data-testid`, which render once, on the dialog the `ref` resolves to, from the first commit's synchronous re-render on; server markup of a flow that mounts closed carries them on no element (the shared dialog carried them). A non-modal flow orders its sheet dialogs inside a switcher-owned isolated wrapper that carries the one overlay value the shared dialog carried before.

#### Fixes

- `TextInput`, `TextArea`, `Selector` and `MultiSelector` announce "Loading" once, politely, through the shared announcement channel when they become busy, and the Spinner they show while busy is hidden from assistive technology. Before, the Spinner mounted as its own `role="status"` region already holding its name, which screen readers often skip, and it competed with the control's own `aria-busy` as a second owner of the same feedback. A rerender or StrictMode replay does not repeat the announcement; settling and becoming busy again announces again. Tests that found the busy Spinner with `getByRole('status', {name: 'Loading'})` should check the control's `aria-busy` instead. (#7920)
- Carousel: when the focused edge scroll button runs out (the carousel reached that edge), focus now moves to the scroll area without scrolling it, instead of to the opposite scroll button. No API changes. (#7926)
- `CheckboxInput` announces its busy start ("Loading") once, politely, through the shared announcement channel. The Spinner it shows in place of the check mark while busy sits inside the decorative, hidden indicator, so before this nothing told screen-reader users that the checkbox had become busy beyond its `aria-busy`. Inside an open modal dialog the announcement goes to a status region in the dialog. (#7948)
- `CommandPaletteItem` now reflects its highlighted, selected, and disabled states on the `command-palette-item` theme target as `data-highlighted="highlighted"`, `data-selected="selected"`, and `data-disabled="disabled"`. A theme can now style the active keyboard result, the chosen value, or an unavailable command, for example `.astryx-command-palette-item[data-selected]`. States derived from CommandPalette are reflected too. Rendering, semantics, and props are unchanged. (#7967)
- `CommandPalette` announces each busy start ("Loading"), including its load on opening or clearing the query, once from a status region inside its dialog, and its search Spinner is hidden from assistive technology. Before, the Spinner mounted as its own `role="status"` region already named "Loading", and the palette's own "Loading" went to the page-level announcement channel, which an open native modal hides from assistive technology. Result-count announcements are unchanged. Tests that found the Spinner with `getByRole('status')` should query the Spinner element instead. (#7956)
- A busy `DateInput` (`isLoading`, or a pending `changeAction`) no longer looks disabled. On the popover, native, and bottom-sheet surfaces the field keeps its ordinary paint and shows its Spinner while new commits are blocked; only `isDisabled` dims the field. The busy field still takes no hover ring and keeps its keyboard focus ring. Props, semantics, and announcements are unchanged. (#7968)
- `DateInput` (popover, native and bottom-sheet presentations) and `DateRangeInput` announce their busy start ("Loading") once, politely, through the shared announcement channel, and the Spinner they show while busy is hidden from assistive technology. Before, that Spinner mounted as its own `role="status"` region already named "Loading", which screen readers often skip, and it was a second owner beside the field's `aria-busy`. Inside an open modal dialog the announcement goes to a status region in the dialog. Tests that found the busy Spinner with `getByRole('status', {name: 'Loading'})` should check the field's `aria-busy` instead. (#7939)
- `DateTimeInput` and `TimeInput` (popover, native and bottom-sheet presentations) announce their busy start ("Loading") once, politely, through the shared announcement channel, and the Spinner they show while busy is hidden from assistive technology. Before, that Spinner mounted as its own `role="status"` region already named "Loading", which screen readers often skip, and it was a second owner beside the field's `aria-busy`. A change made inside the open bottom sheet under a pending `changeAction` is announced from inside the sheet. Tests that found the busy Spinner with `getByRole('status', {name: 'Loading'})` should check the field's `aria-busy` instead. (#7942)
- `FileInput` announces its busy start ("Loading") once, politely, through the shared announcement channel, and the Spinner it shows while busy is hidden from assistive technology. Before, that Spinner mounted as its own `role="status"` region already named "Loading", which screen readers often skip. A file pick keeps its single "file selected" announcement, because it is one user action, even when it starts a busy period (`changeAction`, or `isLoading` set from `onChange`). Other busy starts, such as `isLoading` on its own or a clear under `changeAction`, announce "Loading". Inside an open modal dialog the announcement goes to a status region in the dialog. Tests that found the busy Spinner with `getByRole('status', {name: 'Loading'})` should check the field's `aria-busy` instead. (#7954)
- Selector, DropdownMenu and ContextMenu: clicking an option inside a shadow root (open, closed or nested) selects it. The menus used to read the document's view of the click, which names the shadow host, so the click closed the menu without selecting anything. (#7914)
- `DropdownMenuSubMenu` (with `hasSpinner`), an uploading `Thumbnail`, and `ChatMessageList` while it loads older messages announce their busy start ("Loading") once, politely, through the shared announcement channel. The Spinner each one shows is hidden from assistive technology. Before, that Spinner mounted as its own `role="status"` region already named "Loading", which screen readers often skip; in `ChatMessageList` it was also a second live role inside the log. Tests that found these Spinners with `getByRole('status', {name: 'Loading'})` should query the Spinner element or the owner's busy state instead. (#7950)
- ChatComposerInput: the trigger menu's loading row no longer mounts as a `role="status"` region already holding its text, which screen readers could skip. The loading text is announced once per pending search through the shared polite channel instead, and a search that returns its results before the loading row is painted, such as `createStaticSource` or a cached result, announces nothing; the visible row and its `loadingText` are unchanged. (#7900)
  Fixes #7859.
- useTypeahead clears its pending buffer reset when its component unmounts or an `<Activity>` boundary hides it, so a menu, list or selector removed within 750 ms of a typed character leaves no timer running behind it, and a hidden one comes back with an empty buffer (#7938)
- `ComplexSelector`, `Typeahead`, `Tokenizer` and a directly used `BaseTypeahead` announce their busy start ("Loading") once, politely, through the shared announcement channel, and the Spinner they show while busy or while a search is in flight is no longer a live region: ComplexSelector's is hidden from assistive technology, and the search Spinner of Typeahead, Tokenizer and BaseTypeahead stays named as an image ("Loading") so the search's busy feedback keeps its name. Before, that Spinner mounted as its own `role="status"` region already named "Loading", which screen readers often skip, and it was a second owner beside the control's `aria-busy`. Inside an open modal dialog the announcement goes to a status region in the dialog. Tests that found the busy Spinner with `getByRole('status', {name: 'Loading'})` should check the control's `aria-busy`, or find the search Spinner with `getByRole('img', {name: 'Loading'})`. (#7930)

#### Documentation

- `BottomSheetSwitcher` anatomy names its host part `Sheet dialogs` — one native dialog per child sheet, the one hosting the active sheet carrying the flow's ref, id, modality, and dismissal — instead of `Shared dialog`. (#7720)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @HelloOjasMutreja
- @imdreamrunner
- @vjeux

---

# 0.7.3

#### New Features

- `DropdownMenuSubMenu` takes `header` and `footer`, as the root `DropdownMenu` does, so a sub-menu can have a filter field above its rows, or an action such as "New folder" below them, outside the sub-menu's menu itself. With either, the sub-menu's surface (the flyout, or the drilled-in view on a phone) is a modal dialog named by its row: the row says `aria-haspopup="dialog"`, Tab and Shift+Tab walk the header, the rows and the footer and wrap, Escape returns to the row, and a pointer leaving the flyout closes it only once focus leaves too. A `ContextMenu` does not show a sub-menu's `header` or `footer`. Without them nothing changes.

  ```diff
   <DropdownMenuSubMenu
     label="Move to"
  +  header={<TextInput label="Filter folders" isLabelHidden value={query} onChange={setQuery} />}
  +  footer={<Button label="New folder" onClick={createFolder} />}
   >
     <DropdownMenuItem label="Folder A" onClick={() => move('a')} />
   </DropdownMenuSubMenu>
  ```

#### Fixes

- `TimeInput`'s arrow keys ignore a fractional increment instead of writing a malformed time such as "14:30.5": `adjustTime` returns the time unchanged for a fractional minute delta ([#7823](https://github.com/meta/astryx/pull/7823)).
- Screen readers now announce a `Button` that is first rendered with `isLoading` (for example after a remount). Its visually hidden loading live region mounts empty and gets "Loading" on the next frame, because screen readers skip a live region that already holds its text when it appears. A Button that becomes loading after it mounts is unchanged, and a Button mounted idle does no extra render.
- `ChatComposer`: screen readers now announce a status message, errors assertively and warnings politely, once per occasion: a rerender does not repeat it, and a status that clears and then returns is announced again. Before, the status bar mounted as a `role="alert"` or `role="status"` region already holding its text, which screen readers often skip. The message now goes through the shared announcement channel, and the visible bar no longer carries a live role. No API changes.
- `ChatSystemMessage`: a new chat notice inside a `ChatMessageList` now has one live region announcing it, the list's polite log, instead of also being a second live region nested in it (WCAG 2.2 SC 4.1.3). Its root no longer forces `role="status"`, in either variant, so date and divider rows are no longer presented as status messages, and a `role` passed to the component reaches its root. Tests that found a system message by the `status` role should query it by its text instead.
- Keyboard and screen-reader users can now reach disabled `CheckboxInput`, `CheckboxList` items, `Switch`, `Slider` and `FileInput`, and hear that they are disabled. Before, they rendered the native `disabled` attribute unless a `disabledMessage` was set, so Tab skipped them. Now every disabled control exposes `aria-disabled="true"` and keeps the Tab stop it has when enabled, while toggling, selecting, dragging, opening the file picker and any `onClick` stay blocked, and its value is still left out of form submission. A focused disabled checkbox, switch, slider thumb or file input shows its keyboard focus indicator. No API changes.
- The agent guide that global mode writes to the home folder now tells agents to deliver a page built with Astryx, not only how to find things. Before, agents that found the right template could still build the page with a tool that cannot install packages and deliver a page with no Astryx in it. The guide now tells agents to work in a project folder (creating one if there is none); add `@astryxdesign/core` and `@astryxdesign/cli` to a new project or one without Core, or, in a project that already has `@astryxdesign/core`, the CLI at the same version; run `astryx init` there; follow the same template-first workflow and self-check the project agent docs give; and end by building the project and delivering that build. The guide stays version-free and names only commands every release keeps. The project agent docs are unchanged, and so is what `@astryxdesign/core`'s install script prints: its copy of the shared agent-docs file only gains the same workflow lines.
- Keyboard and screen-reader users can now reach a disabled `ComplexSelector` and hear that it is unavailable (WCAG 2.2 SC 2.1.1 and 4.1.2). Before, its trigger rendered the native `disabled` attribute, so Tab skipped it and a focused trigger lost focus when disabled; now it exposes `aria-disabled="true"`, keeps focus, shows its keyboard focus outline, and still opens nothing. A press or key on it reaches no handler: not the toggle, not a caller's `onClick` or `onKeyDown`, and not an ancestor's click handler.
- Keyboard and screen-reader users can now reach a disabled `Calendar` day or `Pagination` dot and hear that it is disabled. Disabled `TreeList` rows' expand toggle and action button, disabled `Pagination` dots and disabled `Calendar` days expose `aria-disabled="true"` instead of the native `disabled` attribute, while clicks, Enter and Space still do nothing and arrow keys still skip disabled days as before. No API changes.
- `DateInput`: keyboard and screen-reader users can now reach a disabled date field and hear that it is disabled. A disabled or busy field no longer renders native `disabled`: its input and calendar button keep their place in the focus order and expose `aria-disabled`, while typing and opening stay blocked, and a focused disabled field shows its focus ring. Tests that query a disabled DateInput with `toBeDisabled()` or `:disabled` should check `aria-disabled="true"` instead.
- `DateRangeInput`: keyboard and screen-reader users can now reach a disabled field or preset and hear that it is disabled. A disabled or busy field and a disabled preset no longer render native `disabled`: the trigger, calendar button and presets keep their place in the focus order and expose `aria-disabled`, while opening and selecting stay blocked, and a focused disabled field shows its focus ring. Tests that query them with `toBeDisabled()` or `:disabled` should check `aria-disabled="true"` instead ([#7866](https://github.com/meta/astryx/pull/7866)).
- `DateTimeInput`: keyboard and screen-reader users can now reach a disabled or busy field and hear that it is disabled. It no longer renders native `disabled` on its text, native-picker or touch fields, or on its calendar and clock buttons: they keep their place in the focus order and expose `aria-disabled`, while typing, picking, opening and a caller's `onClick` stay blocked, and a focused disabled field shows its focus ring. `TimeInput`'s native picker button, which shares the time segment and stays out of the tab order, also moves from `disabled` to `aria-disabled` and stays inert. Tests that query a disabled DateTimeInput with `toBeDisabled()` or `:disabled` should check `aria-disabled="true"` instead.
- Apps that use Core's prebuilt CSS without a StyleX build step now get the default data colors: the prebuilt CSS defines the canonical `dataVars` defaults, so compiled imports and raw CSS references paint correctly.
- `Dialog`, `BottomSheet` and `BottomSheetSwitcher` stay open when a file picker inside them is dismissed. A file input fires a bubbling `cancel` event when its picker closes without a choice, and all three took that event for a close request of their own and closed (a switcher closed its whole flow). They now act only on a `cancel` aimed at their own `<dialog>`, so Escape and platform close requests (the Android back gesture) behave as before. No API changes.
- `DropdownMenuRadioGroup` now forwards `ref`, and its docs explain controlled selection, how to name the group, when the menu closes, and how it composes inside a `DropdownMenu`.
- `astryx init` writes the agent docs at the project root, in files the project commits, so Codex, Gemini CLI, Copilot CLI and Claude Code all read the block from the project root or any folder below it ([#7497](https://github.com/meta/astryx/pull/7497)). It no longer writes agent docs into a project's subfolder, the home folder, or a settings folder in it such as `~/.gemini`.
  - `AGENTS.md` holds the block, created when missing. Before, a project with only `CLAUDE.md` got the block only there, so Codex and Gemini CLI never saw it.
  - Claude Code skips `AGENTS.md` in a folder that has a `CLAUDE.md` or `.claude/CLAUDE.md`, so the Claude Code file the project already has keeps a full copy: root `CLAUDE.md`, else `.claude/CLAUDE.md`. It keeps the copy even when it imports `AGENTS.md`, because Claude Code does not follow that import in a session started in a subfolder; started at the root, Claude Code then reads two. When both exist, the copy goes in root `CLAUDE.md`, which projects commit even when they ignore `.claude/`, and a block in `.claude/CLAUDE.md` is removed. Init creates no Claude file. `astryx upgrade` refreshes every copy, except in a project at the top of a home settings folder (see the next entry).
  - Gemini CLI reads only `GEMINI.md`: init adds a one-line import, `@./AGENTS.md`, creating `GEMINI.md` when it is missing. It adds none when `GEMINI.md` already imports `AGENTS.md`, inline or on its own line. It adds the import even when the project's `.gemini/settings.json` has Gemini read `AGENTS.md` through `context.fileName`: Gemini loads those settings only when it starts at the project root, so a session started in a subfolder would otherwise get no copy. Started at the root, Gemini then reads two.
  - The project root is the nearest folder at or above where init runs whose `package.json` declares an `@astryxdesign` package, else the nearest with any `package.json`. The search stops at a repository root and never counts the home folder. With no `package.json` found, init writes where it runs, as before. `docsWritten` still lists each file relative to where init ran, for example `../../AGENTS.md`.
  - A `GEMINI.md` that resolves outside the project, for example a link to a shared file, is skipped and reported in `docsError` with one note (not an error line), in the default layout and in a project's own layout; the rest is written and init exits 0.
  - The managed block belongs to Astryx: init and `astryx upgrade` write, refresh, and remove only the block, whatever ignore rules or generated markers say, as 0.7.1 did, and never change the text around it. Every write stays inside the project: run in the folder 0.7.1 wrote, an agent file 0.7.1 wrote there whose path leaves the project still refuses the run with exit 1. The project's Claude Code file (root `CLAUDE.md`, or `.claude/CLAUDE.md` when there is no root one) that resolves outside the project and is a block-less import of an existing `AGENTS.md`, which 0.7.1 left alone, is skipped and reported in `docsError` with one note, and init exits 0. Run from a folder below the project root, where 0.7.1 wrote in that folder instead, a project-root file whose path leaves the project is skipped and reported in `docsError` with one note, the rest is written, and init exits 0.
  - While root `CLAUDE.md` is untracked and ignored by the repository's ignore rules (any ignore file from the repository root down, such as a monorepo's root `.gitignore`, the local exclude file, or configured excludes; init asks git, Sapling or Mercurial), a `.claude/CLAUDE.md` the project commits gets the copy too, so a fresh clone still gives Claude Code a copy; `--agent claude` and `--agent all` write it there as well. A file the repository tracks counts as committed whatever the ignore rules say, as git and Mercurial ignore only untracked files, and when the repository cannot answer, the copy is kept, on the first run as on later ones. Such a copy that resolves outside the project refuses the run with exit 1 where 0.7.1 wrote it too; one 0.7.1 did not write (the one `--agent claude` adds, or a block-less import of an existing `AGENTS.md`) is skipped and reported in `docsError` with one note, and init exits 0. So is a `.claude/CLAUDE.md` whose block `--agent claude` would remove beside a `CLAUDE.md`, since 0.7.1's `claude` preset wrote only `CLAUDE.md` there. Beside a committed root `CLAUDE.md`, with `.claude` linked outside the project, three cases that 0.7.1 refused now exit 0 with nothing written: the default with a `.claude/CLAUDE.md` of plain text, and `--agent all` with one of plain text or a block-less import of `AGENTS.md`; root `CLAUDE.md` holds the copy, so no write leaves the project. In a project that keeps its own layout, a `GEMINI.md` that imports no agent file now gets a copy, as the other agent files do.
  - The copy in `.claude/CLAUDE.md` is removed only once root `CLAUDE.md` holds the same block, and only the managed block between its markers: the rest of the file stays, and the file is deleted only when nothing but whitespace is left. `astryx init --remove-agents` deletes a file it created only when nothing but whitespace or init's own heading is left; 0.7.0 also deleted a file whose remaining text had a heading and any line with the word "guidance".
  - `astryx init --remove-agents` removes the block at the project root, where `init` writes it, and in the folder it runs in. Run from a subfolder, it removes what `init` wrote at the root, and a block an earlier version left in that subfolder; a root agent file with a block that resolves outside the project is left as it is with a note, and the run exits 0, as 0.7.1 did when it touched only the subfolder. Exit codes and the JSON shape are unchanged.
  - `--agent claude` and `--agent all` never leave a block in both `CLAUDE.md` and `.claude/CLAUDE.md`, unless the project ignores `CLAUDE.md`: when `CLAUDE.md` gets the block, a block in `.claude/CLAUDE.md` is removed. `--agent all` keeps the `GEMINI.md` import. The `--agent` help and the working-with-AI guide say so. `--agent-docs-path` writes where init runs, as before.
  - `astryx doctor` fails when the `GEMINI.md` import points at an `AGENTS.md` with no block. The setup check in the CLI and in `@astryxdesign/core` no longer counts that import as set up, and looks at `GEMINI.md`. The reminder to run `init` that commands print looks at the project root too, so it stops once `init` has run in a nested package.
- `astryx init` and `astryx upgrade` no longer write agent docs into your home folder, or into a settings folder in it such as `~/.gemini` or `~/.claude` outside a project. Agents read the files in those folders in every project, so a block there reached unrelated work. This follows the CLI's existing rules that no command writes agent docs into those folders and that a write outside a command's own folder is refused before anything is written.
  - **Refused by `init`:** the home folder itself, and the top of any folder in it whose name starts with a dot (every such folder is a settings folder), even when it holds a `package.json`. A folder below it with its own `package.json` is a project and is set up normally, such as an agent worktree in `~/.codex/worktrees/` or `~/.cursor/worktrees/`, and `astryx upgrade` refreshes it. With `--agent-docs-path`, each file's own folder is checked: from the home folder, `notes/AI.md` is written as before, while `AI.md` or `.claude/CLAUDE.md` is refused.
  - **What `init` does instead:** it writes no agent docs, reports `docsError` as `install-failed` with the reason, and exits 0, as before.
  - **Refused by `upgrade`:** refreshing a block in a project whose root is the home folder or the top of a settings folder, such as `~/.dotfiles` with a `package.json`, with or without `--apply`. It leaves the block as it is, sets `agentDocs.action` to `error` (never `would-refresh`), and warns with the folder and why; its other steps and its exit status are as before. With no block there, it gives the same reason instead of suggesting `astryx init`. `astryx doctor`'s agent-docs fix does the same, and the setup reminder after each command stays quiet.
  - **Migration:** run `astryx init` from the project's own folder, or add the block to the file by hand. Move a project rooted at the home folder or a settings folder into a folder of its own, or update or remove its block by hand. To remove a block an earlier version wrote into `~/.claude/CLAUDE.md`, run `astryx init --remove-agents` in the home folder.
- Keyboard and screen-reader users can now reach a disabled `MultiSelector` and hear that it is unavailable (WCAG 2.2 SC 2.1.1 and 4.1.2). Before, its trigger rendered the native `disabled` attribute and `tabIndex={-1}`, so Tab skipped it and a focused trigger lost focus when disabled; now it exposes `aria-disabled="true"`, keeps focus, still opens nothing, and submits no form value. Like a natively disabled button, it runs no caller event handler other than focus and blur, and a press on it reaches no handler. A focused disabled trigger shows a keyboard focus ring, dimmed with the rest of the control (WCAG 2.2 SC 2.4.7).
- Keyboard and screen-reader users can now reach a disabled `Link` or `ClickableCard`, and the buttons of a disabled `Token`. Before, they rendered the native `disabled` attribute or `tabIndex={-1}`, so Tab skipped them. Now each disabled control exposes `aria-disabled="true"` and keeps the Tab stop it has when enabled, while activation by click, Enter or Space, `onClick`, removal and navigation stay blocked; a disabled Link keeps no live destination and is exposed with the link role. A `Popover` no longer opens from a wrapped or `anchorRef` trigger marked `aria-disabled="true"` (for example a disabled `Button` with a `tooltip`), including for a click dispatched straight on the trigger; before, such a click opened it. No API changes.
- Keyboard and screen-reader users can now reach a disabled `Selector` and hear that it is unavailable (WCAG 2.2 SC 2.1.1 and 4.1.2). Before, its trigger rendered the native `disabled` attribute and `tabIndex={-1}`, so Tab skipped it and a focused trigger lost focus when disabled; now it exposes `aria-disabled="true"`, keeps focus, still opens nothing, and submits no form value. Like a natively disabled button, it runs no caller event handler other than focus and blur, and a press on it reaches no handler. A focused disabled trigger shows a keyboard focus ring, dimmed with the rest of the control (WCAG 2.2 SC 2.4.7).
- `Selector` options in a narrow list now shrink and truncate a long label with an ellipsis instead of being clipped past the list edge.
- `Switch`: a busy switch announces "Loading" once per busy start. Under React StrictMode the announcement used to be made twice.
- `TimeInput`: keyboard and screen-reader users can now reach a disabled field, or a busy bottom-sheet field, and hear that it is disabled. It no longer renders native `disabled` on its typed, native-picker or touch input or its picker button: they keep their place in the focus order and expose `aria-disabled`, while typing, arrow-key adjustment, opening, submitting a surrounding form with Enter, and a caller's `onClick` stay blocked, a draft typed before the field became disabled is dropped, and a focused disabled field shows its focus ring. Tests that query a disabled or busy TimeInput with `toBeDisabled()` or `:disabled` should check `aria-disabled="true"` instead.
- Pages that use `Timestamp` with an absolute format (`date`, `time`, `date_time` and the other fixed formats) now prerender in Next.js with `cacheComponents` turned on, where they used to fail the build: `Timestamp` no longer reads the current time while rendering on the server, and absolute formats never read the clock. `relative`, `relative_short` and `auto` read the clock on the client only: a server render or static prerender shows the full date and time in UTC, labelled, and the client switches to the format's normal output right after hydration, so server and client markup now always match. Client-only rendering is unchanged. No API changes ([#7883](https://github.com/meta/astryx/pull/7883)).
- `Tooltip`: moving the pointer straight from the trigger onto the tooltip in one step no longer hides it, so it stays open while hovered (WCAG 2.2 SC 1.4.13).
- A `SideNavItem` in a collapsed `SideNav` now shows its tooltip on hover and gets `aria-describedby`, even when the item first appears inside an already-collapsed `SideNav`, the common case for saved collapse state. Before, only an item that collapsed after it appeared got a tooltip. Fixes [#7692](https://github.com/meta/astryx/issues/7692).

  A `Tooltip` with an `anchorRef` that renders inside the very element the ref points at, as `SideNavItem` does, now attaches however it mounted. The effect now re-checks the anchor once the commit has finished attaching refs; event listeners and the `aria-describedby` merge and restore are unchanged.

- `TopNav` on narrow screens: a long `TopNavHeading` now gives way (it truncates with an ellipsis, or wraps when the heading is a link) instead of pushing the end content and the menu toggle past the edge of the bar, and the mobile drawer's close button is back on screen.
- `Typeahead`: clearing the value while editing it now empties the input and reports `onChangeQuery('')`, instead of leaving the old label in a field with no value. Fixes [#7038](https://github.com/meta/astryx/issues/7038).

#### Performance

- Pages with many code blocks, such as a long Markdown document, paint sooner on first load: `CodeBlock` inserts its syntax-highlight rules before the first layout read instead of after it, which cut first paint by 16–19% in 100–500 KB test documents ([#7875](https://github.com/meta/astryx/pull/7875)). The rules and the highlighted output are unchanged.
- Pages that update around a long `Markdown` document stay responsive: Markdown skips re-rendering its document when a parent re-renders without changing the text or any rendering prop, and a link handler passed as a new function on each render no longer forces that work. The rendered output is unchanged.

#### Documentation

- The `DropdownMenuItem` docs now explain when an item is an action or a destination, disabled items, and supporting content.

#### Contributors

Thanks to everyone who contributed to this release:

- @aashish254
- @cixzhang
- @ejhammond
- @HelloOjasMutreja
- @josephfarina
- @kyu-rong
- @Pushpak731
- @vjeux

---

# 0.7.2

#### Experimental APIs

- Drawer's full-viewport mobile coverage ships as experimental: `experimental={{isFullWidthOnMobile: true}}` fills the viewport below 640px instead of keeping the 56px page reveal. Anything inside Drawer's `experimental` prop may change or be removed in a patch release; omitting it keeps the stable behavior.

#### New Components

- Promote `Drawer` and `DrawerHeader` from the canary-only Lab package to Core, imported from `@astryxdesign/core/Drawer` or the package root. The stable package now ships the full-height side panel with modal and non-modal presentation, the shared dismissal stack, Dialog's `purpose` dismissal policy, a `DrawerHeader` whose close button appears when given `onOpenChange`, and Dialog-style container padding (`--spacing-4` by default, `padding` prop, or a theme's `drawer` padding), plus Core documentation and runnable examples. Canary users importing from `@astryxdesign/lab` switch to `@astryxdesign/core/Drawer`.

#### New Features

- An integration can set the command its users run the CLI with: a new `cliCommand` field in `astryx.integration.*`, such as `cliCommand: 'acme astryx'`. In a project that loads that integration, every command the CLI prints starts with it instead of the package-manager prefix (`npx astryx`, `pnpm exec astryx`): next-step hints, errors, suggestions, Doctor fixes, `--help`, the setup reminder, the agent-docs block, and doc text. If two loaded integrations set different commands, neither is used, and the new `cli-command` check in `astryx doctor` warns. An invalid `cliCommand` is ignored with an `invalid_cli_command` warning; the rest of the manifest still loads.
  Docs, including an integration's, are now written with bare `astryx ...` commands, and `astryx docs` prefixes them for the project when it prints them. JSON output keeps every command bare, as before. The install-time setup reminder from `@astryxdesign/core` and `@astryxdesign/cli` names the command the project's package manager runs, instead of always `npx @astryxdesign/cli`.
- Adds the `@astryx.diffViewer.*` keys to the `en` catalog so the lab `DiffViewer` reads its file-status badges, line counts, line-number button labels, per-line "Added"/"Removed" labels, and empty-state messages from the translation runtime. No existing string changes; locales without a translation fall back to English.
- `Item` accepts `align="first-line"`, which centers each start and end slot on the label's first line. A small status dot, radio, checkbox, or timestamp beside a wrapping label now stays level with the first line, where `center` drops it to the middle of the row and `start` leaves it above the line. A slot taller than the first line moves the text down rather than leaving the row, and a one-line row with no description looks the same as `center`. `ListItem`, `RadioListItem`, and `CheckboxListItem` accept the same `align` and pass it to their row. Themes can style these rows through the `item` target's `align` axis. The default stays `center`, so existing rows don't change.
- i18n catalog: add the English messages used by the Lab CommentComposer for its input, image upload, inline quote, emoji action, cancel action, and retry affordance.
- i18n catalog: add the English messages used by the Lab CommentThread for replies, reactions, edit history, resolution, errors, comment actions, and the unsaved-draft warning it announces when a dismissal would discard a reply or edit.
- i18n catalog: add the English messages used by the Lab Comments panel for its region, empty/loading states, pagination, and posting errors.
- i18n catalog: add the English messages used by the Lab EmojiPicker so locale catalogs and provider overrides can replace its labels, search status, loading state, and group names.
- `List`: add `edge` to choose where each row's text, dividers, and hover and selection backgrounds sit. `padded` (default) keeps today's look. `flush` drops the rows' side padding, so text and dividers start on the same line as the list header and a heading above, with no container needed. `outset` keeps backgrounds' room around the text while reaching into the padding of a Card, Section, or Dialog, so text lands on the heading's line. `bleed` reaches rows to the container's edges with square corners, like Table rows in a Card. `edgeCompensation="inline"` is deprecated in favor of `edge="outset"` and keeps working; its rows' outer room is no longer cut off by the list's swipe clip. Run `astryx upgrade` to rename it.
- `Pagination`: `variant="compact"` shows first/last buttons around previous/next when `hasFirstLast` is `true` and the page count is known. Compact still omits them by default, and the `input` variant still shows them unless `hasFirstLast` is `false`.
- `reset.css`: in Chromium, the dropdown marker of an `<input>` with a `list` sits in the middle of the field. Chromium sets the marker on the field's line-height, so above a line-height of 1 it sits low, and the reset makes every field inherit the page's 1.5: the marker sat 3.5px below the middle of a 40px field, and further down on taller lines. Date and time fields, whose calendar icon uses the same part, keep their icon where it was. To keep the old placement, add `input[list]::-webkit-calendar-picker-indicator { line-height: inherit; }` after the reset.
- `SideNavItem`: nested items now span the full width of the nav list, like top-level items, so their hover and selected fill lines up with the rows above them. Before, a nested item started 24px in from the list edge. The indent now sits inside the row, one `--spacing-6` step per nesting level, so icons and labels stay exactly where they were. The indent area is now part of the nested row, so it shows hover feedback and clicking it activates the item. Content placed directly inside a `SideNavItem` that is not itself a `SideNavItem` is no longer inset by the children group. There is no supported way to keep the old inset look.
- `TabMenu` passes host attributes and DOM event handlers to its trigger button. The trigger keeps its button semantics, tab stop, and menu disclosure attributes; a caller's `onClick` runs after the menu toggle.
- Tables draw a line on every cell edge, not only between rows, on both `Markdown` and the RichText surfaces, and the grid closes at the table's rim. A reader following one row across never needed vertical lines, but someone editing a table has to aim at a cell and judge where a selection stops, and the empty 3×3 a toolbar insert produces was three horizontal rules with no sign it had three columns. The line is the same `--color-border` already used between rows, the rim merges with it into one rule rather than doubling at the edge, and both surfaces move together — the read and edit renderings match block for block, more closely than before.
- `TreeList`: nested rows now span the full width of the list, like root rows, so their hover and selected fill lines up with the rows above them. Before, a nested row started at its indent. The indent now sits inside the row, so chevrons, icons and labels stay exactly where they were. The indent area is now part of the row, so it shows hover feedback, and clicking it activates the row: clicking a folder's indent toggles the folder, and clicking a row whose only action is its link anywhere outside its label follows the link, as Enter already did: modifier keys are kept, so Cmd/Ctrl-click opens a new tab, and a middle-click opens one too. Controls in a row's start or end content keep their own clicks, including role-based ones such as a `role="switch"` element, which no longer also toggle the row or run its `onClick`. Guide lines draw above the rows, so a hover or selected fill doesn't break them, and they let clicks pass through to the row underneath. The one exception is a row with keyboard focus: it draws above the guides so they never cut its focus ring, which means that if it is also filled (selected or hovered), its fill covers the guides at that row. Padding set on a row through the `tree-list-item` theme target or an item's `className`, `style` or `xstyle` still composes with the indent. `--tree-list-indent` still retunes the indent step. There is no supported way to keep the old inset rows.

#### Fixes

- Allow MetadataList label width without an explicit position while preserving single- and multi-column label defaults (#6310)
- AppShell: defer hiding the mobile nav's Activity boundary until its close animation finishes (#5701)
  `AppShell` mounts the mobile nav drawer inside a `React.Activity` boundary that flipped to `mode="hidden"` in the same commit as the drawer closing. React's `Activity` hides its subtree with `display: none !important` synchronously and re-runs the cleanup of every effect inside it, which cut off `MobileNav`'s own slide-out CSS transition and cancelled its delayed `dialog.close()` before either could run. The drawer still closed correctly (a safety-net effect force-closed the native dialog on that same cleanup), just with the close animation skipped entirely.

  `AppShell` now holds the `Activity` boundary visible for a beat after the drawer closes, strictly longer than `MobileNav`'s own worst-case close delay, so `MobileNav`'s normal close effect gets a real chance to run its transition and its own timed `dialog.close()` before `Activity` ever hides the subtree.

  `MobileNav` also keeps its dialog rendered from the commit that closes it until its delayed `close()` has run, instead of relying on the dialog's discrete `display` transition to do so. A browser that does not hold that transition (WebKit) dropped the dialog to `display: none` at once while it was still an open modal, so for about 200ms nothing was visible and the page stayed inert. The slide-out itself is unchanged.

- `AspectRatio`'s `fit="cover"` and `fit="contain"` now fill the box on the documented Tailwind setups. The fit rules lived in `reset.css`, in the `reset` layer, and the setup guides put Tailwind's preflight in a layer above it, so preflight's `img, video { height: auto }` won and a fitted image kept its own aspect ratio. The fit sizing now ships with the component's own styles in `astryx-base`: above preflight, and below Tailwind's utilities, so a utility class on the child still wins. `reset.css` no longer carries AspectRatio rules.
  With `fit="cover"` or `fit="contain"`, a direct child's own Astryx styles (an Astryx component's own size or `object-fit`) no longer override the fill. To keep a child's own size, set it with an inline style, unlayered CSS or a rule in a later layer, or leave `fit` unset.
- The static `AvatarGroupOverflow` chip (no `onClick`) is exposed to assistive technology as an image named by its count label ("5 more"). Before, it was a span with an `aria-label` but no role, a name the generic role does not allow, so screen readers could skip the count. This meets WCAG 2.2 SC 4.1.2 Name, Role, Value. Nothing changes visually; the clickable chip stays a button, and a `role` passed by the caller still wins.
- `Button` (and `IconButton`) no longer use the native `disabled` attribute while a busy state (`isLoading`, or a non-interruptible `clickAction` in flight) is the only reason the button can't be clicked. A natively disabled element can't hold focus, so the browser moved focus to `<body>` the instant an action started and never restored it — the classic reason busy state should be visual-only. Busy now uses `aria-disabled` (button stays focusable) with `aria-busy` and the spinner, matching the documented "Disabled vs Busy" API convention and the behavior input components already follow. `isDisabled` (and `isDisabled` together with a busy state) is unchanged — that still uses native `disabled`. `isInterruptible` is also unchanged.
  `aria-disabled`, unlike native `disabled`, still lets the button dispatch a click — the busy guard already called `preventDefault()` to block the button's own action, but a click on a busy button could still bubble to a wrapping ancestor's own click handler (a clickable row, card, or backdrop), which the previous native-`disabled` behavior never allowed. `handleClick` now also calls `stopPropagation()` in that guard, containing an unavailable click at the Button boundary the way a natively disabled control always did.

  The `href`-rendered anchor path had the same gap for keyboard activation: it only wired `onClick` to the busy guard, not `onKeyDown`, so a consumer's own `onKeyDown` still received Enter/Space on a busy-only anchor Button while it was announced `aria-disabled`. The anchor path now wires the same `handleKeyDown` suppression the button path already had, so Enter/Space are swallowed and every other key still reaches the consumer, on both render paths.

- `ChatLayoutScrollButton`: the scroll-to-bottom pill now gives up keyboard focus, and refuses new focus, as soon as it starts to hide. Previously focus stayed on the fading pill for about half a second, until `visibility: hidden` applied, so it could sit on a control that was fading out or already transparent (WCAG 2.2 SC 2.4.7 Focus Visible). (#7738)
- Preserve caller-provided IDs on CheckboxInput and keep labels associated with the native input.
- CheckboxList keeps a caller's `aria-labelledby`. The group always replaced it with its own label id, so the caller's ids never reached the accessible name. The group is now named by its label and then the caller's ids, the same order RadioList and TimeInput use.
- The setup reminder, the swizzle StyleX note, and one doctor line say only what is true
- `CommandPaletteInput`: the query field now draws the shared keyboard focus ring. Previously it suppressed the browser outline without replacing it, so keyboard users could not see which field held focus.
- Source builds through Next.js's Babel no longer fail with `Unknown property: L` (or `Zs`, `Letter`) when the app sets no browserslist or targets a browser without Unicode property escapes. `Avatar`'s initials and the Markdown parser's emphasis and heading-link rules now build their `\p{…}` regular expressions at runtime, as `NumberInput` already does, so there is no literal for Babel to rewrite. Matching is unchanged.
- `DrawerHeader` now renders numeric zero `startContent` inside its start slot and preserves numeric zero `endContent` when no close button is present.
- `Drawer` now slides from the correct logical edge when `dir="rtl"` is set directly on the drawer, matching inherited right-to-left regions.
- `DropdownMenuDivider` now forwards host attributes and DOM handlers (`id`, `data-*`, `aria-*`, event handlers) to its separator, as other DOM-owning components do. Before, it accepted only `xstyle`, `className`, `style` and `ref` and dropped everything else, so a separator could not carry a test id or an accessible label. Its `role="separator"` and orientation stay component-owned.
- DropdownMenu: load the touch bottom sheet only when a menu shows it
  `DropdownMenu` imported its touch sheet (BottomSheet, its gestures, and the touch action list) up front, so every page with a dropdown shipped it, even when the menu only ever opens as an anchored popover. The sheet now loads on demand, the way `ContextMenu` already loads it. A popover-only dropdown's own code drops by about a third (about 23 KB gzipped). Bottom-sheet and adaptive menus behave as before. The sheet starts loading when the trigger mounts, and a menu opened from the keyboard before it arrives still focuses its first action once it loads.
- `EmptyState` no longer leaves blank icon or action spacing when those optional slots receive a boolean or an empty string. An empty description also omits its theme target. The docs now describe configurable heading levels and map the container anatomy to the public theme target.
- Keep `Field`'s horizontal-label layout marker authoritative when callers pass conflicting data attributes, and keep hidden descriptions visually hidden in that layout. Correct its custom label-icon type, all three status placements, complete anatomy, and guidance for controls that cannot safely use attached status.
- `FieldStatus` (and any element using `useEntryAnimation`) no longer causes a hydration mismatch on server-rendered pages. An element that arrives in the server's HTML now hydrates without the entry style and never plays its entry animation, even when hydration runs after the page has painted; elements mounted after hydration still animate. `useEntryAnimation` no longer documents server rendering as unsupported.
- Keep `FormLayout`'s direction metadata authoritative when callers pass conflicting data attributes.
- `GridSpan` keeps its content inside the span. A child whose min-content width is wider than the span, such as a `Tokenizer` with a long token, used to stretch the span's column past the grid cell; it now gets the span's width and truncates the way it does outside a Grid (#7438)
- Keep `Grid`'s theming metadata authoritative when callers pass conflicting data attributes.
- `useHoverCard`: closing a hover card with `hide()` or Escape while the pointer rests on the card no longer leaves the next open stuck. The hook kept believing the pointer was still over the card, because a card closed that way unmounts without a `mouseleave`, so the trigger's next hover-open never closed on leave or after `hideDelay`. Both paths now clear that state, as the touch dismissal already did.
- Compute ISO week numbers (`Calendar hasWeekNumbers`, `getWeekNumber`) on UTC anchors instead of local-time `Date` arithmetic. In timezones whose DST ends after New Year (Sydney, Auckland, Santiago), the local-millisecond difference between the week's Thursday and January 1 carried the DST offset, and in years whose January 1 is a Friday that extra hour rounded a whole week up: the entire ISO week 14 of April 2021 displayed as week 15. Week numbers are now identical in every timezone.
- Anchored layers (`Popover`, `DropdownMenu`, and every component built on them) now keep their safe-area gutter and dynamic-viewport size cap in the shipped stylesheet. The compiled CSS referenced an undefined variable for the preferred value, so every browser used the fallback: on a phone with a dynamic toolbar or a notch, a tall layer could run past the visible screen or under a declared bottom bar. Desktop sizes are unchanged.
- `createMarkdownFrontmatter` now hands its `parse` function a plain object, so a parser that returns the decoded fields unchanged (`parse: fields => fields`) is accepted as metadata. Before, the record had no prototype, failed the JSON-like metadata check, and the document fell back to readable text with its frontmatter still showing.
- `MultiSelector`: the row action cell the keyboard reaches with the inline-end arrow draws the standard focus ring. Before, its outline read four CSS variables that nothing declared, so no ring showed on the active action cell.
- PowerSearch: clear every filter with one press of the clear-all button instead of removing only the last filter.
- Prevent pressing a built-in PowerSearch filter token with the mouse from opening search suggestions before the filter editor. Token editing, removal, and keyboard navigation retain their existing behavior.
- Keep built-in PowerSearch value controls disabled in read-only filter editors, matching custom editors.
- RadioList keeps a caller's `aria-labelledby`. The radiogroup always replaced it with its own label id, so the caller's ids never reached the accessible name. The group is now named by its label and then the caller's ids, the same order TimeInput uses.
- Restore focus to the element that opened a Dialog when its content mounts in the open commit. The opener was captured in the Dialog's passive effect, which runs after a freshly mounted DialogHeader's autofocus effect had already moved focus to the dialog's own title — closing then restored focus to that detached title and the user's focus landed on `<body>`. The capture now runs in a layout effect, before any descendant's passive effect. (#5637)
- `astryx search` finds more of what a reader means when the words differ from the catalog's.
- `astryx search` ranks a match on more of your words above a shorter named entry.
- `SideNavItem` keeps a caller's `className` on its row element (the link or button, and the collapsed rail item) next to its own classes. Before, the row's generated class replaced it, so a class passed to style the row (for example, a cursor while a row is dragged) never reached the DOM, even though `style`, ARIA, data attributes and handlers did.
- Shrink Token's invisible remove-button target from 44px to 24px without changing the visible icon. Clicking adjacent text or values in PowerSearch now edits the filter instead of accidentally removing it.
- DropdownMenu submenu flyouts close with their menu when it is light-dismissed: previously a submenu opened by tap or a fast click stayed open (and re-anchored to the viewport corner) after the menu was dismissed and reopened. A hover-open scheduled on a submenu trigger before the menu closed from elsewhere is also cancelled, so it can no longer reopen a flyout behind the dismissed menu
- `Switch` now adds a caller's `aria-describedby` to the switch control, ahead of its own description, status, and disabled-reason ids. Before, the value landed on the field wrapper, so a hint rendered elsewhere on the page could not describe the switch to assistive technology.
- `Switch` now puts a caller's `aria-labelledby` on the switch control. Before, the value landed on the field wrapper, so a visible title elsewhere in the row could not name the switch for assistive technology.
- A truncated `Text` or `Heading` (`maxLines`) now re-measures when its content changes, not only when its box resizes. A fixed-width single-line status whose message changed kept showing the first message in its truncation tooltip, and a new short message could keep a tooltip while a new long one lacked one. `useTruncation` now also observes the element's text, so the tooltip text and the truncated state follow the current content.
- `ToggleButton` keeps toggling when it also receives an `onClick`, for example from a wrapper that renders it as its trigger. That `onClick` used to replace the toggle's own click handling, so `onPressedChange` never ran and a `ToggleButtonGroup` member never asked its group to toggle (`pressedChangeAction` still ran). The caller's `onClick` now runs first and the toggle request follows. On a standalone `ToggleButton`, calling `preventDefault()` in that `onClick` cancels the request: neither `onPressedChange` nor `pressedChangeAction` runs.
- `useTooltip` (and every component built on it, such as `Button`'s `tooltip` prop) now drops a show that is still waiting out its delay when `isEnabled` turns `false`. Before, hovering a trigger and then disabling its tooltip within the delay let the timer fire anyway: the tooltip opened after its triggers were turned off, with no pointer-leave listener left to close it. A pending hide still runs, and an enabled tooltip is unchanged.
- Tooltip: an icon-only trigger now opens instead of throwing. The layer passed its trigger to `showPopover` as the invoker `source`, which the Popover API declares as an `HTMLElement`; a caller-rendered icon is an `SVGElement`, whose dictionary conversion throws before the popover opens, so the hint never appeared. An icon trigger now reaches `showPopover` without a source — positioning is unchanged, since the layer is anchored by its anchor-name pair, and only the invoker's focus order is given up.
- A collapsed `TopNavMenu` or `TopNavMegaMenu` section in the mobile drawer is now `inert` and hidden from assistive technology, so Tab no longer moves focus onto links that are not shown and screen readers no longer list them under a section announced as collapsed.
- An expanded `TopNavMenu` or `TopNavMegaMenu` section in the mobile drawer no longer clips the focus ring of its items. The section still clips while collapsed and while it animates open or closed.
- `Typeahead`, `Tokenizer`, and `PowerSearch`: clear loading state and stop busy indicator when search source is replaced (#7457)

#### Performance

- `Text` and `Heading` with `maxLines` and `hasTruncateTooltip={false}` no longer measure their text or observe it for resizes and content changes. Only the tooltip uses that measurement, so with the tooltip off the text is cut by CSS alone, and a long table of truncated cells no longer pays a layout read per cell. Rendering is unchanged; with the tooltip enabled (the default) nothing changes.

#### Documentation

- `Avatar` and `AvatarGroup` docs list the numeric sizes `size` accepts (16, 20, 24, 32, 36, 40, 48, 60, 64, 72, 96, 128, 144, 180) instead of implying any pixel value, and say that an `AvatarGroup`'s size always overrides a child `Avatar`'s size, including the group's default.
- Docs and CLI examples import each Core export from the path `astryx component <Name>` prints.
- `ContextMenu` docs now state that data-driven `items` and compound `menuContent` are mutually exclusive choices instead of marking `items` as unconditionally required.
- Document DropdownMenuGroup's complete wrapper props, group semantics, and non-interactive heading guidance.
- Document FieldLabel's complete public prop surface, group-label semantics, and supporting descriptions.
- Make `FormLayout` documentation match logical fractional grid tracks and viewport collapse, and make the public layout target discoverable from component anatomy.
- Make `Grid` and `GridSpan` documentation match fractional track sizing, responsive repeat behavior, implicit rows, and explicit-column spans.
- `useCombobox`, the single-select combobox hook exported from `@astryxdesign/core/Selector` that powers `Selector` and `CommandPalette`, now has hook docs, so `astryx hook useCombobox` and `astryx search combobox` return it with its options, its return fields, and how to wire `aria-activedescendant` while focus stays on the control.
- The `useMultiCombobox` hook docs now say that ArrowDown or ArrowUp opening the list lands on the first or last option even with `hasSearch` or a disabled end option, and that the hook still handles Home and End with `hasSearch`, so a search input that keeps those keys for the caret stops them first and relies on PageUp and PageDown.
- `useMultiCombobox`, the multi-select combobox hook exported from `@astryxdesign/core/MultiSelector` that powers `MultiSelector`, now has hook docs, so `astryx hook useMultiCombobox` and `astryx search combobox` return it with its options, including the grid rows with an action cell, its return fields, and how to wire `aria-activedescendant` while focus stays on the control.
- InternationalizationProvider documentation now names its nonvisual provider boundary so the new component contract can map its anatomy without implying rendered DOM. (#6048)
- `ListItem`'s docs now list `label` as a `ReactNode`, matching its props type: a string is truncated to one line, and any other node renders as given. They used to say `string`, which told readers a rich label had to be restructured away.

#### Other Changes

- `VStack` and `HStack` come from `@astryxdesign/core/VStack` and `@astryxdesign/core/HStack`, `Heading` from `@astryxdesign/core/Heading`, `Text` from `@astryxdesign/core/Text`, and `Theme` and `defineTheme` from `@astryxdesign/core/theme`.
- This covers the guides, the `Card` docs, the next steps `astryx init` prints, the install example `astryx theme build` prints, the wiring example `theme add` prints, the build rules, the theme-module fix `astryx doctor` prints, and the annotated theme template.
- Every path was already exported. Nothing else changes.
- The "run init to finish setup" reminder no longer prints where agents already have the Astryx prompt. In a git repository it looks for init's block in the agent docs from the project up to the repository root, because coding agents read every agent doc in between, so a package in a monorepo that ran `init` at its root stays quiet. This holds for every command and for the reminder printed when `@astryxdesign/core` or `@astryxdesign/cli` is installed. Running the CLI from its own source checkout, inside that checkout, prints no reminder. A project with no block in reach still gets it, and `--json` never prints it.
- `astryx swizzle` no longer says StyleX components "render unstyled (no error)" without a StyleX compiler. Importing them throws StyleX's "Unexpected 'stylex.create' call at runtime" error and the page does not render, and the note now says so.
- In an integration package, where the package's own manifest loads, `astryx doctor`'s implicit-integrations line no longer says that "every loaded integration is named in astryx.config". It names the package's own manifest: as the only loaded integration, or beside the integrations astryx.config names.

  Classification: contract-restoring. Only message text changes: JSON keys, check ids, statuses, and exit codes are unchanged. The doctor line's new text also appears in its `--json` `message`.

- Internal groundwork for a sub-menu's header and footer: `DropdownMenu`'s Tab walk through its header, menu and footer moves, unchanged, into a module of its own, so another menu level with regions can share it. `DropdownMenu`'s behavior does not change.
- Adjacent query words that join into a component, hook, or template name, or into a one-word keyword, match it: `table header cell with sort arrow` finds `TableHeaderCell`, `tree view folders` the `treeview` keyword, and a hook answers to its words without `use`. Most of a name, a name's leading words, or a run of its words also count for components and hooks, a step below the full name.
- A query that is one camelCase identifier and matches nothing as typed is read as the words it spells, so an unknown API name such as `useTablePaginationState` reaches `useTablePagination`. In a query of several words each identifier stays one term.
- When the whole query is an entry's name, these readings add no near siblings beside it. A match on a joined keyword never ranks above an entry the query names, and a match on part of another name does only when it spans more query words than that entry's name.
- A gerund matches its verb (`spacing` and `space`, `dragging` and `drag`), and a plural can start a longer word through its singular (`tokens` and `Tokenizer`).
- Core component docs declare more keywords: other libraries' names (`scrollarea`, `togglegroup`, `pageheader`, `splitpane`, `circularprogress`, `linearprogress`, `commandmenu`, `relativetime`, `sidesheet`, `descriptionlist`, `inlinecode`) and common glyph names on `Icon`, since any icon library's glyph renders through it.
- The JSON shape is unchanged.
- A match on part of a longer name that reads more of the query than the entry the query names is no longer held below it: `dropdown menu radio options` leads with `DropdownMenuRadioItem`, not `DropdownMenu`.
- `useResizable` drops the `splitview` keyword, which put it ahead of the side-panels guide.

#### Contributors

Thanks to everyone who contributed to this release:

- @azure-553
- @cixzhang
- @ernestt
- @Geervan
- @harjothkhara
- @HelloOjasMutreja
- @imdreamrunner
- @josephfarina
- @kentonquatman
- @korkt-kim
- @kyu-rong
- @latxh
- @ManoharPaturi
- @nynexman4464
- @potatowagon
- @Pushpak731
- @rapsealk
- @vjeux
- @WeAreResilience

---

# 0.7.1

#### New Features

- Chat: mention people and topics by multi-word names with opt-in `hasMultiWordQuery` on `ChatComposerTrigger` (#6128)
  Set `hasMultiWordQuery: true` on a trigger whose suggestions contain spaces, and typing `@Jordan Le` keeps narrowing the menu instead of closing it at the first space. The query runs until a line break or about 64 characters, typed text is never changed unless a row is picked, and an unmatched multi-word phrase hides the menu unless the trigger sets `emptySearchText`. Triggers that don't opt in still end their query at a space.

  For every trigger: while results for the current query are still loading, Enter sends the message as typed and never picks a row from an earlier query. Results that arrive after a send or after the editor clears are dropped, so the menu never reopens over an empty composer. Escape and the arrow keys pass through while the menu is hidden, and IME keystrokes never pick a row.

- `CodeBlock` gains `isDiff`, a diff layer over any `language`, and Markdown renders a ```diff fence as tinted diff rows instead of plain text. (#7389)
  With `isDiff`, lines starting with `+` sit on a success-tinted row, `-` on an error-tinted row, `@@` hunk headers (and a `--- `/`+++ ` file-header pair directly before one) on a quiet muted row, and the rest of every line keeps the language's syntax highlighting. The glyph renders in its own column so the code's indentation lines up on every row and stays in the copied text. A changed row's margin reads the change: the tint runs under the line-number gutter too and spans the full scroll width of a long line, and the line number and the glyph take the row's marker colour, while the code keeps the syntax theme's colours. These are five new syntax-theme slots — `--color-syntax-added`, `--color-syntax-removed`, `--color-syntax-diff-header` (row paints, defaulting to `--color-success-muted` and `--color-error-muted` at 25% strength and to `--color-background-muted`; a defined syntax theme that leaves the header paint unset gets none, its header rows sitting on its own background in its punctuation colour) and `--color-syntax-added-marker`, `--color-syntax-removed-marker` (defaulting to `--color-text-green` and `--color-text-red` in the default syntax theme; a defined syntax theme that leaves them unset keeps its own line-number colour) — so existing and custom syntax themes need no change and may override them.

  Markdown maps a ``diff-<lang> fence to the layer over `<lang>` (labelled `<lang> diff`) and a ``diff fence to the layer over plaintext (labelled `diff`), so a diff keeps its header, copy button, disclosure, and a viewport name that still says `diff`.

  A `diff fence that should stay plain text can use `text. A custom `components.code` renderer is unchanged: it keeps receiving the fence's leading word characters in `language` (`diff` for both `diff and `diff-tsx, as today), so an existing `language === 'diff'` check still matches, and receives nothing new.

- Clearable inputs: the clear button's tooltip now reads just "Clear" (localized) instead of repeating the field's label, so a long label no longer turns into awkward tooltip copy such as "Clear Assigned engineering partner". The button's accessible name is unchanged and still names the field, such as "Clear Search". Applies to every input that renders the shared clear button, including `TextInput`, `NumberInput`, the date and time inputs, `FileInput`, `Selector`, `MultiSelector`, `Typeahead`, and `Tokenizer`. Override the new `@astryx.inputClearButton.tooltip` catalog key to change the wording. (#7476)
- `Markdown` fenced code blocks wrap long lines instead of scrolling them sideways. A reader on a narrow screen sees the whole line without a horizontal scroll, and where `Markdown` and RichText give a code block the same width, a long line takes the same number of lines in both. Only the appearance changes: the code's text, line numbers, syntax colours and what Copy returns are unchanged, and a code block whose lines no longer overflow also no longer takes the scroll region's Tab stop, as a code block that fits never has. To keep the old sideways-scrolling look, render code yourself through the `components.code` prop with a `CodeBlock` that leaves `isWrapped` off. (#7564)
- Selector, MultiSelector, and ComplexSelector gain a `secondary` variant: a borderless, neutral-filled trigger matching secondary buttons in navigation and toolbar compositions. Inside an `InputGroup`, a secondary Selector or MultiSelector keeps its fill and takes the group's row height and connected edges. Existing `input` (default) and `ghost` behavior is unchanged. (#7252)

#### Fixes

- `Typeahead`, `Tokenizer`, and `PowerSearch`: focusing an empty field with `hasEntriesOnFocus` after its search source changed now bootstraps entries from the new source. Previously the results cached from the old source were already invalidated but still blocked the bootstrap, so focusing or clicking into the field opened nothing until the user typed. Cached results that are still current are re-shown without a new bootstrap, as before. (#7157)
- `BottomSheet` returns focus without a focus ring after a pointer close (a tap in WebKit, or a pointer close of a sheet opened from the keyboard) and keeps the ring after a keyboard close, including on a `DropdownMenu` bottom-sheet trigger the caller renders (`renderTrigger`). The sheet now asks the browser not to treat that focus as keyboard focus, the way Dialog's focus moves do. (#7388)
- Keep DateInput's calendar selection empty after clearing the field. (#6935)
- `Calendar`: PageUp and PageDown move the focused day by a month — into the month the grid shows, on the same day of the month where it exists — instead of by a week; a page from a borrowed adjacent-month day lands on that day of the month now shown rather than on the month's first day. With two months, a page or an arrow crossing a month edge from the first month now lands on the correct day (the second grid no longer overrides the first grid's target). An arrow or page past `min`/`max` changes nothing, and a page into a month with no enabled day keeps focus in the grid. (#7467)
- `Calendar`: the arrow keys, Home and End no longer land on a borrowed adjacent-month day (shown dimmed, exposed as disabled, and inert to Enter, Space and clicks). An arrow crosses into that month and focuses the real day there, including across the two grids of a two-month view; Home and End stop at the first or last enabled day of the week in the month shown. A month with no enabled day holds no Tab stop. (#7511)
- `Calendar` with `hasWeekNumbers`: the blank cell above the week-number column is now a `columnheader` named with the locale's own word for the week field (from CLDR, visually hidden), so every cell in the header row has a grid role and assistive technology reads the weekday header row without a stray unnamed cell. (#7509)
- `ChatMessage` no longer leaves empty space for an avatar, name, or metadata that renders nothing. Booleans and empty strings create no slot, and any other slot content that renders nothing, such as an empty Fragment or a component that returns `null`, collapses its wrapper. A name that renders no text falls back to the translated sender label, while numeric values such as `0` still render. (#6597)
- `CodeBlock`'s code viewport is a keyboard Tab stop only while its content actually overflows, through the shared scroll capability: a short snippet no longer adds an unexplained stop to the page's Tab order, a wide or capped block still does, and a viewport that stops overflowing keeps focus where it is. Role and accessible name are unchanged. (#7424)
- `CommandPaletteInput` now exposes the semantics and name that its visible state promises. (#7321)
  - A standalone field with no popup attributes was `role="combobox"` with `aria-expanded="true"` and `aria-autocomplete="list"`; it is now `role="searchbox"` with no popup state. Pass `role="combobox"`, or your popup's own ARIA attributes, to keep the old semantics. A field that already passes popup attributes (`aria-expanded`, `aria-controls`, `aria-owns`, `aria-haspopup`, and the like) stays a `combobox` and keeps them, and a field inside `CommandPalette` is unchanged.

  - The field's default accessible name was its placeholder (`Search…`, or the caller's `placeholder`); it is now `Search commands`, translated. Pass `label` to keep a specific name, for example `label="Search…"` for the old default. A caller whose custom `placeholder` served as the name keeps working code and hears the generic name until it passes `label`.

  - The CLI's async-search CommandPalette block names its field `Search files`.

  - `endContent={true}` no longer renders an empty trailing slot, and `endContent={0}` renders inside the trailing slot instead of after it.
- A standalone `CommandPaletteItem` now keeps a caller-supplied id on its rendered option and ignores click callbacks while disabled, so labels and test hooks keep pointing at the option and a disabled command cannot run. (#7324)
- `CommandPalette` now keeps dismissal, text entry, result focus, and empty-state announcements aligned with what the reader sees. (#6950)
  - While no selectable result exists, the results container no longer exposes an empty `listbox`, and the query field reports `aria-expanded="false"` with no `aria-controls` or `aria-activedescendant`. It was an expanded combobox controlling an empty listbox.

  - Home and End move the caret in the query field, as in any text field; they used to jump to the first and last result. Page Up and Page Down still jump to the first and last result.

  - A search with no results announces the empty message the palette renders (`No results` by default, or the caller's `emptySearchText`), once the search settles. It used to announce `No results for <query>`, whatever the palette showed. An override of the `@astryx.commandPalette.noResultsFor` catalog entry no longer has any effect; use `emptySearchText` to customize the message.
- `ContextMenu` paints in Safari when its trigger sits inside a scroll container. The menu is anchored to a box at the pointer, and that box was empty: WebKit counts an empty anchor box inside a scroller as clipped, so the default `position-visibility: anchors-visible` hid the open menu. The anchor is now 1px, kept inside the trigger, so the menu still hides while a scroller clips the pointer position and paints again when it scrolls back. A pointer-opened menu now starts 1px lower, below the pixel under the pointer. (#7369)
- `ContextMenu` now lets Escape dismiss the topmost nested overlay before the menu itself, and preserves consumer trigger handlers while adding its own, so an overlay opened from a menu stays usable and product event logic still runs. (#7167)
- The touch month scroller shared by `DateInput` and `DateTimeInput`: under RTL the horizontal arrows follow the reading direction (ArrowLeft moves to the next day, ArrowRight to the previous), and every keyboard move — arrows and Home/End — now lands on the real day in its own month pane rather than on the dimmed, disabled copy a neighbouring pane shows at its edge. Touch scrolling is unchanged. (#7466)
- `DateRangeInput`: activating the clear button with the keyboard now returns focus to the range trigger. Previously the button unmounted once the range was cleared and focus fell to `<body>`, so a keyboard user had to Tab back in from the top of the page. Pointer clears are unchanged. (#7507)
- `Dialog` now preserves consumer `onClick` handlers while retaining its controlled backdrop-dismissal behavior. (#7452)
- `DialogHeader` now keeps valid numeric zero content inside its `startContent` and `endContent` wrappers and theme targets. (#7454)
- `Divider` now keeps numeric zero labels inside the labelled separator and omits boolean or empty-string labels without leaving empty label spacing. (#7572)
- `DropdownMenuCheckboxItem` now preserves consumer click and pointer-move handlers while keeping its checked-state, disabled, hover-focus, and close-menu behavior. (#7573)
- A `DropdownMenu` with `header` or `footer` is now exposed as a modal dialog around its menu, as the APG Dialog pattern requires. The popover is a named `role="dialog"` with `aria-modal` and the `role="menu"` inside it; the trigger says `aria-haspopup="dialog"` and its `aria-controls` names the popover holding the dialog. Tab and Shift+Tab wrap through the header, the menu and the footer instead of closing the menu at either end. Escape still closes and returns focus to the trigger. A menu without either prop is unchanged. (#7515)
- A `DropdownMenu` whose trigger the caller renders (`renderTrigger`) returns focus to it without a focus ring after a pointer pick (a mouse click in Chromium, a click or a tap in WebKit), as the built-in trigger already did: the menu now asks the browser not to treat that focus as keyboard focus, the way Dialog's focus moves do. (#7382)
- `DropdownMenu` and `MoreMenu`: a disabled trigger no longer opens the menu. A disabled trigger with a tooltip stays focusable (`aria-disabled`), and Button swallowed only Enter and Space, so ArrowDown, ArrowUp, a press, or a click could still open the anchored menu; the anchored open path and the bottom-sheet trigger's click now check the trigger's availability first, for the default Button and for a natively or `aria-disabled` custom trigger. (#7475)
- `FormLayout`: below the 480px collapse, `direction="horizontal-labels"` controls now fill the column the way they do in a vertical `FormLayout`. Previously each control shrank to its content, so a `Selector` was only as wide as its current value. The two-column layout above 480px is unchanged. (#7501)
- Buttons used as InputGroup addons now share the group's outer shape, with square inner corners where they meet the adjacent input. (#7233)
  Standalone buttons and buttons rendered inside an input keep their existing shape and behavior.
- Keep `useHoverCard()` trigger refs stable across unchanged rerenders. The hook returned a fresh `ref`/`interactionRef` on every render because its callbacks depended on the whole `layer` and `touch` objects, which are rebuilt each render — React detached and re-attached every trigger listener and rewrote the trigger's inline `anchor-name` on each rerender. Hooks now depend on the stable layer and touch members instead, mirroring the Tooltip fix in #5951. (#6472) (#6606)
- MobileNav: return focus to the element that opened the drawer when it closes. The drawer relied entirely on the browser's implicit `<dialog>` focus restore, which was reported failing in Safari 26.5.2: `document.activeElement` became `<body>` after close, stranding keyboard and screen-reader users at the top of the document. MobileNav now captures the opener before `showModal()` moves focus into the top layer and hands it back as soon as the native dialog has closed, matching what `Dialog` already does. The close is deferred until the slide-out has played, so the restore waits for it too; until then the rest of the document is inert and an earlier `focus()` would be silently dropped. The restore also covers the AppShell path, where the drawer is torn down by an `<Activity>` switching to `mode="hidden"` rather than by the close branch re-running. No API change. Focus is left untouched when there was no real opener (`activeElement` was `<body>`), when the opener has since left the DOM, or when the drawer is reopened before its pending close runs. (#3343) (#4410)
- `MultiSelector`: activating the clear button with the keyboard now returns focus to the trigger, as `hasClear` documents. Previously the button unmounted once the selection was empty and focus fell to `<body>`, so a keyboard user had to Tab back in from the top of the page. Pointer clears are unchanged. (#7506)
- `NumberInput`: the screen-reader "Invalid number" alert now goes through the i18n translator, so an `InternationalizationProvider` locale or override can replace it. Adds `@astryx.numberInput.invalidNumber` to the `en` catalog. Locales without a translation yet still fall back to English. (#7482)
- `astryx.css`, `reset.css`, and every other package stylesheet (`richtext.css`, `lab.css`, `charts.css`) now open with `@layer reset, astryx-base, astryx-theme;`, the same line theme stylesheets carry. The Astryx layer order holds whichever Astryx stylesheet loads first: loading `reset.css` after `astryx.css` no longer lets the reset override component styles, and theme overrides keep winning. Setups that already declare the order on their own first line are unchanged. (#7585)
- `plainDateToInstant` now resolves skipped and repeated wall times the way Temporal's default `"compatible"` disambiguation does. (#7081)
  - A skipped wall time moves forward by the length of the gap. In a zone that springs forward from a negative offset at local midnight, such as America/Santiago on September 6, 2026 or America/Havana on March 8, 2026, the start of that day came back as 11:00 PM the day before, so a week or day range landed on the wrong date; it is now the day's first instant (1:00 AM).

  - A repeated wall time resolves to its earlier occurrence in every zone. In zones with a positive offset, such as Europe/Berlin on October 25, 2026, it resolved to the later one.
- `Calendar`: dates in years 1-99 now show their own year instead of 1900-1999. A value of `0001-01-15` was captioned "January 1901" with 1901's weekday layout and day labels, while `onChange` still emitted the year-1 ISO date. The shared date helpers behind the caption, day grid, week numbers, day counts, and timezone instants now keep years 1-99 as given. One limitation remains: in a timezone west of UTC, the instant for January 1 of year 1 still comes out a year early, because its timezone offset is read from a 1 BC wall clock without the era. (#7465)
- `PowerSearch`: pressing Enter on a focused button in the filter editor now activates that button. Enter on Cancel closes the editor without applying the draft, and Enter on Delete removes the filter; before, both applied the draft instead. Enter in a text or number value field still applies the filter; Enter on the date picker's calendar button now opens the calendar. (#7500)
- `CommandPaletteList` now preserves a caller-supplied id when used standalone, while a managed `CommandPalette` still assigns the ARIA id its search field controls. External labels and test hooks stay attached without breaking the palette's combobox relationship. (#6988)
- `reset.css` no longer hides `hidden="until-found"` content with `display: none`. The browser's own rendering, `content-visibility: hidden`, now applies, so find in page and text fragment links can find the content and reveal it, as the HTML Standard specifies. Plain `hidden` elements are still `display: none`, and a browser without until-found support still hides the content with its own `[hidden]` rule. (#7520)
- `ResizeHandle`: on a collapsed pane, the arrow that grows it opens it one step above its minimum, or at its `collapsedSize` when that is larger (a single step below the collapse threshold used to leave it collapsed); the arrow that shrinks it stays a no-op. Enter and double-click still restore the previous size. (#7512)
- `ResizeHandle`: Enter and double-click on a collapsed pane restore it to the size it had before it collapsed, not to its minimum, and reopen it even when `minSize` is below `collapsedSize`. The handle uses `useResizable`'s own collapse and expand transitions; `ResizableProps` is unchanged, and a hand-built props object keeps the previous resize-to-minimum behavior. (#7479)
- `ResizeHandle`: with snap points set, an arrow key moves the pane to the adjacent snap point in its direction (Shift moves two), a point beyond the bounds counting as that bound — a 10px step used to snap straight back to the point it started on. With snap points, a shrink arrow at the lowest point no longer collapses a collapsible pane; Enter, double-click and dragging still do. (#7514)
- `ResizeHandle`: a separator whose region sets no `maxSize` now reports an `aria-valuemax` — a measured extent standing in for the missing maximum (the window's extent on the region's axis, or the container's content box while a percentage bound observes it), never below the current size or, while collapsed, the minimum. Pixel-only regions inside a container still report no maximum (measuring one would add an observer). `ResizableProps` is unchanged; End still moves only to a configured maximum. (#7481)
- `useScrollOverflow` (the strip of `TabList`, the scroller of `Carousel`) measures a resize, and its container at registration, only while the container is rendered. Inside a `display: none` ancestor or a `content-visibility: hidden` subtree the hook keeps its last state instead of reading layout, since a layout read there made the browser render the whole hidden subtree for the answer; the resize observation that comes with the reveal measures again, one frame after the reveal paints. A scroll is measured hidden or not, so a container script scrolled while hidden (a selected tab's reveal) is right at a reveal that brings no resize. Before, a hidden container reported no overflow. (#7518)
- A `secondary` Selector, MultiSelector, or ComplexSelector now matches the theme's secondary Button: under butter, chocolate, gothic, stone, and y2k it takes that Button's border, fill, text color, and hover instead of the default borderless neutral fill, so a toolbar mixing secondary buttons and selectors reads as one set of controls. Disabled and read-only triggers keep a still fill on hover, as a disabled Button does, and a Selector or MultiSelector inside an InputGroup keeps the group's neutral fill and edges. The default theme is unchanged, the selector docs now say `secondary` follows the theme's secondary Button, and themes added with the CLI get the same parity. (#7548)
- `Selector`: activating the clear button with the keyboard now returns focus to the trigger, as `hasClear` documents. Previously the button unmounted once the value was cleared and focus fell to `<body>`, so a keyboard user had to Tab back in from the top of the page. Pointer clears are unchanged. (#7455)
- `SideNav`: the resize handle now names the navigation pane it resizes with `aria-controls` (the nav gets a generated id when the consumer gives none), as the APG window splitter pattern requires, so assistive technology can relate the separator to the pane. (#7473)
- `Slider`: End now reaches `max` even when the step grid does not land on it (for `max={100}` with `step={3}`, End stopped at 99). Arrow and Page key results still snap to the nearest step and then clamp. (#7484)
- `Slider`: on a horizontal track under RTL the arrow keys now follow the mirrored track — ArrowLeft increases the value and ArrowRight decreases it, matching where the thumb moves on screen. ArrowUp/ArrowDown, PageUp/PageDown, Home/End, and vertical sliders are unchanged. (#7461)
- Stop Tokenizer's `hasCreate` "Create X" entry from offering a label that is already tokenized under a different id. The duplicate check compared the typed text against selected ids, but real selections usually carry an opaque id (`u1` under the label "Alice"), and the search results could not catch the match because they are pre-filtered to remove already-selected items — so typing an existing token's label offered "Create", which committed a second, duplicate token with a new id. The check now also compares against selected labels (case-insensitive), in both the Create entry and the stale-entry commit guard. (#6367)
- Keep Toolbar keyboard navigation and roving tab stops outside nested popover menus, without disabling toolbar navigation inside an outer popover. (#7446)
- `TreeList`: each row is now named by its label alone and described by its description (`aria-labelledby`/`aria-describedby` on the `treeitem`), so screen readers no longer read the chevron toggle's label or the description as part of a row's name, and link and action rows are named as rows, not only through their inner control. Typeahead matches the label rather than the row's whole text. (#7472)

#### Documentation

- `AlertDialog`'s anatomy lists the dialog surface — the modal panel that holds the title, description, and buttons — and `Calendar`'s anatomy lists the calendar root and the day button, so every part that carries a theming target (`alert-dialog`, `calendar`, `calendar-day`) is named in the component docs. (#7464)
- List `DateInput`'s `containerClassName`, `containerStyle`, `controlClassName`, and `controlStyle` props in its API reference, alongside `containerXstyle` and `controlXstyle`. (#7372)
- Grid's `columns` docs now lead with the shape that reflows: a numeric `columns` is exactly N columns at every width and never reflows, and `columns={{minWidth, max}}` is the form for columns that must survive a phone. The `astryx docs layout/responsive` topic gains a "Columns that reflow" section with a reflowing stat row beside a fixed week row. No behavior changes. (#7340)

#### Other Changes

- The core build now fails when StyleX rejects a declaration such as a `border`, `background`, or `all` shorthand, instead of silently dropping it from the shipped CSS. The emitted `dist/` is unchanged. No API change. (#6830)

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @athz
- @barm
- @cixzhang
- @ernestt
- @Geervan
- @harjothkhara
- @imdreamrunner
- @korkt-kim
- @kyu-rong
- @ManoharPaturi
- @rubyycheung
- @vjeux

---

# 0.7.0

#### Breaking Changes

- Stop deriving live-region roles from `Banner.status`. Banners are non-live by default; call `useAnnounce` from the actual async transition handler, or provide an explicit `role="status"` for a persistent semantic mirror. (#6630)
  `role="alert"` is now opt-in rather than automatic for warning and error banners.

  Old usage: `Banner` derived `role="status"` or `role="alert"` from its `status` variant.

  Replacement: The caller sets the role explicitly, or announces with `useAnnounce`.

  Migration: Call `useAnnounce` from the actual async transition handler, or provide an explicit `role="status"` for a persistent semantic mirror.

  Codemod: None — the right announcement depends on the callsite.

- Layout, MetadataList, NavHeadingMenuItem and TopNavMegaMenuItem now apply the BaseProps they accept (id, role, aria-\*, data-\*, hidden, inert, dir, event handlers; TopNavMegaMenuItem also xstyle/className/style) instead of silently dropping them; NavHeadingMenu keeps arrow navigation when an item handler cancels. (#7331)
  Migration: remove any of those props you passed that you relied on being ignored; a TopNavMegaMenuItem styled through xstyle/className/style now shows that styling.

  From #5656 by @harjothkhara.

- BottomSheet pads its content by default, like Dialog. With no `padding` prop and no theme padding, the content box now pads by `--spacing-4` (it had no padding before) and publishes that inset. (#6884)
  A sheet whose only child is a padded `Section` or a `Layout` renders as before, because both escape the inset. Content that supplies its own inset is now padded twice: drop that inset, or pass `padding={0}` to keep the unpadded content box. `astryx upgrade` ships `preserve-bottom-sheet-content-padding`, which adds `padding={0}` where needed.

  Migration: pass `padding={0}` to keep the unpadded content box, or drop your own inset to take the default; `astryx upgrade` adds `padding={0}` to every BottomSheet that sets no padding unless its only child is a padded Section or a Layout. An app whose theme already sets `bottom-sheet` padding on every edge is not affected by the new default; the codemod cannot see the theme, so remove the `padding={0}` it adds there to keep the theme inset. A sheet whose content wraps a `Layout` gets a TODO: `padding={0}` also removes the inset between that Layout's regions, which the Layout's own `padding` does not restore.

- Require `upload` on complete `IconRegistry` types (#7329)
  Old usage: A custom complete icon registry typed as `IconRegistry` that omitted the `upload` key.

  Replacement: `IconRegistry` now requires all semantic `IconName` keys, including `upload`.

  Migration: Add an `upload` entry drawn in your registry's icon style to complete icon registries typed as `IconRegistry`.

  Codemod: No `astryx upgrade` codemod applies because icon artwork is bespoke design artwork tailored to each theme and cannot be automatically synthesized.

- Move canonical data-color defaults from generated theme CSS to the public StyleX `dataVars` group. (#6834)
  Import `dataVars` from `@astryxdesign/core/theme/dataTokens.stylex` for CSS-capable code. Canvas and other non-CSS APIs continue to use `resolveThemeToken()` or `useTheme().token()`. Rebuild committed theme CSS with `astryx theme build`; concrete themes now emit only explicitly authored data-color overrides.

  Old usage: Generated theme CSS owned the canonical `--color-data-*` root defaults.

  Replacement: The public StyleX `dataVars` group in `@astryxdesign/core/theme/dataTokens.stylex` owns the defaults; concrete themes emit only explicitly authored data-color overrides.

  Migration: Import `dataVars` from `@astryxdesign/core/theme/dataTokens.stylex` for CSS-capable code. Canvas and other non-CSS APIs continue to use `resolveThemeToken()` or `useTheme().token()`. Rebuild committed theme CSS with `astryx theme build`.

  Codemod: `astryx upgrade` runs `validate-data-token-ownership`, which rewrites nothing and reports fallback-less `var(--color-data-*)` uses (whole or embedded source strings, and stylesheets) and stale generated theme CSS for manual migration.

- DateInput, DateRangeInput, DateTimeInput, and TimeInput no longer accept root `xstyle`, `className`, or `style`. Style the field with `containerXstyle`/`containerClassName`/`containerStyle` (the Field box; no effect inside InputGroup or a `horizontal-labels` FormLayout) and the visual control box with `controlXstyle`/`controlClassName`/`controlStyle`. Base props such as `ref`, `id`, `data-*`, `aria-*`, and DOM handlers reach the field's semantic control on every surface (the date, time, or date-time input; DateRangeInput's range trigger) instead of the wrapper, TimeInput no longer drops them, and a caller `id` is now honored there. A caller `aria-describedby` is added to the component's own description ids, and a caller `aria-labelledby` is read after the field's own label (on DateRangeInput, after its label and selected range); a caller `aria-label` on DateRangeInput replaces the trigger's name. (#7337)
  Migration: rename root `xstyle`/`className`/`style` on these components to `controlXstyle`/`controlClassName`/`controlStyle`, which style the same element as before (for DateTimeInput, the row holding the date and time segments). Rename by hand, or run `astryx upgrade`; it runs `migrate-field-input-styling`, which rewrites JSX usage; styling passed through a wrapper's own props or a spread is never rewritten and now fails type-checking at that callsite, so rename it there. Untyped callers get a development warning and the value is ignored. A DOM handler or `data-*` attribute that relied on landing on the wrapper now lands on the control; a handler still runs after the component's own and still receives events the component handled.

  From #5656 by @harjothkhara.

- Typeahead, Tokenizer, CheckboxList, RadioList, and Slider no longer accept root `xstyle`, `className`, or `style`. Style the field with `containerXstyle`/`containerClassName`/`containerStyle` (the Field box; no effect inside InputGroup or a `horizontal-labels` FormLayout) and the visual control box with `controlXstyle`/`controlClassName`/`controlStyle`. Base props now reach the primary semantic control: the combobox input for Typeahead and Tokenizer, the `role="group"`/`role="radiogroup"` element for CheckboxList and RadioList, and the `role="slider"` thumb for Slider (the `role="group"` control in range mode). A caller `aria-describedby` is kept alongside the field's own description and status, on these components and on TextInput, TextArea, and NumberInput, which previously dropped it. CLI templates use the new props. (#7339)
  Migration: rename root `xstyle`/`className`/`style` to the part they styled before: `containerXstyle`/`containerClassName`/`containerStyle` on all five components, except a Typeahead inside InputGroup, whose root styling painted the control surface and moves to `controlXstyle`/`controlClassName`/`controlStyle`. The release's `astryx upgrade` codemod, `migrate-field-input-styling`, performs these renames on JSX usage.

  Not rewritten by the codemod, so update by hand:

  - `ref` and `id`, plus `data-*` (except Typeahead and Tokenizer `data-testid`, which marked the control surface), `aria-*`, and DOM event handlers such as `onClick`, previously landed on the outer Field (or were dropped by RadioList and Slider). They now land on the primary semantic control. Update code that measured, queried, or listened on the outer field, and wrap the component in your own element when you need an outer boundary.
  - Typeahead and Tokenizer refs are now `HTMLInputElement`.
  - A consumer `onKeyDown` on Typeahead or Tokenizer still runs after the built-in key handling, cannot cancel it, and still fires for keys on the clear button and tokens; for keys on the input it now runs on the combobox input itself.
  - RadioList and Slider used to drop DOM event handlers; they now run after the component's own handling, so a Slider `onPointerDown`, `onKeyDown`, `onFocus`, or `onBlur` that never fired before now fires (on the thumb, or on the group in range mode).
  - Tokenizer's `onFocus`/`onBlur` keep their meaning: focus entering or leaving the field.
  - Styling passed through a wrapper's own props or a spread is not rewritten and now fails type-checking at that callsite.

  Untyped callers get a development warning and the value is ignored.

  From #5656 by @harjothkhara.

- Selector, MultiSelector, and ComplexSelector no longer accept root `xstyle`, `className`, or `style`. Style the field with `containerXstyle`/`containerClassName`/`containerStyle` (the Field box; no effect inside InputGroup, a `horizontal-labels` FormLayout, or with `renderTrigger`) and the visual control box with `controlXstyle`/`controlClassName`/`controlStyle`. Base props such as `ref`, `id`, `data-*` (including `data-testid`), `aria-*`, and DOM handlers reach the trigger button that carries the combobox role (or, with `renderTrigger`, the caller's control), and a caller `aria-describedby` is kept alongside the field's own description and status instead of being replaced. Handlers keep their existing order: a ComplexSelector `onClick` on its own trigger can still cancel opening, and newly forwarded handlers (including those reaching a `renderTrigger` control) run after the built-in toggle and keyboard handling. CLI templates use the new props. (#7341)
  Migration: rename root `xstyle`/`className`/`style` on these components to `controlXstyle`/`controlClassName`/`controlStyle`, which style the same element as before. Not a rename: a `data-testid` or other base prop now lands on the trigger button rather than the bordered box around it (query the box with `.closest()` if a test measured it), and with `renderTrigger` base props and `ref` now reach the caller's control. Rename JSX usage by hand, or run `astryx upgrade`; it runs `migrate-field-input-styling`, which does not follow styling passed through a wrapper's own props or a spread, which now fails type-checking at that callsite, so rename it there. Untyped callers get a development warning and the value is ignored.

  From #5656 by @harjothkhara.

- TextInput, TextArea, NumberInput, and FileInput no longer accept root `xstyle`, `className`, or `style`. Style the field with `containerXstyle`/`containerClassName`/`containerStyle` (the Field box; no effect inside InputGroup or a `horizontal-labels` FormLayout) and the visual control box with `controlXstyle`/`controlClassName`/`controlStyle`. Base props such as `ref`, `id`, `data-*`, `aria-*`, and DOM handlers reach the native control, and a caller `id` is now honored there. CLI templates use the new props. (#7336)
  Migration: rename root `xstyle`/`className`/`style` on these components to `controlXstyle`/`controlClassName`/`controlStyle`, which style the same element as before. `astryx upgrade` rewrites JSX usage; styling passed through a wrapper's own props or a spread is not rewritten and now fails type-checking at that callsite, so rename it there. Untyped callers get a development warning and the value is ignored. Not rewritten by the codemod: a caller `id` used to be replaced by a generated one and now reaches the native control (the label stays associated), so remove an `id` you passed but relied on being ignored. Other base props already reached the native control and are unchanged.

  From #5656 by @harjothkhara.

- `PowerSearchFilterEditor` no longer calls `onSave` when it opens on an already-complete empty-operator filter (such as "is empty"). (#7347)
  Old usage: opening a standalone `PowerSearchFilterEditor` on a complete empty-operator filter saved that filter immediately, with no Apply rendered for it, and saved it again whenever the editor remounted.

  Replacement: the editor saves only from a user choice in it. Opening it saves nothing.

  Migration: if you relied on that save-on-open, call your own `onSave` handler with the filter at the point where you open the editor (or skip opening the editor for empty-operator filters, as PowerSearch now does). This cannot be rewritten by a codemod, because the right place to commit depends on your code.

- Remove the deprecated component-theming compatibility surface scheduled for 0.7.0. Components now emit only canonical target classes and reflected `data-*` prop/state selectors. Theme discovery and build output no longer expose deprecated targets, and `ThemePropsOptions` plus `ComponentThemingTarget.deprecatedFor` are removed. The `theme targets --json` response drops the `ThemeTargetEntry.deprecatedFor` field, because no target it lists is deprecated. (#7302)
  Migration: run the required codemod `migrate-deprecated-theme-surface` with `astryx upgrade --from <your 0.6 version> --apply --path .` after upgrading.

  The codemod renames removed target keys inside theme `components` maps (an imported `defineTheme()` call, an object typed as an Astryx theme, or a theme object with a static `name`), renames target classes in CSS, and replaces target-qualified bare prop/value/state classes with reflected `data-*` selectors, using every bare class the final 0.6 release emitted. It leaves dynamic/computed theme keys, unqualified or unknown classes, and CSS embedded in JavaScript/TypeScript strings for manual review. It adds `TODO(astryx upgrade)` when old and canonical keys coexist, and when a bare class Astryx once emitted has no known meaning on the target it qualifies.

  The four per-component clear-icon aliases all become the shared `input-clear-icon`, which styles every input's clear icon. In CSS the codemod keeps each rule on its component with `:where(.astryx-<component> *)`, which adds no specificity. Theme keys cannot carry that scope, so the codemod adds a TODO naming the CSS selector to use.

  Code that passed `{legacyNames}` to `themeProps()` or set `deprecatedFor` in a component doc should delete that argument or field; the canonical target is unchanged.

  Rename theme keys and CSS target classes with this complete mapping:

  - `base-table` → `table`
  - `checkbox` → `checkbox-indicator`
  - `codeblock` → `code-block`
  - `codeblock-copy-button` → `code-block-copy-button`
  - `codeblock-header` → `code-block-header`
  - `codeblock-title` → `code-block-title`
  - `date-input-clear-icon` → `input-clear-icon`
  - `date-range-input-clear-icon` → `input-clear-icon`
  - `hovercard` → `hover-card`
  - `multi-selector-clear-icon` → `input-clear-icon`
  - `navicon` → `nav-icon`
  - `popover-surface` → `popover`
  - `progressbar` → `progress-bar`
  - `progressbar-fill` → `progress-bar-fill`
  - `progressbar-mark` → `progress-bar-mark`
  - `progressbar-track` → `progress-bar-track`
  - `radio` → `radio-indicator`
  - `radio-dot` → `radio-indicator-dot`
  - `selector-clear-icon` → `input-clear-icon`
  - `statusdot` → `status-dot`
  - `textarea` → `text-area`

  For custom CSS, replace removed bare selectors with the corresponding reflected attribute on a canonical target—for example, `.astryx-button.primary.sm` becomes `.astryx-button[data-variant="primary"][data-size="sm"]`, and `.astryx-switch.checked` becomes `.astryx-switch[data-checked="checked"]`. Review unqualified classes such as `.primary` manually because they may be application-owned.

- Remove the deprecated `emptySearchResultsText` prop. Use `emptySearchText`. (#7289)
  Old usage: `emptySearchResultsText` on `Tokenizer`, `Typeahead`, and `BaseTypeahead`, and the `emptySearchResultsText` key on a `ChatComposerInput` trigger.

  Replacement: `emptySearchText`, shipped in 0.6.6. It takes a `ReactNode`, so every old string value stays valid. The old name is no longer in the types and is no longer read; a JavaScript caller that still passes it sees the default empty message.

  Migration: Rename `emptySearchResultsText` to `emptySearchText`. Where both are set, keep `emptySearchText` and delete the old one — unless `emptySearchText` could be `null` or `undefined`: 0.6.x then fell back to the old value, so move that value into `emptySearchText` (for example `emptySearchText={value ?? 'Old copy'}`).

  Codemod: `astryx upgrade` runs `rename-empty-search-results-text`, a straight rename at the JSX boundary: the prop on imported `Tokenizer`, `Typeahead`, and `BaseTypeahead` elements, and the key on trigger objects written inline in `ChatComposerInput`'s `triggers`, each renamed as written. Like every Astryx codemod it does not follow variables, helpers, spreads, wrappers, or types; where it cannot attribute the value — `emptySearchText` already set, any spread onto one of these elements (whether or not the element writes the old name), a `triggers` value not written inline, a trigger object with a spread or computed key (whether or not it writes the old name) — it leaves a TODO instead of choosing a winner. The type checker reports any literal `emptySearchResultsText` it did not reach; the TODOs cover the values that reach an element through a spread, which it cannot.

- `reset.css` now reaches `::before`, `::after`, `::placeholder` and the search field's cancel button, as its comments document. Three of its rules wrote the pseudo-element inside `:where()`, where pseudo-elements are invalid, so browsers dropped those parts of the selector and the rules never applied to them. Each pseudo-element now follows the `:where()`, as in `:where(*)::before`, and the rules stay in `@layer reset`, so any later layer or unlayered style still overrides them. (#7355)
  What changes on a page that loads the reset: a `::before` or `::after` with padding or a border used to size as `content-box` and now sizes as `border-box`; setting only `border-width` on one used to draw nothing and now draws a solid `currentColor` border; a placeholder with no color of its own used to show the browser's grey and now shows `--color-text-secondary` (or that token's own default, `light-dark(#4E606F, #AAAFB5)`, when no Astryx CSS defines it); and a `type="search"` field no longer shows the browser's cancel button.

  To keep the old result for one of your own elements, set it in your own CSS: `box-sizing: content-box` or `border-style: none` on the pseudo-element, a `color` on the `::placeholder`, or `appearance: auto` on the field's `::-webkit-search-cancel-button`. There is no codemod: whether a stylesheet relied on the old result cannot be read from its source.

- Spacing tokens are rem (`--spacing-2: 0.5rem`), so gaps and padding follow the reader's root font size the way the type scale does. Every token value is unchanged at the default 16px root. (#7359)
  One change shows at the default root: the `useTableRowExpansion` chevron now sits centered in its fixed 40px column instead of running past its edge (its button moves from 24–48px to 8–32px of the column). Under a theme with a larger spacing scale, such as matcha, the chevron is visible again and the detail panel lines up with the first column instead of starting 20px past it.

  Old usage: The `--spacing-*` defaults were fixed px (`--spacing-2: 8px`), so `useTheme().token()`, `resolveThemeToken()`, `tokenDefaults` and `spacingDefaults` returned px strings, and spacing stayed the same size when a reader raised the browser font size.

  Replacement: The defaults are rem with the same value at a 16px root (`--spacing-2: 0.5rem`, `--spacing-4: 1rem`), and those readers return the rem string.

  Migration: CSS that reads `var(--spacing-*)` needs no change. Code that parses a spacing token as a px number converts the rem value with the root font size, or reads the element's computed length. A theme that wants fixed px spacing sets the tokens back, for example `defineTheme({tokens: {'--spacing-2': '8px'}})`.

  Codemod: None. A token read and parsed at runtime cannot be found and rewritten statically, and CSS uses need no rewrite.

#### New Features

- `DropdownMenu` takes `header` and `footer`: content above and below the rows that sits in the popover beside the menu, never inside it. This is the place for a filter field or a "Create" button. The menu still holds only its rows, so it stays a valid menu to a screen reader. The controls keep their own keys and presses, and Tab walks header, menu, footer. The bottom sheet shows them above and below the actions. (#7344)
- `DropdownMenuSubMenu` passes host attributes, DOM event handlers and a `ref` to its trigger row, as `DropdownMenuItem` does: a sub-menu row can carry `aria-keyshortcuts`, a `data-*` mark or an `id`, and a caller can reach the row element. The row keeps its own role, tab stop and popup state; a caller's `onClick`, `onKeyDown`, `onPointerMove`, `onMouseEnter` and `onMouseLeave` run after the row's own handling, except for an event the row consumes: the keys that open the flyout (the open arrow, Enter and Space) and a click on a disabled row. A caller's `id` names the row the flyout is labelled by. (#7318)

#### Fixes

- A standalone `BottomSheet` now joins the shared layer dismissal stack, so one Escape press closes only the top-most layer. A Popover, Dialog, or menu opened inside the sheet closes first, and the next press closes the sheet. `purpose="required"` still blocks Escape without letting the press close a layer behind it, a sheet that is animating out keeps the press, and the native close request answers with the same top-most and IME composition rules. (#7225)
- `ContextMenu` puts only its four touch handlers on the trigger element. It used to spread everything `useLongPress` returns, which since the press model includes the hook's imperative `start`, `moveTo` and `cancel`, so React warned "does not recognize the `moveTo` prop" and "Invalid values for props `start`, `cancel`" on the first ContextMenu of a page. Long-press opening is unchanged. (#7322)
- DateInput: run changeAction with optimistic busy feedback on the native picker surface (#7243)
- Dialog's initial focus and the focus it returns on close now follow the last input: the shared focus indicator is hidden after a mouse click or tap and shown after keyboard input, including focus returned after a keyboard open and a mouse close (#7306). Text fields keep their own focus treatment. (#7313)
- A DropdownMenu hung off its own control through `renderTrigger` names a drilled-in sub-menu's Back row after the menu: "Back to <the menu's aria-label>", or the name of the control it hangs off, instead of "Back to Menu". (#7304)
- Lightbox shows the next or previous image unzoomed from its first frame. The zoom and pan reset when the image changes now happens in the same update, instead of painting the new image at the previous image's zoom for one frame. (#7351)
- With `markdownSourceLinesPlugin` installed, a transform plugin no longer falls back to its readable fallback on documents that contain a list or a quote. Blocks nested in a list item or a quote carry lines without offsets, and the transform check now accepts those Core-assigned lines while still refusing a transform that adds, shifts, or forges them. (#7345)
- A two-finger pinch over an open DropdownMenu, sub-menu flyout, ContextMenu or Selector list now zooms the page. The menus declared `touch-action: none` while their rows fit and `pan-y` once they scroll, and neither allows a pinch, so a phone could not zoom the page while a menu was open. They now declare `pinch-zoom` and `pan-y pinch-zoom`; a one-finger slide over the rows and the press model behave as before. (#7201)
- DropdownMenu, ContextMenu and sub-menus no longer special-case text fields and buttons placed among their rows. This reverts an unreleased change. A menu holds only menu items; a control that is not a row belongs outside the menu. (#7338)
- The PowerSearch filter editor saves an "empty" operator filter (such as "is empty") exactly once, from the choice that completes it. Choosing such an operator, or switching to a field whose default operator is one, now saves from that choice instead of from an effect. The filter is no longer saved again when the parent re-renders with a new `onSave`, or twice in React StrictMode. Re-choosing the current operator or field saves nothing, and focus still returns to the search input after the editor closes. Clicking an existing empty-operator token in PowerSearch commits it once without opening the built-in editor; a `components.empty.Editor` override still opens. (#7347)
- The PowerSearch filter editor saves once when a value that saves on choice is picked (an enum option, a relative-date preset, a suggestion). The save no longer runs inside a React state updater, which React may call more than once, so it no longer fires twice in StrictMode. (#7350)
- Toasts stay visible and clickable while a Dialog is open. The `ToastViewport` from `LayerProvider` (or the one `useToast` mounts on its own) now moves into the open Dialog, and back when it closes. Before, a Dialog opened after the viewport mounted painted over it, and clicking a toast's close button hit the backdrop and closed the Dialog. Moving the viewport does not reset visible toasts or their timers. A viewport rendered with `isTopLayer={false}` keeps rendering in place. (#7238)
- DateTimeInput's touch picker no longer paints a stale frame. Clearing the value from outside clears the time display in the same update, instead of showing the previous time for one frame, and narrowing `max` (or raising `min`) while the sheet is open keeps the visible month in range in the same update, instead of showing the out-of-range month and then jumping. (#7349)

#### Performance

- An `Item` without `swipeActions` no longer bundles the swipe gesture. The panels and the drag that uncovers them now live in a module `Item` loads on demand the first time a row has swipe actions, so an app whose rows never swipe ships about 2.7 KB (gzip) less on its first load and a row that does swipe keeps its DOM, props and behavior; its gesture becomes live once that module has arrived, which on a first load is a moment after the row paints. (#7296)

#### Documentation

- Describe `CommandPaletteList` as the list `CommandPalette` renders itself, and as a component to render directly only for a standalone results list. (#7370)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @Geervan
- @harjothkhara
- @imdreamrunner
- @ksying
- @rubyycheung
- @vjeux

---

# 0.6.8

#### New Features

- `useTableColumnResize` now reveals its handles when the pointer enters the header. The boundaries were only drawn once the pointer was already within a handle's 8px hit area, so a resizable column gave no sign it could be resized. Every boundary now appears at border weight while the header is hovered, and the handle under the pointer still takes accent. The reveal holds while the table is scrolling sideways, so a boundary arriving under a still pointer is not mistaken for intent, and focusing a handle emphasizes that one boundary without drawing its neighbours. Pointer-only: where nothing can hover, nothing is revealed. (#6194)
- `DropdownMenuItem` passes host attributes and DOM event handlers to its row, as `DropdownMenuCheckboxItem`, `DropdownMenuRadioItem` and `Item` already do (#7196): a row can carry `aria-current`, `aria-busy`, a `data-*` mark, an `id`, or drag-and-drop handlers. The row keeps its own role and tab stop; a caller's `onPointerMove` and `onAuxClick` run after the row's hover focus and middle-click close.
- Add `markdownSourceLinesPlugin` to `@astryxdesign/core/Markdown/plugins` (#7286). With it installed, every block `Markdown` renders, nested blocks included, carries `data-source-line` and `data-source-line-end`: the 1-based, inclusive lines it came from. That lets a host map a selection, search hit, or comment back to the exact Markdown lines. `components` block renderers receive a matching `sourceLines` prop, and plugin renderers read lines from `node.position`. The lines come from the parse `Markdown` already runs, and without the plugin nothing changes.

#### Fixes

- Preserve AppShell page content, local state, and input focus when the elevated layout crosses the mobile navigation breakpoint (#7236).
- Calendar now accepts null as an explicit controlled empty value (#7297). DateRangeInput announces required state through a valid button description, keeps pending values in its accessible name, and clears Calendar selection without reviving the previous range.
- Keep DateTimeInput's calendar selection empty after clearing the field (#7298).
- A DropdownMenu that a finger held on its trigger opens (after the long-press delay) stays open when that finger lifts on the trigger (#7241). The browser's light dismiss read the lift, outside the menu, as a press outside and closed the menu at once; the trigger is now held as the menu's invoker through the press, as it already was for a mouse press.
- A mouse press on a `DropdownMenuItem` link row (`href`) that moves a few pixels no longer starts the browser's link drag (#7197). The drag cancelled the press, so the highlight stopped following the mouse and the row under the release never acted; a press dragged from one link row to another now acts on the second, as it already did for rows without an address. Link rows render `draggable="false"`.
- Kbd: use primary text color token to meet WCAG AA contrast over neutral keycaps (#7100)
  The default `<kbd>` text color has been updated to `--color-text-primary`, ensuring visible key glyphs exceed the 4.5:1 WCAG AA contrast ratio against the `--color-neutral` keycap background across all light and dark themes.
- Stepper: a Stepper inside a layer opened from a step no longer picks up the outer Stepper's `--step-connector-gap` (#7287). Layer content roots (Popover and other `useLayer` surfaces, Dialog, BottomSheet, MobileNav, Lightbox, and the toast viewport) now stop that value, so the inner track starts from its `0px` default. Setting the gap on the inner Stepper or through the `stepper` theme target still works, and the gap still inherits normally outside layers.
- `Markdown` renders a fence that a `createMarkdownFenceTransform` plugin claims through that plugin even when `components.code` is supplied (#7284). A host that drew its own code blocks lost every semantic fence, so a diagram or chart fence showed as code. `components.code` now renders every fence no plugin claims, and stays the fallback when a claimed fence's renderer declines, throws, or suspends. Hosts with only one of the two render as before.
- Keep Table column resize handles accessible, contained, and compatible with sticky columns (#6194).
  Resize handles stay keyboard-reachable on touch-first devices instead of disappearing from the accessibility tree. They no longer extend below the table and create stray vertical scrolling, and sticky headers keep their pinned positioning regardless of plugin order.

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @cixzhang
- @ernestt
- @Geervan
- @korkt-kim
- @vjeux

---

# 0.6.7

#### New Features

- `Item` gains swipe actions for touch, per `spec:AST-057`. `swipeActions` declares, per side, the verbs a sideways drag uncovers as `ItemSwipeAction[]` (`{id?, label, icon?, onActivate, isDisabled?, variant?: 'neutral' | 'accent' | 'destructive', hasRemoval?}`, outermost last); `swipeBehavior` is `reveal` (the row rests open with every entry a real button; a long drag or a fling fires the outermost) or `commit` (the row slides out and the outermost fires; nothing rests). After an entry fires the row springs back, or holds out when the entry has `hasRemoval`. A mouse never starts the drag, a mostly vertical drag stays the scroller's, a resting row closes on a pointer outside it. Available on a row whose role permits interactive descendants (a `listitem`, a role-less row); `ListItem` passes both props through. No element is added to a row: its root translates and its panels counter-translate. `List` clips its rows in the inline axis (`overflow-inline: clip`). Types `ItemSwipeAction`, `ItemSwipeActions`, `ItemSwipeActionVariant` and `ItemSwipeBehavior` are exported.
- Drawer is a container, like Dialog. A new `padding` prop takes a spacing step, and a theme's `padding` on `drawer` pads the drawer's scrolling content area through container tokens instead of padding the panel. The padded content area publishes its inset, so a Section that is the drawer's only child, and bleed children such as Table and Divider, align against it, and a Layout inside picks the value up for its header, content, and footer regions. With neither set, the inset is `--spacing-4`, as in Dialog; pass `padding={0}` for a full-bleed content area. The block-end safe-area inset is preserved in every mode.
- An option can carry a secondary action; `MultiSelector` renders it in a grid.
  `SelectorOptionData` and `SearchableItem` gain `action?: ReactNode`: one node the caller renders and names — an `IconButton`, a `Button`, a menu trigger. In `MultiSelector`, once any option carries one the popup is a `role="grid"` whose rows pair the option with its action: Up/Down move rows, the inline-end arrow reaches the action (following RTL), Enter fires it, pointer and touch press it directly, and pressing it never changes the selection. The trigger advertises `aria-haspopup="grid"`. Nothing changes for options without an action. `Selector` and the typeahead panel do not render the key yet and warn in development when an item carries one.
- `useTableRowExpansion` accepts `panelVariant`, and the detail panel now sits on the surface behind the table by default instead of on a wash of its own. (#5995)
  The panel row painted `--color-background-muted` unconditionally, and being a `<tr>` the plugin builds itself, nothing a caller rendered could reach it.

  The panel is the row's continuation, not a surface of its own, so it now takes whatever the table sits on — the same thing the row does. That keeps the plugin unopinionated about the table's background: a table on a `Card` no longer stacks a third surface, and a striped table no longer paints a band in the same token as its own stripe, which read as a data row rather than as a detail.

  `panelVariant: 'muted'` keeps the wash for the case that wanted it — a bare table with no card, no dividers and no striping, where nothing else separates the panel from the data around it.

  **This changes the default appearance.** A table relying on the wash gets it back with `panelVariant: 'muted'`; in dark themes there is nothing to get back, because `--color-background-muted` is a low-alpha near-black that is close to invisible over a dark card — dark has effectively been rendering `transparent` all along.

- `useTableRowExpansion` accepts `hasRowClickExpansion`, so a row opens when you click anywhere on it and not only on its chevron. (#5995)
  `useTableTreeData` has had this since it shipped, under the same name and with the same behaviour. The detail-panel plugin is the other half of the same pair — one expands into child rows, one expands into a panel — and a caller who moved between them lost whole-row clicking without anything saying why. There was no way to add it back either: a click handler on the row has to know not to fire on a checkbox, a link or the end of a text drag, and none of that is reachable from the outside.

  Off by default, and pointer-only when on. The chevron button stays the accessible control, so keyboard and assistive-tech users are unaffected — this adds a shortcut for a mouse, not a second way to operate the table. Clicks that land on interactive cell content, clicks that end a text selection, and clicks on rows `getIsItemExpandable` has ruled out all pass through untouched. The chevron already stops propagation, so it does not toggle twice.

  Collapsed rows are wired up as well as expanded ones, which is most of the point: the row you want to click is the one that has not opened yet.

#### Fixes

- A BottomSheet drag writes its transform straight to the sheet once per input sample and renders nothing in between (React state changes when the drag begins and ends, and when its layout split changes). Measured in Chromium: 4 commits for a 24-sample drag, down from 49. The release still animates from wherever the finger left the sheet.
- BottomSheet hands a touch to the sheet at the scroll edge of the box under the finger, not the body's alone. Content that scrolls inside the body (a pinned header and footer around a scrolling middle, a grid) never moved the body's `scrollTop`, so every pull down over that scrolled box dragged the sheet and the box could not be scrolled back by hand. From the box's top the pull still drags the sheet.
- BottomSheet no longer blocks pinch-zoom. A pinch that started on an open sheet (its handle, its content, or across both) did nothing, because the sheet claimed every touch gesture: `touch-action: none` on the sheet and handle, `pan-y` on the content. The sheet now leaves pinch to the browser (`pinch-zoom`, and `pan-y pinch-zoom` on the content), and a second finger (on the handle, on the content, or off the sheet, whichever lands first) ends any sheet drag in flight or about to start, so the page zooms and the sheet stays at its detent. One-finger drag and scroll are unchanged.
- A BottomSheet release is judged where the sheet would coast to at the finger's speed, not where the finger left it: a medium throw dismisses from short of the dismiss line and a gentle throw lands on the next detent instead of snapping back, the release speed is read over the finger's last 100ms rather than its last two samples, and a finger that rests before lifting releases no throw. A nudge under 48px still projects nothing.
- A DropdownMenu opened by a mouse press returns focus to its trigger when it closes, instead of to the control that was focused before the press.
  A mouse opens the menu on press-down, before the browser's own mousedown has focused the trigger, so the popover remembered the previously focused control and handed focus back there on Escape or after a pick. The trigger now takes focus as the press opens the menu, the state a click-open already had; keyboard opens, taps and the menu's own behavior are unchanged.
- A field status shown with `statusVariant="tooltip"` is now announced to screen readers when it appears or changes, the same way the attached and detached message boxes are: errors assertively, warnings and successes politely.
  Before, the tooltip placement only described the control, so a screen-reader user was not told that a validation message had appeared until they left and re-entered the field. This affects every input that offers the tooltip placement. The attached and detached placements are unchanged and are still announced once.
- FileInput: invoke changeAction and update optimistic state on clear and file selection
- swizzle: rewrite every .stylex import to a deep path
  `astryx swizzle Button` (and any component that imports a `.stylex` module from outside its own directory) emitted an import that collapsed to the directory barrel — e.g. `@astryxdesign/core/utils` instead of `@astryxdesign/core/utils/interactionOverlay.stylex`. The barrel does not re-export those StyleX symbols, so the swizzled file could not compile.

  `rewriteImports` now gives every `*.stylex` module the deep subpath. The exports generator (`scripts/sync-exports.js`) adds 16 specific subpath exports for the `.stylex` modules swizzled components actually reference across directories:

  `DateInput/tokens.stylex`, `Icon/IconSize.stylex`, `Indicator/indicator.markers.stylex`, `Layer/layerAnimations.stylex`, `Layer/layerTextReset.stylex`, `Layer/layerViewportInset.stylex`, `Layout/container.stylex`, `Layout/edgeCompensation.stylex`, `Layout/padding.stylex`, `NavItem/navItemStyles.stylex`, `Selector/selectorPresentation.stylex`, `Stack/stack.stylex`, `Stack/stackItem.stylex`, `Text/text.stylex`, `utils/focusOutline.stylex`, `utils/interactionOverlay.stylex`

  These are public API additions. Each module already ships in the npm tarball (in `dist/`); only the exports map entry is new. No wildcard — a future cross-directory `.stylex` import needs a deliberate entry in `STATIC_EXPORTS`. Precedent: `./theme/dataTokens.stylex` (AST-066 FR2).

- Keep grouped-row custom headers full-width while pinning their 16px disclosure button, and expose expansion state on the button. (#6251)
- Keep grouped-row collapse chevrons pinned without shrinking custom headers, and increase them from 12px to 16px (#6222)
- Keep layer portals inside their nearest dialog
- Markdown: read an indented table with its own columns
  `Markdown` no longer adds an empty first column to a table whose rows are indented, such as `  | a | b |`. The indentation before a row's first pipe used to read as a cell of its own.
- Markdown: keep a definition-shaped line whose label is over 999 characters
  `Markdown` no longer drops a line shaped like a link reference definition whose label holds more than 999 characters. CommonMark allows no such definition, so the line now shows as text, as a reference with that label already did.
- Markdown: end a code block left open at the end of a message on its last line of code
  When a message ended inside a code block that was never closed, `Markdown` read the message's final line ending as one more, empty line of code, unlike a closed code block and unlike the streamed render of the same message. A real blank line before the end is still code, and while a message streams, an open code block now shows the blank lines already written instead of adding them later.
- Markdown: keep a quoted blank line at the end of a code block left open
  A code block left open inside a block quote keeps a blank quoted line at its end as code, as CommonMark reads it. Only the document's own final line ending is left out of an open code block.
- Markdown: keep two lists apart while streaming when their bullets or indentation differ
  While a message streamed, `Markdown` joined two lists a blank line apart whenever both were bulleted, or both numbered with the same delimiter — even when their bullets (`-` then `*`) or indentation differed, where the finished document shows two lists. The streamed render now keeps them apart, as the finished document does.
- MobileNav no longer blocks pinch-zoom while it is open. The open nav covers the whole viewport and declared `touch-action: none` (with `pan-y` on its content), so a pinch anywhere on screen did nothing. It now declares `pinch-zoom` (and `pan-y pinch-zoom` on the content): pans are still kept from reaching the page behind, and a pinch zooms the page.
- MultiSelector: name the listbox of a bottom sheet without search from the component's label, so screen readers announce it
- Added a `@astryx.richTextEditor.*` catalog namespace to the shared message catalog, so the RichText editor's toolbar labels, block-format options, link dialog, and Tab escape hint can be translated and overridden through `InternationalizationProvider`. The editor's character counter now announces through the existing `@astryx.textArea.characters*` messages, so it is translated in every locale TextArea already ships.
- In a collapsed SideNav, pressing a SideNavHeading menu trigger right after hovering it now keeps the hover-opened menu open, as the click guard intends. The browser was dismissing the menu on the press because the trigger sat outside the panel; the collapsed trigger is now the panel's native invoker, the same wiring TopNavMenu uses.
- Keep editable content from toggling tree and expansion rows
  The shared click guard that row-expansion and tree-data use to decide whether a row click should toggle missed `[contenteditable]` elements. Clicking or typing inside editable content in a row toggled it. Restored the exclusion with tests on both paths.
- Whole-row-click expansion reuses the shared clickable-container guards instead of its own selector list. (#5995)
  `useTableRowExpansion` and `useTableTreeData` each carried a hand-rolled copy of "did this click belong to something else" — the same nine selectors, written twice. `useClickableContainer` already owns that rule for every clickable surface in the system, and its `INTERACTIVE_SELECTORS` list is the fuller one: it also covers `role="link"`, `radio`, `switch`, `tab`, `menuitem`, `option`, `combobox`, `listbox`, `slider`, `spinbutton` and `[data-pressable-container]`, and it excludes `[aria-readonly="true"]`.

  Both plugins now call the hook's `hasInteractiveAncestor` and `hasTextSelection`, newly exported for containers that cannot use the hook itself — a `<tr>` assembled inside `transformBodyRow` has no ref to hand it.

  Two behaviour changes fall out of sharing, both fixes:

- Turn only the chevron glyph in `useTableRowExpansion`, not the button beneath it. (#5995)
  The rotation was on the `<button>`, which is the hit target and carries the hover chip, so opening a row swung that rounded rectangle and its highlight a quarter turn along with the arrow — most visible mid-animation, where the chip passes through a diamond. A finished 90° turn on a 24px rounded square lands back on itself, which is why this only shows up in motion.

  The transform now sits on the glyph and the button stays put. The two transitions move onto `--duration-fast` and `--ease-standard` in the same pass, matching what `TableRow` already uses for its own hover transition.

- Draw the row divider below a `useTableRowExpansion` detail panel rather than above it. (#5995)
  An expanded row and its panel are one unit, but the divider was landing between them: the row drew its own bottom border, which put a line between the row and the detail it had just opened, and the panel drew none, so it ran flush into the next row. Both halves of that are backwards — the pair was split down the middle and then fused to the row below.

  The expanded row now gives up its border and the panel takes one. On a table with no row dividers the suppression removes a border that was never there and the panel's is never applied, so neither side has to consult the divider mode; only the panel does, to know whether to draw at all. The panel row carries `tableRowMarker`, which is how `TableCell` scopes its "no trailing line under the last row" rule, so an expanded last row still ends the table cleanly.

- Start the `useTableRowExpansion` detail panel at the first column rather than at the row edge. (#5995)
  The panel is one cell spanning the whole row with a flat `20px` inline padding, so its content began under the chevron — a column to the left of every label it describes.

  It now indents by the chevron column's fixed width plus the inline padding a cell of that density gives its own content, read off the table context so it follows `density`, and written as a logical property so RTL mirrors it. It is not configurable: a panel starting anywhere else reads as a misalignment rather than as a choice.

  The chevron column's width cannot be a token reference — the layout does arithmetic on it — but it is the pixel value of `--spacing-10`, which is how the indent spells it. A test pins the two together so a change to the scale cannot silently unalign them.

- `Table` zebra striping counts data rows only, so expanding a row no longer inverts the stripe of every row below it. (#5995)
  A row-expansion detail panel is appended as a sibling `<tr>` in the same `<tbody>`, and striping is `:nth-child(even)` — so the panel took a stripe turn of its own and pushed every row after it onto the opposite one. Opening a single row repainted half the table.

  The stripe now counts `:nth-child(even of :not([data-expansion-panel]))`. A panel is not a row and is not counted as one, so the data rows keep their parity whatever is open.

  `of S` has been Baseline since 2023, inside Astryx's support floor (AST-013). Below it the stripe rule is dropped rather than misapplied: an unstriped table, not a mis-striped one.

  Tables without the row-expansion plugin are unaffected — nothing else in the system emits `data-expansion-panel`.

- Table columns without an explicit width now keep a compact readability floor and use the existing horizontal Scroll region when their combined minimums do not fit.

#### Documentation

- The README's CDN template command and the icon and token hints in the DropdownMenu item and Indicator docs name the scoped `npx @astryxdesign/cli`, which runs this CLI whether or not it is installed. Bare `npx astryx` fetches an unrelated npm package until the CLI is a dependency.
- align statusVariant documentation and test coverage across ComplexSelector, Tokenizer, and Typeahead

#### Other Changes

- A click on a composed control the short list missed — a `role="tab"`, a segmented `role="radio"`, a `Slider` in a cell — no longer toggles the row underneath it.
- The text-selection guard is scoped to the row instead of asking the document for any selection at all. Text selected elsewhere on the page no longer makes every row in the table inert.

  The walk also stops at the row rather than climbing to `document.body`, so an interactive ancestor of the whole table cannot suppress row clicks.

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @cixzhang
- @ernestt
- @humbertovirtudes
- @imdreamrunner
- @josephfarina
- @Lee-Dongwook
- @ManoharPaturi
- @vjeux

---

# 0.6.6

#### New Features

- Add a shared `upload` icon, and use it for FileInput's upload affordance instead of the directional `arrowUp`
  Themes draw `upload` through `icons.upload`, separately from `arrowUp`, so sort arrows and every other `arrowUp` use stay unchanged. Every bundled theme and theme template draws `upload` in its own icon style. FileInput keeps its icon size, placement, color, and accessibility in both modes; a theme with no `upload` artwork shows the default upload-into-tray glyph there.

  A complete `IconRegistry` may still omit `upload` in this release. The next minor makes it required, so add an `upload` entry to any registry you type as `IconRegistry`.

- BottomSheet is a container, like Dialog. A new `padding` prop takes a spacing step, and a theme's `padding` on `bottom-sheet` now pads the sheet's content box through container tokens instead of padding the panel. The padded content box publishes its inset, so a Section that is the sheet's only child, and bleed children such as Table and Divider, align against it. With neither set, the content box stays unpadded as before.
- `ComplexSelector` can hang off a control the caller renders.
  A new `renderTrigger` render prop renders the control the popup hangs off — a glyph in a list row, a chip, an icon button — in place of the selector's own field and button. Spread the given props onto it; the popup is anchored to it, keeps its dialog label from `label`, opens on click or ArrowDown, and returns focus to the control on close. The existing `handleRef` and `onOpenChange` work unchanged beside it. Off by default; existing selectors are unchanged.
- ContextMenu takes `triggerAs` (`div` | `span`) so a reference inside prose can own a context menu without breaking the text flow.
- Export the canonical 56-token StyleX `dataVars` group for CSS-capable data visualization consumers.
- Export `decodeMarkdownCharacterReferences` from `@astryxdesign/core/Markdown/parser` and `@astryxdesign/core/Markdown`
  It decodes character references the way `Markdown` renders them — `&copy;`, `&#169;`, and `&#xA9;` become `©`; unknown names and references without their semicolon stay as written — using the same table `Markdown` uses. It works on plain text, so leave code and backslash-escaped references out. The parser subpath has no use-client boundary, so server code can call it.
- Add `DropdownMenuGroup`, a titled `role="group"` of rows for compound-mode menus.
  The `items` data API could title a group (`{type: 'section', title, items}`); a menu written with children — checkbox rows, radio groups, rows mounted only while open — could not. `DropdownMenuGroup` (also `ContextMenuGroup` and `BreadcrumbMenuGroup`) renders a `role="group"` named by its heading through `aria-labelledby`; the heading shares the data mode's typography and `astryx-dropdown-menu-section-heading` theme target, is not a menu item, and is skipped by arrow keys and typeahead. Existing menus are unchanged.
- The message a component shows when a query matched nothing is now `emptySearchText` everywhere, and it takes a `ReactNode`.
  `Selector`, `MultiSelector`, and `CommandPalette` already called it `emptySearchText` and already accepted a node. `Tokenizer`, `Typeahead`, `BaseTypeahead`, and each `ChatComposerInput` trigger called it `emptySearchResultsText` and accepted only a string — so the same product could offer a "no results, create one" row in one component and not in its neighbour, and a builder who learned one had to discover the other.

  Nothing breaks. The type only widens, so every existing value stays valid, and `emptySearchResultsText` keeps working exactly as released. Set both and `emptySearchText` wins, with a development warning. Migration is the name alone.

  Deprecation lifecycle (`spec:AST-017` FR28, FR31) — removal only in a later minor whose frozen manifest carries both ids of a pair:

- The layer runtime owns the viewport inset: one gutter, one cap, one fallback order, and one place an app declares a floating bar.
  Every anchored layer — Popover, DropdownMenu and its submenus, Typeahead, Tooltip, HoverCard, the selectors — now keeps the same gutter from each viewport edge (the spacing-4 step or the device safe-area inset, whichever is larger) and is capped to the viewport. Four components used to carry their own copies of that gutter, and they had drifted.
- Add the first-party Markdown heading-links module.
  `createMarkdownHeadingLinks()` is exported from `@astryxdesign/core/Markdown/plugins` and gives every built-in h1–h6 a collision-safe generated fragment plus an accessible inline trailing `#` copy button, including headings nested in blockquotes and lists. Its frozen, versioned entry carries the namespace and safe URL base across compatible Core package copies without module-local state. The heading row uses `useContainerReveal`: the button is hidden at fine-pointer rest, reveals on row hover or keyboard focus, and follows the canonical coarse/touch behavior. An unmodified tap, click, Enter, or Space copies the canonical URL without navigating, scrolling, or mutating the hash and briefly shows a check confirmation; failures stay silent. The same opaque plugin entry keeps Markdown-derived Outline aligned, supports Unicode NFKC slugs, an optional caller-owned namespace and safe permalink URL base, and leaves default Markdown plus custom heading renderers unchanged.
- Markdown: nested lists draw a different marker at each depth
  Bulleted lists cycle disc, circle, and square, and numbered lists cycle decimal, lower-alpha, and lower-roman, by how many lists of either kind enclose them, so each level can be told apart from the levels beside it. Numbering keeps each list's start and items. `List` and `ListItem` keep their public marker styles.
- Markdown plugins: read what a plugin declares, and render one plugin node as Markdown does
  `getMarkdownPluginCapabilities(plugin)`, from `@astryxdesign/core/Markdown/plugins`, reports whether a plugin declares syntax and whether it declares a transform, and nothing else; plugin entries stay opaque. `MarkdownPluginNodeRenderer`, from the new client-only `@astryxdesign/core/Markdown/plugin-renderer` subpath, renders one parsed extension node with the given plugins exactly as `Markdown` presents it — the plugin's renderer inside the same error boundary and suspense fallback, the same readable fallback text, and the same failure report — with no element of its own. `Markdown`'s own output is unchanged.
- DropdownMenu takes a `trigger` render prop: hang a menu off any control.
  `trigger` renders the control the menu opens from — an IconButton, a chip, an avatar, a list row — and hands it `DropdownMenuTriggerProps` to spread: the press model, the keyboard opens, the toggle click and the ARIA wiring. The menu is named by that control through `aria-labelledby`. `button` and `trigger` are mutually exclusive (a dev warning).
- Menu arrows wrap and PageUp/PageDown page.
  In `DropdownMenu`, `ContextMenu` and `DropdownMenuSubMenu`, ArrowDown on the last row wraps to the first and ArrowUp on the first to the last, as macOS menus do (`Selector` keeps clamping like a native select). PageDown and PageUp move to the last and first fully visible row of a scrolling menu, and pressed there again one viewport further, never wrapping. ArrowUp on the trigger opens the menu with the last row highlighted. The key that opened the menu no longer activates the first row through its auto-repeat, and typeahead ignores a key that is part of an input-method composition. `useListFocus` gains `hasPaging`.
- DropdownMenuItem takes `href`: a menu row that navigates is a real link.
  `DropdownMenuItem` (and a data-mode item) takes `href`, `target` and `rel`. The row renders as the anchor itself, with `role="menuitem"`, routed through `LinkProvider`, so a ⌘-click, Ctrl-click or middle click keeps the browser's meaning and skips `onClick`; a plain click runs `onClick`, closes the menu and navigates. The touch sheet renders the same item as a link row. `onClick` now receives the click event. Enter and Space in every menu synthesize a click that carries the key's modifiers.
- DropdownMenu takes `menuMaxHeight` to lift the 300px cap for a menu that must fit its rows; the viewport still bounds it.
- Menus and pickers act on the row under the pointer at release, and the highlight follows a held finger or mouse.
  `DropdownMenu`, `ContextMenu`, `DropdownMenuSubMenu`, `Selector` and the menu bottom sheet share one press model, the one macOS and iOS menus use: the row under the pointer when it is released is the row that acts, and the highlight follows a held pointer across the rows. A finger that lands on one row and lifts on another acts on the second — once; the click the browser aims at the first row is swallowed. A mouse released outside a menu closes it; a finger released outside leaves it open. A menu whose rows fit declares `touch-action: none` so a slide stays a slide; one that scrolls lets the browser pan it and ends the gesture. Menu rows no longer paint a pressed look where hover does not exist. New public hook: `useMenuPress`.
- A mouse opens a DropdownMenu on press and can drag straight into it; a finger held on the trigger opens it with the finger down.
  A `DropdownMenu` trigger now opens its menu on a mouse press-down, and a drag from the trigger into the menu that lets go over a row picks it, as macOS menus do. The release of the opening press acts only after the pointer has entered the menu or the press has lasted about a third of a second, so a menu that opens under the pointer never picks a row nobody chose. Pressing the trigger of an open menu closes it without reopening in the same gesture. A tap still opens through its click; a finger held on the trigger for half a second opens the menu with the finger down, and a slide then picks. `useMenuPress` gains `onTriggerPress`, `triggerProps`, `isTriggerClickFromPress` and `longPressDelayMs`.
- DropdownMenuSubMenu drills in on a phone instead of opening a flyout.
  When a coarse pointer opened the menu, a sub-menu row replaces the menu's rows with its own and a "Back to <parent>" row, in the same box; Back, Escape or ArrowLeft return to the row. Works in compound and data mode, inside `DropdownMenu` and `ContextMenu`; `presentation` (`flyout` | `drill-in` | `adaptive`) overrides the policy.
- `MultiSelector` can offer a `Create "<query>"` row for a search that matches nothing.
  With `hasSearch`, the new `hasCreate` switch puts a `Create "<query>"` row first in the list when the trimmed query equals no option label under the search's own case-insensitive matching and the options have loaded. Picking it, or Enter with nothing highlighted, calls `onChange` with the query appended to the value and a second argument `{type: 'create', query}` (exported as `MultiSelectorChange`), then clears the search; the caller adds an option for the new value in that same update. Every other change passes no descriptor, so existing one-argument handlers are unchanged. `hasCreate` without `hasSearch` warns in development and offers nothing. Off by default.
- `MultiSelector` can hang off a control the caller renders.
  A new `renderTrigger` render prop renders the control the panel hangs off — a glyph in a list row, a chip, an icon button — in place of the selector's own field and button. Spread the given props onto it; the listbox is anchored to it, named by `label`, takes focus on open, and focus returns to the control on close. `handleRef` (`open`/`close`/`toggle`/`isOpen`, the `ComplexSelectorHandle` shape) and `onOpenChange` let the caller open the panel from a keystroke elsewhere and observe every open and close. All three are off by default; existing selectors are unchanged.
- Sub-menu flyouts stay open while the pointer travels toward them, and a press on a sub-menu row opens it without ever closing the menu.
  In `DropdownMenuSubMenu` the flyout now stays open while the mouse moves from the row toward the flyout inside the triangle to its near edge, and closes after the existing delay once the pointer has left both the row and that triangle, so a diagonal path to the flyout no longer folds it. A click or release on a sub-menu row opens its flyout; on an open one it confirms the flyout and moves focus into it instead of toggling it shut, as macOS sub-menu rows do. `useMenuHover` gains `flyoutRef` and passes the leave event to `onMouseLeave`.
- Touch press model: under a coarse pointer the bare `:active` arm is dropped and a delegated, document-level controller paints the press the way a native list does — nothing for 150 ms, then the full pressed overlay on the next frame; cancelled with no fade by 10 px of travel or by a scroll claiming the gesture, and dead until a new touch; a tap shorter than the delay paints at the lift; the release fades over 200 ms, a real fade on every surface: the pressed overlay is the pressed token at `--astryx-press-alpha`, a registered custom property (`@property`, syntax `<number>`) the release arm animates 1 → 0, declared once by the shared overlay styles as `--_press-paint` and read by whatever paints it. The controller writes `data-astryx-press="on"|"fading"` on the nearest element marked `data-astryx-pressable`, which every Astryx surface that paints a press now carries; a mouse keeps `:active`. Public API for a local pressable: `usePressFeedback()` from `@astryxdesign/core/hooks` (returns the marker to spread; installs the controller on first mount) and `interactionOverlayStyles` from `@astryxdesign/core/utils` (compose one of its variants on the marked element). A press is themed through `--color-overlay-pressed`, which the hold, the flash and the fade all read.

#### Fixes

- Selector and MultiSelector announce the empty-state message they actually show, and announce it on every path that reaches one.
  Two defects, one cause — the live region was fed from the props instead of from what rendered:
- `Typeahead`, `Tokenizer`, and `PowerSearch` (which composes `Tokenizer`): clicking the search/combobox input after the dropdown closed without a blur now reopens it.
  `BaseTypeahead` only ever opened its dropdown in response to a real `focus` event. Any flow that closes the dropdown while leaving the input focused — selecting a result (which re-focuses the input internally after clearing it), pressing Escape, or a composing component (`PowerSearch`'s token add/remove, e.g.) imperatively re-focusing the same input once it's done — dispatches no new `focus` event, since `focus()` is a no-op on an element that's already the active element. The input looked focused and clickable, but clicking it did nothing until the user clicked elsewhere first and back.

  `BaseTypeahead` now also opens on click, specifically when the input was already focused before the click began (checked at `pointerdown`, before the browser's own default action moves focus — a click that itself just caused the input to gain focus is left to the existing focus path, so the two don't double-fire a bootstrap fetch on a single first click).

  Only `Typeahead` and `Tokenizer` compose `BaseTypeahead` directly — `Selector`, `MultiSelector`, `CommandPalette`, and `DateTimeInput` use their own separate combobox implementations (which only follow `BaseTypeahead`'s conventions, not its code) and are unaffected by this change.

  Fixes #6845.

- Card: yield to a flex row or grid track instead of widening it to the card's content.
  A card no longer holds its row or `1fr` grid track at its min-content width, so a long unbroken value (an ID, a hash) inside a card can no longer push side-by-side cards past a phone screen. Cards that fit are unchanged. Content that cannot wrap is clipped at the card edge, as it already was for cards with an explicit `width`; truncate such values with `Text maxLines={1}` and give wide content its own scroll region. An explicit `width` is now the card's preferred width in a row rather than a floor. To hold it, wrap the card in `StackItem` in a flex row, or set a consumer `minWidth` on the Card in Grid.
- Chat: center inline tokens on the line box using 1lh and vertical-align top, fixing vertical misalignment against adjacent text and CJK characters.
- Prevent disabled `ClickableCard` links from retaining an activatable destination.
- Make Code's complete public API and theme target discoverable in component documentation.
- Keep collapsible code blocks named and recoverable when header controls disappear, honor zero-pixel height limits, and document the public root ref.
- Expose Collapsible open, disabled, position, and divided states to themes, and document grouped state ownership and root customization.
- Preserve `CollapsibleGroup` context identity when a controlled string value is unchanged, avoiding unnecessary grouped-item rerenders.
- Let CommandPaletteFooter wrap translated guidance on narrow screens, correct its composition example, and add owned audit coverage.
- Field-based inputs (TextInput, Selector, DateInput, and the rest of the input family) can now be shrunk by their row: the Field root resets its automatic minimum size, so a filter bar of a search box and selectors no longer pushes past its container on phones
- Defer a layer `show()` that arrives while another popover is mid show/hide, so a tooltip trigger regaining focus from a closing popover no longer throws `InvalidStateError`.
- Markdown: read angle-bracket link destinations to their closing bracket
  `Markdown` now reads an angle-bracket destination as CommonMark specifies: parentheses inside the brackets are part of the address, so `[a](<b(c>)` links to `b(c)`; an escaped bracket inside is part of it too, so `<b\>c>` is `b>c`; and a line ending inside the brackets makes the text no link. Unsafe schemes are refused as before.
- Markdown keeps a backslash unless it escapes punctuation, and a backslash at the end of a line is a line break
  `C:\Users\Ada` rendered as `C:UsersAda`: any character after a backslash swallowed it. As CommonMark specifies, a backslash now escapes only ASCII punctuation (`\*`, `\#`, `\\`, …); before a letter, digit, space, or other character it stays as written. A backslash at the end of a line is a hard line break. Image alt text follows the same rule.
- Markdown: cap list and blockquote nesting, so deep input cannot crash rendering
  `Markdown` now nests lists and blockquotes at most 100 levels deep, as it already caps emphasis; content nested deeper reads as text. A list or blockquote nested thousands of levels deep, as a crafted message can be, used to overflow the stack and throw while parsing.
- Markdown: read a block quote marker as CommonMark does
  `Markdown` now reads a line that starts with up to three spaces and `>` as a block quote, whether or not a space follows the `>`: `>quote`, `   > quote`, and `>>> nested` are quotes, as CommonMark specifies. These lines used to show as plain text with their `>` marks.
- Markdown: start a new list when the bullet changes
  `Markdown` now starts a new list when a bullet list's marker changes — `- a` then `* b` are two lists — as CommonMark specifies, and as ordered lists already did when their delimiter changes.
- Markdown shows character references such as `&amp;`, `&copy;`, and `&#169;` as the characters they name
  `Fish &amp; chips &copy; 2026` rendered with the references spelled out. Named references (every name in the HTML standard) and decimal or hexadecimal numeric references in text now render as their characters, as CommonMark specifies; inside inline code and code blocks they stay exactly as written. An unknown name or a reference without its closing `;` stays literal, and a decoded character is never read as Markdown syntax.
- Markdown: close a code span only at a backtick string of the same length
  `Markdown` now ends a code span at the next run of exactly as many backticks as opened it, never at part of a longer run, and reads runs of any length, as CommonMark specifies. `` `one`` two` `` is one code span holding ` `` `, and four or more backticks open and close spans too. A run with no closer of its length stays text.
- Markdown makes a hard line break from two spaces or a backslash before a Windows (CRLF) line ending
  Documents saved with CRLF line endings lost their hard line breaks: the carriage return sat between the trailing spaces or backslash and the line feed, so neither was recognized and the lines ran together. Both now break the line exactly as they do in an LF document, in paragraphs, links, and block quotes and while streaming; code spans, code blocks, and table cells are unchanged.
- Markdown: read a code fence's language after spaces
  `Markdown` now reads a fenced code block's language as the first word of its info string after any spaces, as CommonMark specifies, so `~~~ js` and ` ``` js ` are JavaScript blocks rather than blocks with no language. Fences written without a space read as before.
- Markdown: give an image the plain text of its description as alt text
  `Markdown` now reads an image's description as inline content and uses its plain text as the alt text, as CommonMark specifies, so ``![`a]b` *c*](u)`` has the alt `a]b c` rather than the raw source with its backticks and asterisks.
- Markdown image alt text shows character references and escapes as the characters they name
  `![Fish &amp; chips](…)` gave the image the alt text `Fish &amp; chips`, so a screen reader announced "amp". Alt text now resolves character references and backslash escapes the same way body text does, for inline, standalone, and reference-style images; an escaped `&` and unknown names stay literal.
- Markdown: read an ATX heading indented up to three spaces as a heading
  `Markdown` now reads a heading line indented by up to three spaces, such as `   # Title`, as a heading, as CommonMark specifies. Such lines used to show as plain text with their `#` marks, except at the very start of a streamed message.
- Markdown: read a code fence indented up to three spaces as CommonMark does
  `Markdown` now reads a code fence indented by up to three spaces as a code block, and a closing fence may be indented the same way, as CommonMark specifies. Each code line loses as much indentation as the opening fence has. A closing fence has only spaces or tabs after it, so a line such as ` ```js ` inside an open block stays part of the code. Such fences used to show as raw backticks or tildes in a paragraph, and an indented closing fence left the block open to the end of the document.
- Markdown: show a link whose destination opens with `<` but is no angle-bracket destination as text
  `Markdown` now shows `[a](<b>c>)`, `[a](<b)`, and `[link](<foo\>)` as text, as CommonMark specifies: a destination that opens with `<` must be one whole angle-bracket destination, with no line ending inside, even after a backslash. Such links used to fall back to a link to the whole text between the parentheses.
- Markdown: keep lazy continuation lines fast in deeply nested input
  `Markdown` no longer slows to seconds on a deeply nested blockquote or list followed by a lazy continuation line, as a crafted message can be: checking whether the line continues a paragraph now reuses what the parser already read at each level, and checking a long line for a thematic break no longer copies it. Lists and blockquotes nest at most exactly 100 levels deep.
- Markdown: find link destinations in linear time
  `Markdown` no longer searches the rest of the text for every link or image whose destination never closes, which made a message with many of them take seconds to render. Each parenthesis now pairs once per text, so such input renders in milliseconds; links read as before.
- Markdown: decode character references and backslash escapes in link destinations, and close link text at an unescaped bracket
  A link or image destination now reads as CommonMark specifies: `[x](https://a.com/?a=1&amp;b=2)` links to `https://a.com/?a=1&b=2`, `[x](a\)b)` links to `a)b`, and reference definitions decode the same way. The URL safety check runs on the decoded destination, so an encoded unsafe scheme such as `&#106;avascript:` is refused like the plain one. Link text and image alternative text close at the first unescaped `]`, so `[a\]b](u)` is a link with the text `a]b`.
- Markdown: pair link text brackets as CommonMark does
  `Markdown` now pairs the brackets of link text as CommonMark specifies: link text may hold balanced brackets, so `[a [b] c](u)` is one link; the innermost bracket makes the link, so `[a [b](u)` links only `b`; and a link inside link text wins, so `[a [b](u) c](v)` shows the outer brackets as text instead of nesting links.
- Markdown: a code span in link text hides its brackets
  `Markdown` no longer ends link text at a `]` inside a code span, since code spans bind tighter than links (CommonMark). ``[`a]b`](/u)`` links the code `a]b`, and ``[`[x](javascript:y)`](/rel)`` links the code `[x](javascript:y)` to `/rel` rather than reading a link inside the code.
- Markdown links and images go to their destination when the source also gives them a title
  `[notes](https://example.com/notes "Release notes")` linked to `https://example.com/notes "Release notes"` — an address that does not exist — and a titled image pointed at a source that could not load. A title after the destination, in double quotes, single quotes, or parentheses, is no longer part of the link or image address, and a destination in angle brackets may contain spaces. Content in any other shape keeps its meaning.
- Markdown: keep content indented into a list item in the item after a blank line
  `Markdown` now keeps lines indented to a list item's content in that item after a blank line, as CommonMark specifies: a nested list, a fenced code block, or another paragraph under a numbered step stays in the step, and the numbering continues after it. Such content used to end the list, so the sub-items showed as a separate list and a step's code block showed as raw text.
- Markdown: a list that mixes task and plain items shows each task item's checkbox
  In a list such as `- [x] Done`, `- Plain`, `- [ ] Open`, each task item now shows its own read-only checkbox, checked or open and named by its text, where its marker would be, and each plain item keeps its marker; the list stays one list. Before, the task items lost their checked state and showed bullets. Lists of only task items are unchanged.
- Markdown: pair emphasis and strong markers by CommonMark's rules, so strong inside emphasis keeps its strong
  Runs of `*` and `_` now pair as CommonMark specifies: by which side of a word they touch, by the nearest compatible opener, and by the rule of three. `*see **bold** more*` and `*see **bold***` render the bold inside the emphasis, `**bold *both***` renders the emphasis inside the strong, `__foo, __bar__, baz__` nests, and an escaped `\*` inside emphasis stays literal. Before, the first matching marker closed emphasis early and left stray `*` or `_` in the text. `***text***` still renders as strong around emphasis. Streaming closes an unfinished `**bold` before trailing spaces, so the partial text keeps its formatting.
- Markdown: keep the indentation of a message's first line
  `Markdown` now keeps the indentation of a message's first line, as it already did for every later line: two bullets indented by the same amount stay side by side, an indented numbered list keeps each item, and an indented table keeps its columns. A message that started with indented content used to render it differently from the same text after its first line.
- Markdown: end a list at a thematic break
  `Markdown` now reads a line such as `* * *` or `- - -` after a list item as a thematic break that ends the list, as CommonMark specifies, rather than as another item holding a nested list.
- Markdown: check a line's trailing spaces in linear time
  `Markdown` no longer slows to seconds on a line holding a long run of spaces before its last word, as a crafted message can: deciding whether trailing spaces make a hard line break now counts them from the end of the line instead of matching a pattern that retried from every space. Line breaks read as before.
- A DropdownMenu returns focus to its trigger after a pointer dismissal, without painting a focus ring.
  `DropdownMenu` used to blur its trigger after a pointer pick or an outside press, dropping focus to the page so the next arrow key went nowhere. Focus now returns to the trigger with the focus ring suppressed after pointer input, as the bottom-sheet presentation already did, and stays visible after a keyboard pick. A press outside that landed on a focusable control keeps focus there.
- A nav or menu trigger disabled while a hover is in flight no longer opens its surface.
  Hover intent schedules an open after a short delay. Disabling the trigger in that window left the scheduled open to land anyway, on a surface whose handlers were already inert — so it opened and nothing could dismiss it. The pending intent is now abandoned when the integration is disabled.
- A Layout nested in AppShell content, or in any other Layout, no longer inherits the outer Layout's `padding`. Its header, panels, content, and footer keep their default inset (or the enclosing Card, Section, or Dialog padding) instead of rendering flush against the content edge. An explicit `padding` on the nested Layout still wins.
- Restore Outline's visible keyboard focus indicator.
- Refresh stale cached field entries when `PowerSearch` reopens an already-focused input after its search source changes (#6845).
- Preserve consumer className on ToggleButton while retaining its theme classes.
- Navigation URL safety: refuse a data URL with spaces before its media type
  The shared URL safety check now ignores spaces after a URL's scheme before it compares the scheme, as a data URL's media type does, so `data: text/html,…` is refused like `data:text/html,…`. In Markdown this also refuses links, images, and angle autolinks whose destination decodes to that form, such as `data:&#32;text/html,…`. Accepted URLs are returned as before.
- Let chat follow reach the bottom when browsers round scroll offsets.
- Toolbar's center slot no longer clips its content, so focus rings, box-shadows, and the selected-tab indicator of a TabList in `centerContent` are drawn in full. Center content that cannot shrink and is wider than the space between the start and end slots now overflows it instead of being cut off.
- Forward accepted DOM props such as `id`, `data-*`, and `onClick` to the Typeahead and Tokenizer root elements. Preserve existing ref, styling, and `data-testid` targets and Typeahead's built-in focus and edit behavior inside InputGroup.

#### Other Changes

- `emptyText` and `emptySearchText` accept a `ReactNode`, but the region spoke the value only when it was a string and announced the built-in default otherwise. A product that put a link or a "create one" row in the dead end showed one message and announced another, so the screen-reader user was told something the sighted user was not reading.
- An empty result that arrived _after_ the keystroke — an async load landing with nothing that matches an active query — was never announced at all. The message sat on screen and the region stayed silent.

  Both components now read the rendered message out of the DOM and announce that, from one place that watches the panel's state rather than the keystroke. An element is announced as written, text a child component generates is announced correctly, and anything marked `aria-hidden` is left out of the announcement exactly as it is left out of the screen. A loading panel still announces nothing.

- deprecation `DEP-0001` / cleanup `CLN-0001` — `Tokenizer.emptySearchResultsText`
- deprecation `DEP-0002` / cleanup `CLN-0002` — `Typeahead.emptySearchResultsText`
- deprecation `DEP-0003` / cleanup `CLN-0003` — `BaseTypeahead.emptySearchResultsText`
- deprecation `DEP-0004` / cleanup `CLN-0004` — `ChatComposerTrigger.emptySearchResultsText`
- An explicit `width` on `Popover` and `menuWidth` on `DropdownMenu` or `Typeahead` render at their size up to the viewport. They used to be capped to the room beside the trigger, so a 352px menu opened from a control near a panel edge rendered 274px wide.
- A layer that does not fit beside its trigger flips; one that fits on neither side keeps its size and slides into view while its trigger is on screen. Once the trigger has left the viewport the layer holds its position and size instead of chasing the edge.
- An app that floats a persistent bar over a viewport edge — a phone navigation bar — declares it once, as `inset` on the `LayerProvider` it already mounts: `<LayerProvider inset={{blockEnd: 56}}>`. Every anchored layer then ends above the bar, and the toast viewport rises by the same amount, so one bar is declared once for both. Every edge defaults to zero, so nothing moves by default; an existing `toast.inset` keeps its meaning as the toast-only override.

  One additive prop (`LayerProvider.inset`, type `LayerInset`); no other prop, type, or default changes. `spec:AST-059` holds the decisions; the `Core/Layer` stories show each behavior.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @Geervan
- @HelloOjasMutreja
- @imdreamrunner
- @kentonquatman
- @korkt-kim
- @markselby9
- @rubyycheung
- @thedjpetersen
- @vjeux

---

# 0.6.5

#### New Features

- Stop bundling translator-only descriptions with the built-in English
  fallback and add compact generated string-map modules for every shipped locale. Existing rich JSON catalog exports remain unchanged.
- Popover and usePopover take a `padding` prop on the spacing scale (matching Card and Stack). `padding={0}` paints a flush surface for content that owns its own edges, such as a list of rows or a header with a rule; the default rung (3) is unchanged.

#### Fixes

- Button no longer overflows narrow rows: a labelled button can shrink below its label width and truncates the label with an ellipsis, while icon-only buttons stay square
- Prevent an empty Tokenizer input from creating a blank trailing row.
- SegmentedControl's default `hug` layout is now capped at its container width, and its segments shrink and truncate their labels instead of overflowing narrow cards and phone rows
- SelectableCard: keep disabled cards in sequential focus navigation with aria-disabled and gated interaction handlers.
- Selector's one-line trigger matches its size token when the theme's `--spacing-5` is taller than the token can hold, instead of overshooting it.
- Switch: announce busy/loading states through the persistent `useAnnounce` live region and localize the announcement via `@astryx.switch.loading`.

#### Contributors

Thanks to everyone who contributed to this release:

- @Geervan
- @imdreamrunner
- @nynexman4464
- @thedjpetersen
- @vjeux

---

# 0.6.4

#### New Features

- Add Timer for standardized elapsed durations without React tick renders. (#6438)
  Use `Timer` for active-operation elapsed time. It starts from mount by default, accepts an earlier Unix-millisecond `startTime`, offers `elapsed` and `clock` formats with adaptive cadence, and matches Timestamp typography props.
- DialogHeader: expose the start- and end-content wrappers as theme targets (#6415)
  Adds `dialog-header-start-content` and `dialog-header-end-content` so themes can style the existing content-slot wrappers without relying on their DOM positions. The end-content slot also contains the optional close button. Default layout and behavior are unchanged.
- `DialogHeader` `title` and `subtitle` now accept any `ReactNode`, not only strings.
  A title can carry inline markup and still renders inside the focusable `h2` that receives focus on open and names the Dialog; the accessible name is the title's text content. A subtitle can carry inline content such as a `Link`. String callers are unchanged. An empty-string, boolean, or nullish subtitle renders nothing, and a numeric `0` subtitle now renders inside the subtitle text.
- `DropdownMenuItem`, `DropdownMenuCheckboxItem` and `DropdownMenuRadioItem` forward a `ref` to the row root (#6687).
  The ref reaches the element carrying `role="menuitem"` (or `menuitemcheckbox` / `menuitemradio`), the way `Item` and `DropdownMenuDivider` already forward one, so a menu row can be registered with an element-keyed observer or overlay — an IntersectionObserver for an impression, a measurement, a debug outline — without a wrapper between `role="menu"` and the row.
- Add `presentation` to DateInput, DateTimeInput, and TimeInput (`spec:AST-043`) (#6628).
  `presentation` names every picker surface, distinguishing Astryx's desktop surface, Astryx's bottom sheet (including a new TimeInput sheet), the browser/OS picker, and — for TimeInput only — a plain typed field. DateInput and DateTimeInput accept five values: `'popover' | 'bottom-sheet' | 'native' | 'adaptive-bottom-sheet' | 'adaptive-native'` (default). TimeInput accepts those five plus `'text-input'`, the typed field on every pointer, because that is the surface its released `nativePicker="never"` already was. `presentation="native"` always shows native; `adaptive-native` keeps the released native fallbacks.

  `nativePicker` is deprecated but keeps working exactly as released (`touch`→`adaptive-native`, `always`→`native`, `never`→`adaptive-bottom-sheet`, or `text-input` for TimeInput); `presentation` wins when both are set. `astryx upgrade` ships `migrate-native-picker-to-presentation` for static callsites.

- `List`: add `edgeCompensation="inline"` to compensate for item content inset within container padding (#2626)
  `ListItem` insets its content by a density-dependent horizontal padding, so a list under a section heading reads as misaligned and consumers reach for negative-margin custom CSS. `edgeCompensation="inline"` on `List` cancels, per inline edge, the smaller of that inset and the container's published padding on that edge; zero-padding and full-bleed surfaces therefore stay in place, asymmetric container padding never over-cancels an edge, and headers, hover backgrounds, and selection backgrounds keep their existing geometry.

  `Item` now publishes its inline inset as `--_item-inset-inline` and derives its own `paddingInline` from it, and the clamped cancelling margin reads the same variable — so the cancel tracks density and theme overrides instead of mirroring hardcoded values. Themes that set `paddingInline` on `item` feed the variable automatically via the derived var registry.

- Markdown: add the first-party soft-breaks plugin (#6459)
  Use `markdownSoftBreaksPlugin` from `@astryxdesign/core/Markdown/plugins` to render soft line endings as hard breaks without preprocessing source. The plugin matches the real `remark-breaks` package through Astryx's supported adapter path while keeping code and other opaque content unchanged.
- Table: add a selection-aware bulk-actions wrapper that consumes `useTableSelectionState` output while keeping the selection plugin behavior-only. (#6474)

#### Fixes

- Preserve authored heading and text component styles when theme adaptations change the type scale (#6710)
- AvatarGroup keeps its overlap when avatars are wrapped in a HoverCard or Tooltip. Every avatar and the overflow indicator now take the overlap margin, and the group pads its start edge to match, so the overlap no longer depends on each avatar being a direct child of the group (#6736).
- Avatar initials skip punctuation: each word's initial is its first letter, digit or emoji, so `Northwind Workbench (automation)` renders `NA` instead of `N(` and `“Ada” Lovelace` renders `AL` instead of `“L`. Words with none of those, such as a lone `-`, are ignored, and a name made only of punctuation shows the default icon rather than a stray symbol (#6698).
- Size an Astryx Icon without an explicit size to match its Button or
  IconButton: 16px for small and medium controls, and 20px for large controls. (#5762)
- `ChatComposerInput`: an empty input no longer shrinks by 8px when `isDisabled` flips to `true`, which shifted anything bottom-aligned beside it (e.g. a send button in a grid row) (#6654).
  The root's `minHeight` was set to the shared line-height only, not the padding `editable` and `placeholder` both add on top of it — normally immaterial, since the editable region reserves its own padded box even when empty. A disabled, empty `contentEditable` region stops reserving that empty line at all in Chromium, and the absolutely positioned placeholder standing in for it doesn't contribute to layout height, so the root fell back to just the line-height and lost the padding. `minHeight` now explicitly accounts for both.
- ChatComposerInput no longer scrolls for a short single-line draft with `maxRows={1}`. Removing vertical padding also keeps the empty input and placeholder aligned when disabled. (#6733)
- Keep numeric zero aligned in ChatMessageBubble name and metadata slots. (#6600)
  The aligned wrappers are omitted for non-rendering scalar values (`null`, `undefined`, booleans, and the empty string), while numeric `0` remains visible inside the same inset as other slot content.
- Render numeric zero when it is passed as the ChatMessageList empty state. A valid ReactNode should not disappear when the transcript is empty. (#6636)
- Omit empty ChatMessageMetadata slots and their separators (#6637).
  Boolean and empty-string timestamp or footer values no longer leave a blank row or a stray dot. Numeric zero remains visible, and all delivery statuses keep their existing labels and icons.
- Compose accepted `onClick` handlers with ChatSendButton's send and stop actions instead of replacing them (#6653). Consumers that used `onClick` to replace sending should move that logic to `onSend`, because both handlers now run.
- Allow long ChatSystemMessage content to wrap within narrow chat layouts instead of crossing the container edge (#6655).
- ChatTokenizedText now ignores empty token values so tokenized messages always finish rendering (#6679).
- ChatToolCalls now displays custom group labels, keeps collapsed details out of keyboard navigation, adds visible focus treatment, and uses readable secondary text for neutral metadata (#6680).
- Stop ChatLayout's scroll-to-bottom button from being a tab stop while it is invisible. At rest the layout's default `scrollButton` renders hidden, but `opacity: 0` and `pointer-events: none` leave it in sequential focus navigation — so a keyboard user's first Tab into any chat landed on a control with no visible focus indicator (WCAG 2.2 SC 2.4.7), and Enter scrolled the transcript. The hidden state now also sets `visibility: hidden`, which the fade transition carries so the animation is unchanged; the visible button keeps its keyboard access. The pill's height and collapsed width now track `--size-element-md` instead of a hardcoded `32px`, so a theme that retunes the element scale can no longer make the pill clip its own Button. ChatLayout's consumer docs also gain the `density` prop, which was undocumented, and drop the claim that density adapts automatically to container width — it never did. A Chromium evidence spec pins the hidden/visible/re-hidden keyboard contract and the pill's containment of its Button under a size-retuning theme, and the RTL applicability ledger records why ChatLayout and its scroll button have no applicable RTL dimension. (#6466)
- Make a theme that styles `chat-layout-scroll-button` actually restyle the chat scroll-to-bottom pill. The documented target sat on the invisible full-width row that centres the pill, so a `backgroundColor` override painted a band across the chat dock while the pill kept the surface the theme asked to replace — and every automated check passed, because the override did reach _an_ element. The target now rides the pill, which is what paints the fill, elevation, and radius (`architecture:component-theming-surface` INV4). The target keeps its name, stays a single target, and the component's props, DOM shape, ref target, and consumer passthrough are unchanged. A Chromium spec pins the placement and proves the repair by moving the target back and showing the pill go unstyled under a theme. (#6482)
- Correct CheckboxIndicator theming, replacement-content, and focus guidance (#6745).
- Align CheckboxInput theming and label-icon guidance with shipped behavior (#6747).
- A CheckboxList option that is saving through `changeAction` now keeps its spinner, busy state, and re-toggle guard when another option is toggled before it settles (#6777).
- Clicking a read-only CheckboxList option that has an `onClick` now fires that handler once, instead of re-dispatching the click until the browser's call stack overflows (#6777).
- Give inert Citation references a supported accessible name, and document their linked and inert root contract.
- CodeBlock no longer crashes on custom tokenizer types outside the built-in grammar (a dotted type such as `keyword.control.sql` threw from `insertRule` and took the whole block down). The generated `::highlight()` name and `--color-syntax-*` custom property now pass through `CSS.escape` before entering the dynamic stylesheet, so every type the CSS parser accepts (dotted, digit-led, `_private`, non-ASCII) keeps its colour, and no token type can reach outside its own highlight rule. A rule the engine still refuses costs that type its colour, never the block. (#5528)
- `Dialog` and 30 other components no longer lose their `border` and `background` resets in the shipped CSS. The sources used the `border: 'none'` and `background: 'none' | 'transparent'` shorthands, which StyleX's default property-specificity mode drops silently, so the declarations never reached `astryx.css`; a consumer that does not load `reset.css` saw the UA `<dialog>` frame. They are now the `borderWidth` / `borderStyle` / `backgroundColor` longhands. No API change.
- Apply the same narrow blocked-scheme rule to native links, custom routers, clickable surfaces, and Markdown links. Rejected destinations stay visible without navigating or invoking a router, including structured URLs with a separate protocol. Ordinary URLs, safe custom schemes, downloads, and accepted router-object identity are preserved; Markdown image/resource policy is unchanged. (#5524)
- Preserve Tailwind font weights when using the theme bridge. (#6479)
- Ignore IME key events (`isComposing` or `keyCode` 229) in useHotkeys, even with allowInInputs enabled, without preventing their default behavior (#6773).
- Keep hug-layout segmented controls content-sized in flex containers (#6643)
- Keep a reopened top layer at the front of Escape dismissal order. (#6073)
- Prevent ancestor text formatting and surface/group context from leaking into Layer content. (#6457)
  Layer content now starts with theme body typography and neutral text formatting. Core layer content no longer inherits accidental ancestor surface/group membership, including group-owned disabled state, selection, callbacks, and label associations. Intentional groups and required providers created inside the layer still apply. Unrelated contexts, explicit props, themes, and styling overrides remain unchanged.
- `List` with `hasDividers` no longer draws a divider after the last `ListItem`. The last-item reset used the `borderBlockEnd` shorthand, which StyleX's default property-specificity mode drops silently, so it never reached the shipped CSS; it is now the `borderBlockEndWidth` longhand. (#6420)
- Localize PowerSearch boolean operators in Japanese and Korean and use locale-appropriate ellipses in Chinese. (#6783)
- Markdown: keep lazy continuation lines inside blockquotes and list items (#6752)
  Wrapped paragraph lines may omit repeated blockquote markers or list indentation without escaping their owning container. Nested, ordered, unordered, and task-list continuations now preserve their rendered structure, text projection, and source range.
- Markdown tables now use the `spacing-2` token (8px) on every header and body cell edge. The tighter inline spacing leaves more room for content in narrow reading columns while keeping rows comfortably readable.
- Markdown: render escaped table pipes literally in code spans (#6642)
  A `\|` used to keep a pipe inside a table cell now displays as `|` in inline code, matching prose cells without exposing the structural backslash. Completed inline-code spans render only their parsed contents inside `<code>`, without source backticks; standalone inline code otherwise remains unchanged.
- Markdown: table columns keep a content-derived width floor and headers stop truncating (#6708).
  A Markdown table in a narrow reading column no longer squashes every column to a few characters. Each column keeps a floor derived from its own content, measured in characters on the cell's text box, so a column is never narrower than its longest unbreakable token and cell padding does not eat into the floor. Identifiers, URLs, and inline code stay whole, header labels wrap instead of ellipsizing, and a table that is genuinely wider than its container scrolls in Table's own scroll region — which is now the table's only scroll viewport, accessible name, and keyboard stop.
- Align titled sections in DropdownMenu and ContextMenu bottom sheets with their spacious action rows (#6694).
- Keep MetadataList side labels readable beside long badges in narrow containers by allowing value columns to shrink, including numeric columns and custom label widths. (#6598)
- PowerSearch: `enum_list` value menus now show every value instead of the typeahead default of 10. (#6481)
- Selector keeps compact single-line triggers aligned with their size tokens, including icons and clear controls.
- Name the no-search bottom-sheet `Selector` listbox from the component's `label` so Chromium exposes it with an accessible name; the searchable sheet and popover paths keep their existing trigger relationship. (#6395)
- Keep Tailwind bridge tokens reference-only so utilities follow the active theme without emitting competing runtime declarations.
- Keep authored theme declarations inside their CSS boundaries. Drop only an unsafe declaration, preserve valid CSS values and legacy token generation, and continue compiling the rest of the theme. Runtime reports dropped declarations on the console; theme builds include them in the existing receipt warnings. CSS generators accept an optional warning-text array for build collectors, without a callback API or additional exported diagnostic types. (#5529)

#### Documentation

- Document CheckboxList's `isReadOnly` prop, and separate the select-all block example's rows with `hasDividers` instead of placing a Divider inside the options list (#6777).
- Clarify that CheckboxListItem reads `isChecked` and `onCheck` inside a CheckboxList without `value` (such as a select-all item), and requires `value` only when the parent CheckboxList has a `value` array (#6778).
- Clarify that CheckIndicator is the selection mark itself and does not render persistent control chrome.

#### Contributors

Thanks to everyone who contributed to this release:

- @bhamodi
- @cixzhang
- @fullstackhacker
- @harjothkhara
- @HelloOjasMutreja
- @humbertovirtudes
- @imdreamrunner
- @jiunshinn
- @korkt-kim
- @ksying
- @kyu-rong
- @light-merlin-dark
- @nynexman4464
- @rubyycheung
- @vjeux

---

# 0.6.3

#### New Features

- Show each shared InputClearButton's contextual action label in a tooltip. Clearable inputs now give sighted users the same specific action name already available to assistive technology. (#6354)
- ChatComposerDrawer: add a `collapsedSummary` composition slot that replaces the complete Collapsed summary anatomy part when provided. Omitting it preserves the existing neutral Badge and label. (#5399)
- DialogHeader: add end-content edge compensation control (#6465)
  DialogHeader now accepts `endContentEdgeCompensation="inline" | "block" | "all"` to select which axes of its existing end-content wrapper receive fixed compensation. Omitting the prop preserves the current automatic compensation whenever the close action renders.
- Markdown: add native typed frontmatter metadata (#6381)
  Use `createMarkdownFrontmatter()` from `@astryxdesign/core/Markdown/plugins` to decode a document-start key/value block into typed metadata, keep unfinished streaming metadata hidden, and remove completed metadata syntax from rendered Markdown.
- Markdown: add the core plugin protocol (#6340)
  Use `createMarkdownPlugin()` and Markdown's `plugins` prop to compose bounded source syntax, immutable typed AST transforms, and extension renderers. Import `parseMarkdownAst()` or `parseInlineAst()` from `@astryxdesign/core/Markdown/parser` when server code needs the canonical tree. The same ordered plugins work with parser entry points and Markdown-derived Outline items, while omitted or empty plugin lists preserve existing behavior.
- Markdown: add a limited Remark compatibility adapter (#6345)
  Import `createMarkdownRemarkTransform()` from `@astryxdesign/core/Markdown/remark` to run one synchronous transform-only Remark plugin over the documented MDAST subset. Every invocation gets a fresh mutable tree and an isolated file, and each plugin's compatibility is proven by fixtures rather than assumed: async work, parser or compiler plugins, processor state, raw HTML, unsupported nodes, forged positions, and metadata Astryx cannot represent keep the last valid readable document and report one diagnostic. The adapter is a separate entry point, so it stays out of every bundle that does not import it.
- Markdown: add a semantic code-fence transform helper (#6343)
  Use `createMarkdownFenceTransform()` to annotate declared fenced-code languages with typed extension data while standard plugin `renderers` own presentation and text projection. `components.code` retains precedence, and declined, missing, or failed proposals preserve Markdown's accessible, copyable `CodeBlock` fallback.
- Markdown: add an immutable source-decoration helper (#6344)
  Use `createMarkdownSourceDecoration()` to attach non-visual metadata to every block a validated UTF-16 source range touches, and `getMarkdownSourceDecorations()` to read it back in a later plugin. It works through `<Markdown>` and Outline with no extra parser options, resolves independently of the order earlier transforms left blocks in, and appears on the settled document rather than on partial streaming chunks, so a decoration never appears and then vanishes. Metadata lives in one versioned Astryx-owned envelope that never merges foreign node data. Rendered output, copyable text, accessible names, heading ids, focus order, navigation, and source provenance are unchanged.

  Markdown transforms also got faster, and a plugin now always observes a fully immutable tree — including blocks a Core helper carried over untouched. Core-authored helpers now validate the nodes a caller's callback produced and run on a trusted path that skips the whole-tree validation and freezing applied to plugin-authored output, freezing walks only what a transform changed, a plugin list that contributes no inline syntax no longer costs anything per source character, and the helpers' per-match allocations and rebuilds are gone. The representative three-helper set now adds about 20 percent over an empty pipeline, inside its 25 percent budget, down from roughly 3.3x.

- Markdown: add an immutable text-transform helper (#6342)
  Use `createMarkdownTextTransform()` to replace matching prose with typed Markdown nodes while preserving links, images, code, math, citations, and existing extension syntax as protected contexts.
- Add pressed feedback to CheckboxInput, Collapsible, Link, Slider, Switch, TabList, RadioList, and unselected SegmentedControl items. Enabled controls paint `--color-overlay-pressed` on their interaction surface during pointer hold or drag; disabled controls and selected SegmentedControl items keep their existing surfaces. (#6380)
- Let a TreeList item carry row styles (#6238)
  `TreeListItemData` gains `xstyle`, `className`, and `style`, applied to the item's row element, as the TreeList contract's per-item styling seam requires.

  `TreeList` takes rows as data, so nothing previously handed back the row's element. That prevents row-scoped primitives such as `useContainerReveal` from installing the class and inline custom properties that jointly isolate each row's hover and focus state; applying the reveal to the whole tree would expose every row action at once.

  `Item` already accepts the same row styling props, so a list converting to a tree keeps its reveal wiring instead of having to mark the whole tree.

#### Fixes

- Make overflowing BottomSheet text keyboard reachable with a named scroll-body tab stop. Add shared focus-time keyboard delegation to `useScrollableArea`: forward Tab may enter the first native link/button directly, while inputs, composite widgets, and nested scroll owners retain the viewport stop. Reverse traversal skips the delegated viewport; pointer/programmatic focus and content changes never trigger delegation. Sheet scroll containment now applies only while content overflows and uses the shared `contain` policy, which permits native edge feedback. (#6301)
- Keep ChatComposer's public composition contracts aligned: custom inputs now submit the value they supply, disabled default editors expose their state to assistive technology, and an explicitly shown Stop action remains pointer-operable while editing is disabled. (#6398)
- Keep collapsed `ChatComposerDrawer` content out of keyboard and assistive-technology navigation, and show the shared focus indicator on its disclosure control. (#6416)
- Keep programmatic ChatComposerInput edits observable, deliver dropped files through `onFiles`, and let `onPaste` intercept text before default token conversion. (#6419)
- Export `ChatComposerTokenElementProps` and forward supported span props and refs from `ChatComposerTokenElement` (#6443).
- Keep the chat dictation control disabled when speech recognition is unavailable, and preserve theme control over its clipping feedback (#6444).
- Clip the resizable SideNav handle within the sidebar bounds (#6196)
- scope the 16px text-control font-size floor to iOS with `@supports (-webkit-touch-callout: none)` inside the coarse-pointer query, so Android and touch-screen laptops keep the theme's type scale instead of an inflated 16px (#6085; fixes #6015)
- Kbd: render the `esc` and `return` aliases with the same glyphs and accessible names as `escape` and `enter` (#5657)
  This partial fix for #5403 normalizes the two unambiguous aliases already accepted by `useHotkeys`. Kbd now renders `esc` as `Esc` with the accessible name `Escape`, and `return` as `↵` with the accessible name `Enter`. Its lookup tables now also avoid prototype-chain collisions when rendering arbitrary key names. The platform-specific rendering contract for `meta` and display choice for `space` remain unresolved in #5403 pending separate API and design decisions.
- LayoutFooter: add playground wrapper and default children for docsite preview (#6341)
  Prevents the properties-tab preview on the docsite from rendering an empty stage by wrapping LayoutFooter inside a Layout scaffold with representative footer content in the footer slot.
- PowerSearch: switching the field or operator while the value menu is open now shows the new field's options instead of the old ones. (#6357)
- Move focusable ProgressBar target marks outside the `progressbar` subtree (#6248)
- Selector: collapse an option's mark column when its resolved selection indicator renders nothing. (#5619)
  Unselected rows using the default check indicator no longer lose label width to an empty wrapper. Selected marks and themed indicators that render an unselected state keep their space at the configured logical edge.
- Slider marks inside the filled region use the fill color: marks at or behind the thumb in single mode, and marks between the thumbs in range mode, now paint with the accent fill color instead of the default mark color. Marks on the unfilled side are unchanged. (#6455)
- Slider uses the track token for unfilled tick marks so marks and rails stay aligned across themes (#6461)
- Spinner: animate the arc's dash offset instead of rotating the ring, fixing residual wobble on iOS Safari (#6311; fixes #6253)
  The earlier fix for #3617 added `willChange: 'transform'` to the rotating `<svg>`, which smooths the rotation's motion but does nothing about how WebKit rasterizes a rotating stroked shape's rounded cap on each frame. Rotating the whole ring still visibly wobbled on iOS Safari.

  Animates `stroke-dashoffset` on the stationary arc `<circle>` instead of rotating the `<svg>`, so the shape never rotates and WebKit never re-rasterizes the cap at an intermediate angle. Confirmed against a real iOS Safari device by the issue reporter.

- Table: contain overscroll only while its inner viewport can scroll, so a fitting table no longer creates a dead scroll zone in its parent. (#6410)
- Apply the theme's body font to the theme scope root. Generated theme CSS set `font-family` on headings, paragraphs, and code elements but never established a base font on the page, so components styled with `font-family: inherit` (SideNav items, Buttons) fell back to the browser default serif. The generator now emits `font-family: var(--font-family-body)` on `:scope`, which inherits through the tree. (#6450)
- Keep ToggleButton callbacks synchronous and run pressed Actions through Button’s clickAction pathway, preserving callback cancellation and optimistic pending feedback. Omit the Action pathway for callback-only toggles and value-identified ToggleButtonGroup members, whose selection remains group-owned. (#6463)
- Keep a ToggleButton's own `isDisabled` when its ToggleButtonGroup does not disable anything. The group always supplies an `isDisabled` boolean, so the previous `??` fallback never ran and an enabled group re-enabled a member that had disabled itself — the member selected on click, and a member carrying a `tooltip` stayed operable while looking unavailable. A disabled group still disables every member; it just cannot re-enable one. (#6356)

#### Contributors

Thanks to everyone who contributed to this release:

- @aldentan
- @athz
- @cixzhang
- @ernestt
- @harjothkhara
- @HelloOjasMutreja
- @jiunshinn
- @kentonquatman
- @korkt-kim
- @ManoharPaturi
- @nynexman4464
- @rupesh-kumar-sah
- @vjeux

---

# 0.6.2

#### New Features

- Markdown: add an opt-in math renderer (#6312)
  Supply `components.math` to parse `$…$` inline math and `$$…$$` display math. The renderer receives the delimiter-free expression as `value` and its placement as `display: 'inline' | 'block'`, so applications can connect their preferred math typesetter without preprocessing Markdown or accepting raw HTML.

  Math is off unless the renderer is present. Direct parser callers can opt in with `MathParseOptions` (`{math: true}`) and incremental callers create `IncrementalParseState<true>` via `createIncrementalState<true>()`. Those overloads return `InlineNodeWithMath` or `BlockNodeWithMath`; default, legacy-set, `math: false`, and `ParseOptions`- annotated calls retain the existing `InlineNode` and `BlockNode` unions, so exhaustive consumers do not gain a case unless they opt in. Existing Markdown parsing and rendering stay unchanged by default; code stays opaque, escaped and unmatched delimiters stay literal, and inline plugins skip math. Incremental parsing preserves full-parse results when display math is nested in ordinary or task lists and blockquotes, including quote-depth transitions, with LF or CRLF and with source ranges enabled.

- DialogHeader exposes theme targets for its header gap, title/subtitle gap, and close-icon size. (#6240)
- Expose DateRangeInput preset theming targets (#6223)
- Expose the Slider interactive control as a theme target (#6225)
- Expose FileInput's upload icon as a mode-aware theme target (#5417)
- Add a `--spinner-arc-fraction` public var to Spinner, so a theme can change how much of the ring the moving arc covers (defaults to 0.375, a 135deg sweep), the same way it already retheme diameter, stroke width, and color. (#5845)

#### Fixes

- Adds the `@astryx.chatTypingIndicator.*` catalog keys so the lab ChatTypingIndicator can build its typing status from the translation runtime instead of English literals, joining names with `Intl.ListFormat` for the active locale. English output is unchanged. (#6220)
- Spinner: the default assistive label now comes from the translation catalog (`@astryx.spinner.loading`) instead of a literal `"Loading"` in component source, so a localized app translates the status. An explicit `aria-label` and a visible string label still take precedence, in that order. (#6217)

#### Contributors

Thanks to everyone who contributed to this release:

- @athz
- @cixzhang
- @freddymeta
- @HelloOjasMutreja
- @ksying
- @Kyujenius

---

# 0.6.1

#### New Features

- Remove the prefix requirement from theme-local tokens (#6285)
- Add ScrollableArea and useScrollableArea for accessible, logical-axis native scrolling with explicit overscroll policy. (#6262)
  Scrollable viewports now become keyboard reachable only while content effectively overflows, preserve logical edge state across writing modes, apply contained overscroll only on active axes, avoid capturing Sticky while fitting unless explicitly requested, expose standard container sizing props, and integrate optional content padding plus opt-in full bleed with the shared container geometry system.

#### Fixes

- BaseTypeahead: preserve input props and keep results accessible in narrow layouts (#6179)
  BaseTypeahead now forwards its inherited DOM and styling props to the combobox input, preserves native input attributes unless a defined legacy alias overrides them, keeps empty result lists valid for assistive technology, counts visible characters for `minQueryLength`, and keeps both the popup and long result content within viewport gutters.
- BottomSheetSwitcher: let the topmost nested layer handle Escape before a non-modal flow. (#6184)
- BreadcrumbItem preserves valid outside focus on menu light dismiss and labels menus from rich trigger content (#6206)
- Center: preserve component-owned axis reflection and correct the horizontal-centering example. (#6207)
- Localize Chart accessibility text and complete its consumer guidance. (#6247)
- defer clear focus restoration for pointer/touch taps to prevent page scroll jumps while preserving synchronous focus restoration on keyboard activation and properly composing `onPointerDown` in `InputClearButton` (#5440)
- Prefer canonical component target names in maintained themes and new examples while preserving deprecated runtime aliases and released bare prop/state selector classes through the 0.7.0 removal window. Theme discovery labels deprecated targets, theme build warns with each exact canonical replacement, and `astryx upgrade --apply` provides the forward-compatible bare-selector migration. (#6126)
- Field inputs no longer paint above the sticky AppShell header while scrolling (#5689). Field now contains its local stacking layers (the input surface's z-index and the attached status layer) behind an `isolation: isolate` boundary on the field surface, so they cannot compete with page-level stacking; the AppShell header keeps its normal stacking level.
- TextInput's `onEnter` no longer fires for the Enter that commits an IME conversion (Japanese/Chinese/Korean input); `onKeyDown` still receives the raw event. (#6082)

#### Documentation

- AspectRatio: show the `ratio` prop in its JSX form (#6093)
  The best-practice line told readers to express the ratio as a fraction like `16/9` without showing it in JSX, and nothing else in the CLI output gives `ratio` an example. Rewrites it to `ratio={16 / 9}` and names the string form as a type error.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @Cypher-Aura-19
- @Geervan
- @Kyujenius
- @ManoharPaturi

---

# 0.6.0

#### Breaking Changes

- Remove deprecated focus-direction overrides, the hooks-path `isImeKeyEvent` re-export, and Resizable pixel-bound aliases.
  **Codemod:** Run `npx astryx upgrade --apply` before updating to 0.6.0. It removes focus-hook `isRtl`, moves `isImeKeyEvent` imports to `@astryxdesign/core/utils`, and renames `minSizePx`/`maxSizePx` to `minSize`/`maxSize`.
- Stop emitting deprecated bare prop and state classes such as `.primary`, `.sm`, and `.checked`. Components retain their stable `astryx-*` target classes and reflect visual props and runtime states through explicit `data-*` attributes; generated runtime and built theme CSS now uses that same selector contract.
  Run `astryx upgrade --apply` to migrate safely identifiable selectors in `.css` files when a known Astryx target and v0.5.4 value have one or more known meanings. For example:

  - `.astryx-button.primary` → `.astryx-button:is(.primary, [data-variant="primary"])`
  - `.astryx-button.sm` → `.astryx-button:is(.sm, [data-size="sm"])`
  - `.astryx-switch.checked` → `.astryx-switch:is(.checked, [data-checked="checked"])`

  The codemod parses CSS selector syntax and never rewrites declarations, comments, JavaScript/TypeScript strings, unqualified classes, or custom/unknown qualified classes. Each known value becomes a specificity-preserving `:is(...)` union containing the original class arm plus every v0.5.4 reflected data-attribute arm. The class arm keeps consumer-supplied `className` matches working; the attribute arms match v0.6 props and states. You can narrow the union later when class provenance or prop-axis intent is known. Search for unqualified old value selectors such as `.primary` or `.sm` and migrate those manually only where Astryx usage is confirmed. Migrate selectors embedded in JavaScript or TypeScript manually with the same rules.

  Semantic `defineTheme({components})` keys such as `variant:primary` and `checked` do not change. If you prebuild a custom theme, rerun `astryx theme build <theme-file>` after upgrading and deploy the regenerated `.css`, `.js`, `.d.ts`, and optional `.variants.d.ts` artifacts together. A built theme is marked `__built: true`, so the runtime intentionally does not regenerate stale CSS.

  Exported theme helpers keep their return/container shapes but intentionally return different selector bytes:

  - `themeProps` returns the stable target class (plus target-name compatibility aliases), without bare prop/state classes; its reflected `data-*` attributes are unchanged.
  - `parseStyleKey` returns data-attribute selector suffixes instead of `.value`, `.prop-N`, or `.state` suffixes.
  - `generateThemeRules` keeps its array contract and ordering; non-base component selectors use reflected attributes.
  - `generateThemeRulesSplit` keeps `{component, prose}`; `component` selector bytes change and `prose` is unchanged.
  - `generateOnMediaCSS` keeps its scoped string contract; component selector bytes change.
  - `generateThemeCSS` keeps `{prose, component}` and the same layers/scopes; `component` inherits the new selectors and `prose` is unchanged.

- Restrict `Stepper`'s `horizontalOptions.minimumStepWidth` to a pixel number and remove compact-layout implementation fields from `useStepperContext`.
  Replace CSS-length thresholds such as `'7rem'` with their intended pixel number. Call `registerStep(index, {getIsDisabled})` instead of passing a disabled boolean; the options object is optional. `StepperContextValue` keeps transition history and step registration, while step count, compact state, summary-portal coordination, and threshold measurement remain package-internal.
- Add ordered environmental adaptations to `defineTheme`
  Themes can now opt into CSS-first token, theme-local token, and component changes for named viewport widths, primary-pointer precision, contrast preference, and motion preference:

  ```ts
  defineTheme({
    name: 'acme',
    adaptations: {
      widthBreakpoints: {sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536},
      rules: [
        {
          when: {width: {from: 'lg', below: 'xl'}, pointer: 'coarse'},
          value: {tokens: {'--size-element-md': '44px'}},
        },
      ],
    },
  });
  ```

  Condition fields are ANDed. `width.from` is inclusive, `width.below` is exclusive, and rules cascade in declaration order so later matching writes win. Theme extension preserves the effective breakpoint map and inherited rule order; static builds retain the metadata needed for source-equivalent extension.

  `AppShell` now accepts `xl` and `2xl` for `mobileNav.breakpoint` and resolves all five names through the nearest Theme. Mobile mode now uses the documented exclusive boundary (`width < breakpoint`), so an AppShell exactly at the named point renders the wider layout instead of the mobile layout.

  `defineTheme` now validates the token values authored inside an adaptation rule, rejecting non-string scalars and arrays with a length other than two instead of emitting them. Root and on-media token input keeps its existing acceptance unchanged, so themes that pass values through casts or spreads keep building. It also validates the combined portable and theme-local token graph for every reachable set of matching adaptation rules, rejecting cycles before CSS is emitted. Component writes in a rule use the same target, axis, value-domain, and extension validation as root `components`; a rule may not be the only place a custom value is enrolled, because generated type augmentation is unconditional.

  `astryx theme build` treats the adaptation generator as a core capability rather than a baseline requirement, so a theme with no adaptation intent still builds against an older installed `@astryxdesign/core` and emits the same CSS as before. A theme that does carry adaptation intent — valid rules, a custom `widthBreakpoints` map, or present-but-malformed adaptation metadata — fails against such a core before any output is written, with `ERR_CORE_INCOMPATIBLE` naming the missing `generateAdaptationCSS` export. A complete default width map with no rules asks for nothing and still builds. Where an older core's `defineTheme` drops adaptations while resolving, the build records each raw `defineTheme()` input and associates it with the theme it produced, so only the selected theme's lineage decides. An unobservable selected ancestor (including a CommonJS source package whose ESM core namespace cannot be wrapped) fails closed; an unused adaptive theme elsewhere in the import graph does not affect a plain build. The same capture preserves raw typography, color, radius, and motion axis metadata in old-core-built artifacts, allowing later current-core children to resolve partial adaptation axes exactly as if they extended the source theme.

#### New Features

- Banner exposes a `banner-frame` theme target on the visible frame that owns whole-banner elevation and the elevated-card silhouette. The target reflects `container` and `elevation`; existing Banner targets and default rendering are unchanged.
- `Collapsible` and `CollapsibleGroup` accept `chevronPosition="start" | "end"`. The default remains `end`, preserving the released trailing chevron. `start` moves the disclosure arrow ahead of the label for tree/file-browser-style rows: it points inward toward content when collapsed, mirrors under RTL, and turns downward when expanded.
  Set the position on `CollapsibleGroup` when direct items should share it. An individual `Collapsible` may override the group, while a Collapsible nested inside an item's content starts a new presentation scope and keeps its own default.
- Add a named font-weight override to Heading with precedence over its
  visual type and semantic-level defaults.
- Add an `autoComplete` prop to TextInput and TextArea, forwarded to the native control unchanged.

#### Fixes

- ChatComposerInput: drop `aria-multiline` once triggers make the editable a combobox
  `aria-multiline` was hardcoded on the contenteditable element while `useTriggerMenu` owns its role, so configuring `triggers` switched the role to `combobox` — which ARIA 1.2 does not list `aria-multiline` under — and axe flagged `aria-allowed-attr` (critical) on the 8 ChatComposerInput trigger stories and the 2 ChatLayout stories that render one. Moves the attribute into the hook's `ariaProps`, where the role and the attributes whose validity depends on it are decided together.
- CheckboxListItem: the visible `description` is now the checkbox's accessible description, so the browser computes a distinct description instead of none. Item ids the description element it already renders and publishes that id to the content it renders in a slot, which keeps a plain string description's automatic single-line truncation. CheckboxInput now merges a consumer-supplied `aria-describedby` with its own description, status, and disabled-reason ids rather than replacing it. No public API changes.
- CheckboxListItem: a ReactNode `label` now names the checkbox from its visible text through `aria-labelledby`, the way RadioListItem already does, instead of falling back to the generic name "Checkbox". `aria-label` still replaces that name; a rich label with no text at all needs it, as it does for RadioListItem. The dev-time warning that asked for `aria-label` on every rich label is gone.
- Prevented removed Resizable bounds from being silently ignored and kept ambiguous spread migrations behavior-preserving (#6124)
- Keep hover from auto-scrolling open option lists (#6077)
  In a scrollable listbox whose highlight follows the pointer, scrolling the highlighted option into view moved the next option under the stationary pointer, whose mouseenter re-highlighted and scrolled again — an endless loop with no user input. This was already fixed for DropdownMenu and Chat; it now covers the remaining combobox-style paths through a shared highlight owner: Selector, MultiSelector, Typeahead, DateTimeInput, and CommandPalette hover highlights move only the highlight, while keyboard navigation still scrolls the highlighted option into view.
- Slider keeps its focus ring hidden for modifier-only key presses after a pointer drag while preserving keyboard navigation (#5469)
- Layout: keep content scrollbars at the content area's outer edge when `contentWidth` is set.
  Without panels, `LayoutContent` spans the available Layout width and aligns its children to `contentWidth` internally. With exactly one panel, the panel stays aligned to the `contentWidth` frame while content extends across the opposite open area. A two-panel layout keeps the complete composition constrained.
- Popover: apply same-gesture reopen protection through every opening path, focus genuine caller content regardless of activation modality, and keep the generated fallback close control hidden until keyboard users reach it.
- SideNavItem: a consumer-provided `aria-label` no longer gets overwritten by the collapsed-rail fallback, in both the icon-only and popover-trigger paths.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @ernestt
- @faga295
- @freddymeta
- @HelloOjasMutreja
- @imdreamrunner
- @jiunshinn
- @kentonquatman
- @Kyujenius
- @rubyycheung

---

# 0.5.4

#### Fixes

- DropdownMenu: keep focus where it is when a controlled menu mounts already open (#5976)
  Mounting with `isMenuOpen` true no longer moves focus into the first item; only an open that happens after mount does, per the input-modality rules. A page that renders a menu open on load no longer drops keyboard users into it, and ArrowDown on the focused trigger walks into an already-open menu instead of requiring a close and reopen.
- DropdownMenuRadioGroup: render a working menu in the docsite properties preview (#5976)
  Adds a `DropdownMenu` playground wrapper that opens on first load and two `DropdownMenuRadioItem` children, so the properties-tab preview shows selectable radio choices immediately instead of an empty container.

#### Contributors

Thanks to everyone who contributed to this release:

- @Kyujenius

---

# 0.5.3

#### New Components

- Add built-in `popover`, `bottom-sheet`, and compact-touch `adaptive` presentation policies to DropdownMenu, MoreMenu, and ContextMenu. (#5395)
- Add popover, bottom-sheet, and adaptive presentation options to Selector and MultiSelector, with docsite examples for both bottom-sheet variants. (#5395)
- Add `isReadOnly` to Selector and MultiSelector so selected values remain focusable and form-submittable without exposing selection menus or editing affordances. (#5805)
- Add the opt-in theme-local token contract for maintained theme families. (#5844)
- Add `elevation` prop to ToggleButton for floating (FAB-style) toggles, mirroring Button; retained inside a ToggleButtonGroup. (#6012)

#### New Features

- Add structured accessibility requirements and theme coverage support to component documentation. (#5713)
- Banner: the header's supporting line now carries a stable theme target, `astryx-banner-description`. (#5483) Only the header, the status icon and the content panel were themeable before, so a theme restyling the description — its colour, its type, or the space between it and the title — had to reach in with a structural selector like `.astryx-banner > div:nth-child(2) > div:nth-child(2)`. Purely additive: no existing class, data attribute, or style changes.
  Nothing else in the header becomes a target. The end area is a layout row — flex, wrap, and the edge compensation that lets its buttons overhang the header padding — not a painted surface, and a theme that wants the header to grow around its buttons instead of letting them overhang sets `padding-block` on the existing `banner` target, which reaches the same height without exposing a private margin. The title, the two controls and the text column are likewise left alone: the column paints nothing (`display: flex; flex-direction: column; gap: 0`) and the space it owns is expressible on `banner-description`, while the title and the controls already render the way the consuming theme wants them.
- Add `nativePicker` to DateTimeInput for browser and OS date/time pickers, with Astryx time fallbacks for seconds, custom increments, and preset options. Native fields follow DateInput's compact minimum sizing in fit-content layouts. (#5620)
- Let themes add typed Heading visual roles with a safe semantic-level
  fallback when the owning theme styles are unavailable. (#6026)
- RadioListItem and CheckboxListItem accept rich `label` and `description` (#5257)
  `RadioListItem` typed `label` and `description` as `string` while its sibling `CheckboxListItem` already typed `label` as `ReactNode` — so the same slot had two contracts, and an app whose option descriptions carry links could not type them on either component. Both now take `ReactNode`; the runtime already rendered it.

  `RadioListItem` gains the `aria-label` escape hatch `CheckboxListItem` established, with the same meaning: a plain-text accessible name for the control. The radio differs in one way worth knowing — it points at its visible label for its accessible name, so a rich label still names it from its own text, and `aria-label` is there to narrow a name that reads badly rather than to supply a missing one. `aria-label` now lands on the radio instead of the row `<div>`, where ARIA ignored it.

- Stepper: `--step-connector-gap`, so a theme can stop the on-track connector short of the indicator
  The on-track layouts draw the connector as one segment either side of the node. A theme that wants the track to leave a hole around the indicator had to reach the two segments separately, and they are only distinguishable by sibling position — which changes with `indicator="none"`.

  One public var does it instead, declared on the Stepper root because component vars are root-owned: a theme writes `stepper: {base: {'--step-connector-gap': '4px'}}` and every connector inherits it. Astryx spends it on whichever side each segment faces the node from, so the pair leaves a symmetric hole and the caller never names the pieces. `0px` by default: the shipped track still reads as one unbroken line.

  Measured in Chromium against a built theme override, reading painted pixels down a 12px segment:

  | value | clipped away | stepper height | | ------- | ------------- | -------------- | | `6px` | 6px | unchanged | | `-4px` | 0 | unchanged | | `1rem` | capped to 8px | unchanged | | `999px` | capped to 8px | unchanged | | `10%` | 1px (of 12px) | unchanged | | `50%` | capped to 6px | unchanged |

  Four things that had to be true and are:

  **A theme override reaches it.** The default is declared once on the root, not on each connector. Declared per-connector, every connector re-declared `0px` on itself, and a value declared on an element beats an inherited one — so a generated `stepper` override compiled cleanly and changed nothing.

  **The value is bounded**, and both halves earn it — neither for padding's reasons. `max(0px, …)` because `inset()` _accepts_ a negative length: Chromium computes `inset(0 0 -4px 0)` as written rather than clamping it the way it clamps negative padding, so the floor has to be declared. `min(…, --spacing-2)` — the flexible segment's own `min-height` — so an oversized gap leaves a short track rather than an unbounded one. Neither can grow the Stepper; a clip cannot change layout. (An earlier padding-based revision grew a three-step Stepper 108px → 144px at `1rem`.)

  **The horizontal clip mirrors under `dir="rtl"`.** `clip-path: inset()` is physical — top/right/bottom/left, no logical form — while the row itself reverses. Left unflipped, the leading segment sits to the _right_ of the node in RTL and still clipped its right edge, so the hole opened at the join between steps instead of at the indicator. Measured before the fix: `con0 x=622, indicator x=606, clips RIGHT edge`. After: `clips LEFT edge`, with LTR unchanged. The block axis needs no handling — `dir` does not reverse it.

  **One declaration covers both layers.** The gap has to reach the track (the segment's own background) and the accent fill (an absolutely placed `::before`). Spending it on each separately meant two declarations on two boxes, so a percentage resolved against a different containing block for each and stopped them ~1.2px apart. A single `clip-path: inset(…)` on the segment clips the element and its pseudo-element together against one reference box, so every accepted value behaves identically on both — which is what [#5824](https://github.com/meta/astryx/pull/5824) requires of a public input across its full value domain. Clipping also cannot change layout, so the node the segment positions cannot move.

  **No indicator, no gap.** `indicator="none"` renders no node, so a gap there is a hole in a track that is meant to be continuous.

  Any CSS length or percentage is accepted and behaves the same way on both layers. A percentage resolves against each segment's own box, so a fixed and a flexible segment clip by slightly different amounts from one declared value — cosmetic, bounded by the cap, and recorded as accepted rather than fixed.

  **Why a custom property and not a guaranteed CSS property.** A theme target reaches the element, never its `::before`. Measured against a built theme override on `step-connector`: `paddingBlock: 6px` produces no hole at all — the background paints to its border box and the fill is out of reach — its only effect being the Stepper growing 108px → 120px; `paddingBlockEnd: 6px` produces no hole either, and addresses only one of the two edges. Only the component can clip both layers together, mirror per axis and direction, and clamp first.

  Adds `Stepper.spec.md`, the canonical owning record for this public property, carrying that admission argument, the value contract, and the anatomy-to-target map. `Stepper.doc.mjs` gains the anatomy entries its existing `stepper`, `step`, and `step-connector` targets never had, so every current target is anchored to a described part.

  Supersedes the `segment` variant this PR previously proposed. That exposed `lead` / `rail` / `content` as public theming vocabulary, which does not hold up: the words never appeared in the generated docs, they emit bare `lead` / `content` classes where a consumer's own stylesheet can collide with them, and `lead` means different geometry per orientation. The pieces are how this layout happens to be drawn today, not a contract.

- Stepper's `horizontalOptions.collapsedVariant` lets a flow choose `withLabelAndControls`, `withLabel`, or `hiddenLabel` for its compact presentation. Use `withLabel` when the surrounding flow owns Back/Continue, or `hiddenLabel` when surrounding UI owns both the current-step heading and navigation and only a bare progress track is needed. The default preserves both label and controls, its controls require `onStepClick`, and every step keeps its name in the accessible sequence at any width. (#5659)
- Stepper's `horizontalOptions.minimumStepWidth` configures the per-step width at which a horizontal Stepper collapses. Numbers are interpreted as pixels and strings accept CSS lengths such as `7rem`, `calc(6rem + 8px)`, and custom properties. The browser resolves string units through an invisible measurement element, and changes to the resolved value update the compact layout. Omitting the option preserves the existing 112px threshold. (#5659)
- Stepper: add `astryx-step-label` and `astryx-step-description` theme targets. (#5728)
  Both text parts declare their own typography and color, so themes cannot reach them through the `step` target by inheritance. The new targets apply in both indicator positions and reflect `progress` and `status`.

  `step-label` also reflects `disabled`, because the label owns Stepper's disabled text paint. `step-description` does not. The new targets change no default style.

- Stepper collapses itself in narrow containers instead of leaving each consumer to hand-roll a fallback: a horizontal stepper measures its own width and, once a step has under `horizontalOptions.minimumStepWidth` (112px by default), drops the labels to a bare track and uses the configured `collapsedVariant` beneath it. The breakpoint follows the step count rather than the viewport. Both `separated` and `on-track` leave their compact track presentational; navigation moves to named prev/next controls when configured and when `onStepClick` is set. On-track indicators stay on the rail without repeating the active indicator beside the compact label. The full sequence stays intact for screen readers throughout. (#5659)
  [fix] Step labels hold to a single line and ellipsize rather than wrapping and breaking mid-word, so a row of horizontal steps keeps one height and the track under it stays straight. The full label is still carried in the step's accessible name.

  [fix] The gap between connector segments is now `--spacing-1`, matching the connector's own thickness, so the track reads as one dashed line at any theme scale.

- Add semantic Table row statuses while restoring custom-marker compatibility. Named custom icons keep their released Icon color mapping; raw CSS custom icons now use the caller's paint as required by the current contract. Canary users relying on implicit glyphs should switch from `color` to `status`. (#5832)
- TabList: add an `isFullBleed` prop so a tab bar can bleed out to its container's inline content edges instead of requiring hand-written negative-margin CSS (#2622). Like Divider's `isFullBleed`, it cancels the nearest padded Layout container's `--container-padding-inline-*` custom properties with negative margins; the inner strip pads back by the amount the bleed exceeds a tab stop's own padding so edge labels remain aligned to the content inset. It is inline-only: TabList owns the inline full bleed, and the container owns the block-end dock. For that, LayoutHeader gains a `paddingBlockEnd` per-edge override in Section's existing spelling — `paddingBlockEnd={0}` docks the header's last child on its bottom edge so a tab strip's underline meets `hasDivider` at any header padding. The `detail-page` template now uses both props, aligns its ghost panel toggle with the container inset, and no longer carries any hand-written tab-row CSS.
- Add `nativePicker` to TimeInput so coarse pointers use the browser/OS time picker by default, with `always` and `never` overrides. Seconds and custom increments retain Astryx's typed field. (#5811)

#### Fixes

- Keep AppShell's section top bar solid in auto-height mode while content scrolls beneath it. (#5873)
- Extend attached field-status backgrounds behind the lower half of their
  controls so rounded and pill-shaped inputs connect without visible gaps while the control remains visually above and receives pointer input across the overlap. (#5769)
- BottomSheet now keeps the iOS Safari browser-bar edge consistent with the sheet surface for both modal and non-modal presentations. (#5373)
- Keep loading-button spinners at full contrast while interaction is
  blocked, and suppress pressed feedback for disabled and loading buttons. (#5627)
- Carousel: mirror the single-edge fade gradients under RTL so the mask fades the physical edge that actually hides content (overflowStart/overflowEnd are logical edges, the gradients were always physical left/right) (#5586)
- ChatComposerInput no longer discards a pending draft when you click the
  composer's padding and press ArrowUp. Focusing a contentEditable collapses the caret to the start of the draft, which is the one position where ArrowUp means "recall history", so the first ArrowUp after that click replaced what you had typed. The composer now places the caret after the draft when it focuses itself — clicking the space after the text means "put me there" — so ArrowUp moves the caret with a draft present and still recalls history when the composer is empty. Multi-line caret navigation is unchanged. (#6051)
- ChatComposer: add a keyboard-only focus ring around the composer body when its editor receives focus (#5648)
  The ring uses the shared theme focus tokens and does not appear for pointer focus or when an internal action button owns focus.
- Chat/useChatStreamScroll: an upward scroll releases auto-follow in both motion modes, and only the reader can release it. While following, the hook owns the container's position: it disables CSS scroll anchoring on the scroll element, so the only move the browser makes on its own is the resize clamp onto the bottom, and any other upward move is read as the reader. A wheel or drag a nested scroller consumes, or a block collapsing above the viewport, no longer touches the lock either way; unlocked, anchoring is restored. The wheel and touch listeners are gone. `jumpToBottom` also cancels the spring's pending frame, so animation loops cannot stack. (#5662, #5663)
- ChatToolCalls now announces pending, running, complete, and failed statuses to assistive technology, including expandable rows and collapsed tool-call groups. (#5666)
- ChatComposerInput: ArrowUp/Down only recall message history at the text boundaries, so the caret can move between lines of a multi-line draft (#4284)
- CheckIndicator: start the docsite properties preview in the checked state (#5972)
  Seeds a `checked` playground default so the properties-tab preview shows a visible indicator on first load instead of an empty stage.
- `Collapsible`'s trigger label now fills the row instead of hugging its own content, so a composed trigger can put something at the far edge next to the chevron. The trigger is a `space-between` flex row, but its label span had no `flex-grow` — so the free space collected between the label and the chevron, and a trigger built as `<HStack>` with a right-hand element (a date, a count, a status) had that element parked against the label with a gap after it, unable to reach the edge that `space-between` implies. `flexGrow: 1` on the label is the whole change. For a plain text trigger nothing moves: the label was already flush to the start edge and the chevron to the end, and the box that grew is one the text does not fill. The flex floor is deliberately left at `auto`, so no label can now be squeezed narrower than its own content and start overlapping the chevron. (#5933)
- DropdownMenuRadioItem: add playground wrapper and wire wrapper selection state for docsite preview (#5917)
  Wraps DropdownMenuRadioItem in DropdownMenuRadioGroup wrapper and keeps the wrapper's selection independent from the item's value knob, so aria-checked stays false until the item is activated and updates on click.
- Keep DropdownMenu and submenu flyouts inside the viewport with safe inline gutters and viewport-aware height limits. Only overflowing menus become internal scroll containers, while `menuWidth` keeps its existing minimum-width behavior up to the available space. (#5395)
  [feat] Add an opt-in `presentation` prop for data-driven DropdownMenu instances so products can render the same actions as an anchored popover or a modal bottom sheet according to their own responsive input policy.
- FieldLabel: a field's description now sits flush under its label without breaking existing label layout overrides. (#5673)
  A label and its description are one block of text, but nothing in `FieldLabel` said so. It returned a fragment, leaving the `<label>` and the description `<span>` as bare siblings of whatever column happened to hold them — so the space between them was set by that parent's `gap`, the same declaration that separates the label group from the control below it. No caller could close the pair without also pulling the control up against the description, and each had picked its own value.

  Measured in Chromium as `description.top - label.bottom`:

  | | label → description | description → control | | ------------------------- | ------------------- | ----------------------------------- | | `Field`, `TextInput` | 4px → **0px** | 4px → 4px | | `CheckboxInput`, `Switch` | 2px → **0px** | n/a — control sits beside the label |

  The label and description now share a wrapper of their own, so the space between them is theirs to set rather than a side effect of the caller's column. Only the pair closes up: the description → control gap is unchanged, so fields keep their existing rhythm. `CheckboxInput` and `Switch` each carried a 2px label wrapper to do this job locally, which the shared wrapper makes redundant, so all three callers now agree instead of each choosing a value.

  A hidden label group takes `display: contents`, so the wrapper box leaves the caller's layout entirely and the sr-only label and description stay out of flow exactly as they were — a hidden label still costs no space and draws no gap.

  This is one change in `FieldLabel` rather than a change across the ~20 input components, because every input reaches its label through `Field`.

- useFocusTrap only restores focus when focus actually entered the trap while it was active. (#5651)
  `useFocusTrap` captured `document.activeElement` on activation and restored focus to it on deactivation whenever focus would otherwise be lost to `<body>`. For popups that deliberately keep DOM focus on their trigger — a Typeahead or PowerSearch listbox opened with `role: "none"` and `hasAutoFocus: false` — the trap never receives focus, so the restore fired on outside-click dismissal and re-focused the anchor input. Because the input was then already focused, clicking it again fired no `focus` event and `hasEntriesOnFocus` could not reopen the menu — the control was stuck until a second outside click.

  The restore effect now tracks whether focus entered the trap container at any point while it was active (via a `focusin` listener). If focus never entered, the restore is skipped entirely. Popups that do take focus — Dialog, DropdownMenu, a Typeahead option click — are unaffected.

- Core: track keyboard and pointer modality once per document instead of initializing global listeners from every consuming component. (#5881)
- LayoutHeader: add playground wrapper and default children for docsite preview (#5918)
  Prevents the properties-tab preview on the docsite from rendering an empty stage by wrapping LayoutHeader inside a Layout scaffold with representative header text.
- LayoutPanel: add playground wrapper and default children for docsite preview (#5919)
  Prevents the properties-tab preview on the docsite from rendering an empty stage by wrapping LayoutPanel inside a Layout scaffold with representative panel content in start slot.
- Streamed Markdown no longer goes blank when the line still arriving
  contains an escaped pipe. A `\|` is literal text, not a table-cell delimiter, so a line carrying only escaped pipes is ordinary prose and renders as it streams instead of being held back as an unfinished table header. Genuine partial table syntax is still suppressed, and incremental parsing stays bounded to the stream tail. (#6051)
- Popover layers now cap explicit widths and match-trigger sizing to the available viewport with alignment-aware token safe-area gutters, preserving trigger alignment while keeping the painted surface at least one spacing token from both viewport edges. Long content scrolls inside the layer instead of forcing page overflow on narrow viewports. Repeated resize and content-change signals coalesce overflow measurement to once per animation frame. Pointer-activated dialog popovers focus the labeled dialog container so the first action does not appear preselected, while keyboard activation still focuses the first content control. Read-only content uses the same container target without revealing the fallback close button, while preserving Tab access to that fallback escape control. (#5373)
- Reuse `DateRangeInput` for PowerSearch date-range values so endpoint selection always emits an ordered range. (#6004)
- useResizable: percentage configuration with an explicit basis (AST-010)
  Implements the accepted [AST-010](../docs/specs/AST-010/spec.md) contract. Percentages **configure** a pixel size; they never create a second, responsive sizing mode.
- ResizeHandle: a drag survives the cursor crossing an embedded frame. (#5297) The handle listened for `pointermove`/`pointerup` on `window` without taking pointer capture, so the browser hit-tested every later event — and the moment the cursor entered an `<iframe>` inside the resizable region the events went to the guest document instead. Measured in Chromium, the host received 0 of 25 pointermoves once the cursor was over the frame, the panel stopped tracking, and the `pointerup` was never heard: the handle stayed armed with `data-resizing` set and the body cursor/`user-select` overrides stuck. The drag now takes pointer capture on the grab zone on `pointerdown`, so the whole gesture is delivered there whatever is underneath, and the move/up/cancel handlers sit on that element rather than on `window` (the same shape as Slider and BottomSheet).
- Breadcrumbs mirrors its built-in slash separator in right-to-left layouts (#5365)
  Fixes #5364.
- sharedResizeObserver: independent subscriptions per element (#5817)
  The module held **one callback per element** — `callbacks.set(element, callback)` overwrote. A second hook observing the same node silently replaced the first, and either one calling `unobserveResize(element)` blinded the other.

  Two hooks on one element is ordinary rather than exotic: a `TabList` root, a `useOverflow` container and a `useTruncation` target are all nodes another hook may reasonably watch.

  `observeResize` now returns an unsubscribe that removes only its own registration, and every caller in the package uses it. `unobserveResize(element, callback)` does the same by hand; the callback-less `unobserveResize(element)` still drops every callback on the element and stays for a caller that owns its element outright.

  Dispatch snapshots the callback keys, so a callback may unsubscribe while the batch is running without skipping its neighbour.

  Prerequisite for AST-010 §Implementation-requirements 9, kept separate so it is reviewable on its own. No component behaviour changes: 8534 core tests pass, and the five observer regressions fail against the old module.

- Spinner: a narrow flex host no longer compresses the box and clips the ring (#5484)
  The spinner's box carried `overflow: hidden` from the canvas ring it no longer draws. It clipped nothing — the painted circle is inscribed in the box, so hiding or showing the overflow renders the same pixels at every size and shade — but a flex item whose overflow is not `visible` has an automatic minimum size of zero. That left the box with no floor: a flex host narrower than the spinner compressed it while the ring kept drawing at the size its own attributes ask for, and the clip then cut the ring off at the box edge, silently, because a sliced ring still spins.

  Ordinary layouts reached it. A `md` spinner beside a label in a 140px row rendered a 16px box around a 20px ring; an `lg` spinner next to a `flex: 1 0 100px` sibling lost half of its ring. The clip is gone and the box is `flex-shrink: 0`, so the box and the ring stay one measurement and a spinner that does not fit overflows its host visibly instead. Nothing moves for a spinner whose host already fitted it.

- Spinner: the drawn frame follows a themed `--spinner-diameter`, so a
  themed ring is no longer clipped or off-centre. (#5214)

  `--spinner-diameter` and `--spinner-stroke-width` set the ring in CSS, and the box the ring sits in is composed from those same two vars — but the `<svg>` was sized and given its `viewBox` in JS, from the size's own constants. Theming the diameter therefore left the frame behind: the svg stayed at its default while the box shrank around it, and an overflowing grid item aligns to start rather than centre. Measured in Chromium across the four sizes, a themed ring rendered 1.5-3.3px off-centre with its far edge cropped.

  The svg is now sized in CSS from `--_spinner-box-size` — the same composed var the span is sized from — with no `viewBox`, so one user unit is one pixel and the frame moves with the box. (Not a percentage: the span is a grid whose area is not always definite in both axes, and an unresolved percentage height on an SVG falls back to the replaced-element default of 150px.) The px `width`/ `height` attributes remain as the no-stylesheet fallback, as `r` and `stroke-width` already were. Both circles centre on `cx`/`cy="50%"`, and the arc's twelve-o'clock offset is a CSS rotation about the shape's own box rather than an SVG transform about a centre in user units.

  No change to the default render at any size — same box, ring, stroke and sweep, verified against a build of `main`. What changes is that the documented claim "the rendered box … follows automatically" is now true.

- Table's sortable header button now follows its column's `align`, so an `align: 'end'` or `align: 'center'` column no longer gets a start-hugging header label sitting above right-aligned figures. Sorting wraps the header in a full-width flex button, which the `textAlign` that `align` sets on the cell cannot position; the alignment is now carried onto the button's main axis with a flow-relative `justify-content`, so it keeps mirroring under RTL. (#5928)
- Route table-row outcomes and completed or failed tool calls through the theme's semantic icon registry. (#5671)
- `themingTargets.test.ts` now discovers component sources at any depth under `src`, not only in a top-level directory. (#5784) Sources nested a level down — `Table/plugins/<name>/` — were silently exempt from the guard, which is the same drift #3741 was filed to prevent. Nothing was failing (no nested source rendered a `themeProps()` class before this release), so this closes the hole rather than fixing a live break: the guard goes from 294 to 302 assertions.
- Timestamp relative and compact-relative labels now follow the active provider locale, including locale-specific plural rules and word order. (#5859)
- Toast: the card's shadow is no longer clipped away. (#5547)
  Each toast's grid row used `overflow: hidden` throughout its lifetime. The clip is load-bearing while the row opens and closes — it makes the toast read as folding into the stack — but at rest it hugs the card's border box with zero slack on every side and cuts off every shadow the card casts. Astryx's own `--shadow-med` was declared and invisible: against a white page, every sampled pixel below a stock toast was pure white.

  The row now keeps its cross-engine `overflow: hidden` boundary during entry and exit, and releases it to `overflow: visible` only after the opening transition settles. Dismissal restores the clip synchronously. The wrapper keeps its ordinary pointer boundary, so a second click while the toast is still visible is absorbed by the toast rather than falling through to an obscured control underneath.

  This avoids `overflow-clip-margin`, which WebKit 26.5 does not support, while preserving the exact paint boundary the exit shipped with before this fix.

  Settled state is held on the mounted row rather than in a set of toast ids on the viewport, so it cannot outlive the row it describes. A row leaves the DOM by more paths than dismissal — `maxVisible` evicts the oldest when a newer toast arrives, and a `uniqueID` overwrite swaps a new entry into a replaced toast's place — and on neither path does anything on the dismissal path run. An evicted toast that resurfaces once the stack drains therefore mounts clipped and runs its own entry transition, instead of releasing the clip over a row that is still opening.

  One further lifecycle guard: only the row's own transition is read, since `grid-template-rows` is not private to the wrapper and `transitionend` bubbles from any descendant animating its own grid. Reading a descendant's event as the row's own releases the clip before the row has finished opening, and during exit it unmounts the toast mid-collapse.

  Below a settled stock toast on a white page, sampling straight down from the card's bottom border box: `255,255,255` at every offset before; after, the shadow paints `223` at +0px and fades `237 → 243 → 247 → 250 → 253 → 254`, reaching white again at +12px. During exit the row clips again, so anything outside the shrinking row is neither painted nor hit-testable — while the wrapper itself keeps the ordinary pointer boundary it has always had, and still absorbs a click aimed at a toast that is still on screen.

- Reset Toast swipe state when a second touch begins so native pinch and two-finger gestures remain available, and clear transient drag styles before a successful swipe dismissal. (#5676)
- `ToastViewport` resets the UA popover `width`, so an end-positioned toast lands on the end edge again. (#5822) The viewport reaches the top layer through `popover="manual"`, and the UA stylesheet gives every popover `width: fit-content`. Since the placement rework the viewport is positioned by spanning the inline axis and aligning within itself, and a shrink-wrapped box cannot span — both inset edges cannot be honoured, so the box resolves against the start edge and `align-items: flex-end` aligns the toast to the right of a box sitting on the left. Measured in Chromium at 1200px: a 438px viewport at x=0, with the default `bottomEnd` toast at x=19 instead of x=781. The reset block already neutralised `inset`, `margin`, `border` and `background`; `width` belongs with them.
- Tokenizer: render and interact in the docsite properties preview (#5982)
  Seeds playground defaults for the required `value` array so the properties-tab preview shows a labeled field with tokens on first load instead of the missing-required-props placeholder, and wires the preview's `onChange` bridge back to the controlled `value` so removing a token updates the field.
- TreeList: respect consumer `onKeyDown` `preventDefault` cancellation for APG tree keyboard navigation (#5606)
  `TreeList` previously processed built-in APG keyboard navigation on the inner `<ul role="tree">` before consumer `onKeyDown` ran on the root `<div>`, preventing consumer `event.preventDefault()` from suppressing built-in arrow navigation.

  Root `onKeyDown` now invokes consumer `onKeyDown` on the root container first and checks `event.defaultPrevented` before handling internal tree navigation for keydown events originating inside the `<ul role="tree">`. Calling `event.preventDefault()` in `onKeyDown` now successfully cancels built-in navigation and leaves focus and roving tabindex unchanged while preserving root handler target contracts.

- Typeahead: the field keeps its width when a value is selected, and the value stays out of the end controls (#5560)
  Two halves of one promise from the input-field family contract (`docs/families/input-fields.md`): **FR1**, a field's available width does not change because its value did; and **FR2**, a visible end affordance does not have field content painted under it.

  **FR1 — the input keeps its place.** Every other field in the family gets a stable width for free: the `<input>` stays in flow, and the field is as wide as the input's own intrinsic width. Typeahead took the input out of flow and zeroed its width while a token showed, so the field was left measuring the token. In any shrink-to-fit parent it snapped to the value's length. Block-level parents hid it, because they fill their container whatever their content is, which is why no story caught it. The input now keeps its place in the row and its own width — it is only made invisible and inert — and the token is painted over that space rather than beside it. In flow the token would add its own width instead, which is the same value-dependent sizing from the other direction: a long value would grow the field.

  **FR2 — the value is bounded by a content lane.** The input and the token share a content lane: an ordinary flex item, `flex: 1` with `min-width: 0`, that ends exactly where the end lane begins. That is TextInput's own arrangement — the lane takes the free space so the end controls sit in the corner, and yields all of it when the field is narrow, so a narrow field cannot overflow. The token is anchored at both of the lane's inline edges, so a long value ellipsizes at the lane's edge instead of reaching the controls. Positioned against the whole field instead, as the first revision of this change did, it had no idea where those controls start.

  Measured in Chromium. Widths are the field's border box, field in a `max-content` parent, `Field.width` otherwise unset:

  | | empty | short value | long value | | --------------------------------- | ----- | ----------- | ------------ | | TextInput (family baseline) | 199px | 227px | 227px | | Typeahead before | 199px | **54.7px** | **224.09px** | | Typeahead after | 199px | 223px | 223px | | Typeahead in `InputGroup`, before | 397px | **252.7px** | **422.09px** | | Typeahead in `InputGroup`, after | 397px | 421px | 421px |

  The 24px between the empty and valued columns is the clear button entering the row — ordinary for any field whose clear is conditional, it does not vary with the value, and TextInput's is 28px.

  Overlap is the value's trailing edge past the clear button's leading edge; escape is how far the value reaches past the field's border. The middle column is this change's own first revision, which fixed the width and made the overlap worse:

  | field, long value | overlap on main | first revision | now | | ----------------- | --------------- | -------------- | --------------- | | shrink-to-fit | 12px | 28.09px | none, 7px clear | | in `InputGroup` | 12px | 33px | none, 7px clear | | 220px | 12px | 31.09px | none, 7px clear | | 180px | 12px | 33px | none, 7px clear | | 140px | 12px | 33px | none, 7px clear | | escape, 140–220px | none | up to 4px | none |

  No new API and no constants. An earlier revision floored the field with a `--typeahead-min-width` public var defaulting to 200px, which review rightly rejected: it was a second sizing contract beside the documented `Field.width` prop, it was hand-derived (the empty field measures 199, so the floor overshot by 1), `InputGroup` cancelled it, and it could not help `Tokenizer`. Nothing here states a width; the lane's `min-width: 0` is the opposite of a floor.

  `Tokenizer` is **not** fixed here. It shares the family promise and breaks it — 199px empty to 114.7px with one token, in the same probe — but by a different mechanism: its tokens are in flow and wrap, and its input deliberately becomes a 40px continuation lane after them, so what a wrapping multi-value field's width should be is a design question rather than this bug. Its numbers are identical before and after this change.

- Typeahead, Tokenizer: the busy indicator is a Spinner in the field's end lane, and the input keeps its text out from under it (#5555)
  Three defects in one block. The indicator a search painted was `<Icon icon="clock">` — a static glyph, in a family where every other input paints busy with a `Spinner`, and where `clock` otherwise means _time_. It was an in-flow item at the row's inline end, which is where each field independently parks its clear button, so the two landed on each other: 17×20px of overlap in Typeahead and 19×20px in Tokenizer. The overlap is visual, not functional — the clear button is positioned, so it paints above the in-flow indicator and stays clickable across the whole covered band. And the combobox never carried `aria-busy`, unlike every sibling input.

  The base engine now reports the busy state to the field, which paints it in the one inline-end lane it already owns beside its clear button and end content, and sets `aria-busy` on the input. A caller using `BaseTypeahead` directly is unaffected: it still renders its own visible, named "Loading" status, now a Spinner rather than the clock.

  Typeahead puts both controls **in flow**, as ordinary flex siblings of the input, exactly as TextInput does with its own spinner and clear button — an in-flow box takes up room, so the input cannot run under it and there is nothing to measure. Getting there meant dropping `flex-wrap: wrap` from its wrapper, which the shared field base does not set and TextInput does not use: this field holds at most one token, so there is no second row to wrap to, and wrapping is what made an in-flow lane impossible, since flex moves an item to a new line rather than shrinking it. Measured in Chromium: with `flex-wrap` restored and a token too wide to share the row, the end controls drop to a second row and a 280px field grows from 32px to 46px tall. Unwrapped, a long value ellipsizes in the token instead.

  Tokenizer's own pre-existing case of the overlap closes with it: at 280px with a token and no search running, its clear button covered 20px of the input's content box, and covers none now.

  Tokenizer keeps a measured lane, because it cannot use the in-flow shape: its lane stays pinned to the field's first row while tokens wrap below it, so it has to be out of flow, and an out-of-flow box reserves nothing. Its width is measured with `offsetWidth` rather than `getBoundingClientRect()`. The rect is in viewport space — it carries every CSS transform above the element — while the padding it feeds is in local space, so mixing them broke under any transform: measured in Chromium, `scale(.5)` reserved half of what was needed and put the query back under the controls by 22.83px, and `scale(2)` left the caret in a 202.69px gap. `offsetWidth` is the untransformed border-box width and reports the same number at every scale.

  The measurement reaches CSS as a custom property written to the field wrapper, never as React state, so a lane that grows or shrinks repaints without re-rendering the field. Held in state it cost a second commit every time the lane changed size — once as the spinner arrived and once as it left — which doubled the field's commits across a search for a value no JavaScript reads. The observation is shared too, through the same `observeResize` singleton `useTruncation` uses, so a page of fields costs one callback per frame rather than one observer each. The property is `--_tokenizer-end-lane-width`: private and component-named, like every other runtime layout var in the package, and never something a theme writes.

  The busy indicator now appears in each field's documented anatomy, delegating its theming to `component:Spinner` rather than gaining a target of its own — the disposition `TextArea`, `CheckboxList` and `CommandPalette` already use for the same part.

#### Performance

- Keep Tooltip refs stable across rerenders (#5951)
- Markdown streaming bounds four incremental-parse operations by the mutable tail: splitting, fence/boundary detection, link-definition collection, and block re-parsing no longer grow with the already-settled document. The parser contract is unchanged: each call returns a fresh, never-mutated snapshot, and replacing already-settled text still re-parses the document. Two costs intentionally remain proportional to the whole input on each call because that contract requires them — the settled-prefix comparison that detects a replaced document, and the pointer-per-block copy behind each returned snapshot. (#5515)
- Typeahead: skip the loading cycle for synchronous bootstrap sources (#5955)
  `BaseTypeahead` now applies an array returned by `SearchSource.bootstrap()` immediately instead of entering and leaving the asynchronous loading state. An empty synchronous bootstrap becomes a render no-op, while synchronous entries still open normally. Switching from an in-flight search to a synchronous bootstrap also clears the superseded search's loading state. Promise-backed bootstrap sources keep the existing loading behavior.

#### Documentation

- Grid, Stack, HStack, VStack, GridSpan, and StackItem: seed example content via playground defaults (and, for the two sub-components, a real parent wrapper) so the docsite properties-tab preview renders a working component instead of an empty stage. (#5892, #5893, #5894, #5898, #5899, #5900)
- The namespaced-icon rationale and the add-a-semantic-icon intro in the icons guide, and the `SideNavItem` `actions` prop description, now use a comma and a colon in place of prose em dashes. Meaning unchanged. (#5647)
- The Popover presentation best practice and the Banner collapsible best practice now use a straight apostrophe instead of a curly one, so the strings match the rest of the doc copy. Meaning unchanged. (#5772)
- The Spinner CSS-variable and size descriptions, and the `useTableGroupedRows` description, now use colons and semicolons in place of prose em dashes. Meaning unchanged. (#5597)
- The Stepper progress bar anatomy description now sets its nested aside in parentheses instead of paired em dashes, so the sentence about multi-segment spans reads plainly in the CLI and doc site. Meaning unchanged. (#5691)

#### Other Changes

- Core's postinstall no longer hand-mirrors the setup contract. `packages/core/scripts/agent-doc-state.mjs` is now GENERATED byte-for-byte from the CLI's dependency-free leaf `packages/cli/foundation/agent-docs/agent-doc-state.mjs`, and `pnpm check:setup-contract` — wired into `check:repo` — fails the build when the two differ. (#4162)
  The previous guard compared two hand-edited constant lists. That caught a new agent-doc path or a new marker, and nothing else: the predicate itself, and the `shouldNudge` decision matrix duplicated in both postinstall scripts, could still drift and leave layer 1 and layer 2 disagreeing about "is this project set up?" with the test green. `shouldNudge` and the nudge string move into the contract as well, so all four things — paths, markers, predicate, decision — now have one definition and one place to edit.

  Behavior is unchanged, and verified rather than assumed: the nudge text is byte-identical, legacy `<!-- XDS:START -->` blocks still count as set up, all six agent-doc locations are still detected, and both scripts still exit 0 on every path including failure. Core loads its copy with a dynamic import, so a packaging mistake degrades to "no nudge" instead of throwing out of module evaluation and failing a consumer's install. `check:setup-contract` also fails if core stops listing the generated file in `files`, so it cannot go missing in the first place.

- **`minSize` / `maxSize`** join `defaultSize` in one vocabulary: a non-negative finite number, an exact `Npx`, an exact `N%` from 0–100, Table's existing `pixel(value)`, or `percent(value, {min: pixel(value)})` / `percent(value, {max: pixel(value)})` for a percentage with exactly one pixel floor or ceiling. `percent()` requires its options; `'40%'` remains the only unbounded percentage spelling. `minSizePx`/`maxSizePx` remain deprecated aliases, each an exact mutually-exclusive TypeScript union with its replacement; if untyped code supplies both, the unified prop wins and development names the ignored alias.
- **`containerRef`** (caller-owned) changes only what a percentage is a share of: that element's **content-box** size on the active axis, `direction` selecting inline or block. Omitted, percentages keep the released one-time `window.innerWidth` resolution with its 1200px server fallback.
- **A percentage default resolves once** into a pixel selection, applying its optional structured floor or ceiling exactly once. Percentage **bounds** re-resolve with their basis, apply that one pixel bound, and clamp the selection — they never rescale it. A basis change is not a user interaction: it fires no `onSizeChange` and persists only resolved pixels.
- **Everything else stays pixels**, exactly as released: pointer, keyboard, snaps, collapse/expand, persistence, callbacks, and `resize(number)`. `resize('50%')` remains a type error, and `resize(NaN)`, `resize(Infinity)` or a negative now warn and keep the last legal size instead of poisoning state.
- **Invalid configuration** repairs deterministically — 250px for a default, 50px for a minimum, unbounded for a maximum — identically in development and production, warning only in development. Explicit `maxSize: Infinity` and `maxSizePx: Infinity` keep the released unbounded behavior. The deprecated aliases retain their released exact atomic-string behavior for untyped callers. An inverted pair warns and the maximum wins, preserving the released clamp order.

  The structured API follows Table's existing shape rather than parsing CSS expressions: `Resizable/utils` is a server-safe subpath that re-exports the exact same `pixel()` binding and `PixelWidth` type as `Table/utils`, alongside Resizable's `percent()` and types. `pixel(value)` is the canonical structured static size; raw numbers and exact `Npx` remain compatible. `proportional()` remains Table-only because it describes sibling weight, not a literal percentage of one measured basis. CSS `min()` / `max()` strings are deliberately unsupported.

  The defect this closes: a percentage ceiling could previously only be written in CSS, and CSS stops the paint but not the state. `ResizeHandle` publishes the hook's size as `aria-valuenow`, so the separator announced a width the panel did not have — measured at **899.5 against a 434px panel**. Bounds now clamp the state, so paint, persistence and ARIA describe one geometry.

  `ResizeHandle` also warns in development when its `direction` disagrees with its region's, which previously failed silently. Existing vertical panels must pass `direction: 'vertical'` to `useResizable` as well as `direction="vertical"` to the handle.

  The container basis follows the ref, not the element it first pointed at: replacing the element behind the same `containerRef` re-resolves against the replacement, and the element left behind is unobserved. A container that is not laid out yet — unmounted, `display:none`, detached — measures 0, which is not a measurement: percentages hold the documented temporary 1200px basis until it is real, and nothing is written to `autoSaveId` storage from it. Once the first real basis resolves, the default is committed as a pixel selection with its initial clamp included; a 321px default clamped to 200px therefore stays 200px when the container later grows instead of reviving the raw default.

  A gesture that is cancelled rather than completed — `pointercancel`, a lost pointer capture, a handle unmounted mid-drag — releases the basis it froze through a new optional `_onResizeCancel` on `ResizableProps`. It is not a resize end (a cancelled drag deliberately signals none, per #5297), but it is the end of the gesture. `_onResizeCancel` and `_direction` are both optional: `ResizableProps` is exported, so an object literal that satisfied the released type still compiles.

  Not in scope, per the spec: SideNav's simplified `defaultWidth`/`minWidth`/`maxWidth` stays pixel-only.

  A pixel-only configuration keeps its single render pass even when a `containerRef` is supplied. With no percentage anywhere there is no basis to observe or ref identity to follow, so the pixel selection is made at mount; only a basis-dependent configuration with a supplied container defers until that measurement exists.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @ernestt
- @freddymeta
- @Geervan
- @HelloOjasMutreja
- @imdreamrunner
- @jiunshinn
- @josephfarina
- @Kyujenius
- @Lee-Dongwook
- @ManoharPaturi
- @mattandryc
- @nynexman4464
- @rubyycheung
- @trakshan-mishra
- @yyq1025

---

# 0.5.2

#### Fixes

- Rename the Data Input component category to Form Controls (#5686)

#### Performance

- Improve frequent translation lookups by pre-building locale maps (#4696)

#### Contributors

Thanks to everyone who contributed to this release:

- @ngolin
- @rubyycheung

---

# 0.5.1

#### New Features

- add shape prop ('circle' | 'rounded' | 'square') to Avatar for non-circular form factors (#4205) (#4327)
- Card: make the `variant` axis theme-extensible through a `CardVariantMap` interface (#5551)
  `CardVariant` was a hand-written union backed by a closed style record, so a theme could not add a card variant: an unknown value neither type-checked nor rendered. It is now `keyof CardVariantMap`, an interface exported from `@astryxdesign/core/Card` that a theme build augments — the same shape Button, Badge, Section and the other extensible axes already ship.

  `keyof CardVariantMap` resolves to exactly the thirteen values `CardVariant` had, so no existing call site changes. A variant a theme adds falls through to base styles and the theme's own `card['variant:<name>']` rule paints it.

  On SelectableCard that variant's selection ring is drawn in `--selectable-card-ring-color`, defaulting to the accent. No token the component could pick is guaranteed to contrast with a fill the component cannot know, so a theme rule that adds a variant sets the ring colour in the same rule as its `backgroundColor`.

- CheckboxInput and Switch now name their own label as a theme target: `astryx-checkbox-label` and `astryx-switch-label`, alongside the `astryx-field-label` every label already carries. A theme could previously only reach one `astryx-field-label` target, so styling a checkbox's label — which shares a row with its control — meant styling every form field's label above its input too. The control passes the target down, so the name says what the thing is rather than encoding how it is arranged, and nothing can set it untruthfully. (#5183)
- The checkbox indicator now exposes stable theme targets for its two marks — `astryx-checkbox-indicator-check` (the checkmark) and `astryx-checkbox-indicator-dash` (the indeterminate bar) — mirroring the existing `astryx-radio-indicator-dot`. Both reflect `size`. A theme restyling the mark itself (stroke weight, colour, the dash's proportions) previously had to reach it with `.astryx-checkbox-indicator > svg` and `> span`, which are element-and-order selectors that break silently on any restructure. Purely additive; no visual change. (#5426)
- ComplexSelector: `onOpenChange` reports every open and close of the popup — the trigger, the keyboard, a light dismiss, Escape, content calling `close()`, or the imperative handle. Paired with the existing `handleRef`, a consumer can drive and observe the surface without reading the shell's DOM. (#5211)
- DateInput uses the platform date picker on touch, with `nativePicker` to choose the native or Astryx surface; focused desktop-style native fields reveal their editable segments, the Astryx touch sheet keeps Reset in its header and Save alone in its footer, and both closed surfaces match standard input height (#5261, #5456, #5502, #5534)
  `nativePicker="touch"` is the default, `"always"` uses `<input type="date">` wherever supported, and `"never"` keeps Astryx's sheet or popover. Formatting still returns on blur, and `min`/`max` continue to validate native selections.
- Add a coarse-pointer DateTimeInput bottom-sheet picker with separate closed Date/Time segments, direct section opening, and a two-step Save date → Save flow. (#5582)
- Icon APIs and themes accept namespaced extension keys, and NumberInput steppers use `numberInput:stepperDown` without widening the required `IconRegistry` keys (#5466)
  `<Icon icon>`, `useIcon`, and `defineTheme({icons})` accept keys such as `numberInput:stepperDown` and `richtext:bold`; misspelled built-in names remain type errors. NumberInput keeps a compact centered Core fallback, while themes can override its steppers independently from the shared `chevronDown` semantic.
- `OverflowList` can now hand its collapsed items to a menu you already render, via `onOverflowChange(overflowItems)`. `overflowRenderer` only describes an indicator the list mounts itself, and only while items overflow — so a row that already carries a standing "…" menu had no way to collect the collapsed items into it, and adding an indicator gave the user two menus side by side. Watching from the outside was not reachable either: a reporter component placed inside `overflowRenderer` mounts twice (the hidden measurement copy always receives _every_ item, so it cannot tell you what is actually collapsed), and nothing fires when the row widens back out and the set empties. The new callback reports the collapsed set whenever its membership or order changes, and leaves the anchor entirely to the caller. It fires once measurement has collapsed something, fires again with an empty array once the row widens back out and everything fits, and is silent while nothing overflows — including on mount, so a list that fits from the start never calls it. It never reports the pre-measurement state, which is an empty set whether or not the row actually overflows; hold the collapsed set in state initialised to `[]` and it is correct at every moment. Reports run from a layout effect after measurement, so the menu updates in the same frame as the collapse. The measurement container is now observed for size changes, so child-size changes refresh every OverflowList and direct `useOverflow` consumer even when the available container width does not change. Keyed membership and order changes are re-measured before `onOverflowChange` reports them. Stable React keys distinguish same-count membership and order changes, while unrelated re-renders and callback identity changes do not re-fire it. Both APIs may be used together; using `onOverflowChange` alone adds nothing to the row. (#5199)
- Selector and MultiSelector: configurable panel empty states via `emptyText` and `emptySearchText`, announced to screen readers as well as shown; a panel with no options now says so instead of rendering blank, and says nothing while `isLoading` (#5462)
- SideNavItem: new `actions` slot for row-level secondary controls (icon buttons, menus). Content renders as a sibling of the primary link/button — after the expand/collapse toggle, before nested children in DOM and focus order — so interactive controls never nest inside the primary element and every row control is reachable before focus enters the subtree. Passive content (badges, counts) stays in `endContent`; `actions` is hidden while the rail is collapsed, and stays interactive on disabled items since each supplied control owns its own disabled state. An actions row draws its focus ring as a full-row pill for the primary link or button, while the expand/collapse toggle and each supplied action keep their own — adds `focusOutlineProps.focusWithinFirstChild` and `focusOutlineProps.suppressed` for that pairing. Supplied controls inherit the row's control size through `SizeContext`, the way `SideNav` already cascades one size to its footer icons, so an unsized icon button comes out the same box as the built-in toggle; an explicit `size` still wins. (#4988) (#5005)
- Spinner: the ring's geometry and its two colors are now themeable. The `size` and `shade` props keep their fixed enums; what each named value _resolves to_ is now a theme's to set, through four public custom properties on the `spinner` target — `--spinner-diameter` and `--spinner-stroke-width` under a size variant, `--spinner-color` and `--spinner-track-color` under a shade variant (or on the base target for all of them at once): (#5214)

  ```ts
  spinner: {
    'size:xl': {'--spinner-diameter': '2.5rem', '--spinner-stroke-width': '0.375rem'},
    'shade:subtle': {'--spinner-track-color': 'transparent'},
  }
  ```

  Any length and any color notation works — `rem`, `em` and `calc()` are resolved by the cascade into the radius and stroke the ring is drawn with, and colors accept `var()`, `color-mix()` and `currentColor`. A stroke width of `0` is honoured as a zero-width stroke — it paints nothing, rather than being read as "unset" and silently drawing the default. The drawn ring and the box around it come from the same values, so they stay in step, including when a media query or a root font-size change moves them after mount.

  The two private vars the ring resolves into are registered as `<length>` when the module is imported, not when a spinner first mounts. Registering an inherited property with an `initial-value` invalidates style for the whole document, and a spinner is the loading indicator — it arrives on a page that has already rendered, so paying that there is paying it on the full tree: 29 ms against 12 ms for the same mount on an 11k-element page. A build that never imports `Spinner` drops the module and the registration with it.

  Output is unchanged for every size and shade unless a theme overrides something, and so is every precedence around the box: it is still sized by an inline `width`/`height` written after the caller's `style`, as it has always been, with the composed value in place of the number.

- TextArea: the two painted elements inside the wrapper now carry stable theme targets — `astryx-text-area-control` (the `<textarea>` itself) and `astryx-text-area-counter` (the character counter). Only the wrapper was themeable before, so a theme restyling the control's own typography, placeholder or resize affordance, or the counter's supporting text, had to reach in with structural selectors like `.astryx-text-area > textarea`. Purely additive: no existing class, data attribute, or style changes. (#5418)
  Neither carries a `size` axis. `size` moves only the control's block padding (`sm` and `md` are empty; `lg` sets `paddingBlock`), and that is the axis a `padding` translation for this component takes over — so an axis here would be a second way to say the same thing, and the one that stops being true once the translation lands.

  The start-icon and end-slot overlays are deliberately not targets. They paint nothing — each is `position: absolute; pointer-events: none; display: flex` — and they are placed off the wrapper's `--_textarea-inline-padding`, so a theme that moves the control's inset needs them to move with it rather than to be re-placed one at a time. That inset belongs in a `padding` translation for the component, which is tracked separately.

- Toast: `renderContent` on the `showToast` options replaces the content of that toast's card with your own layout. (#5428)

  ```tsx
  showToast({
    body: 'Your changes have been saved.',
    renderContent: ({body, endContent, dismiss}) => (
      <MyRow>
        <MyTitle>{body}</MyTitle>
        {endContent}
        <Button label="Dismiss notification" onClick={dismiss} />
      </MyRow>
    ),
  });
  ```

  Astryx keeps the card, its `astryx-toast` theme target, live-region role and auto-hide behavior. The renderer receives the message, `endContent`, resolved toast settings and a `dismiss` callback.

  Custom content owns its complete layout and every control in it. Call `dismiss` from the control that should close the toast; it may be passed through nested components. Astryx does not register an injected component or add a fallback close behind a custom layout.

  The API is per-toast. An app can share one layout by wrapping `useToast()` and passing `renderContent` on each call, while other toasts continue to use the ordinary Astryx layout and its translated, themeable dismiss `Button`.

  New exported types: `ToastContentRenderProps`, `ToastContentRenderFn`.

- Toast now supports touch and pen swipe dismissal toward its configured viewport edge. The vertical axis matches each Toast's top/bottom placement and entrance/exit motion, so the dismissal follows the same spatial model instead of introducing a separate side exit. Native touch scrolling is preserved until movement resolves to the dismiss direction, interactive controls do not start a swipe, and swipe continues to report the existing manual dismissal reason. Pen is included as direct-contact input; mouse drag is excluded because desktop users already have the visible close control and dragging can conflict with text selection. (#5375)
- Typeahead + Tokenizer: minQueryLength holds the search and the menu until the query is long enough (#5385)
  Also fixes a stranded loading state that predates the prop: abandoning an in-flight search — by emptying the field, by falling below the threshold, or by selecting an item while the next search is still out — bumps the search generation, which makes that search's own `finally` decline to clear the loading flag. The field kept reporting "Loading" to assistive technology until another search settled.

  `hasCreate` is not gated by it. The "Create ..." entry is derived from the typed text rather than fetched for it, so it now reaches the menu through a separate internal path and is offered whatever the threshold says — the threshold exists to avoid a fetch too broad to be worth making, and creating costs no fetch. With `minQueryLength={3}`, typing `QA` offers `Create "QA"` and Enter commits it, while the search source is still never called.

  One consequence worth naming: the Create entry is appended after the results are cut to `maxMenuItems`, so with `hasCreate` a full menu now shows one option more than the cap — 11 where it used to show 10. The cap bounds how many _results_ a menu shows; creating is a separate capability and is not crowded out by them.

#### Fixes

- AlertDialog lets Dialog preserve and clamp its preferred width, lets whole actions move to another row when needed, and stacks full-width destructive and Cancel actions at 640px and below while preserving standard single-line Button sizing and labels regardless of pointer type. (#5343)
- Badge: a long label no longer escapes its container. (#5558)
  `Badge` set `white-space: nowrap` with nothing to clip it — the one pairing that neither wraps nor truncates. A label wider than the space available rendered _outside_ the badge's container and over whatever sat beside it.

  ```tsx
  <div style={{width: 100}}>
    <Badge variant="pink" label="Awaiting security review" />
  </div>
  ```

  Measured in Chromium: that badge came out **163px** wide in a 100px column, spilling 63px past it; in a fixed-layout table cell it painted 64px over the text in the next cell. The badge now clamps to the width it is given and cuts the label with an ellipsis.

  A badge that already fits is untouched — same width, same height, same DOM. Measured before and after, a badge with room to spare is 53px either way; only the cases that were already overflowing change. `Badge` uses no hooks and stays server-renderable.

  The ellipsis sits on an inner label span rather than the badge itself, because `text-overflow` needs a block container and taking the root off `inline-flex` to get one would cost the icon its centring. With an icon, the icon holds its place and the label gives way.

  So that a clipped tail is not simply lost, a string or number label is also carried in the badge's `title` — the same shape `BaseTable` already uses for a truncated header cell. That costs no measurement and no hook, so `Badge` still renders the same on the server and stays usable in a server component. A rich `label` is left alone rather than flattened to a guess.

  Two gaps remain, both needing runtime measurement, and both tracked in #5585: the `title` is set whether or not the label actually fits, and a native `title` is a pointer affordance — it answers hover, not keyboard focus, and not touch at all. The refinement is a tooltip shown only when the text is really cut, reachable by hover and by focus, which makes `Badge` a client component and is its own trade-off to weigh.

- Banner names each dismiss control after its string title, so stacked banners no longer expose identical "Dismiss" buttons to screen readers. Rich titles retain the generic translated name unless the consumer supplies an already-translated `dismissLabel`; that override also labels the tooltip. (#5113)
- Seven components now forward the pass-through props promised by `BaseProps` (#5563)
  `MetadataListItem`, `NavHeadingMenu`, `Timestamp`, `Token`, `TopNavMegaMenu`, `TopNavMenu`, and `TypeaheadItem` now forward neutral `aria-*`, `id`, `tabIndex`, event-handler, and `data-*` props to their rendered DOM element. Styling still merges through `mergeProps`, contract-owned attributes retain precedence, and owned handlers compose through `composeEventHandlers` with the caller first.

  `MetadataListItem` targets its wrapper `<div>` when stacked and its `<dt>` when inline. A `TypeaheadItem` backed by caller-supplied `item.element` remains unchanged and does not receive forwarded props because that value may not be a cloneable element.

  This completes [#5254](https://github.com/meta/astryx/issues/5254) after [#5288](https://github.com/meta/astryx/pull/5288) by @lexs landed `List` and `Markdown` first, followed by [#5493](https://github.com/meta/astryx/pull/5493) by @gonzoblasco for `TreeList`.

- `Button` now reflects `elevation` as a theme target. The prop selected between four StyleX style objects but was missing from the sibling `themeProps('button')` call, so `data-elevation` never reached the DOM and no theme could style the axis — the same defect fixed on `Card` in #5491, and one `ButtonGroup` already had right. A button inside a `ButtonGroup` reports `none`, because the group owns the surface's elevation and the member paints flat. Every wrapper that forwards `ButtonProps` through to `Button` — `IconButton` — picks the reflection up with it. (`ToggleButton` does not: its props extend `BaseProps`, not `ButtonProps`, so it has no `elevation` to forward and keeps reporting `none`.) Nothing about the rendered button changes: 60 of 64 captured frames are byte-identical, and the four that differ do so only inside the loading spinner's own box. (#5552)
- Calendar: announce a cleared range in the provider locale, wrap the two-month layout instead of overflowing a narrow viewport, keep the selected date visible under forced colors (#5453)
- Card: reflect `elevation` as a theme target so a theme can reach it, and correct the documented `padding` default (#5491)
  `elevation` picked a style object but never reached the DOM, so `astryx-card` exposed `data-variant` and nothing for elevation and a theme could not style the four shadow tiers. It now rides `themeProps` alongside `variant`.

  The `padding` prop documented `4` as its default. With the prop omitted the card reads the theme's card padding, and most shipped themes set that to a different step, so writing the documented default explicitly changed the card's size. The prop docs, the JSDoc and the playground default now say that omitting the prop takes the theme's padding and passing a step overrides it. The four `effectivePadding !== 4` style branches that encoded the same wrong default in code are gone: `container()` already sets every variable they set, verified identical across all eleven padding steps on both a bordered and a borderless card.

- Carousel no longer drops keyboard focus to the document body when reaching a scroll edge disables the nav button in use. Focus moves to the opposite arrow instead, on the state transition that disables the button rather than on a prediction from the press, so it holds under reduced motion, under scroll-snap, and on browsers without `scrollend`. The scroll container is also now a documented theme target, `astryx-carousel-scroller`, carrying the gap, padding, snap and edge-fade props it styles, so a theme can reach the spacing and the fade it could not see before. (#5601)
- The 56 `--color-data-*` defaults now reach runtime CSS and built themes from the same source, while dashboard template fallbacks match those defaults (#5562, #5566)
  The defaults live once at `:root` in `@layer astryx-base`, so nested themes inherit parent overrides and `astryx theme build` matches `<Theme>` while `generateThemeCSS` keeps its existing return shape.

  **Visual change.** A chart or template that previously painted nothing or used a mismatched hex fallback now paints the data token's default. Pin an explicit color to preserve a previous fallback.

- DateRangeInput: allow a same-day range when `minRangeSpan` is 1 (#5581)
  A repeated click on the range start now commits a one-day range when the configured minimum permits it, including when a maximum span is also set. Longer minimum spans keep the existing cancel behaviour so the user can move the start date.
- Dialog: fullscreen safe-area padding follows writing direction and defers to explicit padding (#5367)
  Two corrections to the fullscreen safe-area padding that shipped in 0.5.0.

  **The insets were mapped to the wrong edges in RTL.** `env(safe-area-inset-left)` and `env(safe-area-inset-right)` are physical, but they were assigned straight to `padding-inline-start` and `padding-inline-end`, which are logical. That holds in LTR and inverts in RTL, where inline-start is the right edge — so a device notch on the physical left padded the edge away from it and left the notched edge unprotected. Each physical inset now feeds the logical edge that actually faces it, in both directions.

  **Safe-area protection overrode explicit padding.** The `max()` was applied to the fullscreen surface unconditionally, so it beat both a `padding` prop and a theme's `dialog: {padding: 0}`, and a deliberately full-bleed fullscreen dialog could not be expressed. It now sits in the innermost fallback of the same `--astryx-dialog-padding*` chain `container` already resolves, so it applies only when no padding is set anywhere. An explicit value, `0` included, is honored as written.

- Date formatting now defaults to Gregorian calendar semantics across core, charts, and Schedule while still following the selected locale for language, numbering, and field order. (#5303)
  The low-level public `plainDateFormat` helper continues to honor an explicitly supplied `calendar` option for compatibility; Astryx components do not expose that display-only exception and remain Gregorian. The deterministic English fallback also prevents server and browser locale differences from producing hydration mismatches when no provider locale is available. Locale-aware parsing only selects day-first or month-first order for ambiguous ASCII numeric dates; it does not parse localized month names, non-ASCII digits, or arbitrary locale-specific strings.

  Fixes #5074.

- Labelled HoverCard triggers expose a dialog-popup relationship without flattening rich content into a description, and only roles that support `aria-expanded` receive that state (#5419, #5501)
  The trigger now uses `aria-haspopup="dialog"`, `aria-controls`, and a role-gated `aria-expanded`; `useHoverCard` exposes the layer `id` and open state, while `describedBy` remains as a deprecated alias for compatibility. Unlabelled group cards keep their description relationship.
- Popup triggers no longer fight the browser's own light dismiss: pressing the button of an open Selector, MultiSelector, ComplexSelector, DropdownMenu, or Popover closes it once instead of closing and reopening. MultiSelector's clear and status buttons also keep its popup open when pressed. (#5018)
- Markdown now applies the same URL safety rule to every image path it parses: reference-style images (`![alt][label]` and the shortcut form) and standalone block images pass through the check inline images and links already used, and the render-side guard normalizes control characters before testing so both layers see a URL the way a browser will. (#5522)
- Markdown and List forward the rest of `BaseProps` (#5288)
  Both declare `BaseProps`, and `BaseProps` documents that `data-*`, `aria-*` and `role` reach the element — but each destructured a fixed set of props and forwarded only `data-testid`, so an `aria-label` a consumer passed silently disappeared. `<Markdown aria-label="Release notes">` named nothing, and a list could not be labelled by a heading it did not render itself.

  Consumer props spread first, so what a component sets for itself still wins: the block root stays `role="document"`, the list keeps the explicit `role="list"` that restores Safari/VoiceOver announcements, and a list rendering its own header keeps that association rather than one pointed elsewhere. The `aria-labelledby` for that header is only written when the header exists — writing `undefined` unconditionally would erase a consumer's own label.

- NumberInput parses locale-formatted paste safely and commits one complete draft: grouped numbers and machine decimal points work, arbitrary repeated punctuation is refused, out-of-range values clamp to the nearest bound, and fractional stepping cannot cross a rounded bound (#5152, #5450, #5459, #5510, #5546)
  Invalid typed or pasted input preserves the prior value instead of committing a valid prefix. Pagination inherits the complete-draft and bound behavior, while inline Table filtering and PowerSearch keep their existing live and Enter-to-save behavior.
- Popover: theming `popover.borderRadius` now changes the rendered radius. The `astryx-popover` target moves onto the popup surface — the box that paints background, radius and elevation — and `usePopover` reads the registered `--_popover-radius` there instead of hardcoding `--radius-container`. Content padding moves with it, so a themed `padding` still replaces the default instead of nesting inside it. (#5162)
- Ensure pressed overlays override hover across interactive surfaces (#5451) (#5516)
- Stack DateTimeInput's date and time fields when its container is narrower than 400px. (#5609)
- Selector: a caller-supplied `id` now drives the trigger's whole identity, not just its `id` attribute (#5561)
  `Selector` generated its trigger id with `useId()` and set it on the trigger button before spreading `...rest`, so a caller's `id` — accepted through `BaseProps` — replaced it on the button while the generated value stayed behind as the target of the listbox's `aria-labelledby` and of the `Field` label's `htmlFor`. Passing `id` therefore left the listbox with no accessible name and the field label pointing at an element that does not exist, silently and with a clean typecheck, lint and build.

  The internal identity is now derived from the caller's `id` when there is one, so the button, the listbox's `aria-labelledby` (both the plain and the `hasSearch` panel) and `Field`'s `inputID` all name the same element. The trigger's own `id` attribute is unchanged in every case; what changes is that references which used to dangle now resolve — including the field label, which consequently regains its native click-to-focus behaviour. With no `id` supplied the rendered output is identical to before.

- Selector raw source now compiles when consumer Babel presets lower arrow functions before StyleX extraction (#5508)
- Platform detection reads the client-hints `Unknown` sentinel as no answer, and lives in one place (#5394)
  Follow-up to #5325, which taught `useHotkeys` and `Kbd` to fall through to `navigator.platform` when `userAgentData.platform` is blank. `Unknown` is the User-Agent Client Hints spec's own value for "cannot say", and it names a platform no more than `''` does, yet it still committed to the client-hints branch and answered "not Apple". It now falls through the same way.

  The two detections were independent copies kept aligned by a docstring. They are now one internal util that both import, so the next change to this logic cannot land on one surface and miss the other. The util is deliberately not named in `utils/index.ts`, which would publish it as API.

- SideNavItem: the standalone expand/collapse toggle on a `collapsible` item with an `href` or `onClick` now carries the box of a `size="sm"` icon button. It had no box of its own, so it shrank to the 24px chevron inside it and painted a smaller hover pill than any icon button sitting beside it in the same row. (#4988) (#5005)
- SideNav: `collapsible` and `resizable` no longer keep two independently initialized copies of the collapse state. Both props are normalized into one internal collapse config with a single owner — the resize hook when `resizable` is in play, SideNav's own state otherwise — so the hook can no longer restore itself collapsed while SideNav renders the expanded layout at width 0, which is what made a persisted-collapsed nav come back invisible and unrecoverable (#4790) — that the second independently-initialized boolean is the defect, rather than the restore clamp, is @HelloOjasMutreja's diagnosis from #4853. Passing both props stays supported and every configuration that works today resolves to the same collapse state it does now; when the two props genuinely address the same state (`defaultIsCollapsed` on both, or a controlled `collapsible` alongside collapse state on `resizable`) `resizable` wins and a dev warning names the conflicting keys. `useResizable` gains the standard controlled/uncontrolled pair, `defaultIsCollapsed` and `isCollapsed`, alongside the existing `onCollapseChange`: uncontrolled it owns collapse as before, controlled the prop wins and `collapse()`, `expand()` and a drag past the threshold report through the callback instead of mutating. Persisted entries now store `{size, isCollapsed}` where `size` is the _expanded_ size — the encoding is @AKnassa's from #4824 — so a reload restores the collapsed rail and expanding returns to the width the user had rather than `defaultWidth`; legacy entries still load, with a plain number read as a width whose collapse state is unknown and a plain `0` (written by the old collapse path) read as collapsed, so anyone already stuck with an invisible nav recovers without clearing localStorage. `resizable` can now also carry collapse state on its own. Two notification changes ride along: with a single owner, `collapsible.onCollapsedChange` fires once per toggle on a resizable nav instead of twice; and the hook's collapse callbacks now read the live collapse state rather than the value captured at their last render, so one drag past the threshold reports one collapse instead of one per pointer move, dragging back above the threshold re-expands mid-gesture, and `resize()` out of the collapsed state reports the implicit expand. That last fix is @AKnassa's, from #5118. (#5075)
- Slider: dragging the thumb with a mouse no longer draws the keyboard focus ring (#5463)
  The thumb is a `div[role="slider"]`, and the track's `pointerdown` handler calls `preventDefault()` and then focuses the thumb from script. Chromium treats that script focus as focus-visible, so `:focus-visible` matched on mouse-down and every drag came with a 2px accent ring — measured in Chromium, not inferred.

  `:focus-visible` stays the CSS condition; it is now narrowed by the existing `interactionModality` utility, the same way PanelSearchInput and Selector narrow theirs. Keyboard focus rings exactly as before, and a mouse grab of a thumb that already had the ring drops it.

  One deliberate difference from the text-input cases: a keypress after a mouse drag brings the ring back. A text field has a caret to show where input is going, and a slider thumb has nothing else.

- Keep useResizable callbacks stable when snap points are omitted. (#5276)
- Keep useLayer trigger refs and return objects stable when their inputs are unchanged. (#5272)
- Keep useTheme token resolvers and return values stable when the resolved theme is unchanged. (#5274)
- Table sticky columns: the pinned-column shadow now reads the theme's `--color-shadow` token instead of a hardcoded `light-dark()` tint, so a theme can retint it. (#5445)
  The tint was `light-dark(rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.32))` written in the component, chosen because `--color-shadow` (10%/30% alpha) read as slightly too faint. A literal in a component is the one place a theme cannot reach: every theme got this exact black regardless of its own shadow colour, and the two-point alpha difference bought nothing for it — rendered, the token version differs by at most 5/255 on any channel in light mode and 1/255 in dark, over the ~0.4% of the frame the two shadow strips occupy.

  Reading the token instead means the seven bundled themes each tint this shadow with the value they already declare for every other shadow (`chocolate` `#4a35201A`, `stone` `#25252a1a`, and so on), and a custom theme gets the same reach.

- Syntax-highlighted punctuation (brackets, commas, semicolons, operators) now meets WCAG 2.1 AA contrast (4.5:1) against the code surface in every bundled theme. (#5414)
  `--color-syntax-punctuation` borrowed `--color-text-disabled`, a token WCAG deliberately exempts from the normal-text contrast requirement because it marks an inactive control. Punctuation in a code sample is always-active, normal text, and measured well under 4.5:1 in three themes: neutral (2.42:1 light, 2.53:1 dark), chocolate (3.06:1 light, 2.56:1 dark), and matcha (3.83:1 light, 2.73:1 dark). The other four themes (butter, gothic, stone, y2k) already defined their own passing punctuation colour and are untouched.

  The shared default now points at `--color-text-secondary` instead (used for `--color-syntax-comment` too, and already verified to clear AA). Neutral, chocolate and matcha each get a dedicated punctuation colour in their own syntax palette, since they define one rather than inheriting the shared default: neutral `#6e6e6e`/`#a0a0a0` (4.89:1/7.57:1), chocolate `#9e622e`/`#cb884d` (4.84:1/6.12:1), matcha `#566a39`/`#92af6a` (5.19:1/7.02:1).

  Adds `scripts/check-syntax-punctuation-contrast.test.mjs`, resolving each theme's `--color-syntax-punctuation`/`--color-syntax-background` pair through `light-dark()`/`var()` indirection (the pattern from #4446's badge contrast guard) and holding every theme, both colour schemes, to AA — so a regression here fails the build instead of shipping.

- Table keeps grouped headings and selected-row washes visible across frozen columns while scrolling sideways (#5454)
  `useTableGroupedRows` pins its default heading and collapse control to the table's start edge. `useTableSelection` now publishes and withdraws the selected-row overlay with the row background, so the wash continues under sticky cells.
- Text, Heading: a truncated label shows one tooltip, not two. (#5559)
  When `maxLines` clipped the text, both components rendered Astryx's `Tooltip` **and** set the native `title` attribute to the same string. Hovering drew both: the styled tooltip first, then the browser's own unstyled one on top of it a moment later, saying exactly the same thing.

  The `title` goes. `Tooltip` already wires `aria-describedby` onto the anchor, and the full text is in the DOM either way — CSS clips it visually, so a screen reader was never reading the truncated version. Nothing is lost but the duplicate.

  Measured on hover, same story, before and after: `2` tooltips shown to the user, then `1`.

- Seven theme target roots that ran a compound component name together are deprecated onto the `<component-kebab>-<part>` spelling the component's name implies: `codeblock` → `code-block` (with `-copy-button`, `-header`, `-title`), `progressbar` → `progress-bar` (with `-fill`, `-mark`, `-track`), `hovercard` → `hover-card`, `statusdot` → `status-dot`, `textarea` → `text-area`, `navicon` → `nav-icon`, and Table's second root `base-table` → `table` (both named the same `<table>` element). A `defineTheme` key that matches no target fails silently — no error, no warning, the rule never emits — so someone who read `ProgressBar` and wrote `'progress-bar'` got nothing and no explanation. Nothing breaks: every component renders both classes and both keys resolve, including the derived vars a renamed key expands into. New themes should use the canonical spellings; the deprecated aliases remain supported. (#5449)
- Toast fits narrow and safe-area viewports, aligns wrapped actions and dismissal, uses edge-directed entrance and exit motion, exposes the Notifications landmark only while populated, and keeps exactly the viewport gutter below the final toast (#5353, #5460)
  Inter-toast spacing is 8px, while the visual bottom no longer adds a trailing toast gap on top of viewport padding. Placement, visible-stack limits, auto-hide defaults, announcement semantics, and dismissal reasons are unchanged.
- TreeList: forward `aria-label`/`aria-labelledby` to the `role="tree"` element so a tree can be named (#5493)
  `TreeList` destructured a fixed set of props with no rest spread, so every `BaseProps` attribute (`aria-*`, `role`, `tabIndex`, `id`, event handlers) was dropped and never reached the DOM. A tree without a visible header could not be named at all - a screen reader announced an unnamed tree with no way to know what it was.

  The component now spreads the remaining props onto the root element and routes `aria-label`/`aria-labelledby` onto the `<ul role="tree">` itself, so `<TreeList aria-label="File tree">` names the tree. When a visible `header` is rendered, it keeps naming the tree (AT hears the same name the user sees); a consumer-supplied `aria-labelledby` only applies on the headerless path. The contract `role="tree"` is written after the rest spread so a consumer cannot displace it.

#### Documentation

- `useAnnounce`, `useTypeahead`, `useInteractiveRole`, `useLongPress`, `useInputStatusIcon`, `useDevWarning` and `useIndicatorFocusRing` are now discoverable. The CLI's hook index is built from the `.doc.mjs` files next to each hook, and these seven shipped without one; so `astryx hook <name>` answered "No hook named", `astryx hook` omitted them and `astryx search` never returned them, while the package exported them with full TSDoc. Agents following the documented discovery workflow concluded the primitives did not exist and hand-rolled replacements; for `useAnnounce` that means a hand-built `aria-live` region, which usually does not announce at all. A test now fails when a hook is exported from the barrel without a doc, so the index cannot silently go stale again. (#5109)

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @Astro-Han
- @bhamodi
- @cixzhang
- @ernestt
- @freddymeta
- @gonzoblasco
- @HelloOjasMutreja
- @imdreamrunner
- @jiunshinn
- @josephfarina
- @lexs
- @nynexman4464
- @rubyycheung

---

# 0.5.0

#### Breaking Changes

- Banner: the collapse axis moves onto one `collapsible` prop, and content can opt out of collapsing (#5255)
  Banner inferred its disclosure from its content: any `children` got a chevron in the header and were hidden until it was pressed. There was no way to show content without a toggle — the case a banner most often wants, a list of the three fields that failed validation — and `defaultIsExpanded` was the only knob, with no controlled mode.

  The whole axis is now one `boolean | CollapsibleConfig` prop, following the boolean-or-config convention `SideNav.collapsible` set, and backed by the shared `useCollapsible` hook rather than Banner's own state:

  ```tsx
  <Banner status="error" title="3 fields need attention">…</Banner>  // unchanged: collapsible, starts closed
  <Banner collapsible={false}>…</Banner>                             // new: always visible, no toggle
  <Banner collapsible={{defaultIsOpen: true}}>…</Banner>             // replaces defaultIsExpanded
  <Banner collapsible={{isOpen, onOpenChange}}>…</Banner>            // new: controlled
  ```

  **The default is unchanged** — a banner that never mentioned `defaultIsExpanded` behaves exactly as it did. The breaking part is the prop itself: `defaultIsExpanded` is removed in favour of the config, which is a type error at every JSX call site that names it.

  **Codemod:** `npx astryx upgrade --codemod banner-collapsible-content`

  It rewrites `defaultIsExpanded` to `collapsible={{defaultIsOpen: true}}` and drops `defaultIsExpanded={false}`, which is now the default. Banners that never set the prop are left alone.

  **One case the codemod and the compiler both miss: a spread.** `defaultIsExpanded` inside a props object is out of the transform's scope. A props object in a typed position still fails to compile — but an inferred one that is spread, `<Banner {...args} />`, does not, because TypeScript does not excess-property-check a spread. The prop then falls through to the DOM and the banner quietly starts collapsed. **Grep for `defaultIsExpanded` after running the codemod** and migrate any spread sites by hand.

- Overlays share one dismissal stack, so a single Escape dismisses exactly one layer. Every overlay used to own its own Escape listener, which meant one press could close a popover _and_ the Dialog hosting it, or a modal _and_ the modal it was opened from. `useLayerDismissal` replaces that with a single stack: the stack owns one listener, routes each press to the top-most layer, and suppresses the browser's own close-watcher so nothing dismisses twice. A layer declares what it does with a press via `escapeBehavior` — `close` (default) or `block`, for a `required` Dialog that must swallow the press without closing so nothing behind it dismisses either. Fixes a Tooltip inside a Dialog closing the Dialog rather than the tip, and a HoverCard trigger swallowing Escape whenever it merely had focus. Dismissals the browser starts on its own — the Android back gesture, the platform close watcher — still close a Dialog, and follow the same top-most rule. An Escape that cancels an in-progress IME composition dismisses nothing: the stack claims that press so the browser raises no close request of its own, and a close request that arrives mid-composition anyway is declined, so a CJK user backing out of a half-formed character no longer loses the layer and everything typed into it. One behavior change worth knowing about if you listen for Escape yourself: the stack claims a press with `preventDefault()` but deliberately leaves propagation alone, so a `keydown` listener on `window` now sees an Escape that a focus-trapped layer used to stop — with `defaultPrevented` already `true`, which is how to tell the stack has acted on it. Top-most is resolved from React-tree nesting (which survives portals) rather than DOM containment alone. A layer's place in that order is keyed to the layer's identity rather than to each registration, so a prop change that re-registers it — a Dialog whose `purpose` flips while it is open — never promotes it above the layers opened over it. Controlled layers follow their control state: a controlled `Tooltip` or `HoverCard` stays on the stack and takes the press like any other layer, but answers it by calling `onOpenChange(false)` rather than hiding itself — whether it actually closes is the caller's update to make, exactly as it has always been for `Dialog` (#4881).

#### New Components

- Allow MultiSelector count labels to be customized (#4032)
- MultiSelector: rename the unreleased `formatTriggerCount` prop to `formatValue` and widen it to the whole trigger line. It now receives the selected items (`{value, label}[]`, count available as `.length`) and formats the trigger for `triggerDisplay="count"` and `"labels"`; `"badges"` renders elements, so it is not used there. `formatValue` matches NumberInput and Slider, so the same idea has one name across the system. Defaults are unchanged when the prop is absent (#5377).
- Promote `Stepper` and `Step` from the canary-only Lab package to Core. The stable package now ships their existing horizontal/vertical layouts, separated and on-track indicators, semantic status, density, and non-linear navigation, plus Core documentation and rendered examples. The default `aria-label` is now localized.
  Advancing one step now animates the connector. Every connector the four layouts draw — the separated bars and the on-track segments alike — grows its accent fill out of the segment's leading edge instead of swapping a background color, so moving forward reads as progress travelling the track. That one gesture is the only thing that animates: going back, jumping forward by more than one step, and mounting mid-flow all apply at once, as does any change under `prefers-reduced-motion`. Retreats are deliberately instant — run in reverse the same transition ends on a shrinking stub of accent, and a remnant still on the track reads as unfinished where the identical curve growing forward reads as arrived — and multi-step jumps are instant because a jump is a navigation rather than a progression, so sweeping a front across the crossed segments only makes the user sit out a journey they asked to skip. Where one span is drawn by several segments (the on-track layouts split a span between two steps, three when a content slot sits between them) the segments take abutting slices of the span's time and run linearly, so the fill reads as one line growing at a constant speed rather than pieces lighting in turn.

  Five visual fixes land with the promotion. Horizontal steps now divide the track evenly instead of sizing to their own labels, so every progress segment is the same width regardless of how long a step is named. Number indicators shrink from 20px to 16px to match the check, ring, and custom-icon indicators, so a step swapping its number for a check as it completes no longer nudges the label beside it. A step description now occupies a 16px box rather than a 24px one — it previously inherited the page's line box instead of applying its own leading, which opened an 8px gap under the label. A step's content slot now starts flush with the label above it at every density: the slot renders outside the density-padded label area, so it was hanging one pad short of it. And a vertical on-track step carrying content keeps its connector unbroken — the content renders below the row that draws the line, so the track used to split open around any step with content (#5201).

#### New Features

- AspectRatio: emit `ratio` as a class-level declaration instead of a hard inline style, so the ratio can be overridden responsively: StyleX consumers pass an `aspect-ratio` rule via `xstyle` (including under `@media`/`@container` conditions), and plain-CSS/Tailwind consumers override `aspect-ratio` from their own unlayered rules, which beat the `astryx-base` cascade layer regardless of specificity. The mixed-gallery template's hero now switches 3:1 to 3:2 when the grid stacks with a one-line override on a single element, replacing the duplicated hero markup the fixed inline ratio previously forced (#3883, closes #2798)
- ChatMessageList: add an `align` prop for top-aligned message lists
  (#3933, closes #2572).
- DateTimeInput: new `timeOptionInterval` prop adds a dropdown of preset times to the time field, at a cadence of `5 | 10 | 15 | 30 | 60` minutes (`60` gives the 12 AM - 11 PM list). The field becomes an APG combobox over a `listbox`: click or Alt+ArrowDown opens it, ArrowUp/ArrowDown move the active option, Enter picks, Escape closes, and typing moves the highlight to the closest option without filtering the list. `min`/`max` trim the options on the boundary date. Style the popup through the `date-time-input-time-listbox` and `date-time-input-time-option` theme targets.
  Opt-in and additive: with `timeOptionInterval` omitted the time field keeps exactly its current behavior and gains no combobox semantics, so existing `getByRole('combobox')` queries still resolve to the date input. With the list closed the arrow keys keep stepping by `timeIncrement` (#4837).
- Markdown: opt-in source ranges on parsed blocks
  `parseMarkdown(source, {sourceRanges: true})` now gives every top-level block a `range` — `{start, end}`, the character offsets it occupies in the source that was passed in, with `end` exclusive — so a consumer holding that source can `source.slice(range.start, range.end)` for a block instead of reconstructing it from the node (or from the rendered DOM). Reconstruction is lossy in ways slicing is not: escapes, the exact emphasis and fence characters, heading depth beyond the clamp, and alignment all survive a slice unchanged.

  Off by default and absent unless asked for, so no existing node, snapshot or comparison changes.

  Two things the offsets get right that a naive implementation does not: link reference definitions are stripped before the block loop runs, and the ranges are reported against the string the caller passed rather than the stripped text; and `parseMarkdownIncremental` parses slices, so blocks report absolute offsets into the whole document as it streams — including a list whose halves arrived in separate chunks and were merged.

  A range covers a block's own lines verbatim, so slicing it and parsing the result gives the same node back.

  Blocks nested inside a list item or a blockquote carry no range: their children are parsed from text the parser reassembled with markers and `>` prefixes removed, so an offset into it would not address the document (#5290).

- Table: let `useTableSelection` opt out of the checked-row accent wash
  The selection plugin paints checked rows by writing `backgroundColor` straight onto each `<tr>` from its row ref callback. An inline style outranks anything StyleX can layer on, so a product that wanted the row background for its own meaning had no way to reclaim it short of forking the plugin.

  `hasRowHighlight` turns the wash off. It defaults to `true`, so existing tables are untouched. Only the background is dropped — `aria-selected` is still set and removed exactly as before, since that is the half of the state screen readers read.

  ````tsx
  useTableSelection({...config, hasRowHighlight: false});
  ``` (#5310)
  ````

- TabList: a strip that switches panels in place can now say so with `role="tablist"`, and it speaks the WAI-ARIA tabs pattern — `role="tablist"` on the strip, `role="tab"` and `aria-selected` on the tabs, and `aria-controls` pointing at the panel each tab opens, from a new `panelId` prop on `Tab`. There is no new prop for the switch: `TabList` declares `role?: AriaRole` and reads it, the way `LayoutHeader`, `LayoutContent` and `LayoutPanel` already declare and document theirs. The keyboard behaviour the pattern asks for was already there: arrows move between tabs, Tab leaves the strip. Under the asserted role the strip takes only the horizontal arrows, leaving ArrowUp and ArrowDown to scroll the page.
  `role` already reached the DOM through `{...restProps}`, so a caller could pass `role="tablist"` and get a tablist whose children were still `<button>`s with `aria-current` — invalid markup, no `aria-selected`, and no warning. Reading the role turns that silent breakage into the correct behaviour; declaring it is what puts it in the type, the prop table and the docs.

  **Nothing changes for a caller who passes no `role`**: the strip is the `<nav>` landmark with `aria-current` it has always been. Any other role still passes through to the element untouched.

  Two development warnings come with the asserted role, and only with it. A tab with an `href` is a false statement inside a tablist, so the `href` is ignored and the warning says so. And a tab that controls nothing gets asked for a `panelId` — either that or an `aria-controls` you wrote yourself satisfies it, and a hand-written one is never overwritten. `aria-controls` is emitted only when you supply the id: pointing at a panel that does not exist is an invalid attribute value, which is worse than saying nothing. A menu or any other non-tab in a tablist strip is invalid markup, and warns too. The mirror case warns as well: a `panelId` on a strip that is not a tablist has no panel relationship to state, and is dropped (#5349).

- TabList: a strip narrower than its tabs now scrolls instead of spilling out of its container. Every tab stays a tab — nothing is hidden behind a menu — the edges fade to show there is more, and pointers that can hover get arrow affordances; keyboard and screen-reader users reach every tab with the arrow keys, which scrolls the focused tab into view. The selected tab is scrolled back into view whenever it would be out of sight, including on mount and when the host changes `value` itself. The new `overflow` prop takes `'auto'` (the default, which today always scrolls), `'scroll'`, or `'visible'` to keep the old spill-out layout. Built on the existing `useScrollOverflow` hook, so there is no new measurement machinery and no `Carousel` in the tab strip — the documented Carousel recipe, which announced every tab as "slide N of M", is no longer needed and the stories now use the built-in behaviour.
  If you followed that recipe, nothing breaks: a `Carousel` still wrapping the tabs renders and behaves exactly as it did before, because its own scroll container absorbs the strip's, which then never overflows. Removing it is worth doing anyway — it drops the `region`/"slide N of M" wrapping from the accessibility tree, and the strip's own scrolling brings a tab that straddles the edge fully into view on focus, which the carousel does not (#5348).

#### Fixes

- useTablePagination: with `position='both'` the two pagination `<nav>` landmarks now get distinct accessible names — "{label} (top)" above the table and "{label} (bottom)" below it (axe landmark-unique). Consumer-supplied `label` values are interpolated into both names; single-position labels are unchanged (#4692).
- Table useTableRowExpansion: the chevron gutter's column header now carries a visually hidden localized name ("Row expansion", key `@astryx.tableRowExpansion.columnHeader`) instead of an empty `<th>` (axe empty-table-header, WCAG 1.3.1 best practice). The gutter stays visually blank (#5383).
- Table useTableRowStatus: the status gutter's column header now carries a visually hidden localized name ("Row status", key `@astryx.table.rowStatus.columnHeader`) instead of an empty `<th>` (axe empty-table-header, WCAG 1.3.1 best practice). The gutter stays visually blank (#4693).
- BottomSheet: a standalone sheet no longer dismisses when a CJK user presses Escape to cancel an in-progress IME composition. The browser fires that keydown before `compositionend`, so an Escape handler reading a bare `event.key` misread the composition cancel as a dismissal command and closed the sheet — losing whatever had been typed into a `purpose="form"` field inside it. The handler now early-returns on `isImeKeyEvent`, the same guard `Dialog` and `BottomSheetSwitcher` already carry, and claims the key first so the browser raises no close request of its own (#5322).
- `Breadcrumbs` marks the current item with semibold weight, not colour alone. The current crumb was distinguished only by `--color-text-primary` against its siblings' `--color-text-secondary`, which fails WCAG 1.4.1 (use of colour) and leaves the current position invisible to anyone who cannot separate the two tones (#4605, closes #4421).
- ButtonGroup: arrow keys pressed inside a member's open menu stay with that menu. A DropdownMenu renders its menu inline inside the group, so ArrowLeft and ArrowRight used to bubble to the group and move focus onto a sibling button while the menu was still open. The group's `elevation` is also reflected as `data-elevation` now, so a theme can target it (#5355).
- ButtonGroup is a single tab stop. Its members now share one roving tab stop instead of taking one each, so a three-button group costs one Tab press rather than three. Arrow keys move between members along the orientation (flipped in RTL), Home/End jump to the ends, focus wraps, and disabled members are skipped. Two consequences worth knowing: a keyboard script or test that tabbed through a group member by member must use arrow keys now, and a member rendered as a link (`href`) joins the arrow order for the first time. (#5389)
- Calendar (and DateInput, DateRangeInput, DateTimeInput) now opens on a month inside the min/max window instead of on today
  With no `focusDate` and no selected value, the calendar opened on today's month even when `min`/`max` excluded it — a 2019 audit window or a booking window that opens next spring rendered a grid where every day was disabled, and the only way in was clicking the prev/next arrows once per month.

  The initial month is now today clamped into the window: today when it is inside, otherwise whichever bound is nearest. An explicit `focusDate` or a selected value still wins, so nothing changes for callers that already say where to look. With `numberOfMonths={2}` a past window lands `max` in the right-hand pane, so neither pane is entirely out of bounds (#5306).

- DateInput: clearing on touch no longer jumps the page to the top
  On the touch surface, tapping the clear (✕) threw the user to the top of the page. Clearing unmounts the clear button, and `handleClear` focused the field in that same task — on iOS Safari, focusing an element as the focused button is removed scrolls the whole document to 0. The focus handoff is now deferred past the unmount, which keeps the page where it was and still returns focus to the field.

  Measured on the iOS 26 simulator against the live docsite (DateInput — Clearable, page at scrollY 2055): synchronous focus → 0, deferred focus → 2055. `preventScroll` alone does not fix it; it is kept for the ordinary scroll-into-view nudge, which is unwanted for the same reason (#5350).

- Clamp standard Dialog width to dynamic viewport space with token gutters, add safe-area/fullscreen sizing and fade-only fullscreen motion updates, add opt-in adaptive Dialog/BottomSheet recipes, and add explicit presentation comparison stories (#5352).
- DropdownMenu: move the `dropdown-menu-indicator-icon` theme target onto the Icon element itself so a theme can restyle the submenu chevron's size and color directly.
  The loading branch no longer carries the target — its `Spinner` has its own `astryx-spinner` target, matching Selector, MultiSelector and ComplexSelector (#4743).
- Chat: a token in a message bubble now sits on the line the way it does in the composer. `ChatTokenizedText` wraps each token in the same `inline-flex` / `vertical-align: middle` box `ChatComposerInput` uses, so a chip stops lifting off the text the moment the message is sent. Follows #5324, which fixed the composer half (#5402).
- Chat: composer tokens no longer sit above surrounding text — `vertical-align` changed from `baseline` to `middle`, and `ChatComposerTokenElement` now uses a StyleX class instead of an inline style so consumers can override alignment without `!important` (#5324).
- useFocusTrap: Tab is only cancelled when focus is actually inside the trapped container. An open layer whose focus legitimately sits outside it — a listbox popup anchored to its own input, as in DateTimeInput, Typeahead, Selector and MultiSelector — no longer swallows Tab for the whole page, so keyboard users move to the next control on the first press. A trapped surface with no tabbable controls and focus on a `tabIndex={-1}` panel still keeps Tab inside it (#5397).
- `mod` hotkeys and `Kbd` resolve to Cmd on macOS again when client hints report a blank platform
  `useHotkeys` and `Kbd` both prefer `navigator.userAgentData.platform` and fall back to `navigator.platform`, but guarded the preference with `'platform' in uaData`, which is true whenever the key exists at all. A build reporting `platform: ''` therefore committed to the client-hints branch and got `false` without ever reaching the fallback, so on macOS every `mod` combo listened for Ctrl and every `<Kbd>` drew Ctrl. Electron and other embedders that rewrite the app's user-agent identity ship exactly that. A blank platform is now treated as unknown and falls through (#5325).
- Markdown streaming: `parseMarkdownIncremental` no longer throws away its settled blocks while a code fence is open, or when a chunk happens to end on a newline — both re-parsed the whole document, so a long streamed response got slower the longer it grew. Blocks rebuilt across a streamed 500-paragraph document: 126,756 → 1,869 (#5407).
- Migrate core components from inline mergeRefs calls to stable useMergedRefs callbacks (#5267).
- PowerSearch now applies `menuWidth` to the initial field and search menu without letting it shrink below the input width. Value menus shown after selecting a field are unchanged. (#5237)
- PowerSearch: `maxOperatorMenuItems` now caps suggestions in string, string-list, and entity-list value typeaheads, including values inside nested filters (#5242).
- PowerSearch: the edit popover now fits narrow viewports — its 400px minimum width yields to the screen width, and the filter row wraps instead of overflowing when long translated operator labels don't fit. An editor anchored near the screen edge now stays on its own side at the width available there, wrapping internally, instead of flipping across the anchor to keep 400px (#4768).
- PowerSearch now groups fields in the browsing menu using each field's `group` value. Ungrouped fields appear first, while typed search results remain flat. (#5235)
- PowerSearch now shows up to 1,000 configured fields when the search box is empty, instead of stopping at 10. Typed searches still show 10 ranked results by default; use `maxSearchResults` to change only that limit. (#5233)
- `Selector` and `MultiSelector` no longer expose their `{type: 'divider'}` separators to assistive technology. `role="listbox"` only permits `option`/`group` children, but the divider previously rendered `role="separator"` as a direct child of the listbox (axe `aria-required-children`, impact critical). The divider is decorative and carries no information the options don't, so it's now hidden from the accessibility tree via `aria-hidden`, matching the pattern already used for section headings (#5107).
- Keep merged refs stable across Avatar, Button, SideNav, TabList, and TopNav (#5429).
- Add useMergedRefs and keep Text and Heading refs stable across rerenders (#5266).
- Table: a plugin can suppress a body cell's content, and grouped rows use it to keep synthetic group headers out of your cell renderers (#5363)
  `useTableGroupedRows` injects section-header rows into the flattened data, and `BaseTable` evaluates every column's `renderCell` against every row. A renderer that keys a lookup off a field — `STATUS_META[item.status].dot` — was therefore handed a row that is not yours and threw, blanking the page the moment grouping was switched on. The header Proxy answering unknown fields with `''` only ever rescued a renderer that _prints_ a field; `''` fails a lookup exactly as `undefined` does.

  `BodyCellRenderProps` gains `isContentSuppressed?: boolean`. A plugin sets it in `transformBodyCell` for a row whose cells it is about to replace wholesale in `transformBodyRow`, and the table renders that cell empty without calling the column's renderer or the default one. It is decided per cell at render time against the final column list, so it also covers columns other plugins contributed — whatever order the plugins were listed in.

- TimeInput parses compact AM/PM values correctly (#4026)
- Typeahead: Tab out of the field now moves focus to the next control. The result list is dismissed on the Tab keydown rather than from the blur that press produces — hiding a top-layer popover during the focusout makes Chrome abandon the in-flight focus move and drop focus to `<body>`, so the press appeared to do nothing. Selector and MultiSelector already dismissed on the keydown (#5400).

#### Documentation

- document missing API contract props across Button, Toast, ContextMenu, MoreMenu, Selector, Link, and Dialog (#4315, part of #4163)
- document missing props across complex components (MultiSelector, Tokenizer, PowerSearch, Typeahead, Layout, DropdownMenu, HoverCard, Tooltip, Link, Lightbox) (#4316, part of #4163)
- document the missing components prop on Markdown (#4319, part of #4163)
- document labelID and isGroupLabel props in Field (#4320, part of #4163)
- document missing props across structural components (CodeBlock, Toolbar) (#4317, part of #4163)
- Table: document the section components children mode requires
  Children mode stopped wrapping children in a `<tbody>` in #2098, but the docs still described the contract from before it. The `children` prop read "render TableRow/TableCell directly"; `TableRow`'s own `@example` showed a row sitting in `<Table>` with no section around it; and `TableHeader`, `TableBody`, and `TableFooter` — public exports since that change — had no docs at all and were missing from `Table`'s component list. A reader following the component's own documentation wrote `<table><tr>`, which is invalid HTML and mismatches on hydration.

  The three section components are now documented, listed on `Table`, and named in the `children` prop description, in a best practice, and in `TableRow`'s example (#5278).

#### Other Changes

- `align?: 'top' | 'bottom'` (default `'bottom'`). `'bottom'` keeps the
  existing behavior: a flex spacer fills free space so a short conversation sits just above the composer. `'top'` omits the spacer so messages start at the top and grow downward — better for log-style or document-style lists.
- Only changes the resting position of a non-full list. Once messages overflow
  the container the spacer collapses to zero in both modes, so ChatLayout auto-scroll-to-bottom behavior is unchanged.
- Spinner: the ring is drawn in SVG instead of `<canvas>`. The arc and track take their colours from the cascade (`currentColor` for `shade="inherit"`), so nothing resolves a colour in JS: a colour change after mount now repaints the ring instead of leaving it stale until it remounts, and mounting spinners no longer costs a `getComputedStyle` each. Rings are pinned to the document timeline's origin, so spinners mounted at different times turn in phase. No API, geometry or theme-target change (#5408).

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @Astro-Han
- @athz
- @cixzhang
- @ernestt
- @freddymeta
- @gonzoblasco
- @HelloOjasMutreja
- @imdreamrunner
- @jiunshinn
- @Kevinjohn
- @lexs
- @nynexman4464
- @rubyycheung

---

# 0.4.7

#### Fixes

- BottomSheet: a non-modal sheet now colours the iOS 26 Safari toolbar strip with its own surface instead of letting the page show through behind the address bar (#5342).
- BottomSheet: a tap inside the sheet is a tap, and the sheet leaves on an exit curve (#5326).
  Two defects, both of which read as "the sheet closes with no animation" — reported against the touch DateInput picker, which is a Bottom Sheet.

  **A tap inside the sheet started a one-pixel drag.** The sheet body carries the pull-to-dismiss handlers, and they promoted to a sheet drag on _any_ downward movement. A finger is never still, so the pixel or two a tap drifts began a drag — and a live drag suppresses the panel's transition, correctly, because a dragged sheet must track the finger rather than lag it. The close that the tap triggered landed inside that window, so the sheet jumped to its closed position with no transition. Tapping the picker's Save button hit this every time; tapping the scrim never did, because the scrim is the dialog itself and arms no gesture. Promotion now needs 8px of travel — the conventional tap slop, well under what a deliberate pull covers in its first frames — in both the pointer and touch paths. The gesture's transition suppression is also scoped to a sheet that is open, so it cannot straddle an exit.

  **The exit ran on the entrance's curve.** `--ease-standard` is `cubic-bezier(0.24, 1, 0.4, 1)`, a decelerate curve: it spends its speed immediately and coasts. Right for an entrance, wrong for an exit. Measured on device (iPhone, real Safari), a scrim tap put the sheet half off-screen in 59ms of the 410ms transition and 90% off in 163ms, with the dim gone before it — so the close was over before the eye could follow it. The closing state now carries an accelerating curve of its own, `cubic-bezier(0.3, 0, 0.6, 0.6)`: away from rest, gathering speed, quickest as it leaves the screen, and moving within ~50ms so it reads as one departure rather than a hesitation and a snap. Only the curve changes — the exit keeps `--duration-medium`, the entrance's band, which is what keeps it legible under a theme that scales the motion scale down (neutral's medium is 300ms against the base 410ms).

  The scrim leaves with the sheet: while closing, the dim runs `linear` rather than the decelerate token. A fade covers no distance, so front-loading its progress just ends it early — the reasoning the touch date picker's surface swap already carries. `BottomSheetSwitcher` gets the same treatment when its flow closes; a handoff between two sheets is not a close and is unchanged.

- `useListFocus` no longer swallows Escape when no `onEscape` was supplied. The hook called `preventDefault()` on every Escape — a habit inherited from the arrow keys, which share the handler and need it to suppress page scroll — so a list with nothing to dismiss still marked the key handled, and a surrounding layer that defers to `defaultPrevented` (a focus trap, a native popover) never got its turn. Escape is now consumed only when an `onEscape` is passed. Arrow, Home and End handling is unchanged (#5346).
  Behaviour change: `AvatarGroup`, `ButtonGroup`, `Outline`, `Pagination`, `SegmentedControl`, `TabList` and `Toolbar` pass no `onEscape`, so an Escape pressed inside one of them now reaches the surrounding layer and can dismiss it — the point of the fix, but a host that counted on the key stopping there will notice. `NavHeadingMenu` does the same when it renders without a menu close handler. Menus and flyouts that do pass `onEscape` are unaffected. `patch`, not `[breaking]`: the swallowing was never a contract — the hook documented Escape only as "custom callback", and no component advertised consuming the key.
- TabList: the selected tab now carries `aria-current="true"` — ARIA's generic "current item within a set" — instead of `aria-current="page"`. The strip is a `<nav>` and stays one, but it is used to switch views in place at least as often as it is used to navigate, and on those uses `page` asserted a page change that never happened. Assistive tech announced the selected tab as the _current page_ even when nothing had navigated; it now announces it as the _current item_, which is true either way. A tab given an `href` still renders an anchor and still reads as a link — its current marker is just less specific than it was. No role changes and no new props. (#5347)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @imdreamrunner

---

# 0.4.6

#### New Features

- DateInput fits the pointer: a touch picker on a finger, the text field
  on a mouse (#5243)

  `DateInput` has always been a control for a mouse — a field you type into with a calendar in a popover beside it. On a phone or a tablet that is the wrong shape: the popover is a desktop calendar operated by thumb, and focusing the field summons a keyboard that covers the thing it is meant to fill in.

  The same component now renders a second surface where the primary pointer is a finger (`pointer: coarse`): a bottom sheet holding one month per screen, swiped sideways, with month and year wheels behind the header title for the far jumps swiping is bad at, arrows in the header corner for a single step, and every target floored at 44px. A day commits the moment it is tapped and leaves the sheet up, so a mistake can be corrected in place; Save closes the picker, and Reset puts it back to how it opened — no date, current month. The grid spills adjacent-month days, muted and unselectable, and the weekday header is three letters rather than two, both as the desktop calendar has them.

  The month and year wheels are one layer that fades in and out on top of the calendar. The calendar itself never fades — it is covered and uncovered, so the only thing moving is the thing arriving. The layer carries an opaque background of its own, which is what makes the fade uniform: it renders as a finished image and the fade applies to the image, rather than the wheels' translucent selection band compositing against a live grid on its own terms.

  Nothing changes at the call site. It is one component with two surfaces, not two components — same props, same values, no new import, no media query to write. Existing usage is untouched: with a mouse the rendered output is the control that was always there.

  The switch is the pointer alone, deliberately with no width bound. `pointer` means the PRIMARY device, so a touchscreen laptop reports `fine` and keeps the typable field (its keyboard is right there), while a narrowed desktop window is still a mouse. Adding a width test would only re-exclude tablets, which are the clearest case for a thumb picker.

  The public surface barely moves: six `@astryx.dateInput.*` catalog keys for the picker's header and footer, and nothing else. No new props, no new exports — `DateInputProps` is byte-identical at 25.

  Nothing else is published, on purpose. There is no export that forces a surface: the touch picker is reachable by being on a touch device, which is the only place it is worth looking at. The media query the switch runs on is an internal constant, not an export — six other core components write `@media (pointer: coarse)` inline rather than sharing one, and nothing has asked to ask the same question. The picker's two sizes (the 44px day cell, the 28px wheel row) are compile-time constants rather than theme variables — the day size is an accessibility floor, and a variable a theme can quietly lower is not a floor. And the sheet's header button is addressed by a `data-` attribute rather than a theme target, because nothing has asked to restyle it. Each of those is additive later and awkward to withdraw once shipped.

  The wheels also answer a mouse now. A wheel is a scroll container, so a finger pans it for free; a mouse got nothing, because browsers do not drag-scroll an overflow container — pressing and pulling on the one control shaped like a thing you spin did nothing at all. Dragging with a mouse works, and fixes a related bug on the way: BottomSheet begins its own drag from a `pointerdown` on its body and captures the pointer for it, so a click on a wheel row that wobbled more than a pixel or two used to select nothing.

- Export `useLocale` and `useCollator` for provider-backed formatting and comparison (#5194)
- RadioListItem: the `radio-list-item` row theme target now carries `size`, `selected`, and `disabled` state variants (matching `multi-selector-option`), so themes can style selected or disabled rows (#5143).
- RadioListItem: the `radio-list-item` theme target now rides the painting row element (converging with `list-item`), so a theme can style the row's hover background, padding, and border radius — previously it sat on a layout-only wrapper that painted nothing. The default (unthemed) row appearance is unchanged: it stays a bare surface with no row padding, radius, or hover/selected background (only the radio indicator tints on hover) (#5143).
- `Section`, `Stack` (with `HStack` / `VStack`) and `Center` accept a padding prop for each of the four edges — `paddingBlockStart`, `paddingBlockEnd`, `paddingInlineStart` and `paddingInlineEnd` — so an edge can take its own spacing step without an `xstyle` escape hatch. `Section` also gains the `paddingInline` axis prop it was missing, so all three components now expose the same seven-prop set (#5224).
  Each prop takes the same spacing scale as `padding`, and resolution is most-specific-wins, per edge:

  > edge prop → axis prop (`paddingInline` / `paddingBlock`) → `padding`

  An edge prop changes its own edge and leaves the other three alone.

  ```tsx
  <Section padding={6} paddingBlockStart={2}>…</Section>   // tight top, 24px elsewhere
  <Stack padding={4} paddingInlineEnd={0}>…</Stack>         // flush trailing edge
  ```

  The inline props are logical, so `paddingInlineStart` is the left edge in LTR and the right edge in RTL.

  On `Section` the matching `--container-padding-*` custom property moves with the prop, so bleed children (`Table`, `Divider`, a nested `Section`) keep compensating against the padding actually applied.

  Existing code is unaffected: `padding`, `paddingInline` and `paddingBlock` behave exactly as before, and their generated class output is unchanged.

- Selector: add the `selector-option-row` theme target on the dropdown option row, carrying `size` plus `selected`/`disabled` state — so a theme can restyle row padding and density directly (mirroring `multi-selector-option`), instead of reaching the bare `role="option"` element with a structural selector (#5179).
- MediaTheme: add `mode="auto"` and `mode="off"` (#5299)
  A theme is free to define `--color-background-inverted` as something that is not inverted — and a component that hardcodes `mode="dark"` then paints white text on pale grey at 1.25:1. The surface color is a runtime value and the mode was a compile-time guess, so no amount of care in the component could catch it.

  `mode="auto"` measures the surface the browser actually painted and applies whichever of the theme's own `--color-on-dark` / `--color-on-light` reads better on it. There is no threshold and no contrast target: it picks between the theme's two answers, so a theme that wants a soft pairing still gets one. Deciding a surface needs _no_ media context stays an authoring choice — that is the new `mode="off"`, which renders the same element without the media attribute so children never remount.

  When the backdrop is not knowable from CSS — during SSR, on the first client frame, and most often behind a `background-image`, whose pixels need sampling (see `useImageMode`) rather than a computed style — `auto` uses the new `fallback` prop instead of guessing.

  Toast now uses `mode="auto"`, with its previous rule kept only as that fallback. Every stock Astryx surface renders exactly as before.

- Tooltip and HoverCard: tap to open where there is no hover (#5248)
  Hover is the one trigger a touch screen cannot express, and both components were answering that badly. `Tooltip` suppressed itself on any device reporting `(hover: none)`, so its content — often the only label an icon button has — was simply unreachable on a phone. `HoverCard` did nothing at all: the `mouseenter` a tap synthesizes opened the card on every tap of its trigger, over the control the user was aiming at, with no gesture that closed it again.

  Both now take a `touchTrigger` prop, and what the trigger DOES decides the default. A trigger that performs an action — a button, a link, a form control — keeps its tap under `auto`: the layer stays shut, because the tap already has somewhere to go and a hint about a control the user just operated is noise. A trigger that performs no action — an info icon, an abbreviation, a truncated label — has nothing to lose, so the tap opens the layer, with no show delay (a tap is a decision, not the hover intent the delay exists to filter) and a tap outside to dismiss it. `tap` and `none` state the choice outright; `tap` is what an info icon rendered as a button wants, since it looks like an action to the DOM while revealing the layer is the only thing it does.

  Hover-capable devices are unaffected, hybrid ones included: the decision is made per interaction from the pointer type rather than once per device from a media query, so the same trigger opens on hover under a mouse and on tap under a finger. A stylus is a hover device by the same rule — a pen in detection range fires hover events with nothing in contact, so it opens the layer on hover, and only a pen that lands counts as a tap. Neither layer opens from the focus a tap leaves behind any more — the second way a tap could bury the control it activated, and on `Tooltip` it is the tapped text fields that were affected, since those match `:focus-visible` by design.

  [fix] InfoTip (lab): opts into `touchTrigger="tap"`. Its trigger is a real button, so the `auto` rule would hand the tap to the control — but revealing the tooltip is that button's only purpose, and suppressing it left an InfoTip's content unreachable on a phone.

#### Fixes

- Avatar: a status element now reports its own accessible label to the avatar through context, so wrapping `AvatarStatusDot` in a component of your own keeps the status in the avatar's accessible name ("Jane Doe, Online") instead of silently dropping it — the `role="img"` root prunes descendant semantics, so composing it in is the only route to assistive tech (WCAG 4.1.2). Reading `label` off a directly-passed element still works and still resolves on the first render. An interactive avatar (`href`/`onClick`) with no `name`/`alt` warns in development, and a status label no longer counts as the control's identity: "Online" reads as a legitimate name while saying nothing about where the link goes. Derived `role`/`aria-label`/`aria-hidden` now spread before the passthrough props, following Icon, so a consumer's own values win. No API change (#5034)
- AvatarGroup: four defects out of the component audit, three of them in `AvatarGroupOverflow` (#5055).
  The indicator was `display: flex` on a span, which is a block-level flex container, so the exported component rendered as a full-width bar instead of a circle anywhere outside an `AvatarGroup`: measured 1168px wide in a 1168px parent. It is `inline-flex` now; inside a group nothing changes, because a flex item is blockified either way.

  Its label font size was a bare `size * 0.35`, which computes 7px at `xsm` and 8.4px at `sm`. That is under the 12px legibility floor, and the effect is worse than the number suggests: the glyph stroke ends up thinner than a pixel, so it never reaches its own text colour. Decoded from a screenshot, the darkest pixel at `xsm` is `#bebebe` on a `#f0f0f0` field, a contrast of 1.63:1 where 4.5:1 is required. The size now floors at the `--text-supporting-size` role token and scales proportionally above it, so `md` and larger are unchanged.

  The indicator also kept its negative overlap margin when it was the first child of a group, hanging 12px outside the group's own box. It now carries the same `:not(:first-child)` guard `Avatar` already had. And a negative `count` rendered the string `+-3` and announced "-3 more"; since the documented shape for the prop is `total - visibleCount`, which goes negative whenever the list is shorter than the slice, it now clamps at zero.

  Docs: the guidance told readers to "set max to limit visible avatars", and there is no `max` prop. The API is compositional on purpose, so the consumer slices; the guidance now says that. The keyboard behaviour names the APG roving tabindex technique it implements, and `size` now says that the group's value wins over each child avatar's own `size`, including when the group leaves it at the default.

- Blockquote: the `cite` attribution renders as a bare `<cite>` instead of being wrapped in a `<footer>`, which was becoming a `contentinfo` document landmark. Also guards the slot with `isRenderable`, so `cite={condition && author}` no longer emits an empty `<cite>`, and wraps long unbroken words instead of overflowing (#5144).
- Bottom Sheet: float the grab handle so content sits closer to the top (#5222)
  The drag area above the sheet's content was a 48px row in the sheet's flex column, pushing everything below it down by its full height and reading as an empty band above the first line of content.

  The bar is now 24px and floats over the content: the scrolling area starts at the sheet's top edge and rides up under the pill, so a heading sits 24px closer to the top. The pill is 4px tall centered in the band, so it occupies only 10-14px from the edge — inside the top padding a content wrapper already provides — and a surface gradient behind it keeps it legible over whatever sits or scrolls beneath.

- BottomSheet: give the sheet one uniform edge against the scrim. Two things were wrong in dark mode. The sheet drew no edge of its own — surface and scrim sit a few RGB steps apart and the `--shadow-high` drop shadow is black on near-black, so the left and right edges were invisible (measured 1.16:1 boundary contrast in dark against 2.89:1 in light); it now carries a `--border-width` / `--color-border` hairline on its three scrim-facing edges, the same treatment MobileNav gives its scrim-facing edge. And under a theme that packs an inset ring into `--shadow-high` (every bundled theme adds one in dark mode) that ring was painted over by an opaque content wrapper such as `Section`, so it showed only in the gap below where the content ended and the side edges appeared to change width partway down; the scrolling body now paints the surface across the sheet's whole inner box, hiding the ring evenly (#5305).
- Breadcrumbs: button crumbs keep the link's vertical padding, the variant reaches the item theme targets, and interactive crumbs paint the shared focus ring (#5332)
- DateInput's touch calendar no longer rests between two months (#5319)
  Swiping the month calendar on iOS could leave it parked a couple of columns into a pane: the left of March and the right of April on screen at once, under one square Sun-to-Sat header, with the title still naming March. The grid was never skewed — the scrollport was simply at rest where no month begins.

  `scroll-snap-type: mandatory` is supposed to make that impossible, and on a static list it does. This list is virtualized: seven panes exist out of twelve hundred, and the panes ARE the snap areas, so every month the finger crosses mounts one and unmounts another while the fling is still running. iOS scrolls off the main thread — it picks a landing place from the snap points it knows about at that moment, and a React re-render that lands after the decision moves them. The scroller stops where a snap point used to be and nothing re-snaps it. Chrome never showed it because it snaps again after the mutation.

  The rest position is now corrected rather than trusted: once the gesture is genuinely over — touch released, the scroller quiet, AND its offset confirmed unchanged across a frame — a scroller that is off a pane boundary is moved to the nearest one. A scroller the browser snapped for itself is left alone, so nothing extra happens on Chrome, and sub-pixel drift on a fractional viewport is ignored.

  That last condition is what keeps the fix from becoming a worse bug than the one it fixes. A quiet period is not proof of rest: iOS runs its own snap animation for a few hundred milliseconds after the finger lifts and fires scroll events irregularly while it does, so a correction that trusts quiet alone can land mid-animation, round an offset still travelling toward next month back to the month it came from, and reverse the swipe.

- A disabled element answers the pointer with `default`, never an interactive cursor. Every `cursor` in core and lab carries `':is(:disabled,[aria-disabled="true"])': 'default'`, and the reset gives the same cursor to any disabled element that declares none — `[aria-disabled]` included, which previously got nothing. A lint rule and a Chromium sweep over every story keep it that way. Disabled elements sealed behind `pointer-events: none` are unchanged: the pointer never reaches them, so their cursor comes from an ancestor — which is why the guarantee is `default` rather than a distinct disabled cursor the library could only paint on some of them (#5323).
- Disabled elements no longer paint a hover state: every self-`:hover` in core and lab, and every `:hover` a theme authors, now carries the zero-specificity guard `:hover:where(:not(:disabled,[aria-disabled="true"]))`, so existing overrides weigh exactly what they weighed before. A lint rule and a Chromium sweep over every story keep it that way (#5247).
- InputClearButton: the clear (✕) affordance now meets the WCAG 2.5.8 AA 24×24 minimum on touch. The shared button rendered a 20px glyph with a 20px tap target, so every input that clears through it — Typeahead, Tokenizer, FileInput and the rest of the family — was under the floor on a phone. An `::after` overlay now expands the tappable region to 24×24, gated behind `@media (pointer: coarse)`: on a fine pointer the overlay is not generated at all, because a mouse is precise enough, an unconditional overlay could overlap neighboring controls in dense desktop layouts, and an overlay covering the button would take hover away from the `astryx-input-clear-icon` theme target. The visual glyph is unchanged at every breakpoint, and the overlay stops at 24px so it stays clear of the 8px adornment gap and the input's own caret area (#4956).
- MobileNav: the drawer now slides in when it opens, instead of only sliding out when it closes. Two things were needed, and each is useless without the other. First, the dialog is `display: none` while closed, so the drawer's first rendered frame already holds the on-screen transform and a transition has no before-change value to run from — `@starting-style` supplies it, for the drawer's transform and for the `::backdrop`'s opacity. Second, the dialog clipped the off-screen drawer with `overflow: hidden`, which makes it a scroll container; a scroll container in the top layer whose subtree holds another scroller (the drawer's content area) does not paint a `@starting-style` entry transition for its descendants in Chromium — the transition ticks in the CSSOM while every painted frame shows the end value. `overflow: clip` clips identically without creating a scroll container. The drawer now slides in from its own edge (mirrored under RTL) and the scrim fades up, both on `--duration-medium` and both collapsing under `prefers-reduced-motion`, exactly as the close already did (#5218).
- NumberInput: the number-stepper column now tracks a themed padding and radius instead of assuming the defaults. Theming `number-input` padding left the steppers short of the field edges (a gap top and bottom), and a themed `borderRadius` rounded the field while the stepper corners kept the default radius. The wrapper's padding now goes through the shared container expansion, so it is picked up from any spelling a theme writes it in — `padding: 14px 20px`, `paddingBlock`, or a single `paddingBlockStart` — and both the wrapper and the column read the resulting per-side `--astryx-number-input-padding-*` tokens; an asymmetric `paddingBlock: 4px 12px` is cancelled correctly at each edge. A themed `number-input` borderRadius now also reaches `--_field-radius`, which the column's outer corners follow. Byte-identical by default, and inert for the no-stepper case and every other input (#5181).
- Stop the container padding system at every overlay boundary. Follow-up to #5209, which zeroed `--container-padding-*` on four overlay roots and closed the visible overflow in #5208 (#5231).
  Two gaps remained. The variables descendants ADD (`--layout-padding-*`, and a Section's propagated padding) still crossed the boundary, so an unpadded `Section` inside an overlay took the page's padding instead of the theme default — 40px where 16px was meant. And `Lightbox`, `ContextMenu` and `HoverCard` were never covered.

  The reset now lives in one place (`overlayPaddingReset`, exported from `@astryxdesign/core/Layout`) instead of being hand-copied per overlay, and moved onto the `useLayer` root, which covers every layer surface at once. Values descendants subtract are zeroed; values they add are cleared to `initial` so readers fall through to their own default rather than losing their padding.

  Section's padding propagation moved from the public `--astryx-section-padding` token to a private `--_section-padding-propagated`. The two carried different authority under one name — a theme's value versus one ancestor's — and an overlay could not drop the inherited one without blanking the theme's. Propagated values still win over the theme for nested sections, so behavior is unchanged. Themes are unaffected: `--astryx-section-padding` remains the public token and still reaches inside overlays.

- Theming: a physical `paddingTop`/`paddingBottom` now reaches the container padding expansion, so `card`, `dialog`, `section` and `number-input` track it the way they already track the logical spellings. A physical block longhand matched none of the padding property names the expansion recognizes, so it landed raw on the element while the component's internals kept reading the default — the NumberInput stepper column came up ~10px short of the field edges, and container bleed compensated by the wrong amount. Mixing spellings was worse than either alone: `padding: '10px'` plus `paddingTop: '14px'` published 10px in the tokens while the element painted 14px on top. `padding-top` and `padding-bottom` ARE the block edges in every horizontal writing mode, so this normalization assumes no direction. `paddingLeft`/`paddingRight` are deliberately unchanged: they are direction-relative — left is inline-start in LTR and inline-end in RTL — and the tokens are consumed by logical properties, so routing them would silently move the padding to the opposite edge under RTL. They keep their physical meaning, exactly as before (#5244).
- `DateInput`, `DateTimeInput`, `DateRangeInput`, and `Calendar` now format and parse dates using the ambient `InternationalizationProvider` locale instead of the host/browser locale. `plainDateFormat` (backing `formatSharedDate`) previously called `Intl.DateTimeFormat(undefined, ...)`, and `dateParser`'s day/month disambiguation heuristic for ambiguous numeric input (e.g. `3/4/2026`) called `Intl.DateTimeFormat()` with no locale at all, so a tree wrapped in a non-English `locale` still formatted and parsed dates using the host locale (#5120).
- Use the InternationalizationProvider locale for sorting, formatting, and speech defaults (#5195)
- RadioListItem: the whole row is now a click target. Clicking the description — or the empty space in a row's hover area — selects the radio, matching CheckboxListItem. Previously only the radio and its label text responded, so the description and surrounding row were dead space. The row delegates surface clicks to the radio input (one tab stop per option preserved), and the radio keeps its accessible name via `aria-label` (#5143).
- Reset container padding custom properties on overlay elements (`BottomSheet`, `Dialog`, `MobileNav`, `Popover`) to prevent nested `Section` components from inheriting ancestor section padding (#5209).
- ResizeHandle: dragging the lower half of a tall handle works again. The invisible grab zone is stretched along the handle, but the offset that biases it onto the pill also carried the pill's own `-50%` centering shift — so the zone slid half the handle's length off the divider. On a full-height panel at 1440x900 the 16x900 hit box sat at y=-434, leaving everything below the pill's centre dead: a pointerdown on the visible grip's centre, or anywhere lower, started no drag at all. The dead region grew with the panel, and the same shift stranded the grab zone sideways on vertical handles. The bias now moves the zone along the pill's axis only (#5198).
- Opening a Dialog, BottomSheet, Lightbox, or MobileNav no longer shifts the page sideways when the browser has a classic scrollbar (#5219)
  Locking background scroll hides the document's scrollbar. Where that scrollbar takes layout space — Windows/Linux desktop, and macOS set to always show scroll bars — hiding it widened the layout viewport by its width (~15px), so the whole page reflowed sideways behind the overlay and back again on close.

  Both scroll locks now hold that gutter open with `scrollbar-gutter: stable` for the duration of the lock, which keeps `position: fixed` chrome (sticky headers, toast viewports) still as well as in-flow content. Pages with no space-taking scrollbar, and pages that already set `scrollbar-gutter` themselves, are left alone. Engines without `scrollbar-gutter` support fall back to padding the measured difference.

- SegmentedControl: keep item labels on a single line, truncating overflow with an ellipsis instead of wrapping to multiple lines (#5035)
- Selector: `SelectorOptionData` gains `description`, and the closed trigger now shows the selected option instead of just its label. The two-line option row `SelectorOption` draws was unreachable from the `options` prop — the data type carried only `value/label/disabled/icon` — so consumers kept a side map of descriptions keyed by value and re-rendered the row through `renderOption`. `description` now sits on the option data and `DefaultOption` forwards it. On the trigger, the selected option's own `icon` renders in the closed state (`startIcon` still wins when set, so a pinned field icon never doubles up), which retires the app-side `startIcon={value === 'x' ? … : …}` mirroring of state the component already knows. `renderValue` is the seam for drawing the selection yourself — the description included (#5202).
  [feat] Item: new `layout` prop — `'stacked'` (default, unchanged) or `'inline'`, which keeps the description on the label's line with the description ellipsizing first. The inline row centers its two lines rather than sharing a baseline: two font sizes on one baseline make a line box taller than either line, which would push a fixed-height host off its size token. Every row built on `Item` gets the axis, `SelectorOption` included.

  [fix] Selector: the trigger is sized by padding rather than a fixed height, so it is the `--size-element-*` token for a one-line value (28/32/36) and exactly one text line taller for a two-line one (48/52/56). The token and a text line are both multiples of 4, so every trigger lands on the 4px rhythm and lines up with the Buttons and inputs beside it — and no prop chooses the height, the content does. It previously swapped the fixed height for a minimum whenever `renderValue` was passed, keyed on the prop being present rather than on the content needing the room: a one-line value measured 39px and a two-line one 58px at _every_ size, so the `size` prop stopped affecting the trigger at all. Inside an `InputGroup`, where the group pins the row, the relaxed height did nothing and the content bled 4px through its own border. The group owns the row now and the trigger clamps its own value box to it, so nothing a caller draws can paint over the rows above and below: a `SelectorOption` folds onto one line and ellipsizes, and any other node is cut off at the row's edge. The trigger also stops asserting a height floor of its own there, so a control sized above its group — `<InputGroup size="md">` around a `size="lg"` control — sits in the group's row instead of growing it. The trigger's line box is pinned to that same token rather than a ratio, so the coarse-pointer font bump — and any theme that changes `--font-size-base` — grows the glyphs without moving the control off its size token.

- `Slider` with `orientation="vertical"` now gets the same 24px touch hit area the horizontal one got: its track was still only 20px wide on coarse pointers, under the WCAG 2.5.8 AA minimum. The whole track is the tap target for both orientations — the fix that floored the horizontal track's block size did nothing for vertical, whose short axis is the inline one — so the inline size is now floored to 24px on touch, with the same `@media (pointer: coarse)` gate. The rail, fill, marks and thumb all center on the inline 50%, so nothing visible moves and desktop is untouched (#5173).
- `@astryxdesign/core/theme/syntax` is importable from a server component again: the presets are data, not client references (#5076).
  The subpath's barrel carried `'use client'`, and it is the only entry point for the syntax module. React therefore replaced _every_ export with a client reference for a server importer — including `dracula`, `oneLight`, `allSyntaxPresets`, `syntaxTokenDefaults` and `defineSyntaxTheme`, none of which need a boundary. Reading a preset in a Next.js server module (deriving a code-block ground, emitting theme CSS at build time) got a proxy instead of data, so `preset.tokens` was `undefined` and the failure surfaced far from its cause — the same import under plain Node worked perfectly.

  The directive now sits only on `SyntaxTheme.tsx`, the provider that actually needs it, so `SyntaxTheme` and `useSyntaxTheme` keep their client boundary while the data exports resolve as data. No API change.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @ernestt
- @freddymeta
- @Geervan
- @HelloOjasMutreja
- @imdreamrunner
- @nynexman4464
- @rubyycheung

---

# 0.4.5

#### New Features

- BottomSheet: `snapPoints` makes the drag-to-resize stops the host's choice. A stop is the sheet's visible height, written as a viewport fraction (`0.5`), a percentage (`'50%'`), or a px length (`'320px'`) — matching `height`, where a bare number is also px and a string carries its unit. Fractions and percentages re-resolve when the viewport changes, so a sheet keeps the stop the user chose across a rotation, and swapping the points under a resting sheet re-anchors it the same way. A stop of a quarter of the sheet or less is a peek: it slides away rather than reflowing into a sliver, and thins the scrim. Taller stops are working surfaces, so they lay their content out and keep the scrim full — previously the shortest stop was always a peek, which would have thinned the backdrop of a half-height sheet (#5203).
  Behavior change, deliberate and not breaking: every sheet used to carry three built-in stops (14%, 50% and 92% of the viewport), so a drag could leave it resting somewhere the host never asked for. A sheet now opens and closes unless `snapPoints` says otherwise; pass `snapPoints={[0.14, 0.5, 0.92]}` to keep the old stops. No prop, type, or DOM output was removed or renamed, and swipe-to-dismiss, the height budgets, and mobile-keyboard accommodation are untouched.
- Astryx ships translations for 28 more locales. `packages/core/locales/` went from `en` and `fr-FR` to 30 files — Arabic, Catalan, Chinese (Simplified and Traditional), Czech, Danish, Dutch, Finnish, German, Greek, Hebrew, Hungarian, Italian, Japanese, Korean, Norwegian, Polish, Portuguese (Brazil and Portugal), Romanian, Russian, Serbian, Spanish, Swedish, Turkish, Ukrainian, Vietnamese and Afrikaans — covering every `@astryx.*` message the components announce or display (#5185).
  Nothing changes unless you ask for it: `InternationalizationProvider` still defaults to English, and the catalogs are loaded through the existing `./locales/*.json` export. An app that already passes a `locale` now gets translated component strings where it previously fell back to English.

  The catalogs come from Crowdin and are refreshed nightly (#5186), so a translation landing upstream reaches a release without anyone opening a PR by hand.

- DateRangeInput / Calendar: add `maxRangeSpan` and `minRangeSpan` to constrain the size of a selected range. Once a start date is picked, days outside the allowed window are disabled — e.g. `maxRangeSpan={7}` keeps the range within a 7-day window of the start (#5145).
- FormLayout: add `defaultOptionality` — set a form-wide default (`'optional'` or `'required'`) so only the exception carries a visible indicator. Under `'optional'` only `isRequired` fields show one; under `'required'` only `isOptional` fields do; a field that restates the default shows nothing. Under `'required'` the unmarked fields also expose `aria-required` so screen readers match what sighted users see — resolved on `aria-required` only, never the native `required` attribute. Unset keeps today's per-field behavior (#4791).
- Add `astryx-input-clear-button` theme target on the shared clear button wrapper. Themes can now control the clear button's height and hover independently of other ghost buttons — for example suppressing the hover fill or matching a different element size scale (#5093).

#### Fixes

- BottomSheet: a pull up from the scroll area now expands the sheet on iOS. Below the tallest detent, dragging up inside the content did nothing on a real device while the grab handle worked — the sheet took the gesture and then froze for the rest of the pull. iOS Safari raises PointerEvents for a finger under the same numeric id it puts in `Touch.identifier`, so the drag the touch path started was keyed to a live pointer: `beginDrag` captured that pointer, WebKit handed the capture straight back, and the `lostpointercapture` a millisecond later cancelled the drag. Touch-driven drags are now marked as such — they take no pointer capture, and `lostpointercapture`, `pointercancel` and `pointermove` for that same finger no longer cancel, end or double-drive them. Browsers that keep the two id spaces apart were never affected, which is why this only showed up on device (#5178).
- Calendar weekday headers now use compact CLDR stand-alone-short names for the selected locale, while preserving the existing `Su` / `Mo` / `Tu` English labels.
- Render generated id attributes on Markdown headings so Outline hash links scroll to their target. Heading slugs now come from parser helpers shared with parseOutlineFromMarkdown, and the components.heading override receives the generated id (#4765).
- StatusDot: add an `icon` prop for API parity with `AvatarStatusDot` — an optional ReactNode rendered centered in the 8px dot, painted from the dot's `currentColor` ink; booleans and empty renders are ignored so `cond && <Icon />` stays safe. Each variant now pairs its plate with a dedicated ink (`--color-on-*`, the Badge precedent) so a passed icon stays legible — notably the fixed dark on-warning ink on the yellow plate, where a light surface ink lands near 2:1. Per design review, the dot itself deliberately stays a plain colored signal: at 8px, built-in per-variant glyphs satisfy WCAG 1.4.1 on paper but are not genuinely readable, so making the status accessible in context (binary signal, visible label, `icon`, or an accessible alternative) is the builder's responsibility — see the StatusDot usage guidance (#4373).
- `Table`'s row-expansion chevron now mirrors correctly under RTL. It previously rotated on expand with no RTL handling at all, so the directional glyph pointed the same way regardless of text direction, matching the pattern already used by `TreeListItem`'s chevron (#5153).

#### Contributors

Thanks to everyone who contributed to this release:

- @athz
- @bhamodi
- @cixzhang
- @freddymeta
- @HelloOjasMutreja
- @imdreamrunner
- @jiunshinn
- @nynexman4464

---

# 0.4.4

#### New Components

- Promote `BottomSheet` and `BottomSheetSwitcher` from the canary-only Lab package to Core. The stable package now includes their existing native-dialog, drag-detent, transition, and mobile-keyboard behavior, plus Core documentation and examples (#5080).

#### New Features

- `astryx template --cdn` writes a working no-build-step CDN starter page (#5068).
  A CDN starter is a template, so it joins the template family beside `--skeleton` rather than claiming a top-level command. It is a flag and not the positional `astryx template cdn` because the positional resolves against everything `discoverAll()` finds, where a `cdn` id would shadow a discovered template. `cdn.template.html` loads Astryx from jsDelivr and esm.sh with no bundler, no install and no build step, with every CDN URL pinned to the Astryx version you have installed — an unpinned CDN URL resolves to whatever is latest and is cached hard, so a page written today breaks tomorrow without being edited. An existing file is never clobbered; `--overwrite` replaces it, and `--json` returns the receipt.

  The annotations are the things that are load-bearing and silent when missing: `?external=react,react-dom` (without it esm.sh bundles a second React and every hook throws `Cannot read properties of null (reading 'useState')`), `react/jsx-runtime` in the import map (the published bundle imports it; omitting it fails the page with `Failed to resolve module specifier`), and a `font-family` on `body` (nothing in the stylesheets sets a document font, so `Button` — which is `font: inherit` — otherwise renders its label in the browser's default serif).

  Three more lessons came out of building a real app on it. The page now `<link>`s the theme's webfont from Google Fonts, because the theme _names_ Figtree and never loads it, so every viewer silently got the fallback stack (#5015 again). It imports the theme OBJECT and wraps in `<Theme theme={neutralTheme} mode="system">`, so light and dark follow the OS — the `data-astryx-theme` attribute alone scopes the stylesheet but cannot switch modes. And `#root:empty` carries a "Loading…" state, because ESM-from-CDN has real latency and a blank page reads as broken. Markup is `htm`, with a comment saying it is optional and `createElement` is the dependency-free alternative.

  A recipe that is only read is a recipe that is only assumed to work, so CI renders it: `.github/scripts/cdn-template-smoke-test.mjs` scaffolds the page with the real CLI and opens it in headless Chromium, failing on any console error, page error or failed request, and on a page that loads without rendering.

- DateTimeInput: expose `date-time-input-toggle-icon` (calendar glyph, with open/closed `state`) and `date-time-input-clock-icon` (leading time glyph) theme targets, so a theme can size and color the leading icons — matching the `date-input-toggle-icon` seam DateInput already offers (#5148).
- `defineTheme`: `color.accent` accepts a `[light, dark]` tuple (#2279)
  `ColorScaleConfig.accent` now takes either a single hex or a `[light, dark]` tuple, matching `TokenValue`. With a tuple, `expandColorScale` derives the light half of every generated `light-dark()` pair from the light seed's palettes and the dark half from the dark seed's, so each scheme gets a consistent derived palette (muted, on-accent, neutrals) instead of the `tokens['--color-accent']` workaround that skips scale generation. Single-string configs are unchanged, token for token. Also documents the precedence between `color` and `tokens` for accent-derived values: `tokens` entries win token by token, the `var(--color-accent)` reference tokens follow a `--color-accent` override at runtime, and the baked `--color-on-accent` stays derived from the `color.accent` seed.

#### Fixes

- Banner: `endContent` wraps to its own row on a narrow header instead of squeezing the title to one word per line (#5116).
- BottomSheet: a swipe that scrolls to the end of the sheet's content and keeps pulling now expands the sheet, instead of stopping dead at the last line. The handoff used to be decided once, when the finger landed: a gesture that started mid-content stayed a scroll for its whole life, so the natural motion — swipe up through the list, reach the bottom, keep pulling — never reached the sheet. Reaching the end of the content is now enough. The sheet is anchored at the point where the content ran out, so only the travel past it moves the sheet, and the pull is left to the content when the finger comes back down or when there is no taller detent to expand into (#5172).
- BottomSheet: an upward pull at the bottom of scrolled content no longer hijacks the gesture when the sheet is already fully expanded. It used to hand off to a sheet drag with nowhere to expand to, producing a rubber-band the release threw straight back, and — because the handoff swallows the rest of the gesture — leaving the content unscrollable until the finger lifted, so dragging back down collapsed the sheet instead of scrolling. The bottom edge now hands off only when a taller detent exists (#5161).
- BottomSheet: a sheet resting at a detent now follows the viewport. Its detents were resolved to pixels at gesture time and never revisited, so rotating the device or resizing the window left the sheet frozen at the old geometry — a half-height sheet covering three quarters of a shorter window, and a peek detent whose slide-down could exceed the new viewport entirely, leaving a modal dialog on screen with no sheet in it. Snap fractions are also read from the layout viewport now, so the mobile keyboard no longer moves the detents out from under the sheet it is measuring (#5159).
- BottomSheet keeps the page still when the mobile keyboard reveals a field the browser focused itself (#5158)
- Screen-reader announcements are now localizable. MultiSelector, Selector, Typeahead, FileInput, Tokenizer, and Lightbox spoke several live-region messages in hardcoded English — selection and result counts, file selections, token add/remove, and gallery position — so they stayed English under an `InternationalizationProvider`. They now resolve through the message catalog like the rest of the UI, and the counts use ICU plurals instead of appending an English "s", so locales with other plural rules read correctly (#4920).
- The editable text fields in `Selector`, `MultiSelector`, `Typeahead`, `DateInput`, `DateTimeInput`, `TimeInput`, and `NumberInput` no longer misinterpret the keydown that commits or cancels an IME composition (Korean/Japanese/Chinese input) as a command. Previously a composing Enter would select/toggle the highlighted option or commit a typed date, a composing Escape would exit `Typeahead`'s edit mode, and a composing arrow would step a time or number value — all before the composition finished. Each field now lets the IME finish first, matching the guard already in place for `BaseTypeahead` and the Chat composer (#4908).
- MobileNav: keep the drawer rendered until the native dialog has actually closed (#4290)
  `display` was driven by the `isOpen` prop, which flips during the commit, while `dialog.close()` only ran afterwards from an effect — so every close called `close()` on a dialog that was already `display: none` but still open and still in the top layer, and an open modal dialog blocks the whole document whether or not it is rendered. Safari 26.1 never un-blocked it, leaving the page inert with no JavaScript error. `display` now takes part in the transition with `transition-behavior: allow-discrete`, including when React's `<Activity mode="hidden">` hides the drawer inside AppShell, and the unmount close moves into its own effect so the deferred close is no longer cut off by its own cleanup. The close delay is derived from the hold in effect rather than assumed, because that hold is `--duration-medium` — a theme value, which the shipped y2k theme sets to exactly the 250ms the delay used to hard-code.
- `Switch` with `isLabelHidden` no longer reserves the label gap. The hidden label is `sr-only`, but its wrapper stayed a flex item, so the row still painted the 8px gap beside it: the field box measured 8px wider than the track it contains, and a hidden-label switch stopped 8px inside the edge every neighbouring control lined up on. The gap now collapses with the label, so the field is exactly as wide as the painted track — matching `CheckboxInput`, which already did this (#5112).
- Inputs (`statusVariant="tooltip"`): the focusable status button now opens its tooltip on hover inside `TextArea`, whose absolutely-positioned trailing slot is `pointer-events: none`. Keyboard focus already worked; pointer hover did not (#5147).

#### Other Changes

- Clear the mechanically fixable ESLint suppressions from the Bottom Sheet promotion: `BottomSheet` and `BottomSheetSwitcher` now use the React 19 context APIs (`<Context>` as provider, `use()`), the panel drops its duplicate body-element ref in favor of the one the gesture hook already tracks, and `useSheetGestures` reads `prefers-reduced-motion` through the shared `useMediaQuery` subscription so an open sheet follows a preference change (#5155).
- Remove the UMD bundle — it could not work with any React this package supports (#5068).
  `dist/astryx.umd.js` is no longer built or published, and with it go the `unpkg` and `jsdelivr` package fields, the `./astryx.umd.js` export and the `build:umd` step.

  Nobody has a migration to make, because there was no working configuration to migrate from. The bundle binds Astryx to `window.React` and `window.ReactDOM`, and React 19 does not ship a build that defines them: "UMD builds removed: To load React 19 with a script tag, we recommend using an ESM-based CDN such as esm.sh." `https://unpkg.com/react@19.2.0/umd/react.production.min.js` is a 404 where 18.3.1 is a 200. Our `peerDependencies` are `react >= 19.0.0`, so every supported React is one without a global for the bundle to bind to — it documented a path that never had an entrance.

  If you were loading it with an older React anyway, load the same components as modules instead: an import map for `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client` and `@astryxdesign/core` (pinned, with `?external=react,react-dom`), then one `<script type="module">`. `astryx template --cdn` writes that page for you, pinned to your installed version and annotated; the recipe is also in the core README under "No build step (CDN)".

- `isImeKeyEvent` — the guard that stops an IME composition keystroke being read as a command — now lives at `@astryxdesign/core/utils` alongside the other pure helpers, with the reasoning for its two signals written down in one place. It stays exported from `@astryxdesign/core/hooks` for this release but is deprecated there: it is a plain predicate, not a hook, and that barrel is a `'use client'` boundary, so importing it from `hooks` pulls a server-safe function onto a client path. Move imports to `@astryxdesign/core/utils`; the `hooks` re-export will be removed in an upcoming major (#4907).

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @cixzhang
- @freddymeta
- @imdreamrunner
- @jiunshinn
- @nynexman4464

---

# 0.4.3

#### New Features

- New string utilities: `characterCount`, `firstCharacter`, and `truncateCharacters` — replacements for `.length`, `.charAt(0)`, and slice-based truncation that measure and cut user-visible strings by whole characters, so an emoji, flag, or accented letter counts as one and never gets split. Built on `Intl.Segmenter` with a code-point fallback.
- ComplexSelector: support ghost toolbar triggers, leading icons, popup alignment, and an imperative `handleRef` (open/close/toggle/isOpen) for programmatic control.
- `useContainerReveal`: two ways to control the reveal without reaching into the hook's private custom properties. `getContainerProps({hoverDelay})` gates the reveal on pointer dwell — the hover-intent idea Tooltip and HoverCard already have as `delay` — so a cursor sweeping down a list no longer lights up every row it grazes, and `getContainerProps({forceState})` pins the container's trigger state when something else owns the interaction (a scroll, a drag, an open row menu). Per element, `getContentRevealProps({forceVisibility})` pins how one child looks regardless of its container. Still CSS-only: no hover state in React, no re-render. Keyboard and touch are untouched — focus always reveals, `forceState: 'inactive'` and `forceVisibility: 'hidden'` both yield to `:focus-within`.

#### Fixes

- Banner: a dismissed banner no longer drops focus, a custom status no longer loses its ARIA role, and the info banner paints again under the neutral theme.
  Dismissing unmounted the focused dismiss button, so focus landed on `<body>` and a keyboard user lost their place in the page. Banner now records where focus entered from and returns it there, the same handoff `ToastViewport` makes for a dismissed toast. Measured in Chromium: `document.activeElement` was `BODY`, and is now the control the user tabbed in from.

  `BannerStatusMap` is documented as augmentable, but all four status lookups were closed `Record<BannerStatus, ...>` maps. Adding the augmentation the docs show produced four TypeScript errors inside `Banner.tsx` itself, which a consumer cannot fix, and at runtime an unknown status resolved to `undefined` for its icon, its background and its ARIA role, so the banner stopped being a live region at all. The lookups are partial now: an unrecognized status renders with no status fill, no default glyph and `role="status"`.

  A theme could not reach the banner's radius. `--_banner-radius` was declared in the doc file and in `derivedVarRegistry.ts`, but no rule read it, so a theme's `borderRadius` on the `banner` target expanded into a variable nothing consumed. The four card-silhouette radii read it now, falling back to `--radius-container`.

  Under `@astryxdesign/theme-neutral` the info banner had no background at all, light or dark: the override set `background-color` directly and forced `--color-accent-muted` to `transparent`, and a plain CSS property written by a theme lands in `@layer astryx-theme`, which StyleX's `@layer priority4` outranks. Info now goes through `--color-accent-muted` like the other three statuses and like the stone theme already did.

  Also in this change: `children={false}` (the ordinary `{cond && <ul/>}` idiom) no longer produces an expand toggle that opens an empty box, and `description=""` no longer leaves an empty 20px row, both via `isRenderable`; a long unbroken word in the title or description no longer forces the page into horizontal scrolling at a 320px viewport, measured at `document.scrollWidth` 529px before; and the content area's bottom border uses logical `border-block-end` alongside its inline siblings.

- Count and cut text the way people read it: the TextArea character counter (and its over-limit state and screen-reader announcements) counts user-perceived characters — an emoji is 1, not 2; PowerSearch token truncation no longer cuts an emoji or accented letter in half; Table's auto-generated headers capitalize astral-plane letters correctly; Avatar's initials now use the shared character utilities.
- ComplexSelector: honor the `sm`, `md`, and `lg` element-height tokens exactly.
- TreeList's `variant` axis is themeable, and a new guard keeps every extensible axis honest. `TreeListVariantMap` invites theme packages to add variants — its own JSDoc shows the module augmentation — but `themeProps('tree-list', {density})` never passed `variant`, so a custom variant type-checked, rendered, and produced no selector to style. It is passed now, and documented in the target's `visualProps` so `astryx theme build` stops calling it an unknown prop.
  `packages/core/src/theme/extensibleAxes.test.ts` is the third theming-drift guard, beside the ones covering `targets` and `vars`/`derived`. Those two check what a component renders against what it documents; neither looked at the open prop unions, which is why this went unnoticed. For every `*Map` that types a component prop, it now asserts the three places that have to agree: the interface is declared in the index a consumer augments (a re-export is invisible to both module augmentation and the CLI), the prop is reflected through `themeProps`, and it is documented as a visual prop. It reads the TypeScript AST rather than the type checker, and holds the map's OWNER accountable — a component forwarding `actionVariant` or `statusVariant` to the component that owns the map is not separately responsible for it.

  Registry maps that widen a set of NAMES rather than a visual prop (`IndicatorMap`, `IndicatorFamilyMap`) are out of scope by construction, not by allowlist: the guard only considers maps whose alias types a prop on a `*Props` interface.

- Security: reject `javascript:`, `vbscript:` and `data:text/html` URLs in the Markdown parser, so untrusted markdown can no longer produce an executable link href or image src; and fix `escapeRegExp` in `ChatTokenizedText`, whose character class closed early and left `]` and `\` unescaped, so token values containing them were injected raw into a `RegExp`
- `extends` now reaches the CSS. A theme that extended another built a stylesheet holding only the declarations it stated itself: the base's tokens, component overrides and surface rules were all absent, and because each theme is `@scope`d to its own `data-astryx-theme` value, loading the base's stylesheet alongside could not fill the gap either. Every consumer of an inheritance chain silently got stock geometry, elevation and type with a new palette painted over it (#5067). Nothing warned; the loss only showed up by diffing two generated stylesheets token by token.
  The cause was `theme build` shadowing its own inputs. It writes `<name>.js` next to `<name>.ts`, and the loader resolved a plain `./<name>` specifier to that generated artifact before the source — so the second build of a family read the artifact, which carries no `components` and exports `<name>Theme` rather than whatever the source exports. A named import that missed became `extends: undefined`, and `defineTheme` treated an absent base as no base at all. The loader now resolves source extensions first, which is also the resolution the author's TypeScript sees, so the CSS a build emits matches the theme that type-checked.

  Three things behind it are fixed too, so the failure cannot come back by another route. `defineTheme` **throws** when `extends` is present but is not a theme, naming the likely cause, instead of inheriting nothing — the one behavior change here, and it turns a silent stylesheet into a build error. A theme's `onDark`/`onLight` surfaces and its `__inputTokens` are now inherited like its tokens and components were, so a child no longer reverts its base's inverted-surface customizations to the defaults or loses its `[light, dark]` tuples. And a built theme module now carries the resolved `components` and surfaces alongside its tokens, so extending one — the `./built` subpath every shipped theme exposes — is no longer lossy. `theme build` also stopped hand-picking fields when it re-resolves a plain object theme file, which dropped `extends`, `color` and `syntax` on the way in.

  An extended theme is flat: everything it inherits is resolved into its own output, and its stylesheet stands alone. Measured on a 14-theme family (one base, 13 palettes extending it): each palette went from 25 custom properties and no component rules to the base's full 175 and 70, with its own colours still winning.

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @cixzhang
- @ernestt
- @Sunil56224972

---

# 0.4.2

#### New Features

- AvatarGroup: expose `size` on the `avatar-group-overflow` theming target so themes can style the "+N" overflow chip per size (matching `avatar-fallback`); the default chip font is unchanged (#5046).
- Chat: ChatMessageBubble accepts a `width` prop (numbers are pixels, strings pass through, e.g. `width="100%"`), following the sizing convention on Card and other containers. When set it replaces the bubble's default `max(80%, 280px)` width cap; when unset nothing changes. Combined with `variant="ghost"`, custom in-message content (an artifact card, attachment chips, a standalone ChatMessageMetadata) can now align with the bubble's text column at the full message-column width — previously the only workaround was hardcoding the bubble's private padding token at every call site. (#2574)
- `astryx theme template` writes an annotated theme template into your project (#5048).
  New sibling of `theme add`: where `add` starts you from a theme we ship, `template` starts you from a blank annotated one. `astryx init --features theme` calls the same leaf, so project setup writes it too — it previously printed a one-line hint and wrote nothing, which is the weakest form of the help a theme author needs, since the first problem is not knowing the command but not knowing what the theme surface contains. The file is `theme.template.ts`: every `defineTheme` field with a note on when to reach for it, the token families, the component override syntax, and the consumption steps (providing the theme, loading the fonts you name, building for SSR), each section naming the CLI command that prints its authoritative reference. An existing file is never clobbered.

  This came out of a vibe test (#5047): agents given an annotated template reached twice as far into the theme surface as agents given only the docs (17 component targets vs 8, and the only arm to use interaction states, custom variants and `onDark`), and shipped a third of the contrast defects.

  A template that lies is worse than no template, so its claims are machine-checked against live sources rather than trusted: `scripts/check-theme-template.test.mjs` fails when a `defineTheme` field is added and left undocumented, when a token family is missing from the inventory, when a CSS variable or component key it names does not exist, when it cites a docs topic that does not, or when a theme source drops its SYNC reference. `theme build` compiles it warning-free in CI, and the CLI typecheck now covers it.

#### Fixes

- Avatar: put the avatar box on the element that carries the `astryx-avatar` theme target, so a theme rule on the documented `size` axis resizes the whole avatar instead of growing the wrapper around a fixed-size circle; treat a whitespace-only `name` or `alt` as absent, so it falls through to the default icon rather than rendering an empty plate behind a blank accessible name; warn through the shared `useDevWarning` hook rather than a bare `console.warn` in the render body; and replace the phantom `<OnlineIndicator />` in the JSDoc example with the real `AvatarStatusDot` (#5030)
- CommandPaletteFooter: wire default keyboard-hint strings through useTranslator so they resolve from the locale catalog instead of being hardcoded English (#4506)
- `context-menu` component overrides now drive the menu's internal radius and padding vars. `ContextMenu.doc.mjs` has always documented `derived` entries mapping `borderRadius` → `--_dropdown-menu-radius` and `padding` → `--_dropdown-menu-padding`, but `derivedVarRegistry` had no `context-menu` key, so the mapping was dead: `components: {'context-menu': {base: {borderRadius: '12px'}}}` emitted `border-radius` alone and the menu kept reading its own `var(--_dropdown-menu-radius)`. The registry entry now matches the doc, as it already does for `dropdown-menu` (#4783).
- `useFocusTrap`: a modal surface with no tabbable controls keeps its programmatic focus target instead of letting Tab escape into the page behind it. A dialog that places initial focus on a `tabIndex={-1}` heading or panel had nowhere to advance to, so Tab walked straight out of the trap. `@astryxdesign/core/hooks` also exports `hasActiveFocusTrapEscape` and `isImeKeyEvent`, which coordinate nested traps and skip IME composition keys (#5023).
- Heading's `type` is a documented theming target, and the docs stop teaching a CSS variable that does not exist (#5016).
  `Heading` reflects `type` as a theme selector — `typography.scale` generates `heading: {'type:display-1' …}` rules for it — but `theming.targets` listed only `level` and `color`, so `astryx theme build` warned `Unknown prop "type" on component "heading"` on every theme that sets a type scale, including the shipped `neutralTheme`. The drift guard missed it twice over: it read a conditional spread (`{level, color, ...(type && {type})}`) as an unknown bag, and it only checked a component against a doc file in its own directory, so `Heading/` — documented from `Text/Text.doc.mjs` — was never checked at all. Both are fixed, which brings three more previously unchecked directories under the guard.

  Separately, the theme docs' component-override example set `--button-press-scale`, which no component defines: copying it produces CSS that silently never applies. It now sets a real public var, and the example no longer declares the same `button` key twice.

- DateTimeInput: the focused-and-empty time placeholder hints ("e.g., 2:30 PM" / "e.g., 14:30") now route through the i18n translator so they localize with the rest of the component. Adds `@astryx.dateTimeInput.timeHint12h` and `@astryx.dateTimeInput.timeHint24h` to the `en` catalog. The live-region "Invalid date" / "Invalid time" announcements this PR also covered landed first in #4363 and now reuse that PR's `@astryx.dateInput.invalidDate` and `@astryx.timeInput.invalidTime` keys. (#4546)
- Floating layers now declare their own body type instead of inheriting it. The layer container already set `font-family`; it now sets `font-size` and `line-height` from `--text-body-size` / `--text-body-leading` alongside it. A layer is hosted wherever its trigger sits, so any content that did not set its own size took the ambient one — the same Tooltip, Popover or HoverCard rendered at 13px from a caption and at 20px from a lede. Content that goes through `Text`, or sets a size itself (Tooltip's label, DropdownMenu items, NavMenu headings), is unaffected: those already declared their own and still win. Anything that was relying on inheriting a non-body size now renders at the body size and should set one explicitly (#5064).
- Added a `@astryx.listInput.*` catalog namespace to `packages/core/locales/en.json` so the lab `ListInput` component's action labels, empty state, reorder instructions, and live announcements can be translated. `ListInput` previously hardcoded every visible and assistive-technology-facing string (#4967).
- Layer: use an inert `<template>` marker to find each context layer's actual JSX position. Safe positions stay inline; positions inside a paragraph, link, button, inline formatting, or a structurally restricted container portal to the nearest safe ancestor. Corrective portals keep CSS custom properties inheriting from that nearby host while preserving direction and writing mode, and `show()` passes the trigger as the popover's invoker `source`. The new `lazyMount` option waits until opening to resolve and mount content; HoverCard uses it so rich content never enters an invalid paragraph during initial render and unmounts again when hidden. Other context layers keep their existing closed-content behavior (#5039).
- Two guards left failing on `main` by their own landings, so every PR since has been red through no fault of its own. #4963 gave Thumbnail's remove button a coarse-pointer hit-area var and did not document it, which the derived-var guard reads as an undocumented private var; the var is an `inset` on a `::after` overlay, so it is documented as private and listed alongside the other vars no standard CSS property maps onto. #5026 moved `borderDefaults` into `CoreTokenName` — the landing the theme-template guard was explicitly waiting for (its comment says "when #5017 lands, this guard starts requiring the template to cover it") — so the template's token inventory now names `--border-width`.
- Menus that open on hover no longer close when you click them. A hover-opened menu is already open under the cursor by the time the pointer arrives, so the click that naturally follows was dismissing it — fixed for TopNavMegaMenu in #4555, and now shared: the hover→click guard lives in `useMenuHover`, so TopNavMenu, TopNavHeading, SideNavHeading and DropdownMenuSubMenu get it too, and TopNavMegaMenu runs on the shared machine instead of its own copy. Also from the consolidation: opening a menu moves focus into it synchronously rather than a frame later, closing one returns focus to its trigger instead of dropping it to the document, and keyboard activation always opens rather than toggling an open menu shut (#3121)
- SideNav: a hardening pass over the family, driven by the component audit. Accessibility, theming, passthrough and code-health defects across `SideNavItem`, `SideNavHeading`, `SideNavSection`, `SideNavCollapseButton` and the `navItemStyles` module the TopNav drawer modes share — the motion guards, the untranslated flyout name, the hand-rolled visually-hidden block, the dropped `...rest`, the missing theming state, the uncleaned timers, and the hand-rolled hover intent, which is now the shared `useMenuHover`. Nav rows also adopt the shared focus outline from #4654, so a keyboard-focused row is ringed with the system's `2px --color-accent` at `3px` offset in every theme instead of falling through to the browser's own ring; in a split-action row the link and the chevron toggle are ringed individually, since they are separate tab stops.
  Three visual fixes came out of review. The collapsed submenu flyout was painting a second, square-cornered surface inside the popover's rounded one, and insetting its own content by 4px instead of standing off the rail — both gone, with the gap moved to the positioned layer where `DropdownMenu` keeps it. The selected row now survives `forced-colors: active`: it marked the current page with a 6% background tint, which forced colors flatten away entirely, and it now paints `Highlight`/`HighlightText` like `ToggleButton` and `SegmentedControlItem`. And the footer icon row comes out one size, with the collapse chevron centred rather than seated 2.42px high on a stray text baseline.

  Four changes are visible to a consumer. **Hover on a collapsed item's flyout** is now gated on `(hover: hover)` and only closes on `mouseleave` if hover opened it, and a click-to-dismiss no longer springs back open under a stationary pointer. **The footer icon rows cascade a `sm` size** through `SizeContext`, so an unsized `Button` passed to `footerIcons` now matches the built-in collapse button instead of rendering a size larger — pass an explicit `size` to opt out. **`SideNavCollapseButton` takes a `size`**, for placements outside the nav that have no row to inherit from. And **`SideNavCollapseButton` takes the controlled `collapsible` config** — the same `{isCollapsed, onCollapsedChange}` object handed to SideNav — which is how a button rendered outside the sidenav now stays in step with it. `handleRef` on both components is deprecated in its favour: the state the consumer already owns reaches the button through props, with no imperative handle in between.

- Slider: the thumb no longer overhangs the component's own box at `min` and `max`. It was centred on the container edge at either extreme, leaving half of it (10px) outside the control, where a tight container clipped it or it overlapped the next element. Thumb travel is now inset by half a thumb at each end — the geometry a native `input[type=range]` uses — and the fill, the marks and the pointer-to-value mapping share that inset, so the thumb also stays under the pointer that grabbed it instead of jumping by up to half its width. Vertical sliders and both thumbs of a range slider are fixed the same way (#5051).
- Interactive controls meet the WCAG 2.5.8 AA 24px minimum on touch. The Slider track (20px tall, and clickable along its whole length) floors its block size to 24px, Thumbnail's remove button grows its tappable area through a `::after` overlay, and `sm` CheckboxInput, RadioListItem and Switch floor to a 24px target centred on the control. All of it is gated on `@media (pointer: coarse)`, and only the invisible tappable area changes — rails, thumbs and glyphs stay exactly where they were, and fine-pointer rendering is untouched (#4963, #4964).

#### Documentation

- Ten private (`--_*`) component theming vars are now documented in their owning component's `theming.vars[]`: `--_avatar-group-overlap`, `--_card-elevation`, `--_card-ring`, `--_codeblock-gutter-width`, `--_item-label-color`, `--_item-description-color`, `--_tab-indicator-bottom`, `--_tree-indent` (plus `--_dropdown-menu-radius`/`--_dropdown-menu-padding`, which Breadcrumbs sets on a child menu). They were declared in source and described nowhere, because the drift guard skipped the `--_` prefix outright (#4783).

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @freddymeta
- @HelloOjasMutreja
- @imdreamrunner
- @jiunshinn
- @rubyycheung

---

# 0.4.1

#### New Features

- The keyboard focus ring is now a theme token. `--focus-outline-width`, `--focus-outline-style`, `--focus-outline-color` and `--focus-outline-offset` drive every ring in core and lab, so one override in a theme's `tokens` restyles focus system-wide; the color tracks `--color-accent` unless a theme sets it. The `:focus-visible` condition is not themeable, so a themed ring still cannot appear for pointer users (#4973).
  Every ring is now drawn from the shared focus-outline utility rather than written out per component, and a lint rule keeps it that way. Two corrections come with that: the rings that had drifted to a 2px offset (Slider, Switch, Lightbox, ProgressBar, and lab's InfoTip, Step and LogStream) now sit at the documented 3px, and the buttons inside a field — the Date, DateRange and DateTime calendar toggles, the DateRange presets, and the Selector and MultiSelector status buttons — draw the standard 2px ring instead of a 1px one.
- AspectRatio, Badge, Blockquote, Card, Center, Code, Grid, Section, Skeleton and VisuallyHidden no longer carry `'use client'` (#823). Each was verified against its transitive import graph to use no React client API, no client-only dependency and no module-level mutable state, so they can now render in a React Server Component without forcing a client boundary. A new `serverSafeComponents.test.ts` derives the server-safe set from the import graph and fails if one of these components later gains a client dependency without restoring the directive — including the transitive case `scripts/check-use-client.mjs` cannot see.
  Not a breaking change: no prop, type or export changed, and `'use client'` is inert outside an RSC bundler. Client consumers keep working identically, though bundlers may lay these modules out in different chunks now that they are no longer client entry points.
- Selector and MultiSelector: `indicatorPosition` places the selection indicator on either edge of the option row — `start` or `end`, logical, so it follows RTL. Defaults keep today's rendering (`end` for Selector's check, `start` for MultiSelector's checkbox); a start-positioned check reserves its column on every row so labels stay aligned (#4993).

#### Fixes

- TimeInput: announce arrow-key time stepping via the polite live region (also in DateTimeInput), localize the "Invalid date"/"Invalid time" live-region messages through the i18n catalog, and use long timezone names in Timestamp's AT-facing aria-label while keeping the short form visible (#4363)
- Banner: the 'banner-icon' theme target now rides on the default status Icon itself instead of its layout wrapper, so theme component overrides ('banner-icon' + 'status:X') that set color actually reach the glyph. The Icon keeps its existing color variant (info still renders accent) and same-element rules in @layer astryx-theme win over it, so default rendering is unchanged. Contract note: '.astryx-banner-icon' now matches the icon element rather than the wrapper when the default icon renders; a theme that used the target for wrapper layout (margin, alignment) now styles the glyph instead. With a custom `icon` node the target stays on the layout-only wrapper, since core never injects props into consumer elements (#4166)
- CommandPalette: discard in-flight search responses when the palette closes (#3896)
  Closing the palette while a search was still in flight let the late response re-commit the abandoned query and results into the closed palette, which showed up as a ghost query on reopen. Closing now invalidates any pending request.
- FileInput: validation messages, default placeholder, drag hint, and file-selected announcements now go through the i18n translator instead of hardcoded English. DropdownMenuRadioGroup: consumer `xstyle` prop is composed into styles instead of being dropped (#4589).
- The popup theme targets added in #4991 sat on the wrong element. `astryx-complex-selector-popup` and `astryx-multi-selector-popup` were rendered on each component's own content box — the one with the padding and the scroll — while the element that paints the popup's background, radius and elevation is the surface `usePopover` creates one level above it. A theme reaching for those classes to restyle a popup got a rule that could not paint it. Both now land on the surface, so they do what they were documented to do.
  `Selector` gains the matching `astryx-selector-popup`, which its sibling `MultiSelector` had and it did not.

  New: every popup surface carries the shared `astryx-popover-surface` class, so a theme can style all of them at once, and `usePopover` accepts a `surfaceTarget` naming the surface for a component that wants its own target there. A component cannot do this for itself — the surface belongs to `usePopover`, so any class it renders itself lands inside.

- Selector's menu now clears the trigger by the standard `--spacing-1` gap whenever it is not overlaying it — every explicit `placement`, and search mode. It was the only anchored menu in the system sitting flush against its anchor; DropdownMenu, MultiSelector, ComplexSelector, Popover, and Tooltip all use this clearance. The default selected-item overlay is unchanged: it owns its block geometry and is meant to sit on the trigger (#5003).
- Selector, MultiSelector: the dropdown panel's search field is now part of the panel instead of a bordered input dropped into it. The panel is already a bordered, elevated surface, so the nested `TextInput` drew a box inside a box; the row now renders a leading magnifier, a borderless input, and the shared clear (✕) button, with a full-bleed divider between it and the options — the same shape the command palette already uses. Focus is shown as an inset ring on the row, rounded to the panel's own corners. Section titles move from labeled dividers to plain secondary headings, matching DropdownMenu and CommandPaletteGroup, and MultiSelector no longer draws a rule under select-all. Behavior, keyboard handling, and accessible names are unchanged; MultiSelector's search row additionally stays put while the options scroll under it. New theme targets: `astryx-selector-search`, `astryx-selector-section-heading`, `astryx-multi-selector-search`, `astryx-multi-selector-section-heading`; anything that styled the dropdown search through `astryx-text-input` needs to move to those.
- TableRow: honor `className` and `style` on the `<tr>`. `TableRowProps` extends `BaseProps`, but both were spread before `mergeProps()` and then overwritten by the component's own StyleX classes, so a consumer's values silently had no effect. They are now merged through `mergeProps()` alongside the row's StyleX styles, the same way `TableCell` and `TableHeaderCell` already handle them, in both the in-`Table` and standalone rendering paths. The Astryx theme classes and striped/hover styling are unchanged (#4391).

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @arham766
- @bhamodi
- @cixzhang
- @Eloitor
- @jiunshinn

---

# 0.4.0

#### Breaking Changes

- DropdownMenu's two item modes are peers again. Compound mode gains a `DropdownMenuDivider` component (aliased as `ContextMenuDivider` and `BreadcrumbMenuDivider`), which the data path also renders, so `{type: 'divider'}` and `<DropdownMenuDivider />` produce identical DOM, spacing, and theme target. Data mode gains `endContent` and `description`, so an `items` row can carry a shortcut hint or secondary text without dropping to compound mode. Its `label` widens from `string` to `ReactNode`, matching compound mode: the narrowing existed only because rows were keyed by label, and they no longer are (#4953).
  The bare names now belong to those components, so the data-mode option types take the `Data` suffix their sibling `DropdownMenuItemData` already carries: `DropdownMenuDivider` → `DropdownMenuDividerData`, `ContextMenuDivider` → `ContextMenuDividerData`, `BreadcrumbMenuDivider` → `BreadcrumbMenuDividerData`. TypeScript cannot re-export a value and a type under one name from a single barrel, so the rename is what makes the components exportable at all. Run `astryx upgrade --apply` to rewrite the type imports; a missed one fails at compile time rather than silently.
- Remove the `dropdown-menu-radio-dot` theme target. Menu radio rows draw the shared radio indicator now, so the dot is the indicator's dot: target `radio-indicator-dot` (the legacy `radio-dot` name still matches it too). The row's circle keeps its `dropdown-menu-radio` target, so only the dot moved. (#4890)
  Runtime themes are not validated — a theme keyed on the removed target keeps compiling and silently stops matching — so `astryx upgrade` now carries `rename-dropdown-menu-radio-dot-target`, which rewrites the key and the `astryx-dropdown-menu-radio-dot` class. The new target is app-wide rather than menu-only (there is no menu-only dot element left to address), so the codemod leaves a TODO at each site it rewrites.
- useTableRowExpansion is now a detail-panel plugin: it expands a full-width panel below a row via renderExpanded(item), and useTableRowExpansionState is removed. For hierarchical/tree tables (child rows that reuse the parent columns), migrate to useTableTreeData + useTableTreeState. See the migration example on the useTableRowExpansion docs. (#4609)
  **Codemod:** `npx astryx upgrade --apply` runs `migrate-table-rowexpansion-to-tree`, which rewrites tree-mode `useTableRowExpansion` call sites onto `useTableTreeData` + `useTableTreeState`.

#### New Features

- Avatar: the fallback surface (initials and default icon) is now a direct theme target via the stable `astryx-avatar-fallback` class. Theme its background, text color, font weight, and per-size font size through the `avatar-fallback` component key (e.g. `components: { 'avatar-fallback': { base: { backgroundColor: '...' }, 'size:sm': { fontSize: '...' } } }`), replacing the internal `--_avatar-fallback-*` derived vars. (#4716)
- CodeBlock: the built-in copy button is now a themeable ghost `IconButton` with a default "Copy code" tooltip, reachable via the stable `astryx-codeblock-copy-button` class (theme it through the `codeblock-copy-button` component key). Restyle or keep the copy control without turning it off and re-implementing it. The tooltip stays "Copy code" after copying — the copy→check icon flip is the confirmation. (#4867)
  [feat] New `useClipboard` hook (`@astryxdesign/core/hooks`): the shared copy-to-clipboard behavior — clipboard write, a transient `isCopied` flag with its reset timer, and an optional polite screen-reader announcement. CodeBlock and Timestamp now build their copy buttons on it; reach for it directly for copy affordances that are not a plain icon button.
- CodeBlock: add `codeblock-header` and `codeblock-title` theme targets on the header row and the title/language-label element. A theme can now restyle the header (e.g. padding) and the title (e.g. font size) directly, instead of reaching them through structural `> div:first-child > div > span` selectors that reverse-engineer the header layout. Both reflect the `size`/`language`(`/container`) visual props like the root. (#4943)
- DateInput, DateRangeInput, and DateTimeInput now accept a `weekStartsOn` prop that sets the first day of the week in the calendar popover (0 = Sunday … 6 = Saturday, or a three-letter day name like `"mon"`). It forwards to the underlying Calendar, whose default stays Sunday, so existing usage is unchanged. (#4745)
- Selector, MultiSelector and Typeahead expose their empty ("No results found") state as a themeable target (#4756, #4862) — `astryx-selector-empty-state`, `astryx-multi-selector-empty-state` and `astryx-typeahead-empty-state`. Themes can restyle the empty state without the fragile structural selectors consumers previously had to reach for. (The Selector search field is a TextInput, so its placeholder is reachable today via `.astryx-text-input::placeholder`; a Selector-scoped placeholder seam would require a TextInput change and is left as a possible follow-up.)
- EmptyState: add `empty-state-title` and `empty-state-description` theme targets on the title heading and the description. A theme can now restyle the title and description directly (e.g. font size, color, per `variant`) instead of reaching them through structural `> div:has(> :is(h1..h6))` selectors that reverse-engineer which element is which. (#4942)
- Every clearable input now renders its clear (✕) affordance through the shared `InputClearButton`, so the glyph is themeable in one place via the `astryx-input-clear-icon` target instead of a per-component target or a fragile descendant selector. The component-specific `astryx-{date-input,date-range-input,selector,multi-selector}-clear-icon` targets remain supported as deprecated aliases; new themes should use `input-clear-icon`. The clear glyph is now a consistent secondary-color icon with a ghost-button hover affordance across the whole family. (#4876)
- The input family (TextInput, NumberInput, DateInput, DateRangeInput, DateTimeInput, TimeInput, TextArea, Tokenizer) now reflects its disabled state on the root theming target as `data-disabled="disabled"` plus a `.disabled` variant (only when disabled), so a theme can gate its own hover/border treatment on the disabled state — mirroring the existing `status`/`size` reflection — instead of relying on structural `:has(input:disabled)` CSS. This closes a documented theming gap for downstream consumers. (#4794)
- useLayer takes an `offset` for clearance from the anchor, derived from the resolved placement, and the layer wrappers stop hand-rolling it (#4803)
- DropdownMenu rows take two new options (#4953). `DropdownMenuItem` takes `hasCloseOnSelect`, so a plain action can report its result on the item instead of closing the menu. `DropdownMenuItemData` and `DropdownMenuSection` take an optional `id`, the row's stable React key for a menu whose items reorder or filter (also reaching MoreMenu, ContextMenu and Breadcrumbs, which share the type).
- DropdownMenuItem now accepts a `variant` prop (`'default' | 'destructive'`); `'destructive'` renders the label, description, and icon in the error color for dangerous actions like Delete. The data-driven `items` API accepts the same `variant` field, and because ContextMenu shares the menu-item data shape, context-menu items get it too. Defaults to `'default'`, so existing menus are unchanged. (#4753)
- MultiSelector: dropdown option rows are themeable through a single (#4628)
  `multi-selector-option` target, carrying the row's `size` and its `select-all`, `selected` and `disabled` states — so a theme can express "selected option at large" or restyle just the Select All row. Row typography moved from the label span onto the row, so one override reaches both the fallback label and `renderOption` content; custom option content now inherits the row's font and disabled color.
- NumberInput: render a text-backed spinbutton that supports formatted display values, explicit wheel and keyboard stepping, and opt-in trailing increment/decrement buttons. Existing wheel stepping remains enabled by default and can now be disabled with `isWheelEnabled={false}` (#4896).
- ComplexSelector and MultiSelector: add `astryx-complex-selector-popup` and `astryx-multi-selector-popup` theme targets on the popup surface, so a theme can style the popup — background, border, radius, elevation, padding — through `defineTheme` instead of a structural selector or a fork. Both components already targeted their trigger but nothing in the popup, which is the part that has to match the rest of an app's menus. The target sits on the popup's content box rather than the layer element: `useLayer` zeroes the layer's borders, padding and background, so the content box is the surface that actually paints. Purely additive — default rendering is unchanged. (#4991)
- TextInput, TextArea, NumberInput: add `isReadOnly`. The value is shown at full opacity and still submits with the form, but cannot be edited — the "visible, locked, still sent" case that `isDisabled` deliberately does not cover, since disabled controls are excluded from submission. Read-only fields are not dimmed and stay in the tab order, matching the native `readonly` semantics they compile to; `isDisabled` takes precedence when both are set, and the clear button is hidden while read-only. The state is reflected on the root theming target as `data-readonly="readonly"`, alongside the existing `data-disabled`, so a theme can paint it without structural `:has(input:read-only)` CSS. `isReadOnly` already existed on CheckboxInput, CheckboxList, and PowerSearch; the remaining text-ish inputs (DateInput, DateRangeInput, DateTimeInput, TimeInput, Tokenizer) do not have it yet. (#4816)
- Selector/MultiSelector: two additive theming seams (#4626, #4627). A `selector-check` theme target on the selected-row checkmark lets themes restyle or hide it (e.g. to compose their own selected indicator via `renderOption`) instead of relying on a structural sibling selector, and `data-disabled` now reflects on the trigger for theme-driven disabled styling. Rotation styles remain on the indicator-icon target. Default appearance is unchanged.
- Table: `contextMenuActions` now accept a `variant: 'destructive'` for dangerous row/column actions (e.g. Delete), rendered in the error color to match ContextMenu. (#4864)
- TextArea: theme the text inset by writing `paddingInline` on the `textarea` component key — it now drives the internal `--_textarea-inline-padding` var instead of landing on the wrapper. The wrapper stays flush (`padding: 0`), so the native resize grip keeps its true-corner position and the start icon, status, and character counter stay aligned to the text. Adds a `replaces` option to derived var entries for the general "map a property onto a var without emitting it on the class element" case. (#4793)
- Add themeable indicators — the componentized check, checkbox, and radio visuals. `defineTheme({indicators: {check: RadioIndicator}})` replaces one by name, and every component drawing it follows. (#4712)
  Theme targets now follow the component-name convention: `checkbox-indicator`, `radio-indicator`, `radio-indicator-dot`. The old names (`checkbox`, `radio`, `radio-dot`) remain emitted on the same element so existing themes keep working. New themes should use the canonical names; deprecation does not set an automatic removal deadline.

  Migration: menu radios use those shared targets now. `dropdown-menu-radio-dot` is removed — target `radio-indicator-dot`; `astryx upgrade` rewrites it for you.

- TreeList: two additive changes. (1) A fully flat tree — one with no expandable items at all — now renders its rows flush instead of reserving an empty chevron-alignment column that nothing lines up under; any tree that has at least one expandable item keeps the same per-level alignment as before, so only fully flat trees change shape. (2) Adds a themeable `--tree-list-row-gap` for the inter-row gap, defaulting to a subtle `2px` (`var(--spacing-0-5)`) separation — matching the inter-row gap `List` and `DropdownMenu` already ship — so this shifts the default spacing of every tree by that amount; set it on the `tree-list` target to widen or close it. The gap rides collapse-proof `padding-block` on the row wrapper (not the paintable `tree-list-item` target), and the connector guides span it automatically without overhanging the last row. (#4540)

#### Fixes

- AlertDialog: correct the inline role and pin initial focus (#4887).
  The `isInline` preview path no longer renders `role="alertdialog"`. That role promises a modal interruption — focus trap, inert page, explicit dismissal — and the inline path is an always-present, non-modal preview with none of it. It now renders `role="group"`, keeping the title and description associated through `aria-labelledby`/`aria-describedby`.

  The cancel button now carries `data-autofocus`, so the documented "initial focus goes to the cancel button" behavior is pinned instead of depending on cancel happening to be the first focusable node in the footer. Docs now name and link the WAI-ARIA APG Alert Dialog pattern the component implements, and gain an anatomy section.

- AppShell: two a11y fixes to the shell chrome (#4944).
  The mobile top bar rendered for a sidenav-only layout is now a `banner` landmark, matching the header region of a layout that has a `topNav`. Previously the page's landmark structure changed depending on which nav slots it filled: a screen-reader user on a small viewport got no banner region at all. When a `banner` slot is present the existing header keeps the role, so there is still exactly one.

  The skip link now draws the shared Astryx focus ring instead of the browser default outline, so it follows `--color-accent` and matches every other focusable surface in a custom theme.

- Avatar: fallback initials no longer break for names containing emoji or other multi-codepoint characters. (#4750)
- ChatLayoutScrollButton: the default (label-less) state now renders as icon-only, with the translated "Scroll to bottom" string as the accessible name only. It was previously missing `isIconOnly` on its inner `Button`, so Button's default (visible-text) contract rendered the translation as clipped visible text inside the circular button instead. (#4854)
- Chat: the dictation and scroll buttons now carry their `chat-dictation-button` and `chat-layout-scroll-button` theme targets, and ChatSendButton no longer clobbers a consumer's `className` (#4634).
- ChatToolCalls: hover backgrounds on grouped call rows (2+ calls) now keep their full `--radius-element` rounding instead of getting clipped flat on the inline edges. `groupContentInner` — the `overflow: hidden` clip boundary the expand/collapse height animation needs — was missing the padding/negative-margin pair that absorbs the row-level hover-background overhang, so the overhang extended past the clip boundary and got cut off. Matches the ungrouped single-call row, which has no such wrapper to clip it. (#4858)
- `ComplexSelector`'s popup now keeps its 4px clearance from the trigger when `placement="above"`, matching `placement="below"` and `Popover`. The popup's margin was set on `marginBlockStart` only, which is correct for a popup opening downward but leaves zero clearance on the edge that matters when it opens upward. (#4861)
- ComplexSelector: the trigger's focus ring is now keyboard-only. It was drawn from `:focus-within`, which also matches a mouse click — open the popover with the mouse, dismiss it with the mouse, and the restored focus left a pointer user staring at a keyboard affordance. It now uses the shared `:has(:focus-visible)` ring, which also brings the outline to the documented 3px offset. (#4935)
- DateInput and DateTimeInput no longer steal focus when the open calendar is dismissed by clicking another control. Clicking the field to open the calendar, then clicking the time input (DateTimeInput) or any other element, kept yanking focus back to the date input because the popover's close handler always refocused it. It now restores focus only when the dismiss left focus detached (Escape, or a click on empty space), so a click that lands focus elsewhere is respected. (#4974)
- TextInput, TextArea, NumberInput: a disabled field is no longer submitted with the form when `disabledMessage` is set. Showing the reason tooltip requires swapping the native `disabled` attribute for `aria-disabled` + `readOnly`, so the message stays discoverable by pointer and keyboard — but read-only fields still serialize into `FormData`, and these three kept their `name`, so a locked field posted its value. They now withhold the `name` while disabled, matching CheckboxInput and Switch (which forward the name only when enabled) and the hidden-input carriers in Selector, MultiSelector, Slider, and Tokenizer (which mirror `disabled`). Adds form-participation coverage to all three so the guarantee is pinned. (#4811)
- DropdownMenu/MoreMenu: opening with a pointer no longer highlights the first item as if it were selected (#4477). Initial focus now follows the input modality: keyboard opens (Enter/Space/ArrowDown on the trigger) still focus the first enabled item per the APG menu-button pattern, while pointer opens focus the menu container itself so the first ArrowDown moves to item 1. Synthesized clicks (detail 0, e.g. screen reader activation) and programmatic controlled opens keep the first-item focus behavior. Covers data-driven items mode, compound mode, and MoreMenu, which share the open path.
- EmptyState: the rest spread sits before the contract `role`, so a consumer can no longer clobber the landmark role the component guarantees (#4826).
- Indicator: a falsy `children` no longer deletes the state mark. The busy idiom a host actually writes — `children={isBusy && <Spinner/>}` — passes `false` when it is not busy, and `false` is neither `null` nor caught by `??`, so all three indicators took the children path, rendered nothing in it, and dropped the checkmark, the checkbox tick and the radio dot on every selected row. They now use `isRenderable`, so only children that actually render replace the mark. `0` still counts as content, since it renders the character "0". (#4913)
  CheckIndicator's children slot also reserves the glyph's box and carries its color, so swapping a Spinner in no longer shifts the row or loses the disabled shade.

  Fixes #4893.

- Consolidate general interactive focus outlines onto one definition — 2px `--color-accent` at 3px offset, matching Design Conventions. (#4654)
  Most general controls had drifted to a 2px offset; Button, Calendar, Dialog and Pagination were the ones still on spec. Their value wins, so a focus ring on the drifted components (Link, TabList, Token, TreeList, SegmentedControl, TopNav items) now sits 1px further from its control.

  Destructive buttons keep their error-colored ring, and `--button-focus-offset` is unchanged. Form and input focus treatments are out of scope.

- `<Heading type="display-N">` now sizes correctly under every theme, matching `Text`'s behavior. `generateTypeScaleComponents()` only emitted `level:N`-keyed CSS rules for `heading`, with no `type:display-N` counterpart — so as soon as a theme supplied `typography.scale`, the generated theme-layer CSS's `level:N` rule was the only one present and silently won regardless of `type`, discarding the prop. A theme with no typography config was unaffected, which made the bug look intermittent. (#4859)
- theme: `color.contrast: 'high'` now strengthens border tokens too — the emphasized border tone is pulled toward mid-scale (stronger against both light and dark surfaces) and the subtle hairline's alpha is doubled, so structural boundaries stay perceivable in high-contrast themes instead of only text/icons changing. (#4529)
- Icons render through `<Icon>` and carry their component's theme target (#4838).
  Styling-only wrappers around rotating icons are gone, and each rotation now sits on the icon element that already carries the component's theme target — so a theme reaches the glyph and its open/closed transform through one selector. No new theme targets: Selector, MultiSelector and ComplexSelector consolidate onto their existing `*-indicator-icon` targets, and the Table plugins and TreeList simply shed redundant wrapper elements.

  Where an RTL mirror sat on a separate parent element, it is folded into each state's transform (`scaleX(-1) rotate(...)`) so one element carries both. In the Table plugins that mirror was inert — `transform` does not apply to a non-replaced inline box — so RTL disclosure chevrons now mirror correctly where they silently did not before.

  Registry glyphs in SideNav, TopNav, Collapsible, TreeList and Breadcrumbs now render through `<Icon>` instead of `useIcon()` inside a hand-written `<span>`. Those spans were a weaker reimplementation of `<Icon>`, which already resolves the same glyph and renders a span carrying merged `className`/`style`/`xstyle` plus the `astryx-icon` theme target. The converted sites gain that target, and the node count is unchanged. `useIcon()` keeps its place for the cases that resolve a glyph _without_ rendering it: MoreMenu and ChatSendButton pass the node as a default for a consumer-overridable prop, which `<Icon>` cannot express.

  Also adds the `@astryx/no-wrapper-transform` lint rule (warn) for `<div>`/`<span>` wrappers that exist to transform the icon inside them.

- Indicator: a caller can no longer un-hide or focus a decorative indicator (#4921, #4947).
  `IndicatorProps` now omits `aria-hidden`, `role`, `aria-label`, `aria-labelledby` and `tabIndex` — passing `role` or `tabIndex` is a compile error — and each indicator emits its own `aria-hidden` after `{...rest}`, so a forwarded one cannot win. Un-hiding an indicator had it announced next to the control that owns the accessible name, saying the same thing twice; a tab stop on one is a focusable node inside a hidden subtree, an axe `aria-hidden-focus` violation.

  Nothing is stripped: every other prop, including a forwarded `aria-label`, still reaches the DOM, where it is inert inside an `aria-hidden` subtree. Note that TypeScript exempts hyphenated JSX attributes from excess-property checking, so the type alone cannot reject `aria-*`; the attribute order is what enforces it. `tabIndex` is a plain identifier, so its omission stands on its own.

  Also corrects two doc claims: a replacement must render `children` when they will actually draw something (`isRenderable`, not `children ?? mark`), and "passing `role` is a compile error" holds for a literal attribute — a spread bypasses excess-property checking.

  Fixes #4918.

- A DropdownMenu item closes the menu on activation even when it carries no `onClick`, and a data-mode row that changes its own label keeps its identity instead of remounting and dropping focus (#4953)
- Fix `mergeRefs` cleanup so object refs are cleared and callback refs without
  cleanup functions still receive `null` when a merged ref returns cleanup (#4901).
- MoreMenu forwards `placement` and `alignment` to its DropdownMenu. Both were part of the underlying menu's API but were dropped on the floor by the wrapper, so an overflow menu — the one component whose job is a trailing-edge affordance — could not ask to be end-aligned; it only looked right when the layer happened to collision-flip. Defaults are unchanged: MoreMenu passes the props straight through, so DropdownMenu's `'below'` / `'start'` still apply. (#4952)
- Pagination: vertically center the prev/next caret icons. The RTL mirror wrapped each chevron in a `display: contents` span, which dropped the icon out of the button's flex-centering context so the glyph sat a few pixels high. The mirror transform now rides on the `Icon` directly via `xstyle`, so the icon stays a centered flex child and still flips under RTL — no wrapper element. (#4723)
- ProgressBar: a theme can size the target mark again without `!important`. The mark's `width`/`height` were plain StyleX declarations, so a `progressbar-mark` override only landed where `@layer astryx-theme` outranks the component atomics — in a source-build app that compiles StyleX without `useCSSLayers` the atomics are unlayered and beat every theme rule, leaving no way to resize the tick but an unlayered `!important` rule. The dimensions now travel as derived vars with no competing declaration, so the same `defineTheme` entry lands in either build. Theme authoring is unchanged; a mark's color is still a plain declaration and still depends on the layer order. (#4970)
- ProgressBar marks take their color from what they sit on: the fill variant's on-color inside the filled area, the emphasized divider color out on the track (#4741)
- CommandPalette, ComplexSelector and ContextMenu: a consumer's `onClick`/`onMouseEnter` is composed with the component's own handler instead of being overwritten by it, and `{...props}` no longer lands after the props the component must control (#4725).
- CheckboxInput, Switch: a `required` control that is disabled with a `disabledMessage` no longer blocks the whole form from submitting. Showing the reason tooltip swaps the native `disabled` attribute for `aria-disabled`, which leaves the control subject to constraint validation — so an unchecked required checkbox (or an off required switch) the user has been told they cannot touch made the form permanently unsubmittable, with the browser reporting a validation error against a control they had no way to satisfy. Both now detach from the form via `form=""` while focusable-disabled, matching a natively disabled control and the treatment RadioListItem already applied. Enabled controls are unaffected — a required, unchecked checkbox still blocks submission as it should. (#4815)
- `useScrollLock`: coordinate concurrent locks with a shared counter, so overlays closing out of order no longer unlock the body early or leave it stuck locked. (#4788)
- Selector: keep the selected option text aligned with the closed trigger across every menu position by measuring untransformed layout geometry during the popover entry animation. (#4802)
- Drop the shared trigger-icon wrapper in Selector, MultiSelector and ComplexSelector — each trigger icon is now the element that carries its own box, colour and theme target. (#4846)
  The wrapper set a 16px box and `--color-icon-secondary` on a span with no theme target of its own, shared by two different affordances: the status glyph and the disclosure chevron. `<Icon>` already provides both (`size="sm"` is the same 16px box, `color="secondary"` the same token), so the wrapper only stood between a theme and the icons — and made the two affordances share a node they never should have shared.
- Selector selects by typing, matching a native select (#3764)
  Typing a printable character on a focused, closed Selector now selects the matching option — tab to a state picker, press "C", get "CA" — instead of doing nothing until the menu is opened. Repeated presses cycle through options sharing a first letter, and spaces count as match characters ("new y" reaches "New York"). With the menu open, typing moves the highlight and Enter commits, as before. With `hasSearch`, typing on the closed trigger opens the popup and seeds the search input.

  Matching reuses the shared `useTypeahead` hook, so Selector behaves like the other collections (menus, listboxes). Because a match committed from the closed trigger changes the value without opening the popup or moving focus, the new selection is announced through `useAnnounce`.

  `useCombobox` no longer implements typeahead itself; callers that want it compose `useTypeahead` and run it ahead of the combobox key handler.

  Adopting the shared hook exposed two matching bugs in it, fixed here — so `DropdownMenu`, `ContextMenu` and `NavHeadingMenu` improve too. A single-character search now starts _after_ the current item, as native `<select>` and the APG pattern do, instead of only advancing on a repeated press: pressing a letter that the focused item already begins with used to do nothing at all. And with nothing focused the search now genuinely starts at the top, rather than wrapping onto the last item first. Characters composed with Option/Alt (`Option+a` → "å") count as typeahead again, so accented labels stay reachable.

- SideNav: `footer` content now centers when the nav is collapsed, matching how `children` already centers. `stickyBottomCollapsed` (the collapsed-rail wrapper for `footer`) was missing `alignItems: 'center'`, which its sibling `scrollableCollapsed` (the collapsed-rail wrapper for `children`) already had — so full-width footer content (e.g. an icon-only button) stretched to the collapsed rail's width instead of centering. (#4852)
- SideNav: the collapsed icon-only `SideNavHeading` trigger with a `menu` no longer omits its popover's anchor. The trigger's ref callback wasn't forwarding to `usePopover`'s `triggerRef`, so the menu popover had no CSS anchor to position against and fell back to the viewport corner instead of opening next to the trigger. (#4850)
- Stepper: localize the "Optional" step affordance via the new `@astryx.step.optional` message key so it translates like the rest of the component. No visual change in English. (#4872)
- `useStreamingText` no longer renders a broken glyph (a lone surrogate, or a partial ZWJ emoji sequence) for one frame when its fixed-code-unit reveal cadence happens to land inside a surrogate pair or multi-codepoint emoji. The rendered slice now snaps back to the nearest grapheme cluster boundary via `Intl.Segmenter` (with a surrogate-pair-safe fallback where it's unavailable); the reveal cadence itself is unchanged. Also corrected the hook's doc comment, which inaccurately described the cadence as advancing on word/syntax boundaries — it always advanced by fixed code units. (#4866)
- TextArea: no longer reserves trailing space for the on-field status icon when `statusVariant="detached"`. The detached variant surfaces its status glyph in the message box below the field and renders no on-field icon, so the reserved inset pushed the text in for an icon that never appeared. Trailing space is now reserved only when the spinner or on-field status icon actually renders. (#4940)
- TextArea: remove the duplicate wrapper padding so the text and native resize grip sit flush to the edge. The wrapper's `padding: 0` shorthand was being overridden by the shared input-wrapper longhands, leaving the inset applied twice; it now zeroes with matching longhands. (#4813)
- TopNavMegaMenu: fix the hover-then-click flicker where clicking a nav item after hovering dismissed the mega menu. The trigger is registered as the native invoker for its `popover="auto"` panel and uses a Vercel-style hover→click guard, so the click that naturally follows a hover confirms and pins the panel open instead of toggling it shut. Native outside-click, Escape dismissal, and sibling-popover exclusivity are preserved. Click/keyboard opens are pinned (persist past mouse-leave); hover opens stay transient. Keyboard activation (Enter/Space) always opens and moves focus into the panel, while touch/click without a preceding hover toggles cleanly (#3121)
- TreeList typeahead now cycles through same-letter matches instead of stalling, and searches from the top when no treeitem is focused. (#4844)
- `BaseTypeahead` (and everything built on it — `Typeahead`, `Tokenizer`, `PowerSearch`'s content-search field) no longer misinterprets the Enter keydown that commits an IME composition (Korean/Japanese/Chinese input) as "accept the highlighted suggestion". Previously that keydown both selected the highlighted result and cleared the input, so the still-composing syllable landed in the freshly-cleared field and became its own spurious second selection on the next Enter. Also guarded the Enter-to-save handler in `PowerSearchEditPopover`, which had the same gap when typing a CJK filter value. (#4860)
- useLongPress: cancel the pending long-press when a second finger joins mid-press. Previously `onTouchStart` and `onTouchMove` only checked `touches.length` on their own event, so a second finger arriving after a single-finger press had already started the timer (e.g. a pinch-to-zoom gesture) fell through the `touches.length !== 1` guard without ever clearing it — `onLongPress` could still fire with the stale first-finger point mid-gesture. No API change. (#4735)
- useContainerReveal scopes the reveal by inheritance instead of a marker pool: no dev warnings on lists longer than six rows, and isEnabled now takes effect after mount (#4955)

#### Documentation

- AppShell: the two worked examples of the `mobileNav` escape hatch passed `title` to `MobileNav`, which does not accept it: `MobileNavProps` omits the native `title` attribute and the drawer heading prop is `header`. Copying either example produced a type error and a drawer with no heading. Both now say `header`. The doc also gains an anatomy list and accessibility guidance covering the landmark structure AppShell owns. (#4944)
- AspectRatio: document the sizing contract and add the missing anatomy. The box takes its width from its container and derives its height from the ratio, so constraining only the height clamps it off ratio (pass `width: 'auto'` alongside) and a shrink-to-fit parent collapses it to zero width. Both are now in the component JSDoc and in `bestPractices`, along with the single-child expectation: with `fit` set, every direct child is stretched to fill the box. The image-gallery example block now uses `var(--radius-element)` instead of a raw `8`. (#4984)
- StatusDot: document the builder's accessibility responsibilities in the usage dos and don'ts. A color-only dot is not fully accessible in isolation, so the guidance now says to use it as a binary present/absent signal, pair it with a label, carry the status as a shape via an icon, and — if neither fits — convey the status through an accessible alternative. (#4737)

#### Other Changes

- `DropdownMenuItemData` — the shape of one entry in a `DropdownMenu` / `ContextMenu` / `MoreMenu` `items` array — is now sourced from `DropdownMenuItemProps` (`Pick`) instead of restating `icon`, `onClick`, `isDisabled`, and `variant` by hand, and `renderDropdownItems` forwards the whole item to `DropdownMenuItem` rather than copying it field by field. The data and compound APIs describe the same item, so they can no longer drift — exposing another item prop to the data API is now one key in the `Pick`. The type is structurally identical to before (`label` is still narrowed to `string`, since the renderer keys rows by it) and rendering is unchanged. (#4809)
- Remove 15 `<div>`/`<span>` wrappers that existed only to style the single Astryx component inside them (Carousel, Lightbox, MobileNav, Pagination, Switch, TopNav, TopNavMegaMenu, Table row-expansion menu icon); the styles now sit on that component's own root via `xstyle` — or, for Pagination's page-size Selector, its documented `width` prop. No API change, but the rendered DOM has one fewer node at each site, so anything selecting on that structure is affected: `patch`, not `[breaking]`, because the removed nodes were internal implementation with no documented contract, no theme target, and no stable class. Two rendering defects the wrappers were causing are fixed as a side effect: the Lightbox prev/next chevrons and the Pagination first/last chevrons were 2.5-3px off their button's vertical centre. (#4775)

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @alex-js-ltd
- @athz
- @cixzhang
- @czarandy
- @ernestt
- @freddymeta
- @HelloOjasMutreja
- @humbertovirtudes
- @imdreamrunner
- @jiunshinn
- @josephfarina

---

# 0.3.0

#### Breaking Changes

- DropdownMenuRadioGroup now takes a required `label` prop that names the group for assistive tech (applied as aria-label), replacing the previous optional `aria-label`/`aria-labelledby` passthrough -- rename `aria-label="..."` to `label="..."` (pass `aria-labelledby` via base props instead when a visible label already exists). This also covers the ContextMenu/Breadcrumb re-exports (ContextMenuRadioGroup, BreadcrumbMenuRadioGroup). Also fixes ContextMenu to close the menu on Tab per the APG menu pattern.
- Core — the authoring surfaces move to `@astryxdesign/cli/authoring`. `@astryxdesign/core/authoring` (`createIntegration`/`createPageTemplate`/`createBlockTemplate`/`createComponentDoc`/`createFunctionDoc`/`createDoc` and their types) and `@astryxdesign/core/config` (`createConfig` + `AstryxConfig`) are removed. The doc-type vocabulary re-exported from `@astryxdesign/core` (`ComponentDoc`, `ReferenceDoc`, `ComponentPropDoc`, `ComponentTranslationDoc`, …) is now a deprecated alias that re-exports from `@astryxdesign/cli/authoring` and will be removed next release. Author docs/configs/integrations as plain objects and import types from `@astryxdesign/cli/authoring`; `astryx upgrade` repoints existing imports automatically.
- Remove long-deprecated compatibility APIs from core and CLI. Run `astryx upgrade` first to migrate the supported replacements for authoring imports, Dialog logical positions, Switch label spacing, and Table root props.

#### New Features

- Carousel: add `hasLoop` for wrap-around scrolling (next at the end returns to the start, prev at the start jumps to the end; navigation buttons stay active at both edges) and a `handleRef` imperative handle (`CarouselHandle`) exposing `scrollNext`, `scrollPrev`, `scrollTo(index)`, `canScrollNext()`, and `canScrollPrev()` for programmatic control.
- Center: add `padding`, `paddingInline`, `paddingBlock` (spacing-scale inner padding) props. These match the existing `padding` props on `Stack`, `Card`, `LayoutContent`, and `LayoutPanel`, so centered page content no longer needs inline `style={{}}` or `xstyle` wrappers for basic padding.
- ComplexSelector: add a rich custom selector shell with accessible button/popover behavior, async change actions, and optional grid keyboard navigation.
- `defineTheme`: make `color.accent` optional (#2279)
  A theme can now restyle the neutral ramp (`neutralStyle`, `contrast`) without adopting an accent. An accent-less config seeds the neutral palettes from the default accent's hue but leaves `--color-accent`, `--color-accent-muted` and `--color-on-accent` ungenerated, so they fall through to the token defaults — the same fall-through `expandColorScale` already applies to status, categorical and on-dark tokens. Configs that pass an accent are unchanged, token for token.
- Dialog: add logical `start`/`end` offsets to the `position` prop and deprecate the physical `left`/`right`. `start`/`end` map to `inset-inline-start`/`inset-inline-end`, so a positioned dialog mirrors correctly under RTL (start hugs the inline-start edge — left in LTR, right in RTL). The physical `left`/`right` still work unchanged and never mirror (non-breaking); they are now `@deprecated` and will be removed in a future major. When both a logical offset and its physical counterpart are set, the logical one wins. A codemod (`migrate-dialog-position-to-logical`, v0.2.1) rewrites `position={{left, right}}` to `{{start, end}}`.
- DropdownMenuCheckboxItem now composes CheckboxInput so its checkmark matches CheckboxListItem and the standard checkbox theming slots apply. The checkbox stays decorative — the menu row keeps role="menuitemcheckbox" and owns the checked state.
- DropdownMenu now accepts an `alignment` prop for matching Popover/HoverCard positioning parity.
- DropdownMenu: expose themeable slots for the section heading, menu divider, submenu indicator icon, and checked radio dot (`astryx-dropdown-menu-section-heading`, `astryx-dropdown-menu-divider`, `astryx-dropdown-menu-indicator-icon`, `astryx-dropdown-menu-radio-dot`) so themes can style them directly instead of relying on structural selectors. ContextMenu inherits these via shared item rendering.
- Add a ghost trigger variant for Selector and MultiSelector for toolbar-style controls, with ghost status messages detached by default.
- Field/FieldStatus: add `astryx-input-status-icon` and `astryx-field-status-icon` theme targets on the field status glyph, so consumers can recolor, resize, and restyle it — per status — via `defineTheme` instead of a fragile descendant selector or raw CSS. `astryx-input-status-icon` sits on the on-field icon shared by all bordered inputs across the `attached` and `tooltip` status variants and reflects `data-size`/`data-status`; `astryx-field-status-icon` sits on the detached message box's leading icon and reflects `data-type`. Purely additive — default rendering is unchanged.
- Markdown: expose per-block spacing to theming. Every block type now renders a stable theme target — `astryx-markdown-heading`, `-paragraph`, `-list`, `-codeblock`, `-blockquote`, `-table`, `-hr`, and `-image` — so a theme can tune the gap around any block (`marginBlockStart`/`marginBlockEnd`) via `defineTheme` instead of overriding global spacing tokens or reaching for fragile `[role="paragraph"]`-style descendant selectors. Each target reflects `data-density` (so spacing can differ per `default`/`compact`), and the heading target additionally reflects `data-level` (1–6) for per-level spacing. Targets apply only to the default render path — a custom `components.heading`/`code`/`blockquote`/`hr`/`image` continues to own its own styling. Purely additive — default rendering is unchanged.
- Pagination: add an `input` variant — an editable page-number box (a `NumberInput`, so it clamps to `[1, totalPages]` with integer-only semantics) flanked by first/last («/») buttons, rendering `Page [ n ] / N`. Navigation is page-based via the existing `onChange`. The leading noun is set with an open `pageLabel` prop (defaults to the localized "Page"; pass `pageLabel="Row"` to relabel it). Also adds a `step` prop controlling how many pages the prev/next buttons advance per click (default 1, clamped to range); when greater than 1 the buttons' accessible names reflect the stride. Adds `chevronsLeft`/`chevronsRight` icons. The first/last/prev/next carets now also carry a hover tooltip (the same localized, step-aware label already used as their accessible name), so sighted users get the affordance the icon-only buttons previously exposed only to assistive tech. (#4248)
- ProgressBar: add an opt-in `marks` prop that draws fixed target lines on the track at values in the same 0..max scale as `value` (e.g. a goal or threshold). Marks stay visible whether progress is below or past them; each mark requires a `label` (its accessible name, revealed via a tooltip on hover/focus), and marks are ignored in indeterminate mode. The mark tick is directly themeable via the `progressbar-mark` target — a theme sets `backgroundColor`, `width`, and `height` on it (a larger height makes a "flag" tick that overhangs the bar symmetrically above and below). The mark tooltip is loaded lazily, so a ProgressBar with no marks bundles no tooltip code. Named `marks` (with a `ProgressBarMark` type) to match the `marks` prop on Slider.
- Icon registry: `registerIcons()` now accepts arbitrary extension keys (not just built-in `IconName`s), so libraries can augment the icon map with their own keys. Add `getExtendedIcon(name, fallback)` — resolves an extension key, preferring a theme-registered icon over a caller-supplied default. This lets library-shipped icons (e.g. the lab `RichTextEditorToolbar`'s `richtext:*` glyphs) be overridden per-theme without forking.
- SelectableCard: pressing Enter now toggles selection, in addition to Space, when the card is focused
- Selector & MultiSelector: the dropdown search field is now a `TextInput`, so it gains that component's built-in affordances — a leading search magnifier (`startIcon`) rendered inside the field and a trailing clear (✕) button (`hasClear`) that appears once a query is typed and resets + refocuses on click. The field now shares TextInput's border, focus ring, and sizing, so it matches every other Astryx input instead of being a bespoke control. No new props or theme targets. Non-breaking, but note the magnifier is a new default glyph, so existing `hasSearch` dropdowns gain a leading icon.
- Add SSR-friendly theme and icon registry resolution so semantic icons can resolve from a registered theme name without relying on React context.
- Table: `astryx-table-cell` and `astryx-table-header-cell` now reflect the active row density as `data-density` (`compact`/`balanced`/`spacious`), so a theme can override cell padding per density via `defineTheme`. Previously the density split lived entirely in internal StyleX classes with no `density:*` hook on the cell target, so a `components: { 'table-cell': {...} }` entry could only set one padding for all densities — it could not, for example, hold the inline inset constant while varying only the block padding per density. The targets now carry the hook (`{className: 'astryx-table-cell', visualProps: ['density']}`), enabling `components: { 'table-cell': { 'density:balanced': { paddingBlock: '12px' } } }`. Purely additive — default padding is unchanged.
- Table: `useTableTreeData` gains an opt-in `hasRowClickExpansion` prop. When set, clicking anywhere on an expandable row toggles it, in addition to the chevron. Clicks on interactive cell content or a text selection are ignored, leaf rows stay inert, and it is a no-op on flat data. (#4142)
- Text & Heading: `color` is now theme-extensible. `TextColor` is derived from a new `TextColorMap` interface (same technique as `ButtonVariantMap` etc.), so a theme can add custom text colors — `astryx theme build` generates the module augmentation when it sees new `color:*` values on Text/Heading overrides, and consumers can augment `TextColorMap` manually for type safety. A custom color renders as a stable class (`astryx-text.<color>` / `astryx-heading.<color>`) that theme CSS paints, falling back to the `primary` StyleX baseline so it never renders unstyled. Built-in colors are unchanged.
- Timestamp: the hover surface is now a single copyable hover card for every timestamp that shows one. Relative timestamps and `tooltipEntries`-configured timestamps share one card, replacing the old read-only tooltip; the default single row carries the full absolute time and is itself copyable.
  Each `tooltipEntries` row opts into a copy button via `isCopyable` (default `false`) — so a card can mix human-readable, read-only rows with a copyable machine value (e.g. show local and UTC for reading, but only let readers grab the `system_date_time` value). Copyable rows render their copy button in a dedicated trailing action column so the buttons align down one column regardless of value width; that column is only reserved when some row is copyable, so a fully read-only card carries no trailing gutter. The card's labels use the `supporting` text role (the secondary, quieter register that is Timestamp's own default) and values the `body` role.
- Timestamp: add a `relative_short` format — the compact sibling of `relative`. It uses the same tier boundaries and present/clock-skew handling but renders abbreviated units for space-constrained surfaces (chat metadata, dense tables, chips): `now`, `30s ago`, `5m ago`, `2h ago`, `1d ago`, `3mo ago`, `2y ago`, and `in 5m` for future times. Months render as `mo` (not `m`) so they never collide with minutes; the short form is always numeric (no `yesterday` idiom). Like `relative`, it keeps the full absolute date as its accessible name and gets the hover tooltip and live updates. Additive — existing formats are unchanged.
- Timestamp: rename the recently added `system_unix` format to `unix_seconds`. The value is absolute Unix time in whole seconds since the epoch — not a wall-clock `system_*` rendering — so it does not belong to the `system_*` family; the explicit unit name also leaves room for a future `unix_millis`. Behavior is unchanged (zone-independent epoch seconds). This renames a format value that only just shipped, before it has consumers.
- Timestamp: two additions. (1) A new `system_unix` format renders the value as Unix time in whole seconds since the epoch (e.g. `1771520400`) — an absolute, zone-independent machine value, useful as a copyable `tooltipEntries` row alongside human-readable zones. It joins the `system_*` machine-readable family and, being absolute, ignores any tooltip time zone. (2) The copyable hover card's copy button now shows a visible `Copy` tooltip on hover/focus (flipping to `Copied` after a copy, in step with the icon), so the affordance is discoverable for sighted users; the full `Copy <value>` string remains the button's aria-label for assistive tech. Both additive — no change to existing formats or default rendering.
- Add `useContainerReveal` — a headless hook for revealing (or concealing) content when its container is hovered or focused. CSS-driven (no hover state in JS, no re-render on hover) and accessible by construction: revealed content stays in the accessibility tree and tab order, reveals on keyboard focus-within, and stays visible on touch. Callers spread `getContainerProps()` on the container and `getContentRevealProps()` on each child; no StyleX authoring required. `Thumbnail`'s `showRemoveOn="hover"` now uses this hook internally (no API change).

#### Fixes

- AppShell: make the skip-link target focusable (tabIndex={-1}), localize the skip-link label via the i18n catalog, and expose the header region as a banner landmark
- CheckboxList: each option is a single tab stop — the checkbox is the option's only focusable control (WCAG 4.1.2). The row is now an enlarged click/tap target that delegates surface clicks to the checkbox via a new `interactiveRef` prop on Item/ListItem (the useClickableContainer pattern), replacing the internal invisible row button. `interactiveRef` is mutually exclusive with `onClick`/`href`.
- Resizable, TabMenu: two collection ARIA minors (WCAG 4.1.2) — Resizable's collapsed handle clamps `aria-valuenow` to `aria-valuemin` and announces a localized "Collapsed" via `aria-valuetext`, and TabMenu overflow options are `menuitemradio` with `aria-checked` (APG menu-button single-select) instead of `menuitem` + `aria-current`.
- core: preserve state indication for painted controls (Switch, CheckboxInput, RadioList, SegmentedControl, ToggleButton, Skeleton) under forced colors / Windows High Contrast (WCAG 1.4.11)
- i18n: localize remaining hardcoded assistive-tech strings (AvatarGroup overflow label, CodeBlock copy announcement, Button loading announcement, MetadataList show more/less, Table row-expansion context-menu actions, keyboard hint)
- i18n: add `@astryx.step.*` catalog keys (`goToStep`, `goToStepWithStatus`, `status.completed`/`status.warning`/`status.error`) backing the lab Stepper's localized status text and clickable-step accessible names.
- Lightbox: add keyboard zoom (Enter/Space on the image, `+`/`-`) and arrow-key panning while zoomed, with polite announcements (WCAG 2.1.1)
- Selector: convey MultiSelector select-all partial state in its accessible name, mark Selector/MultiSelector empty-state messages presentational inside the listbox, and remove Typeahead's collapsed input from the Tab order while a token is shown
- Toast: announce toasts via the persistent singleton live regions instead of per-toast regions that mount together with their content
- theme: guarantee WCAG contrast for generated color token pairs — text-on-surface pairs are asserted at >= 4.5:1 and non-text UI pairs at >= 3:1 (WCAG 1.4.3/1.4.11), with `--color-border-emphasized` tone-bumped in generation until it clears 3:1 against the generated surface
- Token: render the remove button as a sibling of the link instead of nesting it inside the anchor when both `href` and `onRemove` are provided. The token surface now delegates to the link via `useClickableContainer`, so clicking anywhere on the token (including with middle-click or cmd/ctrl+click to open in a new tab) activates the link, while the remove button keeps handling its own clicks.
- theme build: generated custom Button variants now type-check through the public `@astryxdesign/core/Button` subpath.
- Use spacing tokens for ChatComposerDrawer bar handle dimensions.
- ChatLayout no longer shows a phantom scrollbar in self-scroll mode when messages don't fill the viewport. The root is now a flex column: the message area flexes to fill the space the composer dock doesn't need, so the sticky dock's natural height is part of the 100% instead of overflowing past it by exactly the dock height. Long conversations still scroll and the dock still sticks; external-scrollRef mode (fixed dock) is unchanged.
- Deprecate the `isRtl` option on `useListFocus` and `useGridFocus`. Right-to-left arrow-key direction is now auto-detected from the container, so the explicit override is redundant and will be removed in an upcoming major — omit it and RTL is handled automatically.
- DropdownMenu now reports uncontrolled native open/close transitions and restores focus to the trigger after native popover dismissals.
- DropdownMenu: a submenu trigger no longer shows a second highlight when hovered while another item still holds focus — hover now moves the single focus-driven highlight onto the trigger, matching regular menu items
- CheckboxInput & Switch: clicking the field description now forwards to the control (the whole label area is one hit target), while clicks on interactive content inside a description (links, buttons) are left alone. No new prop or accessibility-tree change — the description stays a sibling of the label, so it isn't folded into the control's accessible name.
- FieldLabel: localize the "Required"/"Optional" indicator through the i18n runtime instead of hardcoding English, so consumers can translate it via `InternationalizationProvider` (#4508).
- useContainerReveal: eliminate the exit flicker on the default (non-layout-preserved) reveal. Hidden content flips `position: static -> absolute` discretely, which previously snapped it out of layout flow at full opacity before the fade could run. The flip now participates in the transition with `transition-behavior: allow-discrete` and a state-conditional delay, so it stays in flow until the opacity fade finishes on exit while remaining immediate on entry. Content stays in the accessibility tree and tab order throughout.
- Selector and MultiSelector: with `statusVariant="detached"`, the on-field status icon is no longer shown inside the trigger. The detached message box already renders its own leading status icon, so the field keeps its chevron indicator instead of duplicating the glyph — matching the bordered inputs.
- Dynamic `import()` specifiers now get their mandatory `.js` extension in the published ESM dist — `babel-plugin-add-extensions` only rewrote static import/export declarations, so the lazy Tooltip specifier in `Text`, `Heading` and `Timestamp` shipped extensionless and strict-ESM consumers (Rspack, webpack `fullySpecified`, Node ESM) failed to resolve any component importing them. A new post-build gate (`scripts/check-fully-specified.mjs`) now fails any build whose dist ships an extensionless relative specifier. (#4569)
- TopNavMegaMenu: keep the desktop mega-menu panel within the viewport — cap its height to the space below the nav (scrolling internally) and clamp its width — so a tall or wide menu no longer overflows the screen edge and clips content
- Lightbox: make backdrop click dismissal actually reachable
  The dismiss check only matched clicks on the dialog element itself, but the layout container fills the entire transparent dialog, so clicks on the dark area around the media always landed on the container and never closed the lightbox. Clicks on the container now dismiss too, and a pan drag that ends over the backdrop is ignored.
- Markdown streaming perf tests declare explicit timeouts matching their own budgets, instead of relying on vitest's 5s default
- MetadataList: a numeric `columns` value is honored with stacked labels. `columns={3}` previously fell back to the responsive `repeat(auto-fill, minmax(280px, 1fr))` grid whenever labels were stacked (the default for multi-column lists), so the documented fixed column count only worked with `label={{position: 'start'}}`. The grid template now covers both label positions — `repeat(n, 1fr)` for stacked labels, `repeat(n, auto 1fr)` for side labels — and resolves through a StyleX dynamic style instead of an inline `style` object.
- MultiSelector: remove the trigger button's own focus outline so it no
  longer doubles the field wrapper's focus ring. The wrapper renders a single `:focus-within` ring, matching `Selector` and the other bordered inputs.
- NumberInput: hide the browser's native number spinners so the field matches the component's own visual treatment across browsers, and stop a focused wheel gesture (which steps the value) from also scrolling an ancestor container. Keyboard stepping and the `spinbutton` role are unchanged, so there is no accessibility impact.
- Pagination: mirror the prev/next chevrons under RTL with CSS (the shared `scaleX(-1)` mirror) instead of reading the ambient direction in JS. The controls now flip purely from an ancestor's `dir`, matching Calendar and the rest of the library — so they render correctly on the server with no hydration flash. No API change; `aria-label`s are unchanged.
- Popover: expose wrapper role and modal options so non-dialog popup content can own its semantics.
- Add a shared `rtlStyles.centerInline(blockOffset)` helper for horizontally centering an absolutely-positioned, auto-width element on the inline axis, with an optional block-axis offset folded into the same transform. It intentionally uses physical `left: 50%` + `translateX(-50%)` — both reference the same physical edge, so the pair is direction-symmetric and centers identically in LTR and RTL. A logical `insetInlineStart: 50%` anchor would flip in RTL while the physical translate does not, shifting the element off-center by its own width. This is the one case where physical `left` is correct, so the single sanctioned `no-physical-properties` suppression lives in the helper rather than at each call site.
  The `@astryx/no-physical-properties` rule now recognises this `left: '50%'` + centering `translate` idiom and points offenders at the helper instead of wrongly suggesting a logical rename.
- The RTL physical→logical migration is complete, so promote the `@astryx/no-physical-properties` lint rule from `warn` to `error` in both the recommended and strict tiers. This gates against future physical-property regressions now that the core package is clean (the one sanctioned physical suppression lives in `rtlStyles.centerInline`).
- RTL Phase 4c — make three animated/interactive behaviors direction-aware under RTL: the ProgressBar indeterminate bar now slides along the reading flow (right → left) instead of always physically left → right; the Switch thumb mirrors on toggle (off-thumb on the reading-start side, on-thumb on the reading-end side, per Material/iOS convention); and horizontal Layer enter animations (Popover/DropdownMenu/HoverCard/Selector placement start/end) now nudge in from the correct physical side. Vertical Layer entrances are unchanged (direction-neutral). LTR behavior is identical.
- Complete the RTL physical→logical CSS migration across the core package: the final components (Avatar, Banner, Calendar, Chat composer, Chat composer drawer, Markdown, Popover, Slider, Resizable) now use CSS logical properties (`insetInlineStart/End`, `borderStart*/End*` radii, `textAlign: 'end'`) instead of physical `left`/`right`, so they mirror correctly under RTL. The Avatar status dot's outward-push `transform` is now direction-aware, so it hugs the bottom-inline-end corner (bottom-right in LTR, bottom-left in RTL) instead of pulling inward under RTL.
  The Popover close button, vertical Slider track/thumb, and ResizeHandle centered grab-zone/pill now consume the shared `rtlStyles.centerInline` helper — fixing an RTL regression where a logical `insetInlineStart: 50%` anchor combined with a physical centering `translate` shifted the element off-center by its own width.
- TextArea: the `<textarea>` now spans the full input container, with icons, status/spinner, and the character counter as absolutely-positioned overlays. The native resize grip sits in the container's bottom-right corner and the scrollbar covers the whole field. The `maxLength` counter moved inside the container, anchored bottom-right beneath the text (#4233).
- Thumbnail: show the placeholder when the image fails to load
  The docs promise a placeholder on load failure, but the img had no error handling, so a broken src rendered a broken image indefinitely. The component now tracks the errored src and falls back to the placeholder, retrying when src changes.
- TreeList arrow-key navigation now follows visual direction in RTL: ArrowLeft expands and ArrowRight collapses under `dir="rtl"` (mirrored from LTR). Detected automatically; LTR is unchanged.

#### Documentation

- Soft-deprecate useTableRowExpansion and useTableRowExpansionState in favor of the tree plugin (useTableTreeData + useTableTreeState). The hooks still work; JSDoc @deprecated tags and the docs point to the migration guide. Removal will come in a later release.
- Document the `@astryxdesign/core` StyleX peer dependency — add `@stylexjs/stylex` to the Getting Started / Quick Start install commands in both READMEs, and add an `astryx init` next-steps reminder to ensure the `@stylexjs/stylex` peer dependency is met, with a pointer to `astryx doctor`. StyleX is the styling runtime every component calls, and not all package managers auto-install peers.
- Surface the React 19 peer-dependency requirement everywhere a user would look for it (root README, core README, docsite hero, and the CLI getting-started guide), and add a sync test that keeps those surfaces naming the same React major as the core peer range.
- Add a migration guide from useTableRowExpansion to useTableTreeData + useTableTreeState (before/after example plus a config mapping), since the two tree plugins are converging.

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @arham766
- @athz
- @bhamodi
- @cixzhang
- @freddymeta
- @HelloOjasMutreja
- @humbertovirtudes
- @imdreamrunner
- @jiunshinn
- @josephfarina
- @nynexman4464
- @potatowagon

---

# 0.2.0

#### Breaking Changes

- TabList: remove orientation prop (misleading no-op). The prop did not render vertical tabs; it only toggled the keyboard-hint badge arrows. Arrow navigation has always accepted both axes (horizontal and vertical) via orientation: both in useListFocus. Run astryx upgrade to auto-strip the prop from your code.

#### New Features

- `Avatar` gains optional interactivity via `href`/`onClick` (with `as`/`target`/`rel`), following Button's element-swap trichotomy: `href` renders a link through `useLinkComponent`, `onClick` (no href) renders a `<button type="button">`, and with neither the avatar stays the static, non-focusable element it is today (non-breaking default). Interactive avatars get the focus-visible accent ring and a required accessible name (from `alt`/`name`). Inside `AvatarGroup`, interactive avatars — and an interactive `AvatarGroupOverflow` — now share a single Tab stop with roving ArrowLeft/ArrowRight focus, and the group exposes a screen-reader keyboard hint via `aria-describedby`. A purely static facepile is unchanged. (#4170)
- Citation: `CitationSource.icon` now accepts a `ReactNode` (e.g. an Astryx `<Icon>`, an SVG, or a custom element) in addition to an image URL string, and a new `CitationSource.src` field holds a favicon/logo image URL (mirroring `Avatar`/`Thumbnail`). Additive and non-breaking: a string `icon` still renders as the favicon `<img>`, so existing callers are unaffected. When both a node `icon` and `src` are set, the node wins. The icon stays decorative — the accessible name still comes solely from the citation's `aria-label`.
- CodeBlock: move the collapse chevron to the left of the title/language label, following the leading-disclosure convention (points right `>` when collapsed, down `v` when expanded). It grows into place (width + inline margin) so it slides the title over smoothly instead of popping in and shifting the header. Respects `prefers-reduced-motion` (#4513)
- Collapsible: expose the trigger button as a distinct theming target (`astryx-collapsible-trigger`) so themes can style the trigger independently from the content — e.g. a heading font on the trigger while the content keeps the body font.
- DateInput: add `astryx-date-input-clear-icon` and `astryx-date-input-toggle-icon` theme targets on the clear and calendar-toggle glyphs, so consumers can recolor, resize, and hover-style each icon — and style the toggle's open/closed state — via `defineTheme` instead of a fragile descendant selector or raw CSS. The toggle reflects its open/closed state as a `data-state` attribute. `Icon` now fully handles its styling props (`className`, `style`, `xstyle`) so they compose with its base styles instead of being dropped. Default rendering is unchanged.
- DateRangeInput: add `astryx-date-range-input-clear-icon` and `astryx-date-range-input-toggle-icon` theme targets on the clear and calendar-toggle glyphs, so consumers can recolor, hover-morph, and resize them via `defineTheme` instead of a fragile descendant selector or raw CSS. The toggle icon reflects its open/closed state as a `data-state` attribute. `Icon` now fully handles its styling props (`className`, `style`, `xstyle`) so they compose with its base styles instead of being dropped. Default rendering is unchanged.
- DateTimeInput: add `astryx-date-time-input-date-segment` and `astryx-date-time-input-time-segment` theme targets on the two segment wrappers, so a theme can restyle their geometry (padding/height/font) via `defineTheme` instead of being unable to reach them at all. Both reflect `size` and `status` as data attributes, mirroring the root target. Default rendering is unchanged.
- DropdownMenu: add submenus via a single `DropdownMenuSubMenu` component (or a nested `items` array in data mode). The row adopts DropdownMenuItem semantics (label / icon / description / isDisabled) and its children — or an `items` array — become the flyout content. Flyouts open inline-end with auto-flip, hover-intent, and full keyboard support (Right/Enter/Space opens and focuses the first item; Left/Escape closes and returns focus to the trigger).
- Bordered inputs gain a `statusVariant="tooltip"` option that hides the status message box and surfaces the status as an info-tip on the on-field status icon. The icon is a real focusable button so the status is reachable by everyone: keyboard users tab to it (with a visible focus ring) and see the message on focus, pointer users see it on hover, and touch users tap to toggle it. The message is piped into both the input's and the button's `aria-describedby`, and the tooltip is dismissible with Escape. Added to TextInput, TextArea, NumberInput, DateInput, DateRangeInput, TimeInput, and FileInput.
- The bordered input family now accepts a `statusVariant` prop (`'attached' | 'detached'`, default `'attached'`) that forwards to the underlying `Field`, letting you float the status message below the input with spacing instead of overlapping it. Added to TextInput, TextArea, NumberInput, DateInput, DateRangeInput, TimeInput, Selector, MultiSelector, Typeahead, Tokenizer, FileInput, and PowerSearch. Non-breaking: the default matches today's behavior. (#4187)
- Add RTL direction API: `useDirection()` hook, `getLocaleDirection(locale)` server-safe helper, and an optional `dir` prop on `InternationalizationProvider`.
- RTL: mirror directional disclosure/navigation chevrons under RTL via a shared `rtlStyles.mirror` CSS transform, applied to the icon wrapper in Lightbox and the Table tree / grouped-rows / row-expansion plugins. The mirror composes correctly with the Table chevrons' state-rotation (expanded chevrons still point down under RTL). Semantic aria-labels are unchanged.
- Selector & MultiSelector: add `astryx-selector-clear-icon`, `astryx-selector-indicator-icon`, `astryx-multi-selector-clear-icon`, and `astryx-multi-selector-indicator-icon` theme targets on the clear and chevron glyphs, so consumers can recolor, resize, and hover-style each icon — and style the chevron's open/closed state — via `defineTheme` instead of a fragile descendant selector or raw CSS. Each chevron reflects its open/closed state as a `data-state` attribute. `Icon` now fully handles its styling props (`className`, `style`, `xstyle`) so they compose with its base styles instead of being dropped. Default rendering is unchanged.
- add size prop (sm / md) to Switch to match CheckboxInput and RadioList boolean control scales (#4230)
- Table: `rowIndexStart` and `rowCount` props expose row numbering as a table-level ARIA concern, so `aria-rowindex`/`aria-rowcount` reflect a row's position in the full dataset: correct across pagination and even when no visible index column is rendered. Opt-in; tables that set neither prop are unchanged. Closes #3939.
- Timestamp: new `tooltipEntries` prop renders the hover tooltip across several time zones and/or formats at once — one line per entry, each with an optional `timezoneID` (IANA id; omit it or pass `'local'` for the viewer's zone), `format` (every non-relative `TimestampFormat` plus `'full'`), and `label`. The default is unchanged: with no entries the tooltip stays the single full absolute line in the viewer's zone. Configuring entries also attaches the tooltip to absolute formats, which previously had none — note that this gives those timestamps a tab stop and focus ring, as relative timestamps already have, so a column of them gains one tab stop per row. `hasTooltip={false}` still suppresses the tooltip, and an empty array counts as no configuration. Also corrects `isTimezoneShown`'s documentation, which claimed it applied to the `system_date_time` and `system_time` formats; it never has, and those formats stay machine-readable. (#4188)
- Token: make the `color` prop extensible via module augmentation. `TokenColor` is now derived from a `TokenColorMap` interface, so theme packages can add custom colors (and `astryx theme build` generates the type augmentation), matching Badge and Button.
- TreeList: the per-level indentation step is now the themeable `--tree-list-indent` variable (default `var(--spacing-4)`), so a theme can retune the indent metric via `defineTheme` on the `tree-list` target instead of the previously hardcoded, unreachable step (#4308).
- TreeList: add a `variant` prop (`'lineGuides' | 'noGuides'`, default `'lineGuides'`) to select the base hierarchy guide-line look. `noGuides` hides the connector lines while keeping indentation intact. Orthogonal to `density` (spacing); the guides stay themeable via the `astryx-tree-list-guide` target. Non-breaking — omitting the prop renders exactly as before.

#### Fixes

- Avatar: compose the status dot's label into the avatar's accessible name so assistive tech can reach the status the `role="img"` root previously pruned (WCAG 4.1.2)
- Calendar: expose selected state in day-button accessible names, announce range-selection progress and completion via the polite live region, and set aria-multiselectable on the grid in range mode
- CommandPalette: announce result counts, empty, and loading states to screen readers via the shared polite live region (WCAG 4.1.3)
- Divider: expose the label as the separator's accessible name via aria-labelledby; Spinner: name the status element from the visible label instead of duplicating it as aria-label
- FileInput: announce the required state via a visually hidden description on the trigger (aria-required is unsupported on role="button") and announce validation errors exactly once
- hooks: resolve focus-trap Escape by DOM depth instead of push order, exclude aria-hidden subtrees from trap tab cycles, and auto-clear live regions after announcing so stale status text does not linger
- List: keep list semantics for all listStyle variants by always emitting an explicit role="list", since the base style strips list-style-type for every variant and Safari/VoiceOver drops implicit list roles for such lists (WCAG 1.3.1)
- NumberInput: announce the units text through the input's accessible description, and stop TextInput/NumberInput from referencing the non-rendered status message id in aria-describedby inside InputGroup
- reset: stop suppressing `:focus-visible` outlines on coarse-pointer devices so keyboard users keep the WCAG 2.4.7 focus indicator
- hooks: auto-detect RTL direction for arrow-key navigation in useListFocus and useGridFocus (WCAG 1.3.2)
- Slider: constrain range thumb aria-valuemin/aria-valuemax by the sibling thumb (including minStepsBetweenThumbs) and render the label as a group label wired via aria-labelledby instead of an inert <label htmlFor>
- TopNav: disabled TopNavItems now render href-less anchors so they no longer navigate or fire clicks, and Outline's active item uses aria-current="location"
- Avatar: avoid remounting the avatar subtree when the name tooltip toggles — render the tooltip as a conditional sibling instead of forking the return so the avatar keeps its position in the React tree (and its image-load state) across tooltip changes.
- Card: rest the bordered variant on the subtle `--color-border` instead of `--color-border-emphasized`, so a Card's outer frame matches its own LayoutHeader/LayoutFooter dividers and neighboring ClickableCards instead of rendering a heavier edge.
- CheckboxInput, RadioList, Switch: align control sizes. The visible checkbox and radio controls now fill their size exactly (20px at `sm`, 24px at `md`) instead of being inset 2px. The `sm` Switch track is now 32px wide with a 2px inset.
- Export the `BaseProps` type through the `@astryxdesign/core/BaseProps` subpath. Previously it was only reachable through the package barrel, so the `import type {BaseProps} from '@astryxdesign/core/BaseProps'` specifier that `astryx swizzle` generates failed to resolve (#4091).
- Guard DropdownMenu item hover styles with `@media (hover: hover)` to prevent sticky highlights on touch devices. Forward BaseProps pass-throughs to the menu element.
- FieldStatus renders a leading status icon on the `detached` message so status is not conveyed by color/position alone (WCAG 1.4.1). The icon is decorative for assistive tech; the message text and live-region announcement carry the status. The `attached` variant is unchanged.
- FileInput no longer nests interactive controls (the clear and status buttons) inside a role="button" trigger. The trigger is now a visually hidden button alongside them in a non-interactive container, resolving the nested-interactive a11y violation (WCAG 4.1.2) while keeping click, keyboard, and drag-and-drop behavior. (#4522)
- Inputs no longer show the hover ring while disabled. The shared input wrapper's disabled state now suppresses both the base and status hover shadows, so TextInput, TextArea, NumberInput, DateInput, TimeInput, Selector, MultiSelector, Typeahead, and Tokenizer stay visually inert on hover when disabled.
- HoverCard: move themeProps className to the layer container (where bg/radius/shadow live) so themes can target the visual surface. Forward consumer xstyle/className/style to that same layer container so surface customization lands next to the theme class, instead of silently dropping them.
- With `statusVariant="detached"`, bordered inputs no longer render a status icon inside the control (this also covers DateTimeInput, which is fixed to the detached presentation) — the detached message box already carries a leading icon, so the on-field glyph was a duplicate. Also centers the detached message's icon on the first line of text.
- DropdownMenu/ContextMenu: mouse hover now moves the highlight instead of adding a second one, so keyboard focus and pointer hover share a single highlighted item (#4493)
- utils: clamp plainDateAddMonths to the target month's last day
  Adding a month to Jan 31 landed on Mar 3 (Date#setMonth overflow) instead of Feb 28, so month arithmetic from end-of-month dates skipped February entirely. The helper now uses pure month arithmetic and clamps the day, matching Temporal.PlainDate.add and date-fns.
- Calendar RTL: month-navigation chevrons now mirror correctly under RTL (via the shared `rtlStyles.mirror` transform on the nav-icon wrapper), and the range-selection / hover-preview fill pills use logical CSS (`insetInline*`, `border*Start/EndRadius`) so their rounded start/end caps follow the reading direction instead of the physical left/right. LTR rendering is unchanged.
- Carousel now supports RTL: the directional scroll-button chevrons mirror under RTL, the scroll buttons respect RTL scroll semantics (previously the button was a no-op under RTL), and the button pills sit on the correct edges.
- RTL: migrate physical `left`/`right` CSS properties to their logical equivalents so components mirror correctly under `dir="rtl"`. This is the Phase 2 mechanical, one-to-one follow-up to the RTL direction API — a no-op in the default LTR direction with no visual change.
- RTL Phase 4 (behavioral): mirror directional behavior that logical-CSS and icon name-swaps alone couldn't fix. SideNavCollapseButton and TreeListItem now compose `rtlStyles.mirror` on the icon wrapper outside the state rotation, so the chevrons point toward the correct edge in every collapsed/expanded × LTR/RTL combination. TreeList connector/guide lines position via logical `inset-inline-start`/`inset-inline-end` so they mirror to the inline-start (right) edge under RTL alongside the chevron and row indent. Slider positions its thumb, fill, and marks via logical `inset-inline-start` and flips the physical centering transform under RTL, and its pointer/click math measures the value fraction from the inline-start (right) edge under RTL — so a click at 25% of the track maps to 75 instead of 25.
- RTL Phase 4b behavioral fixes: ChatMessageBubble grouped-bubble tail corners now use logical border radii so the tail follows reading direction (mirrors under RTL, text unaffected); Table sticky-column shadows make their `translateX` and gradient direction-aware so the shadow fades from the pinned edge toward scrolled content in both LTR and RTL instead of rendering inside-out, and gate shadow visibility on `Math.abs(scrollLeft)` so the start/end shadows still appear under RTL (where spec-compliant browsers report a negative `scrollLeft`); ResizeHandle's hit-area bias is now direction-aware (mirrors about center under RTL) and the pointer-drag delta reads the handle's computed direction so dragging resizes intuitively in RTL.
- Markdown honors the `components.image` override for standalone (block) images, matching the inline image path. A standalone `![alt](src)` line parses as a block image, whose render path previously hardcoded a bare `<img>` and ignored a supplied `components.image`; it now uses the override just like an inline image does.
- Selector & MultiSelector: keep group headers visible while searching; hide groups with no matching items. Previously, typing a query flattened grouped options into a single ungrouped list; now each group header stays above its matching items and a group is hidden only when none of its items match.
- SideNav: remove the top border above the footer region so the `footer` slot no longer renders a divider line.
- Slider: round snapped values to the min/step decimal precision
  With fractional steps, `min + steps * step` accumulated binary floating-point error, so a keyboard nudge on a `step={0.1}` slider emitted `0.30000000000000004` through `onChange`/`onChangeEnd` (and into `aria-valuenow`/the value tooltip once the consumer echoed it back). Snapped values are now rounded to the combined decimal precision of `min` and `step`, which removes only the error — exact steps are unaffected.
- Tooltip: dismiss the tooltip when its trigger is pressed. Previously the tooltip stayed open through a click (e.g. a "Copy link" button's tooltip lingered after activation); now pressing the trigger hides its own tooltip. Applies to uncontrolled tooltips only.
- Typeahead: omit aria-activedescendant when search results are empty or index is out of bounds (#4059)

#### Documentation

- document `width` prop across 17 input component doc files (#4163)

#### Other Changes

- Add `@astryx/no-physical-properties` ESLint rule that flags physical left/right CSS properties inside `stylex.create()` and suggests the CSS logical equivalent for RTL support.
- KEY-BASED: `marginLeft`/`marginRight`, `paddingLeft`/`paddingRight`, `borderLeft`/`borderRight` (+ their `Width`/`Style`/`Color` longhands), `left`/`right` → `insetInlineStart`/`insetInlineEnd`, and the four physical corner radii → their diagonal-aware logical names (`borderTopLeftRadius` → `borderStartStartRadius`, etc.).
- VALUE-BASED: `textAlign: 'left'|'right'`, `float: 'left'|'right'`, and `clear: 'left'|'right'` (the key stays, only the physical value is flagged).
- Scoped strictly to `stylex.create()` — physical identifiers used elsewhere are ignored.
- `useDirection()` returns `'ltr' | 'rtl'` for the current provider context (falls back to `'ltr'` when called outside a provider).
- `getLocaleDirection(locale)` computes direction from a BCP 47 locale via `Intl.Locale.getTextInfo()` — safe to call from React Server Components and Next.js layouts to set `<html dir>`.
- `<InternationalizationProvider locale="ar">` auto-derives `dir="rtl"`. Pass an explicit `dir` prop to override (useful for RTL testing under an English catalog, or to force LTR).
- Pagination is the first component to consume the hook: prev/next chevron icons flip under RTL while the aria-labels stay semantic.
- Storybook gains a global `Direction` toolbar for toggling every story between LTR and RTL.
- Component-level CSS migrations (borders, chevrons, sliders, calendar range pills, etc.) land in follow-up PRs.
- `textAlign: 'left' | 'right'` → `'start' | 'end'` (Selector, Typeahead, Chat trigger menu, DropdownMenu, CommandPalette, NavMenu items).
- `borderLeft*`/`borderRight*` → `borderInlineStart*`/`borderInlineEnd*`, kept as separate start/end declarations (Banner, Table cell/header dividers, DateRangeInput preset sidebar).
- Static `left`/`right` positioning → `insetInlineStart`/`insetInlineEnd` for full-bleed overlays and single-side offsets (Button spinner overlay, Chat dock/blur/placeholder, Field sr-only label, Lightbox close/nav/counter buttons, TabList indicators, Thumbnail remove slot, CodeBlock copy button).
- Inline `marginLeft` indentation → `marginInlineStart` (TreeList rows).

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @arham766
- @bhamodi
- @cixzhang
- @ernestt
- @freddymeta
- @HelloOjasMutreja
- @humbertovirtudes
- @kentonquatman
- @lexs
- @nynexman4464

---

# 0.1.9

#### New Features

- Avatar: add a `tooltip?: string | boolean` prop for a name-on-hover tooltip. Omitting it (or `true`) shows the avatar's `name` on hover and keyboard focus; a string shows that text instead (no need to wrap in `Tooltip`); `false` disables it. Avatar owns the tooltip via the existing Tooltip hook, so there's no extra wrapper DOM. Because this adds a default tooltip to every existing named Avatar, set `tooltip={false}` when you supply your own `Tooltip`/`HoverCard` overlay. The root `aria-label` (`alt || name`) is unchanged; the default name tooltip is visual-only (no `aria-describedby` double-announce), while a custom string tooltip is exposed as a description. Decorative avatars (no `name`/`alt`) get no tooltip. (#4164)
- BreadcrumbItem gains a `menu` prop that turns a crumb into a menu trigger for switching between sibling destinations. It accepts the same item API as DropdownMenu/MoreMenu/ContextMenu (a `DropdownMenuOption[]` array or composed item children), so existing menu-item definitions drop into a breadcrumb with no rewrite. The item components are also re-exported under `Breadcrumb*` aliases.
- Calendar: make the today/selected day-cell ring precisely themeable. The day cell now reflects a compound `marker` state (`today-only` / `today-in-range`) that maps 1:1 to the treatment actually drawn, so `defineTheme({components: {'calendar-day': {'marker:today-only': {...}}}})` targets exactly those states without over-matching or needing a `:not()` exclusion. Default rendering is unchanged.
- Calendar: add a dedicated `astryx-calendar-nav` theme target for the prev/next month-nav buttons, so consumers can theme the nav controls (color, radius, per-direction, disabled edge) without reaching every Button via the global `astryx-button` handle. Reflects `nav` (prev/next) and the `disabled` state as data attributes.
- ChatComposer: make custom inputs first-class. `useChatComposerContext()` and its types are now public, so any input in the `input` slot can read `value`/`onChange`/`onSubmit`/`canSend`/`placeholder`/`isDisabled` and drive the shell's send button. Inputs can register a focus control on `inputControlRef` so click-to-focus works for any input shape (not just `contenteditable`/`textarea`); the shell keeps a DOM-query fallback for uninstrumented inputs.
- ChatComposerInput: add an `onKeyDown` seam so consumers can host platform- or app-specific key handling — e.g. `preventDefault()` Enter to insert a newline on a touch keyboard, or submit on Cmd/Ctrl+Enter. Enter also no longer submits mid-IME-composition.
- CommandPalette: add a dedicated `astryx-command-palette-group-heading` theme target on the group heading, so consumers can theme just the heading (e.g. its padding or typography) via `defineTheme` instead of a fragile structural selector. The group root keeps its own `astryx-command-palette-group` target.
- DateInput gains a `format` prop for the committed date value, reusing Timestamp's `format` vocabulary so the same literal renders the same date shape in both components. Named values are `date_long` (the default, "March 21, 2026"), `date` ("Mar 21, 2026"), `date_weekday` ("Wed, Mar 21, 2026"), and `system_date` ("2026-03-21"); a `(value) => string` function is also accepted for custom output. The `date_long` default is byte-identical to DateInput's previous long-month rendering, so existing usage is unchanged. This also extends Timestamp with two new shared members, `date_long` and `date_weekday`, giving the two components full value parity on the date-only formats. Formatting applies only to the committed value, never to text being typed.
- Add an `elevation` prop to configurable surfaces — Card, ClickableCard, SelectableCard, Button, IconButton, ButtonGroup, and Banner take the full `'none' | 'low' | 'med' | 'high'` scale; ChatComposer takes `'none' | 'low'`. Defaults preserve today's appearance (`none` everywhere except ChatComposer's `low`), so nothing changes unless you opt in. (#4146)
- OverflowList: add `maxVisibleItems` to cap the number of visible items (the ceiling partner to `minVisibleItems`) and `maxRows` for bounded multi-row wrapping — items wrap onto up to N rows, then collapse into the overflow indicator. Both props are optional and default to off, so single-line behavior is unchanged. See #4176.
- Add `useTableRowStatus`, a plugin that prepends a narrow column
  signaling per-row status.
- Thumbnail: add `showRemoveOn` prop — `'hover'` (default) reveals the remove button on hover or keyboard focus and keeps it visible on touch; `'always'` shows it at rest.
- Table tree: add an optional expand-all/collapse-all header control (#4142)
  `useTableTreeState` now returns an aggregate `isAllExpanded` state (`true` / `false` / `'indeterminate'`) and threads `expandAll` / `collapseAll` into `treeConfig`. `useTableTreeData` gains a `hasExpandAllControl` prop: when set, it renders an expand-all/collapse-all toggle in the tree column header, wired to that state, so consumers no longer need to hand-roll external buttons. Flat data stays a full no-op. This is the first affordance folded in from `useTableRowExpansion` as part of converging the two tree plugins.
- TreeList: add a dedicated `astryx-tree-list-chevron` theme target for the expand/collapse toggle, so consumers can theme the chevron (color, per open/closed state) via `defineTheme` instead of reaching it through the functional `[data-tree-toggle]` attribute. Reflects the open/closed state as a `data-state` attribute (`expanded`/`collapsed`); the functional `data-tree-toggle` hook is unchanged.
- TreeList: add a stable `astryx-tree-list-guide` theme target on the hierarchy guide (connector) line elements, so consumers can recolor or hide the guides through `defineTheme` (e.g. `backgroundColor`, or `display: 'none'` to hide them) instead of hiding the built-in connectors and reimplementing them with unlayered CSS.
- TreeList: add a dedicated `astryx-tree-list-item-label` theme target on the item's label text, so consumers can theme just the label (e.g. bold the selected item's label) via `defineTheme` instead of a fragile `button:not([data-tree-toggle]) > span` structural selector. Reflects the row's `selected` state as a `data-selected` attribute on the label.

#### Fixes

- AvatarStatusDot: pair each variant with a distinct built-in shape — success stays a filled dot, neutral renders as a ring, error gets a minus bar — so status no longer relies on colour alone (WCAG 2.1 SC 1.4.1, #4143). A rendered `icon` replaces the shape glyph at sizes where icons fit; themes can target the new stable `astryx-avatar-status-dot-glyph` class and its `data-shape` attribute — a stroked inline `<svg>` painted from the dot's `currentColor`.
- Button: link-rendered buttons (`href`) now expose `aria-busy` while loading, matching the `<button>` branch. Previously an interruptible loading link showed the spinner and announced "Loading" but carried no machine-readable busy state.
- Calendar only marks in-month date cells as today, preventing duplicate today indicators in multi-month views.
- Carousel: slides now expose APG slide semantics (role=group, aria-roledescription="slide", "Slide N of M" labels) instead of anonymous divs.
- Honor `prefers-reduced-motion` in ChatToolCalls (chevron rotation, expand/collapse), ChatLayoutScrollButton (pill show/hide), and ChatDictationButton (equalizer bars).
- Chat/useChatStreamScroll: the scroll-follow spring now respects `prefers-reduced-motion` — locked following, `scrollToBottom()`, and `lock()` fall back to the existing instant jump, so the transcript still tracks the bottom without animated travel. Follow-up promised in #3800.
- Chat: the composer drawer toggle now references its disclosed content via aria-controls, so assistive tech can navigate from the toggle to the drawer.
- ChatSendButton now forwards `className`, `style`, and pass-through attributes (`data-*`, `aria-*`, and other rest props) to the rendered button. Previously these were silently dropped. (#4190)
- Chat: tool-call error details are now exposed to screen readers and keyboard users instead of living only in a hover-only title attribute.
- CheckboxInput: the indeterminate mark now uses the `--radius-full` token instead of a hardcoded radius, for token consistency. No visual change.
- CheckboxList: items with rich (non-string) labels can now provide an accessibleLabel so their checkbox no longer announces as the literal "Checkbox".
- CodeBlock: collapsed code regions are now inert, so keyboard focus can no longer land on the invisible scroll container while collapsed.
- CommandPalette: forward BaseProps pass-through attributes (className, style, xstyle, data-_, aria-_) to the underlying Dialog. Previously these were silently dropped.
- CommandPalette: the search input (role=combobox) now has an accessible name by default, from the new label prop or the visible placeholder. Previously screen readers announced a nameless combobox.
- DateTimeInput: ArrowDown (and Alt+ArrowDown) in the date field now opens the calendar popover from the keyboard, matching DateInput and the advertised combobox pattern.
- Dialog: modals are now automatically labelled by their DialogHeader title via aria-labelledby, matching AlertDialog. Unnamed open dialogs warn in development.
- Dialog: the entry animation is disabled under prefers-reduced-motion, matching the Layer animation guards.
- Fix Divider rest-prop spread order so consumer-passed HTML attributes cannot overwrite the component's `role="separator"` or `aria-orientation`.
- FieldLabel now forwards className, style, xstyle, and pass-through attributes (data-_, aria-_, event handlers) to the rendered element. Previously these were accepted by the type but silently dropped.
- Field/FieldStatus: status and error messages are now announced through persistent live regions, so they are reliably read by screen readers regardless of when they appear.
- FileInput: the trigger's accessible name now includes the selected filenames, so screen-reader users can review what is attached when refocusing the control.
- Prevent PowerSearch edit popover from closing when selecting multi-select options via Enter (#4245)
- Selector/MultiSelector: PageUp/PageDown now jump the active option to the first/last match while searching, complementing Home/End which stay on text-caret movement.
- HoverCard: popups now expose a named dialog when the new label prop is set, and honest group semantics otherwise. Previously every hover card announced as an unnamed dialog.
- Item: aria-selected is now emitted only when the item's role permits it (option, tab, treeitem, grid cells), removing invalid ARIA from plain list items.
- MobileNav: the toggle button now exposes `aria-expanded` and references the nav drawer via `aria-controls`, so screen-reader users can tell whether the drawer is open and what the button controls. (#3721)
- MultiSelector: searching within the options popover now announces the number of matching results ("3 results" / "No results found") to screen readers, mirroring Selector and Typeahead. Previously filtering happened silently.
- SideNav/TopNav: collapsed heading popovers no longer wrap their menus in a modal dialog, and the heading button is no longer an invalid child of the menu.
- Slider now clamps controlled values to its minimum and maximum before positioning the thumb and exposing ARIA values.
- Slider: required sliders now convey the required state to screen readers through the thumb's accessible description (aria-required is invalid on the slider role).
- Make the CLI's `.mjs` sources fully strict-typecheckable (checkJs + JSDoc)
  Annotated the entire CLI package so `tsconfig.strict.json` (full `strict` `checkJs` over `src`, `bin`, `scripts`, `docs`, and the emitted `templates`) reports zero errors — down from 1717. Fixes are JSDoc-only: no runtime logic changed, `.mjs` stays `.mjs`. Strict checking also surfaced and corrected several type-contract drifts: the `upgrade.run` response type (declared a `depsUpdated` field the command never emits, and omitted the real `integrations`/`filesChanged`/`transformsApplied`/`errors`), registered the emitted `theme.list`/`theme.add`/`layout.*` response types in the `--json` envelope union, and added `category?` to `ReferenceSection` in core's docs types (reference docs already emit it).
- Table: the selection plugin accepts getRowLabel so row checkboxes announce which row they select, instead of an undifferentiated "Select row".
- Text: an explicit `size` now overrides the font-size of a themed `type`. The `size` class lived in a lower cascade layer (`astryx-base`) than a theme's per-type font-size rule (`astryx-theme`), so `<Text type="supporting" size="xsm">` silently kept the type's size. Themes now re-emit the size classes in the theme layer so `size` wins as documented.
- Thumbnail: replace the hover box-shadow on interactive tiles with the same `::after` overlay treatment ClickableCard and SelectableCard use. All three now tint on hover with `--color-overlay-hover` (and `--color-overlay-pressed` on press), so interactive feedback is consistent across the card family.
- Thumbnail/TopNavMegaMenuFeaturedCard: images without alt text are now explicitly decorative instead of silently empty-alt, matching Avatar's handling.
- Thumbnail: the overlaid remove button now uses a fixed `--color-overlay` scrim with an `--color-on-dark` icon instead of adapting to the image's luminance, so it has reliable contrast on any image.
- Tokenizer: adding and removing tokens (including Backspace on an empty input) is now announced to screen readers. Previously tokens appeared and disappeared silently.
- TopNav: TopNavMegaMenu triggers now expose aria-controls, and the panel is a labeled group instead of an invalid modal-dialog-wrapped menu.
- TopNav: TopNavMenu popups now expose proper menu semantics (no modal dialog wrapper) with the full APG keyboard pattern (roving tabindex, arrow keys, typeahead).

#### Documentation

- docs(Tokenizer, PowerSearch): document and test the existing startIcon prop
  Both components have shipped a working `startIcon?: ReactNode | IconType` prop for a while (`PowerSearch` forwards it verbatim to the internal `Tokenizer`, and it's already exercised in Storybook), but neither's `.doc.mjs` documented it and neither had test coverage — so it was invisible to `astryx component <Name> --dense`, the docsite props table, and anyone (human or AI) relying on those as the source of truth. No behavior change; adds the missing props-table entries (en/zh/dense) and colocated tests confirming the icon renders and forwards correctly.

#### Other Changes

- Compact per-row status signal (error, warning, unread, etc.) without a
  dedicated status column: a colored status dot by default, or an icon when provided.
- `getStatus(item)` maps a row to `{color, icon?, label?}`, or `null` for no
  indicator. `color` accepts a semantic status name (`success`/`error`/`warning`/`accent`/`red`/`green`/etc.) mapped to a theme token, or a raw CSS color as an escape hatch.
- `icon` renders the status as a shape signifier instead of the dot, which is
  more accessible than color alone when multiple statuses coexist. `label` supplies the accessible name.
- Memoize `getStatus` with `useCallback` for a stable plugin identity.

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @bhamodi
- @cixzhang
- @ejc3
- @freddymeta
- @HelloOjasMutreja
- @humbertovirtudes
- @josephfarina
- @kentonquatman
- @Kevinjohn
- @saadpocalypse
- @yyq1025

---

# 0.1.8

#### Breaking Changes

- Avatar and AvatarGroup adopt Icon's abbreviated size scale — `size` now takes `xsm`/`sm`/`md`/`lg`/`xl` instead of `tiny`/`xsmall`/`small`/`medium`/`large`. Pixel values are unchanged (20/24/36/48/128px) and the default is now `md` (still 36px, formerly `small`). Avatar's tiers stay larger than Icon's because avatars align with media rather than glyphs. Run `astryx upgrade` to migrate call sites. (#2672)

#### New Features

- Collapsible: the content area now anchors body typography (font family, size, weight, line-height) instead of inheriting from its surroundings, and exposes a stable `astryx-collapsible-content` theme target so revealed text can be themed externally.
- Collapsible: add an `isDisabled` prop to disable a single item. A disabled item's trigger can't be toggled and is dimmed; following the system-wide disabled convention it uses `aria-disabled` (not the native `disabled` attribute) and drops out of the tab order, staying perceivable to assistive tech. Disabling doesn't collapse an already-open item. Works standalone and inside CollapsibleGroup.
- `@astryxdesign/core`'s `docs.mjs` now redirects to the CLI so agents converge on a single documentation entry point (`astryx docs` / `astryx init`) instead of a large standalone script. (#4207)
- DropdownMenu selectable items: add `DropdownMenuCheckboxItem` (independent toggle, `role="menuitemcheckbox"`) and `DropdownMenuRadioGroup` + `DropdownMenuRadioItem` (single-select, `role="menuitemradio"`). The control size derives from the menu's item size and swaps to the row's inline-end on touch. They also work inside `ContextMenu` (re-exported as `ContextMenuCheckboxItem` / `ContextMenuRadioGroup` / `ContextMenuRadioItem`). Both menus' keyboard/typeahead/activation now recognize the selectable roles, and the menu context (`DropdownMenuContext`, `useDropdownMenuContext`, `DropdownMenuSize`) is exported for building custom menu items. See #3829.
- Icon: add an optional `label` prop for the accessible name. Setting it makes a standalone icon meaningful (`role="img"` + `aria-label`, no `aria-hidden`), collapsing the old three-attribute dance into one prop; omitting it (or passing `''`) keeps the decorative default (`aria-hidden`).
- "Foolproof init": both `@astryxdesign/core` and `@astryxdesign/cli` now print a postinstall nudge pointing you to `npx @astryxdesign/cli init`, `astryx` commands nudge you to finish setup until init has run, and `astryx init` runs non-interactively (no TTY required) so it works in CI and agent environments. (#4147, #4153, #4154, #4155)
- Outline: keyboard navigation, navigate callbacks, and scroll-scoping props (#2527)
  Layers the public API deferred out of #2746 onto the scroll-spy engine and click-lock that already shipped. No visual change.
- Table: add a tree-data plugin — `useTableTreeState` and `useTableTreeData` — for rendering and managing hierarchical (parent/child) rows, expansion state, and flattening. Exported from `@astryxdesign/core/Table`. (#3789)

#### Fixes

- `AvatarGroupOverflow` now grows into a pill for long `+N` counts so the number never clips.
  The indicator was a fixed-size circle, so wide counts (e.g. `+4912`) overflowed and crowded the edges. It now uses a minimum width equal to the avatar size plus horizontal padding: short counts (`+5`) stay a perfect circle, while longer counts grow horizontally into a stadium/pill and remain legible. No new public props.
- Carousel now scrolls horizontally when you hold Shift and scroll the mouse wheel. Trackpad users already got horizontal scroll for free; this brings standard mouse (vertical-only wheel) users to parity using the established Shift + wheel convention. Native trackpad horizontal scrolling and the prev/next buttons are unchanged.
- Citation: a non-interactive citation (no `source.url`) now keeps the default cursor instead of showing a pointer, so only linked citations look clickable. The pointer cursor is applied alongside the existing hover treatment for both the `label` and `number` variants (#4134).
- Stop suggesting bare `npx astryx` before the CLI is installed — it resolves to an unrelated package on the npm registry.
  The CLI now emits an install-aware invocation everywhere it prints a command:
- Icon: size variants (`xsm`/`sm`/`md`/`lg`) now use `rem` instead of hardcoded `px`, so icons scale in step with text when the document/root `font-size` changes — matching the rest of the design system's rem-based type scale. Fixes #4092.
- Guard useTableRowExpansionState tree walks against cyclic data (#3971)
  The `depthMap`, flattened `data`, and `allExpandableKeys` walks now track the ancestor keys on the current path and skip edges that point back at an ancestor, so self-referential or cyclic row data terminates instead of overflowing the stack.
- Route the Table sortable plugin's header-button aria-labels ("Sort by …", "… sorted …", "… priority … of …") through `useTranslator()` with new `@astryx.table.sort.sortBy` / `sortedBy` / `sortedByWithPriority` / `direction.*` catalog keys, so they localize like the sort menu labels already do (#3618, tracker #3636). The direction word resolves through its own key rather than interpolating the raw enum value. English output is unchanged.
- Table: the tree row expander's `aria-label` is now localized through `useTranslator()` instead of a hardcoded English string, so expand/collapse controls announce in the app's language. (#4149)
- TabList `hasDivider` reserves a gap so the hover pill and adjacent buttons no longer touch the underline
  A divided TabList now reserves 4px between the tabs and the divider rail. The hover highlight sits clear of the underline, and a same-size Button placed alongside the tabs aligns to the tab baseline instead of butting the rail — so a `md` tab strip pairs with a `md` button. The selected indicator still rests on the rail. Non-divided tab lists are unchanged. TabList inside a `Toolbar` with `dividers={['bottom']}` gets the same alignment via the toolbar's own spacing.
- TreeList: focusing a parent row no longer leaks the focus-visible outline onto its descendant rows — each row's ring now resolves from its own nearest treeitem instead of matching any focused ancestor (#4130)

#### Documentation

- DropdownMenu and DropdownMenuItem: seed playground defaults so the docsite properties-tab preview renders real content instead of an empty trigger.

#### Other Changes

- Installed / global / dev runs suggest `<pm> astryx <cmd>` (e.g. `pnpm exec astryx …`), unchanged.
- One-off runs (launched via `npx`/`pnpm dlx`/`yarn dlx`/`bunx`) suggest the scoped package `<dlx> @astryxdesign/cli <cmd>`, which always resolves to us.
- Improved translator context in the shipped English catalog (`packages/core/locales/en.json`) descriptions. Sharpened ~172 entries — added screen-reader-only clarifications, ICU-composition examples, polysemy warnings, and set-pairing notes — so translators working in Crowdin get better context. No changes to `defaultMessage` values, keys, or runtime API.
- **Keyboard navigation** — the outline is now a single tab stop (roving tabindex via `useListFocus`), seated on the _active_ heading per WAI-ARIA, so tabbing into a table of contents while reading section 7 lands on section 7 rather than sending the reader back to section 1. Arrow keys move between headings, Home/End jump to the ends, and Enter/Space activate. A 40-heading table of contents costs one Tab press instead of 40, and Tab still leaves the outline in one press.
- **`onNavigateStart(id)` / `onNavigateEnd(id)`** — fire around the smooth scroll started by a click or keyboard activation, so an app can drive an arrival effect. `onNavigateEnd` resolves on `scrollend` where supported and on a settle timeout where it is not (Safari), so it also fires correctly when reduced motion collapses the scroll into an instant jump. It fires exactly once for every `onNavigateStart` — including when the user interrupts the scroll — so a "navigating" state can never leak.
- **`offset`** — the height of a fixed header overlaying the top of the scroll root. It shifts both the activation line **and** the scroll landing by the same amount, so a heading activates exactly where navigating to it puts it: below the header, not hidden underneath it. It composes with each heading's own `scroll-margin-top` (the header, then the breathing room below it) rather than replacing it — leave `offset` at 0 when nothing overlays the content and let `scroll-margin-top` do the work, since the browser already honors it.
- **`scrollContainerRef`** — scope scroll tracking to a specific container instead of auto-detecting the nearest scrollable ancestor. Fixes the table of contents whose highlight never moves inside a split pane, modal, or dashboard panel. The default (viewport) path is unchanged.
- **`hasScrollOnClick`** (default `true`) — set to `false` to own the scrolling yourself; the outline still updates the active item, the hash, and the navigate callbacks.

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @cixzhang
- @ernestt
- @is-jain
- @joeyfarina
- @josephfarina
- @MeGaurav4
- @nynexman4464

---

# 0.1.7

#### Breaking Changes

- Table plugin render-prop interfaces (`TableRenderProps`, `HeaderRowRenderProps`, `HeaderCellRenderProps`, `BodyRowRenderProps`, `BodyCellRenderProps`, `ScrollWrapperRenderProps`) and the `scrollWrapper` component contract rename their StyleX array field `styles` → `xstyle`, matching the prop name sub-components receive it under. Custom plugin authors: rename `props.styles` reads and `styles:` writes in transform functions (#3679)
  **Codemod:** `npx astryx upgrade --codemod rename-table-renderprops-styles-to-xstyle`

#### New Features

- Export the authoring factories from `@astryxdesign/core`: `createConfig` at `@astryxdesign/core/config` and `createIntegration`/`createPageTemplate`/`createBlockTemplate`/`createComponentDoc`/`createFunctionDoc`/`createDoc` at `@astryxdesign/core/authoring`. Authoring a config or integration no longer requires depending on the CLI. Existing `@astryxdesign/cli/*` imports keep working via re-export.
- Button: new `width` prop following the input field width convention (`SizeValue`: numbers are pixels, strings are used as-is). `width="100%"` removes the need for a `width: '100%'` xstyle override or a stretch layout wrapper for full-width CTAs in auth forms, dialogs, and mobile layouts (#2600).
- **Astryx components are now translatable.** Wrap your app in `<InternationalizationProvider locale="...">` and pass one or more locale catalogs to render astryx UI in the language of your choice; call `useTranslator()` inside your own components to translate consumer strings against the active locale. Astryx ships an English catalog with BCP 47 regional fallback (e.g. `pt-BR` → `pt` → `en`), so consumers who never render a provider see today's English strings unchanged.
- **Translation coverage now spans the full component set** — PowerSearch (UI chrome, value-editor labels/placeholders, the 21 built-in operator labels, and ICU-pluralized result counts), plus AlertDialog, AppShell, Banner, Breadcrumbs, Calendar, Chat, CommandPalette, ContextMenu, date/time inputs, Dialog, DropdownMenu, Lightbox, Link, Markdown, mobile/side/top nav, Outline, Popover, Resizable, Selector/MultiSelector, Table (and its filter/selection/sort plugins), Toast, Tokenizer, Typeahead, and related interactive affordances. Placeholder strings that used `...` are normalized to `…` (U+2026) in the English catalog; consumers who snapshot-test the exact three-dot form will see a diff, and consumers passing an explicit `placeholder` are unaffected.
- Two i18n-related **type refinements** (source-compatible for existing usage): `PowerSearchOperator` is now a discriminated union — `{key, value, label}` (raw text) or `{key, value, i18nKey}` (astryx-translated); passing `label` compiles and behaves unchanged, while a bare `{key, value}` (neither `label` nor `i18nKey`) becomes a compile-time error. `Markdown.renderBlock` gains a `t: TranslatorFn` parameter threaded from the top-level `Markdown`; direct `renderBlock` consumers pass a translator.
- New ESLint rules in `@astryx/eslint-plugin-astryx` (`astryx.configs.strict` / `recommended`): `@astryx/i18n-key-format` enforces camelCase path segments for `@astryx.*` catalog keys, and `@astryx/no-hardcoded-i18n-string` flags hardcoded English string literals on user-facing props — now also inside ternaries, logical expressions, and template literals (e.g. `aria-label={isOpen ? 'Close' : 'Open'}`). Both are filesystem-agnostic; downstream packages can enable them with the standard `files` / `ignores` pattern and will see additional violations flagged after upgrading.

#### Fixes

- Fix Banner chevron transition to honor `prefers-reduced-motion: reduce`.
- Round the trailing corner of the last ButtonGroup member, even when it renders a layer (#2508)
  ButtonGroup keyed its trailing border-radius off `:last-child`. But several members render an invisible layer element _after_ their button — a `Button` with a `tooltip` returns `button + tooltip layer`, and `DropdownMenu` returns `trigger + popover`, both rendered inline by `useLayer` rather than portaled. The layer took the `:last-child` slot, so the real trailing button silently kept square outer corners and the group ended in a flat-edged stub.
- Calendar: month navigation now announces the newly visible month (e.g. "March 2026") to screen readers via a polite live region. Previously the grid changed silently. (#3724)
- Chat: opening a conversation that already has content (history, replay, session switching) no longer spring-scrolls from the top — the first fill positions instantly, whether the content is present at mount or arrives asynchronously. Subsequent growth (streaming) springs as before. `useChatStreamScroll`'s `scrollToBottom` accepts `{behavior: 'instant'}` for one-frame programmatic jumps, mirroring the DOM's `scrollTo({behavior})`. Exports the `ChatScrollToBottomOptions` type. (#3795)
- CheckboxInput/Switch: descriptions stay linked via aria-describedby when the label is visually hidden, instead of being orphaned in the DOM.
- CodeBlock keeps line numbers aligned with wrapped lines when `isWrapped` is enabled
- Forward rest props in Dialog and DialogHeader. DialogHeader now passes through data-testid, aria-*, and other attributes. Dialog's inline path forwards all rest props. Standard path spreads rest before contract props so onClick, onCancel, aria-modal, and role cannot be clobbered.
- Anchor --dense / --zh doc overlays to their base sections (#2182)
  The compressed and translated reference docs were merged into the base doc **by array position**, so an overlay whose sections were ordered differently — or which omitted one — grafted every title onto the wrong body.
- FileInput: don't drop the drag-over highlight when dragging over dropzone children
  Dragging a file across the dropzone's own icon/text fired a dragleave on the container and cleared the drag-over state, so the "Drop files here" highlight flickered mid-drag. A dragleave whose relatedTarget is still inside the dropzone is now ignored; only actually exiting the dropzone ends the drag-over state.
- Fix consumer rest props clobbering component contract props in ButtonGroup, Calendar, and Carousel
  Components that set `role`, `aria-roledescription`, or `onKeyDown` on their root element now spread `{...rest}` before those props so a consumer cannot accidentally override the component's semantic contract. `onKeyDown` is composed via `composeEventHandlers` so both the consumer's and the component's handlers fire.
- Kbd: pass-through props no longer clobber the computed role and spoken accessible name (rest-spread precedence corrected, mirroring Avatar).
- Layer: centered layers near a viewport edge no longer render clipped (#3671). Flip fallbacks are a no-op for center alignment, so centered placements now append span-based `position-try-fallbacks` that slide the layer along its alignment axis.
- Link: disabled links no longer carry a live href/onClick — programmatic focus or AT activation can no longer trigger navigation.
- Selector: searching within the options popover now announces the number of matching results ("3 results" / "No results found") to screen readers, mirroring Typeahead. Previously filtering happened silently. (#3725)
- Table now honors the standard root styling props: `className`, `style`, `xstyle`, `id`, `aria-*`, `data-*`, and other HTML attributes reach the root `<table>` element instead of being silently dropped. `tableProps` is deprecated (still works, loses conflicts to direct props); the computed column min-width still wins over a consumer `style.minWidth`, but no longer clobbers it when columns compute none (#3679)
- Timestamp: the absolute-time tooltip is now reachable by keyboard — the timestamp is focusable while a tooltip is attached, per WCAG content-on-hover requirements.
- TopNav: the `<nav>` landmark now defaults its accessible name to "Top navigation" when the `label` prop is omitted, matching SideNav ("Side navigation"), Breadcrumbs, and Pagination. Previously an omitted `label` shipped an unnamed navigation landmark, leaving screen-reader users with multiple indistinguishable "navigation" landmarks on pages that compose SideNav + TopNav + Breadcrumbs. An explicit `label` still wins.

#### Documentation

- Point AI agents to the CLI from the core README.
  `@astryxdesign/core`'s README now leads with a callout telling AI agents to run `npx astryx init` first, which installs the CLI's component index into `AGENTS.md`/`CLAUDE.md`. In an isolated cold-start test, this took agents from 0/5 to 4/5 on discovering and using the CLI (matching the AGENTS.md ceiling); a first-run nudge alone did 0/5.
- Surface literal values for union types in component docs (#1645)
  Prop docs named their union types without ever showing the values behind them — `gap: SpacingStep`, `align: GridAlignment`, `sort: TableSortState<TSortKey>`, `status: InputStatus`. Readers without an IDE (agents especially) had to guess, and guessed wrong: `gap={16}` (pixels, not a scale step), `direction: 'desc'` (the type says `'descending'`).

#### Other Changes

- Migrate the duplicated charts/lab color parsers onto the shared `@astryxdesign/core/utils/color` module: adds `toGLFloats(rgba)` for RGBA→GL float conversion with a neutral non-NaN fallback, replacing the four `hexToGL` copies, and rebuilds `lerpHex`/`hexAlpha` on `parseHex`/`formatHex`/`parseColor`/`formatColor` (#3739)

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @arham766
- @bhamodi
- @cixzhang
- @ejhammond
- @jiunshinn
- @joeyfarina
- @nynexman4464
- @yyq1025
- @zeroryu

---

# 0.1.6

#### New Features

- Add `useTableGroupedRows` — groups a flat data array into collapsible section rows. Each distinct `groupBy` value becomes a full-width section-header row with a chevron toggle, group label, and member count; collapsing hides that group's rows while keeping the header. Mirrors `useTableRowExpansionState`: the consumer owns the `collapsedGroups` set and the hook returns `{data, plugin, idKey}` (pass to `Table` data / plugins / idKey). Supports `renderGroupHeader` and `groupOrder`. (#3763)
- Add `useTableRowIndex` — a plugin that prepends a right-aligned, monospaced row-number column. Numbering follows the rendered `data` order, so it reflects the current sort / filter / pagination view (pass the sorted/paged array). Provides `getRowKey` for stable keyed lookup, plus `label` and `startFrom` to customize the header and starting ordinal. (#3756)

#### Fixes

- Rebrand the core package `displayName` from "XDS Core" to "Astryx Core"
  The core package's `displayName` still read "XDS Core". It surfaces in the docsite package sidebar and landing cards as the friendly package label, so this rebrands it to "Astryx Core" to match the Astryx migration. Metadata-only — the package `name` and public API are unchanged.
- Compile dist with the production JSX transform — 0.1.5 shipped `jsxDEV`, which crashes every consumer that renders in production
  `@babel/preset-react` 8 derives its `development` option from the Babel env name (`api.env(env => env === 'development')`), and Babel falls back to `"development"` whenever `NODE_ENV`/`BABEL_ENV` is unset. The bump from 7.29.7 to 8.0.1 therefore flipped the published build to the development JSX transform without any config change: 193 of 479 files in `@astryxdesign/core@0.1.5`'s `dist` import `react/jsx-dev-runtime` and call `jsxDEV`, which React's production build does not export.

#### Contributors

Thanks to everyone who contributed to this release:

- @ejhammond
- @fatwang2
- @humbertovirtudes

---

# 0.1.5

#### New Features

- AspectRatio: add a `fit` prop (`'cover' | 'contain' | 'center'`) so the component sizes and positions its child instead of every consumer hand-writing `width`/`height`/`objectFit` on the child. `cover`/`contain` ship as zero-specificity baseline rules in `reset.css` keyed on a `data-astryx-aspect-ratio-override` marker the component sets on the child's direct parent (direct-child selectors, no dependence on internal structure or the theming surface), so a child's own styles always win and self-sized children are unchanged; `center` centers the child at its natural size from the component's wrapper. When `fit` is omitted the child is left unstyled, preserving the existing contract (#2753)
- CodeBlock: new `syntaxTheme` prop for per-instance syntax theme overrides. Shorthand for wrapping a single block in `<SyntaxTheme theme={...}>` — accepts a preset from `@astryxdesign/core/theme/syntax` or a theme created with `defineSyntaxTheme()` (#3360).
- CollapsibleGroup: add a `hasDividers` prop (boolean, default `false`) so FAQ-style accordions get built-in row hairlines instead of hand-rolled borders, plus a `density` prop (`'compact' | 'balanced' | 'spacious'`) controlling row padding. When dividers are enabled the group renders a wrapper div (`astryx-collapsible-group`) and items default to `'balanced'` density; without dividers the group keeps its DOM-less contract and existing renders are unchanged. Borders use the themed `--border-width`/`--color-border` tokens, and nested collapsibles never inherit row chrome (#3487).
- New `incident-console` page template: an on-call incident response console demonstrating the frame-first tracker archetype — grouped dense incident rows (StatusDot severity, Token state), PowerSearch filtering, status segmented control, and a resizable inspector panel with metadata and timeline. Adds the `Tools - Incident Console` template category.
- useLayer: new `positioning: 'custom'` context render option for consumers that author their own position styles (explicit `anchor()` insets, `anchor-size()` covers). Keeps the popover behavior and `position-anchor` wiring but derives no position styles from `placement`/`alignment` — including the automatic RTL mirroring, which becomes the consumer's responsibility (#3389).
- New `messaging-shell` page template: Slack-style column frame (rail | sidebar | stream | thread panel) built on the Chat component family — dense rows, zero cards. Adds the `Shell - Messaging` template category.
- Pagination: the `dots` variant is now keyboard navigable via the shared useListFocus primitive. With a dot focused, Left/Right arrows move between dots and Home/End jump to the first/last, the active page follows focus (roving tabindex), and Up/Down are left to the browser so vertical scrolling is unaffected. (#3681)
- Switch: rename the labelSpacing `"default"` value to `"hug"`; `"default"` keeps working as a deprecated alias. Run `astryx upgrade` to migrate call sites automatically. (#2889)
- Add `useHotkeys` hook for global keyboard shortcuts. Registers one window `keydown` listener per hook instance with handlers kept in a ref (re-renders never re-subscribe). Combos like `'mod+k'` or `'escape'` — `mod` maps to ⌘ on Apple platforms (same detection as Kbd) and Ctrl elsewhere. Skips typing targets (input/textarea/select/contenteditable) unless `allowInInputs`, skips `defaultPrevented` events, and calls `preventDefault()` on match. SSR-safe.

#### Fixes

- Emit derived accent tokens as var(--color-accent) references (#3495)
  Generated themes now emit `--color-text-accent` and `--color-icon-accent` as `var(--color-accent)` and `--color-accent-muted` as `color-mix()` over the same reference, instead of baking resolved hex literals. Overriding `--color-accent` on any scope re-accents the whole subtree at runtime — no second theme build, no per-token overrides. `--color-on-accent` stays resolved because it is a contrast computation CSS cannot express.
- adjustTime guards non-finite deltas and wraps negatives in O(1) (#3583)
  A non-finite deltaMinutes previously spun the wrap-around loop forever (-Infinity — tab freeze) or produced the corrupt string "NaN:NaN" (NaN) that could be committed into consumer form state through DateTimeInput's timeIncrement path. Non-finite deltas now return the input time unchanged, and the negative wrap-around uses double-modulo instead of a loop.
- Forward rest props on AlertDialog and AppShell so consumer `data-*`, `aria-*`, and `id` attributes reach the DOM (#3876)
- Wrap CommandPalette search updates in `startTransition` to resolve a React 19 warning (#3815)
- Derive DropdownMenuItem escape hatches from BaseProps so it accepts `xstyle`, `className`, and `style` (#3687)
- Order rest spread before explicit ARIA props on Item and InputGroup so consumer-set ARIA attributes are no longer clobbered (#3751)
- Avatar: retry a changed src/fallbackSrc after a load error
  A failed image load latched a boolean error flag that never reset, so updating `src` (or `fallbackSrc`) to a valid URL kept rendering the initials fallback forever. The error state now tracks the exact URL that failed, so a changed source gets a fresh load attempt.
- Banner: the expand/collapse toggle is now linked to its content region via `aria-controls`, completing the disclosure pattern (the toggle already exposed `aria-expanded`). (#3719)
- Calendar: mark today's date cell with `aria-current="date"`. Previously "today" was conveyed only visually, so screen-reader users could not identify the current date (WAI-ARIA date-picker pattern). (#3708)
- Calendar: move aria-selected from the day button onto its gridcell wrapper. A plain button (implicit role "button") does not permit aria-selected, which tripped the axe aria-allowed-attr rule; the selection state belongs on the gridcell role in an ARIA grid. (#3343)
- Calendar / DateInput / DateTimeInput: defensively clamp `numberOfMonths` to its `1 | 2` type at runtime. Out-of-range values (e.g. `0` rendered nothing, `1000` locked the page up in `Array.from({length})`) fall back to a single month. DateInput and DateTimeInput inherit the guard since they forward the prop to `<Calendar>` (#2704)
- Calendar: month navigation chevrons now mirror under `dir="rtl"` so "Previous month" points outward (visually right) and "Next month" points left, instead of both pointing inward at the month label. The mirror is a CSS-only StyleX conditional transform keyed on the `dir` attribute; DOM order, labels, and handlers are unchanged. Also fixes the embedded calendars in DateInput, DateRangeInput, and DateTimeInput (#3388).
- Card: draw the `default` variant's border inside its padding and drop the invisible border from the other variants, so a card's total inset (border + padding) matches the spacing token exactly instead of being 1px larger on every side. (#3712)
- Carousel: make the horizontal scroll container keyboard-focusable (`tabIndex={0}`) so keyboard-only users can scroll it with arrow keys. Previously the scrollable region had no keyboard access (axe: scrollable-region-focusable). (#3343)
- Chat components forward pass-through props (data-_, aria-_, id) to the DOM
  `ChatDictationButton`, `ChatLayoutScrollButton`, `ChatMessageMetadata`, `ChatSystemMessage`, and `ChatTokenizedText` declared `BaseProps` but silently dropped `data-*`, `aria-*`, and `id`: they never captured `...rest` nor spread it onto their rendered element. They now capture `...rest` and spread it onto their primary element after the merged className/style, with any component-owned attribute (e.g. `role`) set afterward so it still wins.
- Chat: tool-call rows and the tool-calls group header now expose complete disclosure semantics — expandable call rows announce `aria-expanded` and reference their detail panel via `aria-controls`, and the group header references its content region. Previously an expandable call row was announced as a plain button with no indication it opens anything. (#3720)
- ChatComposerInput preserves composer submit with child onChange (#2330)
- CheckboxInput now forwards rest props (including `data-testid`) to the underlying `<input>`. Previously the component used a closed destructuring list with no `...rest` capture, so any prop not explicitly named — `data-testid`, other `data-*` attributes, etc. — was silently dropped despite `CheckboxInputProps` (via `BaseProps`) typing them as valid. Every sibling input component (TextInput, Selector, Slider, Button, Badge) already forwards rest props; CheckboxInput was the sole outlier. Rest is spread before the component's own named attributes on the `<input>`, so it cannot override `checked`, `disabled`, `type`, or any other explicitly-set prop.
- ClickableCard: remove the faint hover "ring" on borderless variants (everything except `default`) by dropping their invisible border. The `default` variant now draws its border inside the padding so outer dimensions stay identical across variants, and its border color emphasizes on hover. (#3712)
- CodeBlock: announce "Copied" via a polite live region when the copy button is used. Previously success was signalled only by swapping the button's `aria-label`, which screen readers don't reliably announce. (#3709)
- CodeBlock: restart the copied-indicator timer on rapid re-copy
  Each copy click armed an independent 2s reset timer, so copying again within the window let the first click's timer revert the "Copied" indicator early. The timer now restarts on every copy and is cleared on unmount.
- CodeBlock: complete the collapsible header's disclosure pattern. It now shows the standard accent focus ring on `:focus-visible` — previously it defined no focus style and fell back to the browser's default outline, unlike the system's other disclosure controls (Collapsible, TabMenu) — and links to the code region it shows/hides via `aria-controls` (the header already exposed `aria-expanded`). The region stays mounted when collapsed (CSS grid animation), so `aria-controls` is an always-resolvable reference. (#3723)
- Collapsible: link the trigger to its content region with `aria-controls`, and give the content region a matching `id`. Completes the disclosure pattern so assistive tech can move from the trigger button to the region it shows/hides (previously only `aria-expanded` was set). (#3707)
- Collapsible: the trigger button now shows a visible focus ring when focused via keyboard. The trigger's `all: unset` reset removed the browser's default outline without restoring a replacement, leaving keyboard focus invisible (WCAG 2.4.7). (#3722)
- Keep Collapsible self-toggling when uncontrolled with onOpenChange (#3785)
  `useCollapsible` treated the presence of `onOpenChange` as a signal that the component was controlled: its `toggle` handler fired the callback but skipped the internal state update, so an uncontrolled Collapsible given only `onOpenChange` (no `isOpen`) appeared stuck — the callback fired but the content never opened or closed. Control is now determined solely by whether `isOpen` was provided, mirroring how `isOpen` is derived. Uncontrolled usage drives internal state _and_ fires `onOpenChange`; controlled usage still defers entirely to the parent.
- SegmentedControlItem now forwards a consumer onClick, and add composeEventHandlers
  A consumer `onClick` on `SegmentedControlItem` was silently dropped — the internal selection handler clobbered it. It now runs alongside selection (call `preventDefault()` to opt out). The new `composeEventHandlers` utility chains handlers in order and stops when one prevents default, so components that own an interaction can also honor a consumer handler for the same event.
- ContextMenu now anchors the menu to the right-click point relative to its context, so it follows the content on scroll and auto-flips at viewport edges instead of staying at a fixed screen position (#3465).
- DateTimeInput: the embedded time input now carries `aria-describedby` and `aria-busy` like the date input, so screen-reader users keep access to the field's description, status message, and disabled message when focused on the time half. (#3716)
- DateTimeInput: `timeIncrement` is now typed as a literal union of sensible increments (`1 | 5 | 10 | 15 | 30`) instead of an open `number`, so negatives, fractions, and absurd values are rejected at the type level rather than silently accepted. Adds an exported `DateTimeInputTimeIncrement` type (#2725)
- focusableSelector: match only real links (`a[href]`, `area[href]`) instead of any element with an href attribute. Previously non-focusable elements carrying href could be treated as tab stops by useFocusTrap. (#3714)
- useFocusTrap: focus now returns to the previously-focused element when a trap deactivates, so closing a Popover (Escape or light-dismiss) no longer drops keyboard focus to the page body. Components that already restore focus themselves are unaffected — the trap only restores when focus would otherwise be lost. (#3732)
- Forward consumer event handlers in SegmentedControl, CheckboxListItem, and SideNavCollapseButton
  These components set their own `onClick` / `onKeyDown` / `onFocus` / `onBlur` after spreading `{...rest}` (or destructured the consumer's handler and never used it), so a consumer-supplied handler for the same event was silently dropped. They now compose the consumer's handler with the built-in one via `composeEventHandlers`, consumer-first — the consumer's runs and can call `preventDefault()` to opt out of the built-in behavior.
- Grid: with `columns={{minWidth, max}}`, columns that are present now fill the row when fewer than `max` fit. Previously the `max` cap was applied to each track's max size, so a layout collapsing to a single column (e.g. on mobile) left dead space on the right instead of stretching to full width. The cap now limits the column count while letting present columns reach `1fr`. (#3391)
- Icon: allow string (registry) icons to be made meaningful. `aria-hidden="true"` is now applied before the prop spread, so consumers can override it (e.g. `aria-hidden={false}` + `role="img"` + `aria-label`) for a standalone informational icon. Previously registry-mode icons hardcoded `aria-hidden` after the spread, making it impossible to override — inconsistent with component-mode icons, which already allowed it. Default behavior (decorative, hidden) is unchanged. (#3710)
- Layer/Popover: anchor-positioned popovers now mirror in RTL. `placement`/`alignment` `start`/`end` are logical (inline-start/inline-end), so DropdownMenu, Selector, Typeahead, date inputs, and every other context-mode popover opens toward the correct side under RTL automatically via CSS. LTR behavior is unchanged (#3389).
- Lightbox: navigating between images now announces the new image and its position (e.g. "Sunset over the bay, 3 of 12") to screen readers via a polite live region. Previously only the visual counter updated. (#3727)
- MobileNav forwards pass-through attributes and applies consumer className/style
  MobileNav declared `BaseProps` but silently discarded `className`/`style` (destructured to unused vars) and dropped every other pass-through attribute (`id`, `aria-*`, `data-*` beyond `data-testid`, event handlers). It now merges `className`/`style` and spreads the remaining props onto the `<dialog>`, and composes a consumer `onClick` with the backdrop-dismiss handler via `composeEventHandlers`.
- Forward unhandled pass-through attributes (`data-testid`, `aria-*`, `id`, etc.) to the primary rendered element of Switch, Pagination, RadioListItem, SideNavSection, TableHeader/TableBody/TableFooter, and TopNavMegaMenuFeaturedCard. These components previously dropped attributes not explicitly consumed, so test hooks and accessibility attributes silently disappeared.
- NumberInput with hasClear commits null when cleared from the keyboard (#3599)
  Deleting the text and blurring (or pressing Enter) silently reverted to the previous value — only the X button honored the clearable contract. An emptied input now commits onChange(null) on blur/Enter when hasClear is set; non-clearable inputs keep the revert behavior.
- paginateData clamps invalid page numbers instead of slicing from the end (#3593)
  A negative page fed a negative start index to Array.slice, which counts from the end of the data — page -1 returned the dataset's tail dressed up as a page — and fractional pages returned slices straddling two pages. page now gets the same coercion pageSize received in #3380.
- PowerSearch: changes to the visible result count are now announced to screen readers via a polite live region, mirroring Typeahead's wording. Previously the count only updated visually. (#3726)
- ProgressBar: treat a non-finite value/max as empty progress
  A NaN `value` (e.g. an upstream `loaded / total * 100` with total 0) leaked the literal string "NaN" into `aria-valuenow`, the value label, and the fill width style. Non-finite `value`/`max` now route through the same empty-progress handling as `max={0}`.
- ProgressBar: guard the value label against a zero max
  When `max` was `0` (or negative), the default value-label formatter produced `NaN%` (`0/0`) or `Infinity%`. That string was rendered visually and written into `aria-valuetext`, so screen readers announced "NaN percent". Guard it the same way the fill percentage already is (`max > 0 ? … : 0`).
- Resizable: keyboard resizing now works. The keydown handler was attached to a non-focusable child of the separator, so Arrow/Home/End keys never fired for keyboard users; it now lives on the focusable `role="separator"` element per the WAI-ARIA window-splitter pattern. (#3729)
- ResizeHandle: release window drag listeners when unmounted mid-drag
  A drag in flight when the handle unmounts never receives its pointerup, so the window pointermove/pointerup/pointercancel listeners leaked — every subsequent pointer move kept resizing the still-mounted region, and the body cursor/user-select overrides stuck. Unmount now tears down the in-flight drag's listeners and restores the body styles.
- `useTheme()` / `resolveThemeTokens()` now resolve derived tokens that reference other tokens (e.g. `--color-text-accent: var(--color-accent)`) to concrete raw values, following reference chains iteratively. Supported CSS color functions (`color-mix(in srgb, …)`) are evaluated against those values, so canvas/SVG/data-viz consumers get usable colors instead of `var(...)` or `color-mix(...)` strings (#3697).
  Also adds shared color parsing/formatting primitives (`parseHex`, `parseRgb`, `parseColor`, `formatHex`, `formatColor`) under `@astryxdesign/core/utils`, unifying the color parsers previously duplicated across the theme layer.
- SegmentedControl: tabbing through no longer rewrites the value (#3597)
  When value matched no enabled item (initial empty state, stale server value, or the selected item disabled), the roving tab stop fell back to the first enabled radio and selection-follows-focus fired onChange with it — a keyboard user mutated the form just by tabbing past the control. Selection now only follows focus moves within the group (arrow/Home/End); entering focus is a pure focus move, and click selection is unchanged.
- SegmentedControl and SegmentedControlItem forward data-testid to the DOM
  Both components declared `BaseProps` (so `data-testid` and other `data-*` attributes type-check) but silently dropped them: neither captured `...rest` nor spread the remaining props onto its rendered element, so the attribute never reached the DOM. They now capture `...rest` and spread it onto the radiogroup `<div>` / radio `<button>` (the same rest-spread fix applied to `CheckboxInput` in #3738), placed before the component's own `role`/`aria-*` so those can't be overridden.
- SideNav: don't render the empty sticky-bottom container when `collapsible.hasButton` is false. Previously the footer container rendered whenever the sidebar was collapsible — even with the built-in button opted out and no `footer`/`footerIcons` — leaving an empty, bordered container at the bottom of the nav. The container now renders only when it has visible content (a footer, footer icons, or the built-in collapse button). (#3603)
- Markdown/useStreamingText: streaming text now respects `prefers-reduced-motion` — the per-character reveal snaps to the full text and the entry fade is disabled for users who prefer reduced motion, matching the convention already used by Spinner, Skeleton, ProgressBar, and Chat. (#3730)
- Table: always render a numeric aria-valuenow on the column resize handle. The focusable resize separator omitted aria-valuenow before its width was measured, which failed the axe aria-required-attr rule (a focusable role="separator" requires aria-valuenow); it now falls back to the column minWidth. (#3343)
- Table rows re-render when a field is removed from the row object (#3595)
  The row memo compared only the keys of the new item, so a field cleared by omission (optimistic update, server response) never invalidated the memo and the cell kept rendering the deleted value indefinitely. A key-count check now catches removed properties.
- Table selection: select-all no longer reads checked over an empty filtered table (#3591)
  With rows selected and a filter matching nothing, the union-based all-selected check treated the invisible selection as "all selected": the header checkbox rendered checked over an empty table, and deselect-all was a no-op because the hidden keys count as frozen. Zero actionable rows now reads as not-all-selected; the frozen-selection preservation itself is unchanged.
- Table sort: group NaN cells with null instead of corrupting the order (#3585)
  A NaN cell hit the numeric fast path in defaultCompare, and the NaN comparator result reads as "equal" to Array.sort — making the comparator inconsistent and silently mis-ordering the other, valid rows. NaN now sorts to the end alongside null/undefined.
- Table: column headers now render with `scope="col"` so screen readers correctly associate data cells with their column headers. Consumer-provided scope via column header props still takes precedence. (#3715)
- TabList: the overflow tab menu now uses a roving tabindex — one tab stop with arrow-key navigation between items — instead of making every overflow item a separate tab stop. (#3728)
- Document the full themeProps() selector surface and guard it against drift (#3741)
  `theming.targets` is the documented CSS surface of a component — the stable `astryx-*` classes it renders and the visual props it reflects as data attributes. It was hand-authored while the truth lived in `themeProps()` calls in the source, and nothing kept the two in agreement, so it drifted twice (#3652, #3680) and was drifted again.
- Thumbnail: give the labeled root a group role so its accessible name is valid. Previously the file name was set via aria-label on a plain div with no role, which axe flags as aria-prohibited-attr (serious) because a generic element cannot carry a name. (#3343)
- TimeInput: typed-invalid input (e.g. an out-of-range time that will be reverted on blur) now sets `aria-invalid` and announces "Invalid time" via an assertive live region, matching DateInput, NumberInput, and DateTimeInput. Previously only the visual red border signalled the invalid state. (#3718)
- Timestamp: render nothing instead of crashing on an unparseable value
  An unparseable `value` (a malformed date string, or a NaN timestamp from missing data) produced an Invalid Date whose formatting throws "Invalid time value", crashing the whole tree. Invalid values now render nothing and log a console warning instead.
- Timestamp: keep relative time within its own tier
  Relative-time tiers guarded the raw diff with `<` but displayed the count with `Math.round`, so just under a boundary it rendered "60 minutes ago" / "24 hours ago" instead of "1 hour ago" / "1 day ago" (and the same in the future direction). Floor the per-tier count so it can never reach the next tier.
- Toast fallback viewport resolves the app's theme mode instead of OS preference (#3743)
  The fallback mounts via createRoot() on a disconnected tree, so Toast's useTheme() couldn't see ThemeContext and fell back to prefers-color-scheme — when that disagreed with `<Theme mode>`, the toast's inverted-surface text/icon could compute to the same color as its own background. useToast's fallback container now mirrors `<html data-theme>` and `data-astryx-theme` directly (kept live via MutationObserver), and useTheme() itself falls back to reading `<html data-theme>` before assuming OS preference when no ThemeContext ancestor is reachable — the mechanism that actually resolves Toast's JS-computed mode for disconnected trees like this one.
- Toast: onHide fires exactly once, and a paused auto-hide timer survives viewport re-renders (#3589)
  A second dismissal during the exit transition (double-click, auto-timer plus manual dismiss()) double-fired onHide; and because the timer effect depended on the viewport's per-render onDismiss identity, any other toast arriving or leaving silently restarted — and un-paused — every mounted toast's auto-hide timer. Exiting toasts are now tracked in a ref before onHide fires, and the timer reads onDismiss through a ref so it only restarts on a genuine duration change and respects the paused state.
- Typeahead/Tokenizer discard out-of-order async search results (#3587)
  Each search now claims a new generation, so a slow response for an abandoned query can no longer overwrite the results of the current one (previously the last response to resolve always won, and Enter could select an item from a query the user had already replaced).

#### Documentation

- Correct Carousel doc drift and translate its Chinese usage block (#3532)
  The Carousel docs described behaviors the component doesn't have: there is no scroll-driven scale effect on items, and the prev/next buttons are driven by per-edge overflow (each appears when the content can scroll in that direction), not by hover or platform. Descriptions now match the source. Also translates the docsZh usage block, which was still in English.
- DialogHeader: add property-editor defaults and example blocks (#2719)
  The DialogHeader docsite page rendered an empty preview because the properties editor had no default prop values, and it had no example blocks. Add playground defaults (title, subtitle, divider) so the preview is meaningful out of the box, plus example blocks covering a basic header, a header with a close button, and one with start/end content.
- Correct useInteractiveRole isDisabled docs for disabled href (#3786)
  The `isDisabled` JSDoc claimed a disabled `href` "falls back to button". It does not: a disabled `href` is skipped at the link step and resolved by the remaining priority checks, so with no `onClick` and no interactive context it lands on `'inert'` — as `Token` already relies on for disabled links. The `isDisabled` doc, the step-1 inline comment, and the priority summary now describe the actual behavior. Docs only; no runtime change.
- Document when playground.overlay applies: components with no inline containment (MobileNav, Lightbox) use it, while Dialog, AlertDialog, and CommandPalette intentionally keep their contained isInline previews so knobs stay usable. Adds regression tests guarding both shapes (#3657)
- Lightbox Properties preview shows the overlay open trigger instead of an empty stage (playground.overlay)
- Document the full `themeProps()` selector surface in component theming targets. A sweep of every `themeProps()` call against the `theming.targets` entries found 19 gaps across 16 components where a visual prop or state had no documented `data-*` selector, so the CLI theming table hid part of the themeable surface: missing target entries (Citation, ToggleButton, Banner content, OverlayScrim, NavHeadingMenu, NavHeadingMenuItem) and missing `visualProps`/`states` on existing entries (Chat message density, Checkbox, Code color, CodeBlock container, DropdownMenu item size, SegmentedControl item, SelectableCard variant, SideNav item, Timestamp format, Tokenizer status, TopNav item selected, TreeList item density, Typeahead size).

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @arham766
- @arman-luthra
- @bhamodi
- @cixzhang
- @dmitriy-bty
- @durvesh1992
- @Geervan
- @jiunshinn
- @josephfarina
- @kentonquatman
- @let-sunny
- @raphaelroshanM
- @syntaxsawdust
- @thedjpetersen

---

# 0.1.4

#### New Features

- Code: add `color` and `size` props. `color` accepts `'primary' | 'secondary' | 'inherit'` and now defaults to `'primary'` (mirroring Text's color subset); previously the color was left to inherit implicitly. `size="inherit"` makes inline code adopt the surrounding text's `font-size` and `line-height`. Exports `CodeColor` and `CodeSize` types (#2846)
- Markdown: support CommonMark link reference definitions. Reference-style "footer" links — full `[text][label]`, collapsed `[text][]`, and shortcut `[text]` (plus their `![alt]` image forms) — now resolve against a `[label]: destination "title"` block, which is stripped from the output instead of leaking as a visible paragraph. Labels match case-insensitively with collapsed whitespace; top-level definitions are collected across the document (so a reference can precede its definition, including in the streaming/incremental parser, whose settled-block cache invalidates when definitions change). Footnotes (`[^1]`) are intentionally left untouched. Known limit: a definition nested inside a blockquote/list resolves within that container but is not yet exposed document-wide. (#3621)
- Native form participation for custom inputs via htmlName (#3343)
  Switch, CheckboxInput, RadioList, Slider, Selector, MultiSelector, and Tokenizer now accept the same `htmlName` prop TextInput and NumberInput already had, so they serialize into native form submission. Components with a real native input (Switch, CheckboxInput, RadioList) forward the name; the synthetic controls render hidden inputs that mirror native semantics — one entry per value for MultiSelector/Tokenizer (like a multi-select), string value for Slider (two entries in range mode), and exclusion from FormData when disabled.
- Add `useTableRowExpansion` — expand/collapse tree rows inline.

#### Fixes

- Button: keep edge compensation working when a ghost button also has a tooltip. The tooltip is now attached via the tooltip hook instead of a wrapper element, so the button stays a direct child of its container — no extra DOM node, no layout shift, and containers (Toolbar, Banner) still detect the edge-compensation marker via their direct-child `:has()` selector and pull the button flush to the optical edge. (#2578)
- Calendar: stop range-highlighting adjacent-month (outside) days, and cap the range highlight where it meets a disabled or adjacent-month day. In the two-month range view the same date renders in both panes, so the spillover copy on the neighbouring month's pane was drawn as part of the selection; outside days now never receive selection, range, or preview state. A highlighted day next to a disabled or outside day now gets a rounded end cap so the run reads as properly terminated instead of running square-edged into the gap. (#2715)
- Code and CommandPaletteEmpty now forward props correctly (#3620)
  `Code` spreads rest props (`aria-*`, `role`, event handlers) onto the DOM element. `CommandPaletteEmpty` applies the `xstyle`/`className`/`style` escape hatches and theme props.
- DateRangeInput: use the label type-size token for the trigger field. The trigger was reading the body size/leading tokens (`--text-body-size`/`--text-body-leading`) instead of the label ones (`--text-label-size`/`--text-label-leading`), so its text rendered a step larger than the other date inputs. (#3655)
- Spinner: promote the canvas to its own compositor layer (`willChange: transform`) so rotation stays smooth on WebKit — fixes wobbly spinning in Safari and Tauri WebViews. (#3628)
- Text: apply the documented `size` prop as a font-size override (#3615)
  `Text` now reflects `size` in theme props and applies the corresponding typography size token after its type-based baseline styles. The override changes font size while preserving the selected text type's line-height, weight, and family behavior.

#### Documentation

- MobileNav previews with an open trigger instead of an empty stage: new playground.overlay for full-viewport overlay components, and inline sub-components can declare their own playground (#3616)

#### Other Changes

- Inherited-columns mode: child rows use the same columns as their parents,
  indented by depth. Injects a chevron column; clicking (or right-click → "Expand/Collapse row") toggles a row's children.
- Headless: the consumer owns `expandedKeys` state; the plugin provides the UI.
  Pair with `useTableRowExpansionState` to flatten a tree into the visible rows.
- Optional expand-all header toggle via `isAllExpanded` + `onToggleExpandAll`.
- Optional `expandOnRowClick` to toggle by clicking anywhere in the row.
- Contributes a context-menu action for expand/collapse (via the
  `contextMenuActions` system).

#### Contributors

Thanks to everyone who contributed to this release:

- @ahfoysal
- @arham766
- @cixzhang
- @durvesh1992
- @humbertovirtudes
- @jiunshinn
- @lexs
- @MeGaurav4

---

# 0.1.3

#### Breaking Changes

- DropdownMenu, ContextMenu, MoreMenu: removed the `hasAutoFocus` prop. Menus now always focus their first item on open (the correct APG menu-button behavior). Previously `hasAutoFocus={false}` left the menu keyboard-unreachable and undismissable — the prop existed only as an escape hatch for documentation previews, which no longer need it.

#### New Features

- Calendar: `weekStartsOn` now also accepts a three-letter day name (`'sun'`–`'sat'`, case-insensitive) in addition to the numeric `0`–`6`, so the starting day is self-documenting at the call site (e.g. `weekStartsOn="mon"`). Numbers keep working unchanged. Adds an exported `DayOfWeekName` type and a `normalizeDayOfWeek` helper (#2843)
- CheckboxInput/Switch/Slider/RadioList/CheckboxList/SegmentedControl/Tokenizer/PowerSearch: disabledMessage prop shows a tooltip explaining the disabled state (#3509)
- DateInput can now be used inside InputGroup with shared addon styling and group label/description/status ARIA wiring (#3520).
- DateTimeInput: add a `timePlaceholder` prop to customize the time-portion placeholder (previously hardcoded to "Select a time" with no override). `placeholder` continues to control the date portion; the focused typing hint (e.g. "e.g., 2:30 PM") is unchanged (#2729)
- Toolbar, TabList, and SegmentedControl now show an ephemeral "← → to navigate" hint on first keyboard focus, teaching sighted users that arrow keys navigate within the group.
  Adds a showcase block and Storybook story for useKeyboardHint.
- Export `themeProps` (and its `ThemeProps`/`ClassProps`/`ClassValue`/`ThemeDataAttributes` types) from `@astryxdesign/core/utils`, so packages building on core can generate the stable astryx class + `data-*` attribute surface through the public API instead of reaching into core internals.
- MultiSelector can now be used inside InputGroup as a decorated single-line control, sharing the group label, description, status, and connected border treatment (#3520).
- Typeahead, DateInput, DateRangeInput, DateTimeInput, and TimeInput: `disabledMessage` prop shows a tooltip explaining the disabled state on hover and keyboard focus, keeping the control focusable via `aria-disabled` while activation stays blocked (#3509)
- Popover: expose hasLightDismiss and add hasEscapeDismiss so consumers can opt out of outside-click and Escape dismissal for explicit-dismiss surfaces like onboarding coachmarks. usePopover accepts the same new hasEscapeDismiss option; with it off, no handler is registered on the shared Escape stack so the key falls through untouched (#3287)
- Selector/MultiSelector: disabledMessage prop shows a tooltip explaining the disabled state (#3347)
- Selector can now be used inside InputGroup as a decorated single-line control, sharing the group label, description, status, and connected border treatment (#3520).
- Stack/HStack/VStack: add `padding`, `paddingInline`, `paddingBlock` (spacing-scale inner padding) and `isScrollable` (`overflow: auto`) props; StackItem also gains `isScrollable`. These match the existing `padding`/`isScrollable` props on `Card`, `LayoutContent`, and `LayoutPanel`, so common frame layouts no longer need inline `style={{}}` for padding or the flex scroll-region pattern.
- Standardize layout component sizing props. Add `maxWidth`/`minHeight` to `Stack`, `Grid`, and `Center` (matching `Section`/`Card`), migrate `Layout`/`LayoutHeader`/`LayoutFooter`/`LayoutPanel` sizing to the shared `SizeValue` type, and drop redundant `xstyle`/`className`/`style` re-declarations on `Stack`, `StackItem`, and `Layout`. No runtime behavior change.
- Add a plugin-contributed right-click context-menu system to `Table`.
  Right-clicking a column header or a row shows a menu of actions aggregated from
  every enabled plugin (instead of the browser's generic menu).
- TabList is now a single tab stop with arrow-key navigation between tabs (roving tabindex) — Arrow keys move focus, Home/End jump to the ends, disabled tabs are skipped, and focus wraps. This does not change the semantic roles (still `<nav>`/`aria-current`); the full tablist/tab/tabpanel conversion is tracked separately in #3335. Reference (#3343).
- TextInput/NumberInput/TextArea/FileInput: disabledMessage prop shows a tooltip explaining the disabled state (#3509)
- Add InputGroup compatibility for TimeInput (#3520)
- TreeList now implements the full WAI-ARIA APG Tree View keyboard pattern. Roving tabindex places a single tab stop on the treeitem rows (defaulting to the selected item or the first enabled row), and arrow keys move focus in visible order: ArrowDown/ArrowUp step between visible rows (skipping disabled), ArrowRight expands a collapsed parent then enters its first child, ArrowLeft collapses an expanded parent or moves to the parent row, and Home/End jump to the first/last visible row. Enter and Space activate the row's action (or toggle a parent without its own action), and typeahead moves focus to the next row whose label matches the typed characters. Each treeitem now also exposes `aria-level`, `aria-posinset`, and `aria-setsize`. Builds on the interim keyboard-expandable toggle in (#3344). Part of the accessibility & keyboard-management program (#3343).
- Add InputGroup support for Typeahead (#3520)
- Add `useAnnounce` — an accessibility hook that speaks messages to screen readers through persistently-mounted, visually-hidden polite/assertive live regions. Because the regions are created once (not together with their content), announcements are reliable. Wired into `Typeahead`/`BaseTypeahead` to announce result counts and "no results found" during search, which were previously silent (#3343).
- Add `useKeyboardHint` — shows an ephemeral "← → to navigate" badge anchored to the focused item when a composite widget first receives keyboard focus. Teaches sighted keyboard users that arrow keys navigate within a roving-tabindex group. Renders in the top layer (`popover="manual"`) with CSS anchor positioning so it is never clipped by overflow containers. Auto-dismisses on first arrow press, timeout, or blur; does not re-show for that instance. `aria-hidden` (visual-only; screen-reader users already hear the role).
- Add `useTypeahead` — a first-character (type-to-focus) search hook, and wire it into `DropdownMenu`. Typing a letter jumps to the next menu item whose label starts with it; repeated presses of the same letter cycle through matches; the buffer resets after 750ms; disabled items are skipped. The hook is additive and collection-agnostic (composes with `useListFocus`/`useGridFocus` via `onMatch`), so menus/listboxes gain APG typeahead which astryx previously lacked (menus-11, infra-14) (#3343).
- `useListFocus` gains opt-in roving-tabindex ownership (`hasRovingTabIndex`), caret-aware arrow handling that leaves keys to nested text inputs and contenteditables (`hasCaretGuard`), RTL horizontal navigation (`isRtl`), a `hasHomeEnd` toggle, and `orientation: 'both'` for four-arrow navigation. `Toolbar` now uses it — it is a single tab stop and no longer steals the caret from a toolbar text input or composer (#3343).
- Add `VisuallyHidden` — an accessibility primitive that renders content in the accessibility tree while hiding it visually. Use for accessible names on icon-only controls, `aria-live` announcement regions, and supplementary screen-reader context. Renders a `<span>` by default; use `as` for block/live-region elements (#3338).

#### Fixes

- Announce file selection, page changes, and multi-select count via the live-region hook (#3343)
  FileInput now announces successful file selection, Pagination announces page changes, and MultiSelector announces selection-count changes, all through the shared visually-hidden polite live region so these previously-silent surfaces are audible to screen-reader users.
- Avatar: an avatar with no `name` or `alt` is now decorative (`role="presentation"` + `aria-hidden`) instead of being announced with the meaningless generic name "Avatar". When named, the inner `<img>` uses an empty `alt` so the accessible name isn't announced twice (once by the `role="img"` wrapper, once by the image) (#3343).
- Breadcrumbs: auto-detected current breadcrumb now places `aria-current="page"` on the item's content element (link/button/span), matching the explicit `isCurrent` path, instead of on the outer `<li>`. When the last breadcrumb is a link, the anchor itself now carries `aria-current` so screen readers announce it as the current page (#3343).
- Breadcrumbs: BreadcrumbItem now forwards remaining BaseProps (id, aria-_, role, event handlers, data-_) to the underlying `<li>` element. Previously these props were accepted by TypeScript but silently dropped at runtime.
- ButtonGroup: remove the invalid `aria-orientation` attribute from the `role="group"` element, which was flagged by axe (aria-allowed-attr). Orientation is still reflected via `data-orientation` and drives keyboard navigation and styling, so behavior is unchanged. Also fixes Schedule, which reuses ButtonGroup internally.
- Calendar: cross-month keyboard navigation now resolves the focused date from the machine-readable `data-date` attribute instead of parsing the localized `aria-label` with `new Date()`. Previously, month-boundary arrow keys and PageUp/PageDown silently stopped working in non-English locales (e.g. fr-FR, ja-JP) where the label was unparseable (#3343).
- Calendar: the month view now uses a valid ARIA grid structure — the weekday names are `columnheader` cells inside the `grid`, each week is a `row` whose direct children are `gridcell`s, and week-number cells are `rowheader`s. Arrow-key navigation now lands on the correct dates when some days are disabled (via `min`/`max`/`dateConstraints`): moving up/down keeps the true 7-column geometry and skips disabled days to the same weekday, instead of shifting to the wrong weekday. (#3343)
- Carousel, Lightbox: keyboard focus is no longer trapped on invisible or unmounted edge controls. Carousel's scroll left/right buttons, when at an exhausted edge (or when there is no overflow), were hidden with `opacity: 0`/`pointer-events: none` but stayed in the tab order, so keyboard users could focus invisible controls (WCAG 2.4.7); they are now `disabled` in that state (still mounted, removed from the tab order and a11y tree). Button-driven scrolling also now respects `prefers-reduced-motion` (uses `behavior: 'auto'` instead of hardcoded `'smooth'`). In Lightbox gallery mode, the Prev/Next buttons previously unmounted at the range ends, so advancing onto the first/last item removed the focused control and dropped focus to `<body>`, dead-ending keyboard navigation; they now stay mounted and become `disabled` at the boundaries so focus stays within the dialog and arrow-key navigation keeps working (#3343)
- Chat composer: the message input now uses `role="combobox"` when triggers (mentions, slash commands) are configured, and stays a plain `role="textbox"` otherwise. Combobox attributes (`aria-expanded`, `aria-haspopup`, `aria-controls`, `aria-activedescendant`) are only valid on a combobox, so applying them to a textbox was flagged by axe (aria-allowed-attr). (#3343)
- ChatMessageList: add an `isStreaming` prop that marks the `role="log"` region `aria-busy` while an assistant message streams in. Previously the polite live region re-announced the accumulating partial text on every token; with `isStreaming` set for the duration of a stream, screen readers wait and announce the completed message once (#3343).
- CheckboxInput: stop setting a redundant `aria-checked="mixed"` on the native `<input type="checkbox">` for the indeterminate state. The native `indeterminate` DOM property (which browsers already map to `aria-checked="mixed"`) is authoritative; the extra attribute could desync from or override the native state (#3343).
- CheckboxList: the checkboxes are now wrapped in a `role="group"` named by the field label via `aria-labelledby` (and associated with the description/error), instead of a flat list with an orphaned label `htmlFor`. Screen-reader users now hear the group's name and context (#3343).
- CheckboxListItem: drop the invalid `aria-checked` from the list row. `aria-checked` is not allowed on `role="listitem"` (axe: aria-allowed-attr); checked state is already conveyed by the row's inner checkbox. This also fixes Markdown task lists, which render task items through CheckboxListItem. (#3343)
- Citation: linked number-variant badges keep their accent-muted background (previously rendered transparent), and the badge now uses the secondary text color (#3508)
- Citation: only apply `role="doc-noteref"` on the linked (anchor) form. On a plain unlinked span the role is not permitted (axe: aria-allowed-role), so it is omitted there while the `aria-label` still names the citation. (#3343)
- Selector/MultiSelector/Typeahead: the highlighted option is now scrolled into view during keyboard navigation, so arrow keys no longer move the highlight off-screen in long lists (matches CommandPalette) (#3343).
- CommandPalette: the empty state ("No results") no longer flashes when typing further characters into an already-empty search. The empty state stays mounted for the full duration of the pending search instead of briefly unmounting and re-appearing.
- ContextMenu: Escape now closes the menu even when it was opened without auto-focus (e.g. table row menus), via a document-level Escape listener instead of one that only fires when focus is inside the menu. Focus is also restored to the previously focused element on close, instead of falling to `<body>`. Escape during IME composition is ignored (#3343).
- ContextMenu: can now be opened on touch (long-press) and by keyboard. A long-press (500ms, cancelled by a 10px finger move) opens the menu at the touch point — previously context menus were unreachable on iOS Safari, which never fires `contextmenu` on long-press. A keyboard-initiated `contextmenu` (Shift+F10 / the Menu key), whose coordinates are (0,0), now anchors the menu to the trigger's box instead of the viewport corner (#3343).
- DateInput/DateTimeInput: the date field's calendar popover can now be opened from the keyboard with `ArrowDown` / `Alt+ArrowDown` (APG combobox), not just by clicking. DateTimeInput's time input no longer uses a hardcoded English `aria-label="Time"` — it defaults to `"{label} time"` (tied to the field label and localizable) and accepts an explicit `timeLabel` prop (#3343).
- DateRangeInput: the preset sidebar is now a labeled `role="group"` of action buttons instead of a `role="listbox"` of `role="option"` buttons. The listbox/option roles announced a single-tab-stop listbox that contradicted the actual Tab-between-buttons interaction (no listbox keyboard model existed). The currently-applied preset is marked with `aria-current` rather than `aria-selected` (#3343).
- docs.mjs: resolve the package directory with fileURLToPath so component docs work on Windows, where URL.pathname yields drive-letter paths like /D:/... that made --list silently print nothing and single-component lookup crash with ENOENT (#3331)
- DropdownMenu: pressing Tab in an open menu now closes it (APG menu-button pattern) and returns focus to the trigger, instead of leaking focus into the page while the menu stayed open (#3343).
- Escape now dismisses only the top-most open layer instead of closing every open layer at once — a popover or menu nested inside a Dialog no longer closes both on a single Escape press. Also guards against IME composition: pressing Escape to cancel a CJK/IME composition inside a Dialog or popover no longer closes the overlay (#3343).
- Vertically center the optional/required indicator in `FieldLabel`.
  The `label` and `optionalRequired` styles never set an explicit `lineHeight`,
  so both fell back to `line-height: normal` (~1.2), producing mismatched line
  boxes (~16.8px for the 14px label vs ~14.4px for the 12px "∙ Required" text).
  With `alignItems: center` the smaller indicator centered within its shorter box
  and rendered visually high relative to the label.
- FileInput: `aria-describedby`, `aria-required`, and `aria-invalid` now sit on the focusable `role="button"` control instead of the visually-hidden `tabIndex={-1}` file input that never receives focus. Screen-reader users now hear the field's help text, required state, and error state. The hidden native input is also marked `aria-hidden` since it is not focusable (#3343).
- useFocusTrap: the focusable-element detection now includes `contenteditable`, media with `controls`, `iframe`, and an open `<details>`'s `<summary>`, and excludes elements hidden via `display:none`/`visibility:hidden` or inside `inert`/`hidden` subtrees. Previously a trapped surface whose only interactive content was (e.g.) a contenteditable composer could let Tab escape (infra-8).
- Grid no longer writes `grid-template-columns`/`grid-auto-rows` as raw inline styles. Track templates now use StyleX dynamic styles (CSS-variable indirection), so consumer `xstyle` overrides — including responsive `@media` overrides — take effect instead of being defeated by inline styles.
- NumberInput, DateInput, and DateTimeInput now set `aria-invalid="true"` and announce a short message (e.g. "Invalid number" / "Invalid date" / "Invalid time") via a visually-hidden `role="alert"` live region while the currently typed input is unparseable, instead of only dimming the text color and then silently reverting the value on blur. Screen-reader users now get feedback that their entry was rejected rather than silence, and the invalid state is no longer signaled by color alone (WCAG 3.3.1 Error Identification, 1.4.1 Use of Color). The revert-on-blur behavior is unchanged. (#3343)
- InputGroup: grouped TextInput and NumberInput controls now include both the group label and their own label in the input name, while preserving the group's description and status associations (#3343).
- InputGroup: the group is now named by the field label via `aria-labelledby` instead of a duplicated `aria-label`, and the label no longer carries an orphaned `htmlFor` (its `inputId` was never handed to a child). Uses the `Field` `isGroupLabel`/`labelID` support (#3343).
- Kbd: the component is no longer entirely `aria-hidden`. It now exposes a spoken accessible name (e.g. "Command + K") built from screen-reader-friendly key labels, while the visual glyphs (⌘, ⇧, ↵, …) are hidden from assistive tech. Previously any shortcut communicated only via `Kbd` — including CommandPalette's footer hints — was invisible to screen-reader users (#3343).
- Use Kbd for arrow-key navigation hints and space the hint farther from focused controls so outlines stay visible.
- Layer/popover entry animations now honor `prefers-reduced-motion`. The shared layer slide/scale keyframes (used by DropdownMenu, Popover, HoverCard, Tooltip, Selector, and other popover surfaces) and the `useEntryAnimation` presets disable their keyframe animation under `prefers-reduced-motion: reduce`, so layers appear instantly instead of translating/scaling in (#3343).
- useLayer: the popover `toggle` event listener is now removed when the layer element detaches or when the handler identity changes (a new `onHide`), instead of accumulating stale-closure listeners on the same element. This prevents duplicate/stale `onHide` firing over a layer's lifetime (#3343).
- Link: hovering now shifts the link color via the hover tint (`color-mix` with `--color-tint-hover`, matching Slider/Switch/RadioList). This gives always-underlined links (`hasUnderline`) a visible hover affordance they previously lacked — their underline never changed on hover — without altering the default link's underline-on-hover behavior (#2852)
- Link: external links (`isExternalLink`) now include visually-hidden "(opens in new tab)" text so screen-reader and cognitive-load users are told about the new-tab context change — previously only a decorative `aria-hidden` icon signalled it. The text is overridable via the new `newTabLabel` prop for localization (#3343).
- DropdownMenu/ContextMenu: the `role="menu"` container now has an accessible name — DropdownMenu names it from the trigger's label, and ContextMenu exposes a `menuLabel` prop (default "Context menu"). ContextMenu also no longer places `aria-haspopup="menu"` on its role-less, non-focusable trigger wrapper, where it conveyed nothing useful to assistive tech (menus-13, menus-15).
- NavHeadingMenu: `onClick`-only items (rendered without an `href`) now activate on Enter and Space. Previously these `role="menuitem"` elements had no keyboard activation, so keyboard and screen-reader users could focus them but not trigger them (#3333)
- Pagination: coerce pageSize to a positive integer so 0/NaN/negative values no longer crash the dots variant (RangeError: Invalid array length) or render Infinity/NaN page counts; the Table pagination plugin applies the same guard since it computes totalPages independently (#3372)
- usePopover: add a `role` (`'dialog' | 'none'`) and `isModal` option so listbox and menu popups no longer announce a false modal dialog. Selector, MultiSelector, BaseTypeahead, PowerSearch, DropdownMenu, TabMenu, and the Chat mention menu now expose their own `listbox`/`menu` role instead of being wrapped in `role="dialog" aria-modal="true"` while focus stays on the trigger. Genuine dialog popovers are unchanged (#3343).
- ProgressBar: determinate progress now uses `role="progressbar"` instead of `role="meter"`. `meter` is for static gauges (disk usage, battery) that screen readers do not treat as live-updating task indicators; a progress bar conveys task completion and should be announced on update. Indeterminate progress was already `progressbar` (#3343).
- RadioList: give an unselected radio group a deterministic keyboard tab stop. When focus enters a group with no selected value, the group now normalizes the entry point — first radio when tabbing forward, last radio when tabbing backward — matching the ARIA radio-group pattern. A selected value keeps its native tab stop, and moving between radios inside the group is never redirected. (#3390)
- RadioList: the group is now named via `aria-labelledby` pointing at the field label element, and the label no longer carries an orphaned `htmlFor` (it pointed at an id no radio used, so clicking it did nothing and the group was double-labeled). `Field`/`FieldLabel` gain optional `labelID` and `isGroupLabel` props to support grouping controls (#3343).
- Table, CodeBlock, and Markdown: the keyboard-focusable scroll containers now use `role="group"` instead of `role="region"`. `region` is a landmark, so multiple same-named scroll regions on one page (e.g. several tables labelled "Table") triggered axe `landmark-unique`. `group` keeps the label and keyboard focusability without creating duplicate landmarks. (#3343)
- CodeBlock/Table/Markdown: overflowing scroll regions are now keyboard-focusable (`tabIndex`, `role="region"`) so keyboard users can scroll long code and wide tables. CodeBlock's Copy button no longer collapses the block when clicked, and is no longer nested inside the collapsible header's `role="button"` (#3343).
- SegmentedControl: a disabled segment (including when the whole control is disabled) is no longer a keyboard tab stop. Previously the selected segment kept `tabIndex={0}` while disabled, so it was focusable but silently dead — arrow keys and activation did nothing (#3343).
- SegmentedControl: keep the radiogroup reachable by Tab even when the current `value` matches no item (or the selected item is disabled). Previously a stale/unmatched value left every segment at `tabIndex={-1}`, so the whole control dropped out of the tab order. The first enabled segment is now promoted to the tab stop (#3343).
- Selector/MultiSelector: `Delete` and `Backspace` now clear the value from the focused trigger when `hasClear` is set, so clearing a selection is no longer mouse-only. The clear button was already keyboard-reachable; this adds the keyboard shortcut path (#3343).
- Selector/MultiSelector (`hasSearch`): the popup's search input is now the combobox — it carries `role="combobox"`, `aria-expanded`, `aria-autocomplete="list"`, `aria-controls`, and `aria-activedescendant`, so screen readers announce the highlighted option as ArrowUp/Down move it. Previously the search input was a bare `searchbox` while `aria-activedescendant` stayed on the (now-unfocused) trigger, leaving highlight changes silent. In `hasSearch` mode the trigger is a plain button that opens the listbox rather than a second combobox (#3343).
- Selector, MultiSelector: the combobox trigger is now keyboard-focusable (`tabIndex=0` when enabled). Previously it was `tabIndex=-1`, so keyboard and screen-reader users could not open or operate the control in the default (non-search) mode. The Clear button is now keyboard-reachable too (#3320)
- useLayer: guard `showPopover()`/`hidePopover()` behind a feature check so overlays degrade gracefully instead of throwing a TypeError on browsers without the Popover API (Safari <17, Firefox <125) (#3343).
- SideNavItem: for split-action items (a collapsible item with its own link/action), `aria-current="page"` now sits on the focusable link instead of the non-interactive wrapper `<div>`, so screen readers announce the current page on the actual navigation element (#3343).
- SideNavHeading: label the product icon link with the heading text so it has an accessible name. When superheadingHref, headingHref, and a menu were all set, the icon link to the heading href rendered with no text or aria-label, so axe flagged it under link-name and screen readers announced an unlabeled link. (#3343)
- Skeleton: the loading placeholder is now `aria-hidden` by default (it's decorative — the surrounding region conveys the loading/busy state) and its pulse animation is disabled under `prefers-reduced-motion: reduce`. The `aria-hidden` default can be overridden by consumers (#3343).
- Spinner: the rotation animation now slows substantially under `prefers-reduced-motion: reduce` (matching ProgressBar) instead of spinning unconditionally. The `role="status"` "Loading" announcement still conveys busy state (#3343).
- Table: proportional() and pixel() no longer throw when called from a React Server Component. The Table barrel carried a 'use client' directive that marked the pure column utilities as client functions; the directive now lives only on the component modules, and Table.doc.mjs documents which parts of the data-driven API are server-safe (#3457)
- TabList: stop rendering aria-orientation on the nav element. aria-orientation is not an allowed attribute on the navigation role, so it triggered a critical axe aria-allowed-attr violation (also surfaced via Toolbar and ToolbarEdgeCompensation stories that reuse the same DOM). The orientation prop still drives arrow-key navigation and the keyboard hint. (#3343)
- TimeInput/DateTimeInput: parse dotted meridiems correctly. "2:30 p.m." was silently accepted as 02:30 and "12 a.m." as noon because the meridiem-detection regex did not allow the dots that the AM/PM regexes accept; hasMeridiem is now derived from those regexes so they cannot drift (#3462)
- Toast: keyboard users can now reach and manage notifications. Pressing `F6` jumps focus into the toast viewport (the newest toast's first control, or the container). Dismissing a toast that holds focus now hands focus to a remaining toast — or restores the element focused before entering the viewport — instead of dropping to `<body>`. Auto-hide timers also pause while the window is blurred and resume on focus, so a toast no longer silently expires while you're in another window or tab (#3343)
- Toast: remove the invalid `aria-modal` attribute from the notifications viewport. `aria-modal` is only valid on `role="dialog"` / `alertdialog`, so declaring it on the `role="region"` viewport was flagged by axe (`aria-allowed-attr`). Because the viewport renders on every page, this surfaced the violation across the whole app (#3343).
- Tooltip: satisfy WCAG 1.4.13 (Content on Hover or Focus). Tooltips can now be dismissed with `Escape` while visible, and stay open when the pointer moves from the trigger onto the tooltip surface (a short hover bridge). `useLayer` context render props gain `onMouseEnter`/`onMouseLeave` on the layer container to support hoverable overlays.
- TopNavHeading: give the logo an accessible name when it links to a destination. The logo image is decorative, so a logo wrapped in `headingHref` produced an unnamed link (axe: link-name). It is now labelled from `heading` (or a new optional `logoLabel` prop for logo-only headings). (#3343)
- TreeList: parent rows can now be expanded and collapsed from the keyboard. Any item with children renders a real focusable toggle button with `aria-expanded`, so expansion no longer requires a mouse — previously items without an `onClick`/`href` had no focusable control at all (#3343).
- Typeahead/Tokenizer: close the results dropdown when focus leaves the input (e.g. tabbing away), matching the existing outside-click and Escape dismissal. Previously the menu could stay open after the trigger lost focus.
- ContextMenu and NavMenu heading menus now support first-character typeahead (type a letter to jump to the matching item), via the shared `useTypeahead` hook — matching DropdownMenu. MoreMenu inherits it through DropdownMenu (#3343).
- useListFocus (menu/toolbar keyboard navigation): arrow keys, Home, and End now skip disabled items instead of stalling on one whose `.focus()` silently no-ops. This unfreezes keyboard navigation in NavHeadingMenu and Toolbar/ButtonGroup when a disabled control is present. The default item selector also now matches `menuitemradio`/`menuitemcheckbox` (#3343).

#### Documentation

- Document Carousel's hasEdgeFade and padding props, supported by the component but missing from the props table, docsZh, and docsDense (same omission previously fixed for Text's justify and ToggleButton's isIconOnly). Also correct the Fade edges anatomy row to optional, since the mask is suppressible via hasEdgeFade (#3332)
- Fix stale references in the core README: rename the "XDS CLI" section to "Astryx CLI", correct component names to their current bare exports (Layout, AppShell, TopNav, SideNav), and update remaining XDS brand mentions to Astryx.
- Link: document `type="inherit"` for inline links. The value was already supported (forwarded to `Text`, which renders `font-size`/`line-height: inherit`), but undocumented — clarified the `type` prop JSDoc, added an inline-link example, and added regression tests covering the inherit/default-body behavior (#2927)
- MetadataListItem: its docs page preview now renders inside a MetadataList wrapper with realistic defaults (#3318)

#### Other Changes

- Consolidated 5 inline visually-hidden style blocks into the shared VisuallyHidden primitive (Button, Link, ProgressBar, Switch, TextArea); no behavior change.
- Rename the Field `labelElementID` prop to `labelID`, matching the `(part)ID` naming convention used by the sibling props (`inputID`, `descriptionID`, `messageID`). The disambiguation between "the id applied to the label element" and `inputID` ("the control the label points at") now lives in the prop JSDoc rather than the name. Also renamed on FieldLabel and updated the RadioList/CheckboxList/InputGroup consumers. No behavior change. (#3343)
- `useGridFocus` gains `hasRovingTabIndex`, `handleFocus`, and `isRtl`, matching the `useListFocus` API. Calendar now uses `useGridFocus` to own its roving tab stop, removing the unpublished `useCalendarRovingTabindex` hook.
- SegmentedControl now uses the shared useListFocus roving-tabindex primitive instead of its inline keyboard handler and tab-stop repair effect; no behavior change.
  The component's ~60-line inline ArrowLeft/Right/Home/End handler and useIsomorphicLayoutEffect tab-stop repair are replaced by useListFocus({hasRovingTabIndex: true, wrap: true, orientation: 'horizontal'}), which owns the single roving tab stop, skips disabled radios, wraps, handles Home/End, and repairs the stop on mount/disable. Selection-follows-focus (APG radiogroup) is preserved via a container onFocus handler that selects the focused radio's value.
- Move `@stylexjs/stylex` from `dependencies` to a required `peerDependency` (`^0.18.3`). A consumer who authors their own StyleX now shares a single runtime with astryx — resolution dedupes to their own install in both browser and Node — instead of silently getting a second copy on version drift. An incompatible StyleX version is now flagged at install (npm errors, pnpm/yarn warn) instead of resolving silently. Consumers who don't author StyleX are unaffected: the runtime is still required to render astryx components and is auto-installed by npm 7+ and pnpm.
- New `TableContextAction` type and an optional `contextMenuActions` field on
  `HeaderCellRenderProps` / `BodyCellRenderProps`. Plugins append their actions
  inside the existing `transformHeaderCell` / `transformBodyCell` transforms;
  the table concatenates them across plugins (never overridden), the same way
  `styles` are merged.
- The cell components (`TableHeaderCell` / `TableCell`) own the menu wrapper and
  render it around their own content via the `ContextMenuActions` prop, so the
  cell controls how the wrapper interacts with padding / content sizing — and
  row menus work without invalid `<tr>` nesting. Actions group with dividers and
  show a checkmark for the active item; when none are contributed, the native
  browser menu passes through.
- `contextMenuActions` accepts either an array or a getter
  (`() => TableContextAction[]`); the getter is resolved lazily when the menu
  opens, so plugins with state-derived actions don't build arrays on every
  render. `useTableSortable` uses a getter so its checked/clear state always
  reflects the latest sort.
- First contributor: `useTableSortable` adds "Sort ascending / Sort descending
  / Clear sort" on sortable headers.
- TabList now uses `useListFocus`'s built-in roving-tabindex support (`hasRovingTabIndex`) instead of a hand-rolled tab-stop repair effect. The hook owns the single tab stop — stamping tabindex 0/-1, repairing it on mount and as stops mount/unmount or toggle disabled, and keeping it in sync after clicks/programmatic focus via `handleFocus` on the nav. Individual Tabs still render `tabIndex={isSelected ? 0 : -1}` as the initial source of truth, which the hook's repair preserves. No behavior change.
- useTreeFocus gains `hasRovingTabIndex` + `handleFocus` for internal tab-stop management; TreeList drops its inline `activeId` state and lets the hook own the roving tab stop (#3488).

#### Contributors

Thanks to everyone who contributed to this release:

- @AKnassa
- @arham766
- @athz
- @cixzhang
- @durvesh1992
- @ejhammond
- @humbertovirtudes
- @IFAKA
- @imdreamrunner
- @thedjpetersen

---

# 0.1.2

#### Breaking Changes

- `Text`, `Heading`, `Link`, and `Timestamp` rename the `color="active"` value to `color="accent"`, now mapping to the dedicated `--color-text-accent` token (legible accent text ink) instead of `--color-accent`. Run `astryx upgrade` to migrate call sites automatically. (#2863)

#### New Features

- Button: add `isInterruptible` to keep the button clickable while a `clickAction` is pending — the spinner and `aria-busy` still show, but the button is not disabled or deduped, so a re-click interrupts the in-flight action. ToggleButton's async toggle now runs through this path, staying interruptible.
- Add a prebuilt UMD bundle (`dist/astryx.umd.js`, global `Astryx`) plus `unpkg`/`jsdelivr` fields, so the library works directly from a CDN via a `<script>` tag with no bundler. React/ReactDOM stay as peer globals; the StyleX runtime is bundled in.
- Add `useTableStickyColumns` — pin a contiguous run of `Table` columns to
  the start and/or end edge with cumulative offsets and scroll-aware drop shadows.
  Configure with `{ startKeys, endKeys }`; an empty config is a valid no-op.

#### Fixes

- AvatarGroupOverflow now forwards rest props (data-_, aria-_, event handlers, id, role, tabIndex) to the rendered element, matching the behavior of Avatar and AvatarGroup.
- Fix HoverCard SSR hydration mismatch when used inside an SSR Client Component (#3107). The floating layer now renders inline instead of portaling to `document.body`, so server and client markup match. No API change.
- Kbd: use the `--color-border-emphasized` token for its bottom border instead of `--color-border` (#2850)
- useLayer now treats `anchor-name` as a comma-separated list, so multiple layers can anchor to the same element (e.g. two TopNavMegaMenus in one nav) without clobbering each other's anchor. Previously the second menu lost its anchor and rendered over the nav.
- Fix mobile nav drawer not re-opening after it is closed (#3091)
  The AppShell mobile drawer mounts `MobileNav` inside an `<Activity>` that
  switches to `mode="hidden"` when the drawer closes. On close, React runs the
  drawer effect's cleanup (with a stale `isOpen`) instead of re-running the
  effect with `isOpen=false`, so the deferred `dialog.close()` never fired and
  the native `<dialog>` was left `open` in the hidden subtree. The next open then
  skipped `showModal()` (the dialog was already open), so the drawer could be
  opened and closed once but never re-opened. The effect cleanup now closes the
  dialog if it is still open, keeping the native dialog state in sync so a
  subsequent open cleanly calls `showModal()` again.
- Core components (`Banner`, `EmptyState`, `Markdown`) no longer render a `<p>` by default — they render `<div>` (appearance unchanged). This avoids hydration mismatches when block content lands in a `<p>`. `Markdown` paragraphs use `role="paragraph"`; pass `components={{paragraph: 'p'}}` to opt back into `<p>`.
- `Pagination`'s `changeAction` is now interruptible — page changes run in a transition with optimistic page state, so rapid prev/next clicks advance through pages instead of being dropped. `Button`'s `clickAction` keeps its single-fire guard.
- make the `Slider` default track color visible on muted backgrounds
  The background track painted with `--color-background-muted` — the same token
  used for muted surface fills — so the track disappeared on muted backgrounds.
  The track now uses the dedicated `--color-track` channel token, which is
  designed to stay legible against body/muted surfaces.
- Polish `useTableStickyColumns` pinned-cell backgrounds so they match the
  rest of the row:
- Table: the header row no longer picks up the `hasHover` row highlight — hover (and striped) styling now applies to body rows only. Adds an internal `isHeaderRow` flag on the row component so the header row in `<thead>` opts out (#2734)
- `Timestamp` now renders the current time (and small clock skew up to ~30s in the future) as "now" instead of "in a few seconds" (#3099).
- ToggleButton onPressedChange receives the click event for preventDefault opt-out
  `onPressedChange` now receives the originating click event as a second
  argument. Calling `event.preventDefault()` skips `pressedChangeAction`, so a
  consumer can handle the toggle entirely in `onPressedChange` without firing the
  action — matching how `Switch`'s `onChange` and `Button`'s `onClick` already
  gate their action props. Existing `(isPressed) => void` handlers keep working;
  the event is an added trailing argument.
- Tokenizer/PowerSearch: align end content (clear button, resultCount) with the field's inline padding instead of hugging the border (~3px). It now uses spacing-2 (8px) to match the text/start-icon inset (#2849)
- Tooltip and HoverCard: add ARIA roles to the floating layers — `role="tooltip"` on Tooltip (completing the ARIA tooltip pattern; the trigger already links via `aria-describedby`) and `role="dialog"` on HoverCard. Plumbed via a new optional `role` on the layer render props. (#3240; Popover already exposes `role="dialog"`.)

#### Documentation

- Document Banner's `defaultIsExpanded` prop, which controls whether the collapsible content area starts expanded but was missing from the docsite properties tab
- Rename the ClickableCard and SelectableCard examples to follow the "Component — Variant" title convention (`Clickable Card — Nested Button`, `Selectable Card — Multi-select`), and add playground defaults to both card docs so their docsite previews show realistic card content (#2877)
- Declare playground scaffolds for the Chat sub-components so they preview at a realistic width (ChatComposer and ChatComposerDrawer wrap in a sized container, and the drawer seeds default content), and drop the redundant visible value label from the ChatComposerDrawer "With Progress" example while keeping the accessible label (#2877)
- Document two public props missing from the docsite properties tab: List's `start` (ordered-list counter start) and CheckboxInput's `isReadOnly`
- Restore the Icon and Skeleton properties-tab previews on the docsite. Icon now seeds a default `icon` (it was a required, non-generatable prop), and Skeleton renders with concrete preview dimensions instead of collapsing at `100%` (#2848, #2875)
- Document Heading's `justify` prop, which was supported by the component but missing from the docsite properties tab (#2847)
- OverflowList: seed example items via playground defaults so the docsite properties-tab preview renders a real list instead of an empty container (#2872)
- Document Section's `paddingBlock` prop (block-axis padding override), which was supported by the component but missing from the docsite properties tab
- Give the `Skeleton` properties-tab example explicit dimensions so it is visible
  The `Skeleton` doc had no `playground` config, so the interactive
  properties-tab preview fell back to the prop defaults of `width: '100%'` /
  `height: '100%'`. With no sized parent, the skeleton collapsed to a zero-size
  (invisible) element. The doc now sets a `playground.defaults` of
  `width: 320` / `height: 80` so the shimmer placeholder renders visibly.
- Update stale `facebookexperimental/xds` doc/JSDoc links to the then-current `facebook/astryx` namespace in source comments (theme/syntax `@see` references). The old org 301-redirects, so these weren't broken — just stale — and this matches the canonical org used elsewhere
- Document Table's `verticalAlign` and `textOverflow` props, which were supported by the component but missing from the docsite properties tab
- Document TabList's `layout` prop ('hug' | 'fill') for tab sizing, which was supported by the component but missing from the docsite properties tab
- Document Text's `justify` prop, which was supported by the component but missing from the docsite properties tab (same omission previously fixed for Heading) (#2847-adjacent)
- Restore the Timestamp properties-tab preview on the docsite. `value` is a required prop with no semantic default, so the preview rendered "Invalid time value"; it now seeds a valid ISO 8601 date (#2877)
- Document ToggleButton's `isIconOnly` prop, which was a supported public prop but missing from the docsite properties tab
- Make the Toolbar "Table Filter" example use real Selector controls for its Status and Priority filters instead of buttons styled to look like dropdowns, and add meaningful playground defaults plus richer slot options (buttons, icon buttons, tabs, segmented controls, selectors) to the Toolbar docs (#2877).

#### Other Changes

- Pinned cells paint an opaque base via the overridable
  `--table-sticky-background` variable (defaults to `--color-background-card`),
  fixing a grey mismatch in themes/modes where `surface !== card` (e.g. neutral
  dark). Consumers on a different backdrop override the variable.
- The row's overlay (striping and/or hover) is replayed on the pinned cell via
  a background-image gradient. `TableRow` publishes its current overlay color as
  the inheritable `--table-row-overlay` variable, so pinned columns mirror the
  row exactly — striped when the table is striped, hover when enabled, nothing
  otherwise (no phantom stripes) — transitioning in lockstep with the row.
- `background-clip: padding-box` keeps the row divider visible on pinned cells.
- New `transformScrollWrapper` hook (+ `ScrollWrapperRenderProps`) lets plugins attach a `ref`
  to the horizontal scroll container and inject before/after chrome.
- `transformHeaderCell` / `transformBodyCell` now receive `columnIndex` and the
  full ordered `columns` list (also surfaced on the render props), enabling
  position-aware plugins such as sticky columns. Existing plugins are unaffected
  — the new args and methods are additive and optional.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @durvesh1992
- @ernesttien
- @humbertovirtudes

---

# 0.1.1

#### Breaking Changes

- Rename `xdsTokenDefaults` export to `tokenDefaults`
  The token-defaults constant is renamed from `xdsTokenDefaults` to
  `tokenDefaults` (exported from `@astryxdesign/core/theme`). Update imports
  accordingly. Part of removing xds naming from the public API.

#### Fixes

- Increase trailing padding on `ChatLayoutScrollButton` when a label is shown
  With a label (e.g. "New messages"), the chevron icon sits on the leading edge
  and the text on the trailing edge. The symmetric inline padding left the label
  text cramped against the pill's rounded corner. The trailing inline padding is
  now widened when a label is present, giving the text comfortable breathing room
  from the rounded edge. The icon-only (collapsed) state is unchanged and stays
  balanced.
- Prevent `DateInput` from crashing the page while typing an incomplete
  date. Typing a leading `0` or `1` (e.g. starting to enter `01` for January)
  could coerce the in-progress value into an invalid date with a year of `0`,
  which then threw a `RangeError` and crashed the surrounding page. Partial,
  not-yet-complete input is now treated as incomplete instead of being parsed
  into a date, so the field stays usable as you type.
- Remove doubled focus ring on `Selector`. The inner combobox button drew
  its own `:focus-visible` outline on top of the wrapper's `:focus-within` ring,
  producing a stacked, rounded outline over the trigger after selecting an option
  or navigating with the keyboard. The button now defers to the wrapper's focus
  ring, matching `TextInput` and `NumberInput`.
- `<Layout>…</Layout>` no longer renders a blank page. `Layout` is
  slot-driven (`content`/`header`/`start`/`end`/`footer`), and the natural nested
  form `<Layout><LayoutContent /></Layout>` previously type-checked and built
  green while dropping its children at runtime — an empty shell. Children now
  render as a shorthand for the `content` slot (`<Layout>{main}</Layout>` is
  equivalent to `<Layout content={main} />`), matching how `Card` and `Section`
  accept content; an explicit `content` prop still wins when both are provided.
- ToggleButton runs pressedChangeAction in an interruptible transition with optimistic state
  `pressedChangeAction` was fired as a non-awaited promise, so the documented
  loading spinner never appeared and the toggle ignored the action's lifecycle.
  It now runs inside a transition with an optimistic pressed state, matching
  `Switch`:

#### Other Changes

- The optimistic pressed state flips immediately on click; the spinner is
  debounced so a fast action shows the new state without a spinner flash.
- The action is interruptible — clicking again while it is pending starts a
  new transition with the next optimistic state (e.g. true -> false -> true),
  instead of being dropped or guarded out.
- Synchronous handlers are supported too: a `pressedChangeAction` (or
  `onPressedChange`) that synchronously triggers a suspending update, such as
  a router navigation that suspends on data, also drives the pending state.
  `pressedChangeAction` now accepts `void | Promise<void>`.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @ejhammond
- @josephfarina

---

# 0.1.0

#### Breaking Changes

- Rename theme-token helpers off the XDS name
  The `@xds/core/theme` token helpers are renamed: `resolveXDSThemeTokens` ->
  `resolveThemeTokens`, `resolveXDSThemeToken` -> `resolveThemeToken`,
  `xdsTokenVar` -> `tokenVar`, `xdsTokenVars` -> `tokenVars`, and the option types
  `ResolveXDSThemeToken(s)Options` -> `ResolveThemeToken(s)Options`. Update imports
  from `@xds/core/theme` / `@xds/core/theme/tokens`. Part of removing `xds` naming
  from the public API.
- Remove the XDS-prefix compatibility layer — astryx is now the only public surface
  This release erases all `xds` naming from the public API; there is no compatibility
  window. Consumers must migrate (we own all consumers pre-OSS):
- Remove the daily, brutalist, and default themes; neutral is the new baseline
  Three theme packages are removed from the repo and will no longer be published:

#### New Features

- Underline links by default in the Markdown component
  Markdown links now render with a persistent underline instead of only underlining on hover, making links clearly distinguishable from surrounding text and improving accessibility. The accent color is unchanged.

#### Fixes

- Markdown: parse ordered lists using the `)` marker delimiter, not just `.` (#2994)
  CommonMark 5.2 allows an ordered-list marker to end in `.` or `)` (e.g. `1)`), but the parser only matched `\d+\. `, so `1) First` lists rendered as literal paragraph text. Lists now capture their delimiter — a `.` → `)` change starts a new list, including across streamed chunks — and paragraph interruption follows CommonMark (only a marker value of 1, including zero-padded like `01.`, may interrupt).

#### Other Changes

- **Component names:** the `XDS*` aliases are gone — use bare names (`Button` not
  `XDSButton`, `useTheme` not `useXDSTheme`, `ButtonProps` not `XDSButtonProps`). The
  `drop-xds-prefix-imports` codemod automates this.
- **CSS classes:** components emit only `.astryx-*` (the dual `.xds-*` class is gone).
  Update custom CSS selectors `.xds-button` -> `.astryx-button` (prop/state value classes
  like `.primary`/`.sm` are unchanged).
- **data attributes:** only `data-astryx-theme` / `data-astryx-media` are written; update
  custom selectors and SSR root attributes off `data-xds-*`.
- **CSS layers:** `@layer xds-base` / `xds-theme` are renamed to `astryx-base` /
  `astryx-theme`; update your `@layer` order line and any PostCSS `layersBefore` config.
  `@astryxdesign/build`'s default library layer is now `astryx-base`.
- **Pre-compiled stylesheet:** the `@astryxdesign/core/xds.css` export is removed — import
  `@astryxdesign/core/astryx.css`.
- **CSS custom properties:** the `--xds-*` padding fallback is gone; set `--astryx-*`.
- **CLI config key:** `@astryxdesign/cli` reads the package.json `"astryx"` field (was `"xds"`).
  Rename the block; a stale `"xds"` key silently drops the package from discovery.
- `@astryxdesign/theme-daily`
- `@astryxdesign/theme-brutalist`
- `@astryxdesign/theme-default`
- import {defaultTheme} from '@astryxdesign/theme-default/built';
  - import {neutralTheme} from '@astryxdesign/theme-neutral/built';
- <Theme theme={defaultTheme}>...</Theme>
  - <Theme theme={neutralTheme}>...</Theme>

  ```

  ```

- Rename the npm package scope from `@xds/*` to `@astryxdesign/*`
  All published packages move to the new `@astryxdesign` scope (e.g. `@xds/core` → `@astryxdesign/core`), along with the workspace lockfile, build/runtime scope-directory scans, and docsite slug derivation. Consumers must update their imports and dependency names. The internal ESLint plugin namespace (`@xds/*` rules) is intentionally untouched and tracked separately. Existing `@xds/*` codemods continue to target the old scope so projects still on `@xds/*` can migrate.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @ejhammond
- @kentonquatman
- @lexs

---

# 0.0.15

This release makes **bare component names canonical**: `Button`, `Stack`, `useTheme`, etc. are now first-class, and the `XDS*` / `useXDS*` names become compatibility aliases. Existing prefixed code keeps working through the alias layer — migrate when you're ready with the codemod below. It also lands several prop/component renames for cross-component consistency, each with its own codemod.

#### Breaking Changes

- **Un-prefix migration — bare names are canonical** — Every `XDS*` component, hook, and type now has a bare alias (`XDSButton` → `Button`, `useXDSTheme` → `useTheme`, ~634 identifiers across 100 barrels). The prefixed names still work as aliases during the compat window, so this is non-breaking if you do nothing — but bare names are the new default for docs, discovery, and new code. (#2941)
  **Codemod:** `npx astryx upgrade --codemod drop-xds-prefix-imports`
- **`@xds/core` un-prefix** — `XDSMetaAppShell` → `MetaAppShell` and related meta-app exports drop the `XDS` prefix. (#2957)
  **Codemod:** `npx astryx upgrade --codemod drop-xds-meta-prefix`
- **DatePicker components renamed to Input** — `XDSDateTimePicker` → `XDSDateTimeInput` and `XDSDateRangePicker` → `XDSDateRangeInput` (plus their props, size, and hour-format types), for consistency with `DateInput`/`TextInput`/`NumberInput`. (#2276)
  **Codemod:** `npx astryx upgrade --codemod rename-date-picker-to-input`
- **Stack `element` → `as`** — `XDSStack`, `XDSHStack`, `XDSVStack`, and `XDSStackItem` use `as` instead of `element`, matching other polymorphic components. (#2441)
  **Codemod:** `npx astryx upgrade --codemod rename-stack-element-to-as`
- **Chat `isStreaming` → `isStopShown`** — On `XDSChatComposer` and `XDSChatSendButton`, the prop that controls the stop-button affordance is renamed to describe what it does rather than implying a streaming state. (Unchanged on `XDSMarkdown`/`XDSChatReasoning`.) (#2333)
  **Codemod:** `npx astryx upgrade --codemod rename-isStreaming-to-isStopShown`
- **Imperative handles move to `handleRef`** — `XDS*` components reserve `ref` for the root DOM element. Components exposing an imperative handle (`XDSCalendar`, `XDSChatComposerInput`, `XDSPowerSearch`, `XDSTokenizer`, `XDSChartStreamGL`) now expose it via `handleRef`; `XDSSideNavCollapseButton`'s `sideNavRef` is also renamed to `handleRef`. (#2363)
  **Codemod:** `npx astryx upgrade --codemod rename-imperative-ref-to-handleRef`
- **Menu/Selector trailing content: `children` → `endContent`** — `XDSDropdownMenuItem`, `XDSContextMenuItem`, and `XDSSelectorOption` use `endContent` for trailing badges, status icons, shortcuts, and other end-aligned content; the previous trailing-content `children` prop is removed. (#2802)
  **Codemod:** `npx astryx upgrade --codemod migrate-item-children-to-endcontent`
- **Selector custom rendering: function-children → `renderOption`** — `XDSSelector` and `XDSMultiSelector` use the `renderOption` prop for custom option rendering; the previous function-as-children renderer is removed. (#2821)
  **Codemod:** `npx astryx upgrade --codemod migrate-selector-children-to-render-option`
- **CheckboxList loading is now per-item** — The group-level `isLoading` on `XDSCheckboxList` is removed in favor of `isLoading` on `XDSCheckboxListItem`. In collection mode the toggled item shows its spinner automatically while its `changeAction` is pending. (#2903)
- **Chat `messageGap` → `gap`** — `XDSChat` renames `messageGap` to `gap`. (#2325)
- **FileInput `onChangeAction` → `changeAction`** — Aligns `XDSFileInput` with the React 19 action-prop convention used across the system. (#2288)
- **PowerSearch preset types → `*FilterPreset`** — Preset type exports are renamed for clarity. (#2925)
- **`CenterAxis` → `XDSCenterAxis`, `DateRange` unprefixed** — Type-export naming cleanups for consistency. (#2289, #2922)
- **Stepper moved to `@xds/lab`** — `XDSStepper`/`XDSStep` move to the lab package while the API is reworked; import from `@xds/lab`. (#2335)

#### Upgrade

```bash
npx astryx upgrade --apply
```

This runs the release codemods in sequence. The bare-name migration (`drop-xds-prefix-imports`, `drop-xds-meta-prefix`) and the theme data-attribute migration (`migrate-theme-selectors-to-data-attrs`) are optional — run them explicitly when you're ready, e.g.:

```bash
npx astryx upgrade --codemod drop-xds-prefix-imports --codemod-only --apply
```

#### New Components

- **XDSLightbox** — Image/media lightbox with overlay presentation. (#2298)
- **XDSItem** — Shared item primitive with `compact`/`balanced`/`spacious` density and `startContent`/`endContent` slots, now composed by `XDSListItem`. (#2259)
- **XDSOutline** — Sliding-indicator outline/nav with density variant and CSS anchor positioning. (#2347, #2746)
- **useXDSInteractiveRole / XDSInteractiveRoleContext** — Coordinate interactive-role semantics across nested components. (#2399)

#### New Features

- **Bare-name subpath exports** — `@xds/core/Heading`, `@xds/core/Code`, `@xds/core/HStack`, `@xds/core/VStack` ship as convenience subpaths. (#2420)
- **Field `width` prop** — Field-based components accept a `width` (`SizeValue`) applied to the outer `XDSField`, so label, control, and status size together and stay aligned. Additive and backward compatible. Affects `XDSTextInput`, `XDSTextArea`, `XDSNumberInput`, `XDSDateInput`, `XDSDateRangeInput`, `XDSDateTimeInput`, `XDSTimeInput`, `XDSFileInput`, `XDSSelector`, `XDSMultiSelector`, `XDSTypeahead`, `XDSTokenizer`, `XDSSlider`, `XDSCheckboxInput`, `XDSCheckboxList`, `XDSRadioList`, `XDSSwitch`, and `XDSField`. (#2755)
- **`lg` size on all input components** — Inputs gain a large size option. (#2324)
- **Markdown `autolink="gfm"`** — `XDSMarkdown` gains an opt-in `autolink` prop enabling GitHub-Flavored Markdown autolink-literal rules (bare `https?://…`, `www.…`, `<scheme:url>`, `<email>`, `user@host`), skipping code spans, existing links, and image alt text. Also exposed on `parseMarkdown`, `parseInline`, and `parseMarkdownIncremental` via a new `ParseOptions` argument; the existing positional signature is preserved. Default behavior unchanged. (#2394)
- **Markdown `display="inline"`** — Render inline markdown spans that inherit surrounding typography, for doc text and table cells without block-level wrappers.
- **Visual props reflected as data attributes** — Components dual-emit `data-*` attributes for their variant/state axes (e.g. `data-variant`, `data-size`) alongside legacy bare variant classes, giving themes a stable selector surface. (#2792)
- **Spinner `shade="inherit"`** — Paints the ring from inherited `currentColor` (with a translucent track) so it always matches the parent's resolved foreground regardless of theme or variant.
- **Text/Heading `justify` prop** — Justified text alignment on `XDSText` and `XDSHeading`. (#2438)
- **AspectRatio `isCircle`** — Circular containers via `XDSAspectRatio`. (#2632)
- **Link renders a button when `href` is undefined** — `XDSLink` produces a semantic `<button>` for action links without an href. (#2507)
- **Carousel `hasEdgeFade` + padding props** — Edge-fade affordance and padding control; the scale animation is removed. (#2566)
- **Tab `isLabelHidden`** — Icon-only tabs omit empty label nodes so selected indicators align with the visible icon.
- **Menu placement options** — Additional placement controls for menu surfaces. (#2770)

#### Fixes

- **Button/Spinner loading contrast** — Fix poor loading-spinner contrast on themed variants; the spinner inherits the true variant foreground and the label hides correctly on destructive. (#2717)
- **Spinner centering** — Fix `XDSSpinner` rendering off-center inside the icon-only `XDSButton` loading state at fractional device pixel ratios; loading overlay and wrapper use `display: grid` + `place-items: center`.
- **ChatComposer caret** — `XDSChatComposerInput` preserves the caret when the parent updates the controlled `value`, fixing the caret jumping to offset 0 after slash-command picks.
- **Icon slots** — `renderIconSlot` renders semantic icon-name strings through `XDSIcon`; new `getIconRegistry()` lets tooling derive icon-name options from the same registry.
- **CommandPalette inline scroll** — `XDSCommandPaletteItem` no longer scrolls highlighted items into view on initial mount inside an inline dialog, preventing doc-page scroll jumps.
- **Docsite autofocus** — `XDSDialogHeader` skips title autofocus inside `XDSDialog isInline`; `XDSCommandPaletteInput` reads the shared dialog inline context.
- **HoverCard font** — Apply the theme body font token to XDS layer roots so portaled HoverCard content inherits the configured font family.
- **Info status icon** — The default `info` status icon uses a solid fill (matching `success`/`error`/`warning`) for better visibility at small sizes.
- **List/Item density** — `XDSListItem` passes density (`compact`/`balanced`/`spacious`) through to the shared `XDSItem`, fixing `balanced`/`spacious` collapsing to the same padding.
- **Markdown loose lists** — Join blank-line-separated same-style list items into a single loose list (CommonMark §5.3) and forward a non-default `start` onto the rendered `<ol>` for assistive tech and copy-paste.
- **AppShell mobile nav** — Fix mobile nav with a heading-only `XDSTopNav`; remove `useXDSSlotPresence`. (#2243)
- **Theme CSS prose regression** — Fix built theme CSS that broke Markdown typography in the docsite (headings lost block margins) after the un-prefix migration. `astryx theme build` now uses a single CSS generation path (`@xds/core`'s generator) and a failed `@xds/core/theme` import is a hard build error instead of a silent fallback. (#2964)
- **Escape-hatch & base-prop hygiene** — Many components had redundant `xstyle`/`className`/`style` re-declarations removed and now consistently extend `XDSBaseProps`, forward escape hatches, and expose `displayName` (require-base-props / require-ref-prop lint rules). (#2300, #2310, #2835, #2858)
- **Toast barrel export** — Export `XDSToast` and its props from the `@xds/core` barrel so docsite playground previews resolve Toast examples.
- **Typeahead id-less rows** — `XDSBaseTypeahead` uses a shared key fallback for search results without `id` values, so id-less rows no longer all render as selected.
- **SelectableCard transitions tokenized; ResizeHandle gains `className`.** (#2966)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @czarandy
- @ejhammond
- @ernestt
- @imdreamrunner
- @josephfarina
- @kentonquatman
- @lexs
- @nynexman4464
- @rubyycheung

---

# 0.0.14

#### Breaking Changes

- **`on*Action` → `*Action` (React 19 convention)** — `onChangeAction` → `changeAction`, `onClickAction` → `clickAction`, `onPressedChangeAction` → `pressedChangeAction`, `onScrollToTopAction` → `scrollToTopAction`. Aligns with React 19 action prop naming. (#1942)
  **Codemod:** `npx astryx upgrade --codemod rename-action-props`
- **Status naming: `positive`/`negative` → `success`/`error`** — Converge status variant naming across all components. (#2175)
  **Codemod:** `npx astryx upgrade --codemod rename-status-variants`
- **Section `wash` → `muted`** — Rename variant for consistency with XDSCard. (#2063)
  **Codemod:** `npx astryx upgrade --codemod rename-section-wash-to-muted`
- **Stack `direction` defaults to `vertical`** — `XDSStack` no longer requires an explicit `direction` prop; omitting it gives vertical layout. (#1945)
- **Table `textOverflow` default changed to `truncate`** — Was `wrap`, now truncates by default with tooltip on hover. (#2096)
- **Remove deprecated `*Raw` token aliases** — Migrate any `*Raw` usage to standard tokens. (#2095)
- **Remove runtime font loading from `defineTheme`** — Fonts are now handled at the CSS level only. (#2226)

#### Upgrade

```bash
npx astryx upgrade --apply
```

This runs all three codemods (`rename-action-props`, `rename-status-variants`, `rename-section-wash-to-muted`) in sequence.

#### New Components

- **XDSAvatarGroup** — Stacked avatar display for teams and lists (#2183)
- **XDSInputGroup** — Combine multiple inputs into a single visual group (#2207)
- **XDSStepper / XDSStep** — Multi-step flows and progress indicators (#2206)
- **XDSButtonGroup** — Group related buttons with shared styling (#2202)
- **XDSContextMenu** — Right-click context menus with nested items (#2195)
- **XDSFileInput** — File upload with drag-and-drop support (#2184)
- **XDSDateRangePicker** — Date range selection with calendar UI (#2201)
- **XDSDateTimePicker** — Combined date and time input (#2199)
- **XDSBlockquote** — Styled blockquote component (#2198)
- **XDSOverlay** — Scrim + media theme overlay with CSS-first hover and touch support (#1912)
- **XDSNavHeadingMenu** — Container component with size and keyboard nav (#1999)

#### New Features

- **Link `to` prop** — Pass `to` alongside `href` for router compatibility (#2237)
- **Selector `hasSearch`** — Enable filtering/searching within selector options (#2142)
- **CodeBlock `container` prop** — Control width and border on code blocks (#2132)
- **Heading `display` type variants** — Large display headings for hero sections (#2054)
- **Text custom theme-defined types** — Support arbitrary text types from your theme (#1840)
- **Table structural children mode** — Use `<XDSTable>` with JSX children + Markdown integration (#2098)
- **Table content-aware column widths** — Auto layout for children mode (#2105)
- **Table responsive horizontal scroll** — Default column min-widths (#2043)
- **TabList carousel overflow** — Arrow navigation for overflowing tabs (#1978)
- **PowerSearch `components` map** — Per-type token and editor overrides (#2076)
- **Markdown `components` map** — Custom component injection + XDSCitation extraction (#2073)
- **Markdown `inlinePlugins`** — Custom text pattern rendering (#1917)
- **SideNav built-in resize** — Integrate `useXDSResizable` directly (#1877)
- **Resizable pill placement offset** — Auto-collapse flipping (#1876)
- **Theme `--color-track` token** — Spinner consumes it for fully tokenized track (#2170)
- **Server-safe utility subpath exports** — `@xds/core/server` for RSC (#1981)
- **XDSLinkProvider adoption** — All link-rendering components now use the provider (#1906)

#### Fixes

- **Chat composer paste** — Fix silently dropped paste when no forwarded ref (#2179)
- **Citation** — Prevent rest spread from overriding accessibility props; extend XDSBaseProps (#2217, #2092)
- **Field** — Neutral gray hover shadow, focus border on input, horizontal-labels grid, z-index containment, click-to-focus on wrapper (#2157, #2059, #1890, #1839)
- **FormLayout** — Equal-width horizontal children via CSS Grid (#2058)
- **Link `label`** — Make optional; aria-label harms AT on text links (#2031)
- **TopNav** — Stop click propagation on heading links, remove hover delay, add selected state to xdsClassName (#2135, #2133, #1997)
- **Spinner** — Simplify color resolution with useXDSTheme (#2124)
- **Markdown tables** — Reset container padding, alignment and width fixes (#2121, #2109)
- **Calendar** — Add isolation to day cell container (#2001)
- **CommandPalette/MultiSelector** — Prevent iOS zoom on input focus (#1993)
- **Dialog** — Target-based backdrop detection for native popup compat (#1892)
- **Typeahead** — Propagate generic type; prevent empty popover after selection (#2014, #1943)
- **Selector/MultiSelector** — Resolve nested button HTML violation (#1853)
- **ClickableCard** — Merge caller xstyle with internal interactive styles (#1893)
- **RadioList** — Extend XDSBaseProps for standard prop inheritance; fix typography tokens (#2093, #1902)
- **Tokenizer** — Add status to xdsClassName for theme targeting (#1995)
- **List** — Wrap header + list in column container for flex parents (#2017)
- **Section** — Propagate explicit padding to nested sections (#1972)
- **AppShell** — Match flex layout properties on sticky sidenav container (#1850)
- **Menu hover** — Gate behind `(hover: hover)` media query (#2046)
- **ResizeObserver** — Migrate all usage to shared singleton for performance (#1990)
- **Layout** — Container-driven edge compensation via :has() (#1987)
- **Missing `xdsClassName` hooks** — Added to components using border tokens (#2244)
- **ProgressBar** — Add xdsClassName to track for theme targeting (#2079)
- **z-index isolation** — Add isolation to components with leaky z-index (#2004)
- **`use client` directives** — Added to CommandPalette barrel, CodeBlock, ClickableCard, and others (#2069, #2048, #1833)
- **Thumbnail** — Focus ring clipped by overflow hidden (#2264)
- **DropdownMenu** — Light-dismiss + click-toggle race on touch browsers (#2186)
- **Theme** — Baseline media theme color-scheme flip, standalone theme text styling fixes (#1921, #1831)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @czarandy
- @ernestt
- @josephfarina
- @kentonquatman
- @lexs
- @marie-lucas
- @nynexman4464
- @rubyycheung
- @rumble
- @saivazian
- @tedmcdo
- @thedjpetersen
- @zurfyx
- @imdreamrunner

---

# 0.0.13

#### Breaking Changes

- **Toolbar `density` → `size`** — `XDSToolbar` replaces the `density` prop with `size`, adds `XDSSizeContext` cascade for child components. (#1448)
- **Icon renames: `checkCircle`/`xCircle` → `success`/`error`** — Default icon registry renames for semantic clarity. (#1503)
- **`XDSChatComposerAttachments` → `XDSChatComposerDrawer`** — Renamed for clarity. (#1714)
- **Remove deprecated `XDSSelectorItem`** — Internalized `XDSSelectorOption`; use `XDSSelector` directly. (#1582)
- **Tighten `XDSBaseProps`** — Omits `title` and obscure HTML attributes; adds `data-*` index signature. (#1505, #1502)

#### New Features

- **XDSClickableCard & XDSSelectableCard** with `useClickableContainer` hook (#1707)
- **useResizable hook + XDSResizeHandle** — Drag-to-resize for panels and sidebars (#1754)
- **AlertDialog** — Dedicated confirmation dialog component (#1370)
- **`isInline` prop** on Dialog, AlertDialog, and CommandPalette for embedded usage (#1676)
- **Card `transparent` variant** (#1655)
- **`defaultOpen` prop** on XDSTooltip and XDSHoverCard (#1672)
- **Stack `width`, `height`, `align`, `justify` props** — Convenience aliases on HStack, VStack, Stack (#1778, #1703)
- **Text `type` defaults to `'body'`** — No longer required (#1702)
- **Carousel** — Always show nav buttons when content is scrollable (#1772)
- **AppShell `defaultIsMobile`** for SSR-safe mobile nav detection (#1755)
- **SideNav/TopNav hover-to-open menus** via `useXDSMenuHover` (#1419)
- **DropdownMenu compound-component mode** (#1372)
- **MobileNav auto-detect drawer side** from trigger position (#1395)
- **Dialog `padding` prop** (#1169)
- **Grid unified responsive columns** API (#1422)
- **Selector/Typeahead/Tokenizer** size cascade to dropdown list items (#1442)
- **Icon slots standardized to `ReactNode`** across all components (#1746)
- **Tailwind v4 theme bridge** (#1649)
- **Theme `expandColorScale`** — Derive full color token ramp from a single accent hex (#1452)
- **Theme derived var expansion** — CSS properties to internal vars (#1467)
- **Table column alignment and row vertical alignment** (#1362)
- **TabList visual polish** — ghost hover, primary colors, divider overlap; remove density prop (#1357, #1418)
- **TreeList visual polish** (#1367)
- **SideNav/TopNav heading icon toggle** (#1371)
- **CodeBlock highlight ranges** — range-based highlighting support (#1470)
- **Page and block template system** with 100+ component showcase blocks (#1393)

#### Fixes

- Truncation: use Range API for multi-line detection (#1816)
- PowerSearch: add `xdsClassName` for theme targeting (#1813)
- ToggleButton: fix theming + Chat barrel export (#1812)
- Component audit: AppShell BaseProps, AspectRatio RTL, Badge header (#1748)
- Component audit: data-autofocus on BaseTypeahead, displayName on TreeListBranches (#1692)
- Component audit: SegmentedControl, Slider extend XDSBaseProps (#1519)
- Component audit: PowerSearch token, RadioList exports (#1359)
- Hardening audit: AlertDialog BaseProps, CheckboxList className, Table xdsClassName, use-client directives (#1518)
- Remove internal-only exports from public API (#1603)
- Add XDS prefix to StackAlignment type, fix StatusDot header (#1561)
- SSR: replace `useLayoutEffect` with SSR-safe alternatives (#1721)
- Focus: use `:focus-visible` instead of `:focus-within` for outlines (#1511)
- Focus: remove `outline` from transition to prevent black flash (#1731)
- iOS Safari: prevent auto-zoom on input focus (#1468)
- Dialog/MobileNav: replace `:where([open])` with prop-driven open styles (#1652)
- className/style clobber by `stylex.props` spread + lint rule (#1462)
- Collapsible: remove trigger padding, add capsize to label (#1770)
- Breadcrumbs: onClick-only items match link color (#1773)
- Grid: cap column count via track-max (#1761)
- Tokens: update palette border colors from DSP color ramp (#1760)
- Slider: keep tooltip visible during thumb drag (#1751)
- AppShell: targeting class names on sticky wrappers (#1764), detect empty slots via presence registration (#1377)
- Icon: use secondary color for input startIcon slots (#1765), default to `inherit` (#1588)
- SideNav: section custom styles, item collapsible+action split (#1666), design tokens for drag handle transition (#1381)
- Table: container padding to directional vars (#1621)
- Toast viewport: reset UA popover background (#1644)
- Selector: forward extra HTML attributes from XDSBaseProps (#1444)
- TextArea/TimeInput: a11y and input consistency fixes (#1443)
- Token: add `'use client'` directive, TopNav context naming conventions (#1465)
- Chat: anchor trigger menu to cursor position (#1354)
- Banner, Breadcrumbs, Spinner, StatusDot, TabList, Text, TextArea, TimeInput: extend XDSBaseProps (#1780, #1640, #1405)
- CodeBlock: Safari span fallback, per-line token perf (#1487, #1369)
- TextInput/TextArea: default value to empty string (#1439)
- MobileNav: close drawer on nav item activation (#1438)
- Divider: remove opaque background from label (#1426)
- Field: move description into XDSFieldLabel (#1458)
- Theme: sync `data-xds-theme` to `<html>` for root provider (#1587)
- Edge compensation model redesigned for toolbars (#1539)

#### Performance

- CodeBlock: content-visibility chunking for range mode, eliminate stylesheet mutations (#1457)

#### Upgrade

Codemods are available for all breaking changes in this release:

```sh
npx astryx upgrade --apply --to 0.0.13
```

Preview changes first (dry run): `npx astryx upgrade --to 0.0.13`
Run a specific codemod: `npx astryx upgrade --apply --codemod toolbar-density-to-size`
List all available codemods: `npx astryx upgrade --list`

---

# 0.0.12

#### Breaking Changes

- **Button `isIconOnly` required for icon-only mode** — `XDSButton` and `XDSToggleButton` now require explicit `isIconOnly` for icon-only rendering. (#1257)

#### New Features

- **XDSThumbnail** component (#1255)
- **XDSChatLayout** with fixed composer dock and container queries (#1249)
- **XDSToast** notification system (#1194)
- **Chat reasoning components** — Reasoning, ToolCall, ToolCallGroup (#1192)
- **useXDSImperativeDialog** — show/hide without state management (#1239)
- **Theme syntax system** with 11 community presets + `defineTheme({ syntax })` (#1217, #1219)
- **XDSMediaTheme** for inverted surface theming (#1211)
- **Card background color variants** (#1213)
- **Daily theme** with Figtree font, Lucide icons (#1201)
- **SideNav/TopNav menu popover and heading variants** (#1272)
- **TextInput `onEnter` prop** for consistency with NumberInput (#1223)
- **Button `isPressed` prop** for toggle state (#1202)
- **CLI programmatic API** — `@xds/cli/api` (#1208)
- **ChatComposer `headerActions` + `headerContext`** replacing `contextToolbar` (#1242)
- **Chat trigger menu system** for ComposerInput (#1193)

#### Fixes

- Dialog: reset inherited edge signals, prevent ghost button margin shift (#1237)
- CodeBlock: syntax highlighting missing on scroll + perf improvements (#1221)
- Chat: harden bubbles, scroll button, drawer animation, status (#1245)
- Chat: use `color-neutral` for message bubble background (#1271)
- SegmentedControl: consistent border-radius for sm size (#1206)
- Omit `children` from XDSBaseProps — require explicit opt-in (#1246)
- Theme: ship built theme modules to prevent double CSS injection (#1247)
- Theme: support bare state keys in `parseStyleKey` (#1233)
- ProgressBar/Section: migrate to XDSBaseProps, fix RadioList double-apply (#1253)
- CodeBlock: use semantic `--text-code-size` token for md size (#1273)
- Input: forward native event handlers via `...rest` spread (#1259, #1291)

#### Upgrade

Codemods are available for all breaking changes in this release:

```sh
npx astryx upgrade --apply --to 0.0.12
```

Preview changes first (dry run): `npx astryx upgrade --to 0.0.12`
Run a specific codemod: `npx astryx upgrade --apply --codemod add-is-icon-only`
List all available codemods: `npx astryx upgrade --list`

---

# 0.0.11

#### Patch Changes

- Version bump and publish infrastructure fixes
- No breaking changes

---

# 0.0.10

#### Breaking Changes

- **StatusDot and ProgressBar single size** — Both components now have a single fixed size (8px). The `size` prop has been removed. (#966)

#### New Features

- **Layout `defaultHasDividers`** — Container-controlled dividers via context (#969)
- **Button `href` support** — Link-styled buttons (#935)

#### Fixes

- Dialog: propagate `maxHeight` to layout via `--container-max-height` (#965)
- Popover: embed surface styles in `useXDSPopover` hook (#964)
- Dialog: lock body scroll on iOS Safari (#948)
- Dialog: scrollable content, mobile visibility, container styles (#942)
- Menu components: icon sizing, item density, section headings (#946)
- Avatar status dot sizes + icon non-semantic colors (#944)
- Table: truncate overflowing cell text with ellipsis (#933)
- AppShell: default variant to "elevated" (#934)
- DialogHeader: re-add capsize with visual adjustment (#956)
- Hardening sweep (#968)

#### Upgrade

Codemods are available for all breaking changes in this release:

```sh
npx astryx upgrade --apply --to 0.0.10
```

Preview changes first (dry run): `npx astryx upgrade --to 0.0.10`
Run a specific codemod: `npx astryx upgrade --apply --codemod remove-size-props`
List all available codemods: `npx astryx upgrade --list`

---

# 0.0.8

#### Breaking Changes

- **Button `endSlot` → `endContent`** — Renamed on XDSButton and forwarded object literals (e.g. XDSDropdownMenu button prop). (#895)
- **Token renames** — Intermediate token names from v0.0.6 renamed to final v0.0.8 convention per the token spec.

#### Fixes

- Align cyan, pink, and yellow token colors with WWW (#907)
- Dialog hardening (#775)
- ListItem: support ReactNode for description, fix whiteSpace nowrap breaking line-clamp (#896)
- Table: default minWidth for proportional columns (#891)
- Button: prevent text wrap, add ellipsis truncation (#892)
- ListItem: fixed inline padding (#887)
- Slider hardening — style clobber, a11y, pointer handling (#882)
- TextArea hardening — counter a11y, soft maxLength, disabled states (#849)
- Field hardening — a11y, auto-IDs, disabled styles (#848)
- Calendar hardening — a11y, keyboard nav, date constraints (#837)
- CheckboxInput, Button, Switch hardening (#765, #768, #769)
- DateInput, FormLayout hardening (#771, #772)
- CSS layer ordering for dist path theming (#806)
- Rename `@layer xds-reset` to `@layer reset` (#833)
- Tokenizer truncation behavior (#880)
- Correct neutral gray token semantics across components (#852)
- Formalize container padding tokens, prevent internal var access (#847)

#### Upgrade

Codemods are available for all breaking changes in this release:

```sh
npx astryx upgrade --apply --to 0.0.8
```

Preview changes first (dry run): `npx astryx upgrade --to 0.0.8`
Run a specific codemod: `npx astryx upgrade --apply --codemod rename-endslot-to-endcontent`
List all available codemods: `npx astryx upgrade --list`

---

# 0.0.7

#### Breaking Changes

- **Banner `variant` → `container`** — Renamed the `variant` prop on XDSBanner to `container`. Type references `XDSBannerVariant` → `XDSBannerContainer` and `XDSBannerVariantMap` → `XDSBannerContainerMap`. (#814)

#### Upgrade

Codemods are available for all breaking changes in this release:

```sh
npx astryx upgrade --apply --to 0.0.7
```

Preview changes first (dry run): `npx astryx upgrade --to 0.0.7`
Run a specific codemod: `npx astryx upgrade --apply --codemod rename-banner-variant-to-container`
List all available codemods: `npx astryx upgrade --list`

---

# 0.0.6

#### Breaking Changes

- **Token renames** — Design tokens renamed per naming audit: `positive` → `success`, `negative` → `error`, `divider` → `border`, etc. (`migrate-token-names`)
- **Shadow tokens** — Elevation tokens renamed to `shadow-base`/`shadow-menu`/`shadow-hover`/`shadow-dialog` + `insetshadow-border-*` (`migrate-shadow-tokens`)
- **`XDSCollapse` → `XDSCollapsible`** — Component and prop rename (`migrate-collapse-to-collapsible`)
- **Radius tokens** — Semantic radius tokens renamed to numeric scale (`migrate-radius-tokens`, `migrate-skeleton-radius`)
- **Badge `children` → `label`** — Content passed as children now uses the `label` prop (`migrate-badge-children-to-label`)

#### New Features

- **Dynamic theming primitives:** `radiusScale`, `motionScale`, `typeScale` in `defineTheme`
- **Motion tokens:** duration, easing, and component migration to token-based transitions
- **Ratio-based type scale** with `typeScale` in `defineTheme` and 4px grid snapping
- **Mobile-responsive AppShell:** responsive mobile nav API, `autoMobileTopBar`, entry animations
- **TopNav mobile rendering:** responsive menu, MegaMenu composed children API + mobile drawer
- **SideNav:** collapsible sidebar (`isCollapsible` prop), resizable sidebar with drag handle
- **PowerSearch:** filter implementation with nested filters
- **TreeList** component
- **NavItem** component
- Shared theme CSS generation, removed XDSFontWrapper

#### Fixes

- Badge: hardcoded height → spacing token; add `label` prop for API consistency (#709)
- CheckboxInput & Switch: focus rings + indeterminate aria (#723)
- Kbd: platform detection for mod key (#722)
- MegaMenu: uniform border radius, TopNav menu positioning/keyboard/focus trapping
- Popover: background transparency, DropdownMenu elevation tokens
- Collapsible: hardcoded fontSize/transition → tokens
- AppShell: hardcoded spacing → spacing tokens
- Dist CSS layer renamed from `@layer xds` to `@layer xds.core.base`
- `color-scheme` in reset.css for lightningcss light-dark() compatibility
- Sync package.json exports (NavItem, remove stale typography.css)
- Type-scale: use Math.round for 4px grid snapping in computeLeading

#### Upgrade

Codemods are available for all breaking changes in this release:

```sh
npx astryx upgrade --apply --to 0.0.6
```

Preview changes first (dry run): `npx astryx upgrade --to 0.0.6`
List all available codemods: `npx astryx upgrade --list`

---

# 0.0.5

> **Note:** v0.0.5 was the published version. Codemods for this release are registered under v0.0.6 in the CLI. Use `--to 0.0.6` to run them.

See 0.0.6 above for breaking changes and upgrade instructions.

---

# 0.0.4

#### New Components

- **XDSTreeList** — Hierarchical tree list component with expand/collapse (#609)
- **XDSPowerSearch** — Advanced search component with result count, filtering (#561, #593)

#### Features

- **AppShell variant system** — New `variant` prop (#597)
- **AppShell contentPadding** — New `contentPadding` prop (#612)
- **AppShell auto height mode** — Sidenav and sticky backgrounds (#615)
- **startIcon** support (#584)

#### Fixes

- Removed deprecated `isFullBleed` prop from Card and Section (#610, #598)
- Layout: `padding={0}` treated as equivalent to `isFullBleed` (#595)
- SideNav: consistent spacing (#601)
- Nav: consistent gap and heading text sizes (#616)

#### Refactors

- Popover, HoverCard, Tooltip moved to top-level directories (#557)

---

# 0.0.3

#### Patch Changes

- Bundle StyleX runtime — consumers no longer need @stylexjs/stylex as peer dependency (#545)
- Add stable token export path at @xds/core/tokens (#544)
- Replace null style overrides with explicit values, add lint rule (#547)
- Fix theme packages to produce proper JS/TS module output via tsup (#541)
- Sync package.json exports map
- Add verify-exports CI check (#537)

---

# 0.0.2

#### Breaking Changes

- CSS-based theming replaces StyleX theme system — `defineTheme()` API
- `className` and `style` props on all components
- Numeric spacing scale for `padding` and `gap`
- RSC-compatible icon registry (`registerIcons`/`getIcon`)
- React 19 ref prop migration
- Renames: TopNavTitle → TopNavHeading, SideNavHeader → SideNavHeading, useXDSIcon → getIcon
- `gap="space4"` → `gap={4}`, `isFullBleed` → `padding={0}`
- Badge dot → StatusDot

#### Upgrade

Codemods are available for all breaking changes in this release:

```sh
npx astryx upgrade --apply --to 0.0.2
```

Preview changes first (dry run): `npx astryx upgrade --to 0.0.2`
List all available codemods: `npx astryx upgrade --list`

12 codemods included:

- `rename-selector-items-to-options` — Selector `items` → `options`
- `unify-visibility-to-onOpenChange` — onHide/onClose/onShow/onToggle → `onOpenChange`
- `unify-uncontrolled-to-defaultX` — initialIsOpen/initialIsExpanded → defaultX
- `rename-banner-endButton-to-endContent` — Banner `endButton` → `endContent`
- `rename-form-tooltip-startIcon` — Form `tooltip` → `labelTooltip`, `startIcon` → `labelIcon`
- `rename-isShown-to-isOpen` — Dialog/Popover `isShown` → `isOpen`
- `rename-topnav-title-to-heading` — TopNav `title` → `heading`, TopNavTitle → TopNavHeading
- `rename-sidenav-header-to-heading` — SideNav header → heading, SideNavHeader → SideNavHeading
- `migrate-useXDSIcon-to-getIcon` — `useXDSIcon()` → `getIcon()`
- `migrate-gap-to-numeric` — `gap="space4"` → `gap={4}`
- `migrate-isFullBleed-to-padding` — `isFullBleed` → `padding={0}`
- `migrate-badge-dot-to-statusdot` — Badge `shape="dot"` → StatusDot

---

# 0.0.1

- Initial release
