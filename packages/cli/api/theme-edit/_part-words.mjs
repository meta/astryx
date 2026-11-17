// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The plain words for parts that Core's catalog cannot give (groups,
 * variants, font roles, phrases of several words, and words two components
 * share), and the part or group one plain word names.
 * @position api/theme-edit — a leaf with no imports, read by _how-question.mjs
 * and _check.mjs
 */

/**
 * Phrases for parts that Core's catalog cannot give: groups, variants,
 * font roles, phrases of several words, and words two components share.
 * They are read before the catalog's names and doc keywords
 * (partLexicon), longest phrase first.
 * @type {Array<[RegExp, {on: string, when?: string, role?: string, level?: string, missing?: string}]>}
 */
export const OVERRIDES = [
  // (A page's title is its top heading, never the page.)
  [/\bpage (?:titles?|headings?|headers?)\b/, {on: 'heading', level: '1'}],
  [/\b(?:dividers?|separators?)\b/, {on: 'divider'}],
  // (The page's main panel, the area its content sits in.)
  [
    /\b(?:main\s+)?content\s+(?:area|panel|region|pane)s?\b|\bmain\s+(?:area|panel|pane)s?\b/,
    {on: 'layout-content'},
  ],
  [
    /\baccordions? (headers?|triggers?|titles?|headings?)\b/,
    {on: 'collapsible-trigger'},
  ],
  [/\baccordions?\b/, {on: 'collapsible'}],
  [/\bcombo ?box(es)?\b/, {on: 'complex-selector'}],
  // (Other design systems' names for the same parts: a snackbar is a
  // toast, a lozenge a badge, the form controls the inputs.)
  [/\b(?:notifications?|snack ?bars?)\b/, {on: 'toast'}],
  [/\b(focus (ring|outline)s?)\b/, {on: 'focus-ring'}],
  [/\b((modal |dialog )?(overlay|scrim|backdrop))\b/, {on: 'overlay'}],
  [/\bicons?\b/, {on: 'icons'}],
  [
    // (The header row is the header cells: "table header row gray" is
    // never every row.)
    /\b(table header rows?|header rows?|table headers?|column headers?|table headings?)\b/,
    {on: 'table-header-cell'},
  ],
  [
    /\b(tabs? (underline|indicator)s?|underline (of|on|under) (the )?tabs?)\b/,
    {on: 'tab-indicator'},
  ],
  [/\b(status dots?)\b/, {on: 'status-dot'}],
  // (Its indicator too: "the progress indicator".)
  [
    /\b(progress( bar)?( fill| indicators?)?|loading bar)\b/,
    {on: 'progress-bar-fill'},
  ],
  [
    /\b((side ?nav|sidebar)( nav(igation)?)? (links?|items?))\b/,
    {on: 'side-nav-item'},
  ],
  [
    /\b((dropdown |context )?menu (items?|options?|entries)|dropdown items?)\b/,
    {on: 'dropdown-menu-item'},
  ],
  [/\b(nav(igation)? (links?|items?))\b/, {on: 'top-nav-item'}],
  // A context menu is its own part in Core (its items are the dropdown
  // menu's items, which it reuses).
  [/\b(context ?menus?|right[- ]click menus?)\b/, {on: 'context-menu'}],
  // (Menus said plainly are every menu, the menus group; a dropdown menu,
  // or one menu, is the dropdown menu.)
  [/\b(?<!dropdown )menus\b/, {on: 'menus'}],
  [/\b((dropdown )?menus?)\b/, {on: 'dropdown-menu'}],
  // A part's own header or footer ("dialog header", "card footer") is that
  // part's, never the app's top bar or footer.
  [
    /(?<!\b(?:dialog|modal|card|drawer|sheet|popover|panel|section|table|menu)s? )\bfooters?\b/,
    {on: 'layout-footer'},
  ],
  [/\b(side ?nav|sidebar|side ?panel)\b/, {on: 'side-nav'}],
  [
    /\b(app (name|title)|logo|site title|product name)\b/,
    {on: 'top-nav-heading'},
  ],
  [
    /(?<!\b(?:dialog|modal|card|drawer|sheet|popover|panel|section|table|menu)s? )\b(header|top ?bar|title ?bar|nav(?:igation)? ?bar|app ?bar|masthead)\b/,
    {on: 'app-shell-header'},
  ],
  [/\b(page|app background|whole background|body background)\b/, {on: 'page'}],
  // A radio's dot is its own part (the mark a checked radio shows).
  [/\bradio( button)?s?'?\s+dots?\b/, {on: 'radio-indicator-dot'}],
  [/\b(radio( buttons?)?|radios)\b/, {on: 'radio-indicator'}],
  [/\b(primary|main) buttons?\b/, {on: 'button', when: 'variant:primary'}],
  [/\bsecondary buttons?\b/, {on: 'button', when: 'variant:secondary'}],
  [/\bghost buttons?\b/, {on: 'button', when: 'variant:ghost'}],
  [
    /\b(danger|destructive|delete) (buttons?|ones?|variant)\b/,
    {on: 'button', when: 'variant:destructive'},
  ],
  // (Never the operating system, "Windows 11 accent …": a window named
  // with a version is a product.)
  [
    /\b(panels?|windows?(?!\s+(?:\d|xp\b|vista\b))|boxes|tiles?|containers?)\b/,
    {on: 'containers'},
  ],
  [/\b(banners?|alerts?|notices?|announcements?)\b/, {on: 'banner'}],
  // A sheet is Core's bottom sheet (never a style sheet).
  [/(?<!\bstyle[\s-]?)\b(?:bottom[\s-]?)?sheets?\b/, {on: 'bottom-sheet'}],
  [/\b(text ?areas?|multi-?line (inputs?|fields?))\b/, {on: 'text-area'}],
  [
    /\b(select (dropdowns?|menus?|box(es)?|inputs?)|selects|dropdowns?|pickers?|select(?! (the|a|an|all|any|one|which|what|it|them)\b))\b/,
    {on: 'selector'},
  ],
  [/\b(skeletons?( loaders?)?|loading placeholders?)\b/, {on: 'skeleton'}],
  [
    /\b(inputs?|text ?box(es)?|text ?fields?|form (fields?|controls?|elements?)|fields?)\b/,
    {on: 'inputs'},
  ],
  // A checkbox is the box itself; the checks group (checkbox and radio)
  // goes by its own name.
  // A check mark is the mark drawn inside the box, never the box.
  [
    /\b(?:checkbox(?:es)?\s+)?(?:check ?marks?|ticks?)\b/,
    {on: 'checkbox-indicator-check'},
  ],
  [/\b(checkbox(es)?)\b/, {on: 'checkbox-indicator'}],
  // "indicators" alone: the check and radio indicators (the checks group).
  [/\b(?:check(?:box)?\s+and\s+radio\s+)?indicators?\b/, {on: 'checks'}],
  // A switch's or toggle's thumb, knob or handle: the thumb, never the
  // track.
  [
    /\b(?:toggle|switch)(?:e?s)?(?:'s)?\s+(?:thumbs?|knobs?|handles?)\b/,
    {on: 'switch-thumb'},
  ],
  // The buttons or items of a toggle group (its own possessive or not):
  // Core's toggle buttons, never a switch's.
  [
    /\btoggle[- ]?(?:button[- ]?)?groups?(?:'s|s'|’s)?\s+(?:buttons?|items?|options?)\b/,
    {on: 'toggle-button'},
  ],
  // A toggle group: the group of toggle buttons, never a switch.
  [/\btoggle[- ]?(?:button[- ]?)?groups?\b/, {on: 'toggle-button-group'}],
  // A toggle button: Core's toggle button, never a switch.
  [/\btoggle[- ]?buttons?\b/, {on: 'toggle-button'}],
  // "switch off", "switch the buttons to" are the verb, not the part; the
  // switch's "on color" or "on state" (its checked look) is the part.
  [
    /\b(toggles?|switch(?:e?s)?(?! (?:off|on(?![- ](?:colou?r|state|look)\b)|to|the|out|it|them|over|back|from)\b))\b/,
    {on: 'switch'},
  ],
  [/\b((table )?cells?)\b/, {on: 'table-cell'}],
  [/\b(table rows?|rows?|tables?)\b/, {on: 'table-row'}],
  // (A keyboard key, "the key chips", is Core's Kbd, never a badge.)
  [
    /\b(kbds?|keyboard (keys?|shortcuts?|chips?)|key ?(chips?|caps?)|shortcut keys?)\b/,
    {on: 'kbd'},
  ],
  [/\b(badges?|chips?|tags?|lozenges?)\b/, {on: 'badge'}],
  // (An action, "a toast's action", is the button it holds.)
  [/\bactions?(?: buttons?)?\b(?!\s+(?:bar|sheet|menu|list))/, {on: 'button'}],
  [/\bh([1-6])\b/, {on: 'heading'}],
  [/\b(headings?|titles?)\b/, {on: 'heading'}],
  [/\b(modals?|popups?)\b/, {on: 'dialog'}],
  [/\bcode\b/, {on: 'code', role: 'code'}],
  // Small, secondary and supporting text, captions and fine print: the
  // supporting text style, not the base size.
  [
    /\b((?:small|secondary|supporting|helper|hint|caption|muted) (?:text|copy)|fine print|captions?)\b/,
    {on: 'body', role: 'supporting'},
  ],
  [/\bbody( text)?\b/, {on: 'body', role: 'body'}],
];

/**
 * The part or group a plain word names, as how reads it (`checkboxes` is
 * the checks group, `panels` the containers), or null.
 * @param {string} word
 * @returns {string | null}
 */
export function partForWord(word) {
  const w = String(word ?? '')
    .trim()
    .toLowerCase();
  if (!w) return null;
  for (const [re, hit] of OVERRIDES)
    if (/** @type {RegExp} */ (re).test(w))
      return /** @type {{on: string}} */ (hit).on;
  return null;
}

/** @type {Map<string, string> | null} */
let words = null;

/**
 * The single words the table reads as a part or group, each with what it
 * names (`sidebar` side-nav, `checkbox` checks, `toggle` switch): the words
 * a part's typo is read against beside the part names. Taken from the
 * table's own words, a plural's singular (`toggles?`) included.
 * @returns {Map<string, string>}
 */
export function partWords() {
  if (words) return words;
  words = new Map();
  for (const [re] of OVERRIDES)
    for (const m of re.source.matchAll(/[a-z]{3,}(\?)?/g)) {
      const w = m[0].replace(/\?$/, '');
      for (const each of m[1] ? [w, w.slice(0, -1)] : [w]) {
        const on = partForWord(each);
        if (on && !words.has(each)) words.set(each, on);
      }
    }
  return words;
}
