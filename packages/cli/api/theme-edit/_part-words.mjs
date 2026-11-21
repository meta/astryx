// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The plain words for parts that Core's catalog cannot give (groups,
 * variants, font roles, phrases of several words, and words two components
 * share), the part or group one plain word names, and the readers that
 * give a named part its own pieces (its header, its body, its edge).
 * @position api/theme-edit — a leaf with no imports, read by _how-question.mjs
 * and _check.mjs
 */

/**
 * Words for parts that have a header, footer or title bar of their own: a
 * header said after one is that part's, never the app's top bar.
 */
export const OWNER_WORDS =
  'dialog|modal|card|drawer|sheet|popover|panel|section|table|menu';
const NOT_AN_OWNERS = `(?<!\\b(?:${OWNER_WORDS})s? )`;

/**
 * Phrases for parts that Core's catalog cannot give: groups, variants,
 * font roles, phrases of several words, and words two components share.
 * They are read before the catalog's names and doc keywords
 * (partLexicon), longest phrase first.
 * @type {Array<[RegExp, {on: string, when?: string, role?: string, level?: string, missing?: string}]>}
 */
export const OVERRIDES = [
  // (Design systems' names for parts Core has under another name: an
  // underline nav is a row of tabs; a navigation rail is the side nav.)
  [/\bunderline[- ]?navs?\b/, {on: 'tab'}],
  [/\b(?:navigation|nav) rails?\b/, {on: 'side-nav'}],
  // (A page's title is its top heading, never the page.)
  [/\bpage (?:titles?|headings?|headers?)\b/, {on: 'heading', level: '1'}],
  [/\b(?:dividers?|separators?)\b/, {on: 'divider'}],
  // (An action, "a toast's action", is the button it holds: before
  // "button" or at the end of a phrase only. "Action items", "the actions
  // column" and "an actions menu" are other parts. A call to action is the
  // primary button, below.)
  [
    /(?<!\bcalls? to )\bactions?(?:\s+buttons?\b|(?=\s*(?:$|[,.;:!?)])))/,
    {on: 'button'},
  ],
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
  // A calendar's range band, and the band a hover would select.
  [
    /\b(?:calendar\s+)?range\s+preview(?:\s+bands?)?\b|\bpreview\s+bands?\b/,
    {on: 'calendar-range-preview'},
  ],
  [/\b(?:calendar\s+)?range\s+bands?\b/, {on: 'calendar-range'}],
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
    /\b(progress( bars?)?( fill| indicators?)?|loading bar)\b/,
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
  // (A top nav's or a navbar's links are its items, never the top nav and
  // every link.)
  [
    /\b((?:top )?(?:nav(igation)?(?: ?bar)?|navbar) (links?|items?))\b/,
    {on: 'top-nav-item'},
  ],
  // A context menu is its own part in Core (its items are the dropdown
  // menu's items, which it reuses).
  [/\b(context ?menus?|right[- ]click menus?)\b/, {on: 'context-menu'}],
  // (Menus said plainly are every menu, the menus group; a dropdown menu,
  // or one menu, is the dropdown menu.)
  [/\b(?<!dropdown )menus\b/, {on: 'menus'}],
  [/\b((dropdown )?menus?)\b/, {on: 'dropdown-menu'}],
  // A part's own header or footer ("dialog header", "card footer") is that
  // part's, never the app's top bar or footer.
  [new RegExp(`${NOT_AN_OWNERS}\\bfooters?\\b`), {on: 'layout-footer'}],
  [/\b(side ?nav|sidebar|side ?panel)\b/, {on: 'side-nav'}],
  [
    /\b(app (name|title)|logo|site title|product name)\b/,
    {on: 'top-nav-heading'},
  ],
  [
    new RegExp(
      `${NOT_AN_OWNERS}\\b(header|top ?bar|title ?bar|nav(?:igation)? ?bar|app ?bar|masthead)\\b`,
    ),
    {on: 'app-shell-header'},
  ],
  [/\b(page|app background|whole background|body background)\b/, {on: 'page'}],
  // A radio's dot is its own part (the mark a checked radio shows).
  [/\bradio( button)?s?'?\s+dots?\b/, {on: 'radio-indicator-dot'}],
  [/\b(radio( buttons?)?|radios)\b/, {on: 'radio-indicator'}],
  // (The accent buttons and the call to action are the primary button:
  // the one the accent fills.)
  [
    /\b(primary|main|accent) buttons?\b|\b(?:ctas?|calls? to action)(?: buttons?)?\b/,
    {on: 'button', when: 'variant:primary'},
  ],
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
  // (Kbd's key badges, each key's own box, by their own name.)
  [/\bkey badges?\b/, {on: 'kbd-key'}],
  [/\b(badges?|chips?|tags?|lozenges?)\b/, {on: 'badge'}],
  [/\bh([1-6])\b/, {on: 'heading'}],
  // (A large title, the biggest title a screen has, is its top heading.)
  [/\blarge titles?\b/, {on: 'heading', level: '1'}],
  // (A display heading is the heading's largest display look.)
  [
    /\bdisplay (?:headings?|titles?|text)\b/,
    {on: 'heading', when: 'type:display-1'},
  ],
  [/\b(headings?|titles?)\b/, {on: 'heading'}],
  [/\b(modals?|popups?)\b/, {on: 'dialog'}],
  [/\bcode\b/, {on: 'code', role: 'code'}],
  // Small, secondary and supporting text, captions and fine print: the
  // supporting text style, not the base size.
  [
    /\b((?:small|secondary|supporting|helper|hint|caption|muted) (?:text|copy)|fine print|captions?|footnotes?)\b/,
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

/**
 * A part's own pieces said in words ("dialog header", "drawer close icon",
 * "dialog title bar"), read from the catalog's part keys: that catalog
 * part, or the whole part said missing when Core draws no such piece
 * ("card header"). A header said after an owner word that names no catalog
 * part is that owner part's own header ("modal header" is the dialog
 * header), or the owner part said missing when it has none ("menu header").
 * @param {Set<string>} keys the catalog's part keys
 * @param {(source: string, need: string) => RegExp} [make] makes each
 * pattern from its source and the word every match of it holds
 * @returns {Array<[RegExp, {on: string, when?: string, role?: string, level?: string, missing?: string}]>}
 */
export function ownSubParts(keys, make = src => new RegExp(src)) {
  /** @type {Array<[RegExp, {on: string, when?: string, role?: string, level?: string, missing?: string}]>} */
  const subParts = [];
  for (const key of keys) {
    if (key.includes('-')) continue;
    // "dialog close icon / button", "drawer header title": those parts.
    for (const [phrase, part] of [
      ['close (?:icon|button|x)', `${key}-header-close-icon`],
      ['header title', `${key}-header-title-block`],
    ])
      if (keys.has(part))
        subParts.push([
          make(`\\b${key}s?(?:'s)?\\s+${phrase}s?\\b`, key),
          {on: part},
        ]);
    // "dialog title bar", "drawer header bar": the bar is its header; a
    // container Core draws with no header ("card title bar") is said
    // missing.
    if (keys.has(`${key}-header`) || OWNER_WORDS.split('|').includes(key))
      subParts.push([
        make(`\\b${key}s?(?:'s)?\\s+(?:title|header) ?bars?\\b`, key),
        keys.has(`${key}-header`)
          ? {on: `${key}-header`}
          : {on: key, missing: `${key} title bar`},
      ]);
    for (const sub of ['header', 'footer', 'title']) {
      const real =
        sub === 'title' && keys.has(`${key}-header-title-block`)
          ? `${key}-header-title-block`
          : keys.has(`${key}-${sub}`)
            ? `${key}-${sub}`
            : null;
      // A phrase an override reads whole ("table header") keeps it.
      const phrase = `${key} ${sub}`;
      if (OVERRIDES.some(([re]) => re.exec(phrase)?.[0] === phrase)) continue;
      subParts.push([
        // (A header or title bar has its own entry above; a footer bar is
        // the footer.)
        make(
          `\\b${key}s?[\\s-]${sub}s?\\b${sub === 'footer' ? '' : '(?! ?bars?\\b)'}`,
          key,
        ),
        real ? {on: real} : {on: key, missing: `${key} ${sub}`},
      ]);
    }
  }
  for (const w of OWNER_WORDS.split('|')) {
    const owner = keys.has(w)
      ? null
      : OVERRIDES.find(([re]) => re.test(w))?.[1].on;
    if (owner)
      for (const [el, piece] of [
        ['header', 'header'],
        ['footer', 'footer'],
        ['title bar', 'header'],
      ])
        subParts.push([
          make(`\\b${w}s?[\\s-]${el.replace(' ', ' ?')}s?\\b`, w),
          keys.has(`${owner}-${piece}`)
            ? {on: `${owner}-${piece}`}
            : {on: owner, missing: `${w} ${el}`},
        ]);
  }
  return subParts;
}

/**
 * A clause's text: no comma or sentence end (a decimal point is none, and
 * a comma inside parentheses, "rgba(0, 0, 0, 0.05)", is none).
 */
const CLAUSE_CHAR = String.raw`(?:\([^()]*\)|[^,;.(]|\.(?!\s|$))`;

/** The verbs that place a part: "sits", "spans", "is placed". */
const PLACES = String.raw`(?:sits?|spans?|runs?|lies|lie|stays?|is placed|are placed)`;

/**
 * The readers that give a named part its own pieces. A container named
 * (an owner word, or a one-word catalog part with a header or footer part
 * of its own, never the last word of a longer part's name), then "its header" (or footer, title bar) before a comma, a
 * sentence's end, another container or a joining word, is the container's
 * (`ownWord`), and "the dialog and its header" is the dialog's too; "the
 * header" said again in that sentence, each time, is the same one
 * (`ownAgain`, which gives the container and the piece); a piece placed
 * on a container's edge is the container's (`pieceAt`); a part's body with
 * no part of its own ("the dialog body", never "the dialog body text") is
 * the part (`bodyIs`).
 * @param {Set<string>} keys the catalog's part keys
 */
export function ownReaders(keys) {
  const owners = [
    ...new Set([
      ...OWNER_WORDS.split('|'),
      ...[...keys].filter(
        k =>
          !k.includes('-') &&
          ['header', 'footer'].some(p => keys.has(`${k}-${p}`)),
      ),
    ]),
  ];
  const o = owners.join('|');
  // ("context menu", "hover card", "side panel": a container word that ends
  // a longer part's name is no container here.)
  const longer = [
    ...new Set([
      'side',
      ...[...keys].flatMap(k => {
        const m = /^(.+)-([a-z]+)$/.exec(k);
        return m && owners.includes(m[2]) ? [m[1].replace(/-/g, '[ -]')] : [];
      }),
    ]),
  ].join('|');
  return {
    ownWord: new RegExp(
      `(?<=(?<!\\b(?:${longer})[\\s-])\\b(${o})s?\\b(?:(?!\\b(?:${o})s?\\b|\\b(?:and|but|then)\\b(?! its\\b))${CLAUSE_CHAR})*?)\\bits (header|footer|title ?bar)\\b`,
      'gi',
    ),
    ownAgain: new RegExp(
      `(?<=\\b(${o}) (header|footer|title ?bar)\\b(?:[^;.]|\\.(?!\\s|$))*?)\\bthe \\2\\b(?! of\\b)`,
      'gi',
    ),
    // ("the dialog body text", "… body copy", "… body type": its text,
    // read as before.)
    bodyIs: new RegExp(
      `\\b(${owners.filter(k => !keys.has(`${k}-body`)).join('|')})(?:'s)? body\\b(?!\\s+(?:text|copy|type|font|fonts|writing|words|letters|size)\\b)`,
      'gi',
    ),
    pieceAt: new RegExp(
      `(?<!\\b(?:${o})s?(?:'s)? )\\b(title ?bar|header|footer|close (?:button|icon))\\b(?=(?:(?!\\b(?:and|but|then)\\b)${CLAUSE_CHAR})*?\\b${PLACES}\\b${CLAUSE_CHAR}*?\\bedge of (?:the |its )?(${o})\\b)`,
      'gi',
    ),
  };
}

/**
 * What a sentence can draw along an edge: a border, line (never a line
 * height), stroke or shadow, and a stripe, band or accent bar (never a
 * title bar, tab bar or other part).
 */
const DRAWN =
  /\b(?:borders?|lines?(?![- ]?height)|rules?|strokes?|outlines?|shadows?|dividers?|stripes?|bands?|strips?|accent bars?)\b/;

/**
 * A place on a part's edge: "at the top edge of the dialog", "along the
 * bottom edge of its header", "of the top bar" (a part said in two words).
 */
export const EDGE_PLACE =
  /\s*\b(?:at|along|across) the (?:top|bottom|left|right) edge of (?:the |its )?[a-z][\w-]*(?: (?:bar|nav|block|palette|shell)\b)?(?:'s)?(?: (?:header|footer|title ?bar)\b)?/g;

/**
 * An edge place said after a verb that places a part its clause names
 * ("the dialog title bar spans the full width at the top edge of the
 * dialog") says where that part sits, so it is read as no ask, unless its
 * sentence draws something there ("a red border along the top edge of the
 * card", "an accent bar that runs along the left edge of the card"). Any other edge place gives the side and the part of the ask
 * ("a card with padding 24px along the left edge of the card"), so it
 * stays.
 * @param {string} m the edge place
 * @param {number} at where it starts
 * @param {string} all the whole question
 * @param {Array<[RegExp, unknown]>} parts the lexicon's part phrases
 */
export function edgePlace(m, at, all, parts) {
  const sentenceAt = Math.max(
    ...[...all.slice(0, at).matchAll(/[;.](?:\s|$)/g)].map(
      x => (x.index ?? 0) + 1,
    ),
    0,
  );
  const sentence = all.slice(sentenceAt).split(/[;.](?:\s|$)/)[0];
  const clause = all.slice(
    Math.max(
      sentenceAt,
      all
        .slice(0, at)
        .replace(/\([^()]*\)/g, m => ' '.repeat(m.length))
        .lastIndexOf(',') + 1,
    ),
    at,
  );
  const placed =
    new RegExp(String.raw`\b${PLACES}\b`).test(clause) &&
    parts.some(([re]) => new RegExp(re.source).test(clause));
  return placed && !DRAWN.test(sentence) ? '' : m;
}

/** "full width", "spans the whole width": the part fills what holds it. */
// ("80% of the full width", "half the full width": a share of the width
// reads as before.)
export const FULL_WIDTH =
  /(?<!\b(?:of|half|third|quarters?)\s+(?:the\s+)?)\b(full[- ]width|(?:full|whole|entire) width)\b/;

/**
 * A container named only to own its piece ("a drawer with its header
 * navy", read "drawer's drawer header navy") is no part of that ask: the
 * look is the piece's alone. A container said as well ("the dialog and its
 * header") stays.
 * @param {Array<{text: string, parts: Array<{on: string}>}>} clauses
 */
export function piecesNotOwners(clauses) {
  for (const c of clauses) {
    const owners = c.parts.filter(
      p =>
        !p.on.includes('-') && c.parts.some(q => q.on.startsWith(`${p.on}-`)),
    );
    for (const o of owners) {
      const said = c.text.replace(
        new RegExp(
          String.raw`\b${o.on}s?(?:'s)?\s+(?:${o.on}s?\s+)?(?:header|footer|title ?bar)s?\b`,
          'gi',
        ),
        ' ',
      );
      if (!new RegExp(String.raw`\b${o.on}s?\b`, 'i').test(said))
        c.parts = c.parts.filter(p => p !== o);
    }
  }
}
