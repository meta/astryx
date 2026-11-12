---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: the ninth pass of fixes.

- The undo history is never deleted by a recovering `new`, and a stopped `new`'s leftover marker is removed by the next change.
- A theme typed as a file name (`t.theme.ts`) is refused with a suggestion of the theme it names. An undo that is refused suggests undos.
- Undoing a radius token rebuilds the corners without it. Inner corners never get smaller going up the scale. A step never moves a part the other way, starts from an exact border-radius, and for a variant starts from the part's plain setting.
- A `--state` that a part never takes (disabled on a card, which is never marked disabled) is refused and says what to do.
- `undo` names the setting that applies after it. Refusals suggest the nearest value that works.
- A command that lost its theme lock publishes no build output. A change that changes nothing rebuilds a build left stale.

@josephfarina
