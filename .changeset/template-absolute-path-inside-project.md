---
'@astryxdesign/cli': patch
---

[fix] `astryx template <name> <path>` and `astryx template --cdn <path>` accept an absolute path inside the project root, also through a symlinked project folder. It is written exactly as its relative path. An absolute path outside the project is still refused with `ERR_PATH_TRAVERSAL`. For `astryx template <name> <path>`, the receipt says the path was written as its relative path (`data.givenPath` in `--json`), and the refusal names a command that writes inside the project and the command that prints the source without writing anything. The named folder is one the project builds with: `app/<name>` in a Next app with an `app/` folder, `src/app/<name>` in one with `src/app/`, else `src/pages/<name>`; `src/components/<name>` for a block; and `<name>-2`, `<name>-3` and so on when that folder already exists. Next refuses to build a `src/pages/` folder beside a root `app/` folder. For `--cdn`, the receipt is unchanged, and the refusal names `astryx template --cdn cdn.template.html`.

@josephfarina
