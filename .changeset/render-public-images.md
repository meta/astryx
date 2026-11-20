---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export`: more images named by a path from the site's root (`/pics/shoe.png`) show in the file and come back with `--reverse`.

- When the project has no `public/` folder, export reads such a path from the nearest `public/` above the page, inside the project. This covers a site folder below a shared package.json. Outside a project, it reads it from the nearest `public/` above the page, inside the folder you run the command from.
- The file now carries each such image with the page's other files, so `--reverse` puts it back in the `public/` folder export read, at the same path.
- An image the page names this way but draws only later (after a click, in the next view) is carried too, and the file's script shows it from the carried data.
- Export reads such a path only from `public/`. A file of that name at the project's or the page's root is no longer read, and a path that leaves `public/` (`/../x.png`) is not read. A path to a file that is not in `public/` gets the missing-image warning, which now names the `public/` folder export searched.
- The experimental theme editor's image notes read a theme's `url(/…)` file the same way: a file at the project's root, not in `public/`, is now reported as missing.

@josephfarina
