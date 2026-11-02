---
'@astryxdesign/core': patch
---

[fix] `Avatar`: initials at a named `size` (`xsm`/`sm`/`md`/`lg`/`xl`) now render at a real type-scale step instead of an off-scale value from the `size × 0.4` ratio. The ratio landed between steps at most tiers, and at `xsm` it gave 8px (`--font-size-2xs`), smaller than any text role uses.

Initials size by tier, old to new (default text size):

| `size` | Box   | Old    | New  | Token                   |
| ------ | ----- | ------ | ---- | ----------------------- |
| `xsm`  | 20px  | 8px    | 10px | `--text-heading-6-size` |
| `sm`   | 24px  | 9.6px  | 10px | `--text-heading-6-size` |
| `md`   | 36px  | 14.4px | 14px | `--text-body-size`      |
| `lg`   | 48px  | 19.2px | 20px | `--text-heading-2-size` |
| `xl`   | 128px | 51.2px | 42px | `--text-display-1-size` |

`xl` gets smaller because 42px is the scale's largest step. Each size is also capped at half its box (10/12/18/24/64px), so a larger root text size cannot grow two-letter initials past the circle; at the default size no tier reaches its cap.

To keep the old look, give the size an `avatar-fallback` theme rule with the `font-size` you want, or pass a numeric `size` (a numeric `size` that is not one of the named boxes keeps the `size × 0.4` ratio, since there is no step to snap an arbitrary pixel value to).

@HelloOjasMutreja
