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
  [/\bdividers?\b/, {on: 'divider'}],
  [
    /\baccordions? (headers?|triggers?|titles?|headings?)\b/,
    {on: 'collapsible-trigger'},
  ],
  [/\baccordions?\b/, {on: 'collapsible'}],
  [/\bcombo ?box(es)?\b/, {on: 'complex-selector'}],
  [/\bnotifications?\b/, {on: 'toast'}],
  [/\b(focus (ring|outline)s?)\b/, {on: 'focus-ring'}],
  [/\b((modal |dialog )?(overlay|scrim|backdrop))\b/, {on: 'overlay'}],
  [/\bicons?\b/, {on: 'icons'}],
  [
    /\b(table header|column headers?|table headings?)\b/,
    {on: 'table-header-cell'},
  ],
  [
    /\b(tabs? (underline|indicator)s?|underline (of|on|under) (the )?tabs?)\b/,
    {on: 'tab-indicator'},
  ],
  [/\b(status dots?)\b/, {on: 'status-dot'}],
  [/\b(progress( bar)?( fill)?|loading bar)\b/, {on: 'progress-bar-fill'}],
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
    /(?<!\b(?:dialog|modal|card|drawer|sheet|popover|panel|section|table|menu)s? )\b(header|top ?bar|title ?bar|nav ?bar|app ?bar|masthead)\b/,
    {on: 'app-shell-header'},
  ],
  [/\b(page|app background|whole background|body background)\b/, {on: 'page'}],
  [/\b(radio( buttons?)?|radios)\b/, {on: 'radio-indicator'}],
  [/\b(primary|main) buttons?\b/, {on: 'button', when: 'variant:primary'}],
  [/\bsecondary buttons?\b/, {on: 'button', when: 'variant:secondary'}],
  [/\bghost buttons?\b/, {on: 'button', when: 'variant:ghost'}],
  [
    /\b(danger|destructive|delete) (buttons?|ones?|variant)\b/,
    {on: 'button', when: 'variant:destructive'},
  ],
  [/\b(panels?|windows?|boxes|tiles?|containers?)\b/, {on: 'containers'}],
  [/\b(banners?|alerts?|notices?|announcements?)\b/, {on: 'banner'}],
  [/\b(text ?areas?|multi-?line (inputs?|fields?))\b/, {on: 'text-area'}],
  [
    /\b(select (dropdowns?|menus?|box(es)?|inputs?)|selects|dropdowns?|pickers?|select(?! (the|a|an|all|any|one|which|what|it|them)\b))\b/,
    {on: 'selector'},
  ],
  [/\b(skeletons?( loaders?)?|loading placeholders?)\b/, {on: 'skeleton'}],
  [
    /\b(inputs?|text ?box(es)?|text ?fields?|form fields?|fields?)\b/,
    {on: 'inputs'},
  ],
  [/\b(checkbox(es)?|check ?marks?)\b/, {on: 'checks'}],
  // "switch off", "switch the buttons to" are the verb, not the part.
  [
    /\b(toggles?|switch(?:e?s)?(?! (off|on|to|the|out|it|them|over|back|from)\b))\b/,
    {on: 'switch'},
  ],
  [/\b((table )?cells?)\b/, {on: 'table-cell'}],
  [/\b(table rows?|rows?|tables?)\b/, {on: 'table-row'}],
  [/\b(badges?|chips?|tags?)\b/, {on: 'badge'}],
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
