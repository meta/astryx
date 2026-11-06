---
'@astryxdesign/cli': patch
---

[fix] `swizzle` copies a Core component's nested folders, so a component such as Table now brings its `plugins/` instead of a barrel that points at missing files. Imports inside the copied folder stay relative, and imports that leave it are rewritten to the owner package. Test-only `__tests__` and `__snapshots__` folders and browser test harnesses (`*.spec.ts`, `*.spec.tsx`) are left out at every depth. An integration component's folder is still copied flat. A destination that holds an entry of the wrong kind (a file where a folder must go, or the reverse) is refused before anything is written, even with `--overwrite`. Writing through a folder linked elsewhere inside the project works as before, and a link out of the project is still refused.

@jiunshinn
