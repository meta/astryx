# Next release codemods

Put new core codemods here while normal feature PRs are in flight.

The folder that ships a codemod is the target package version containing the
change. Feature PRs do not choose that version: main's fixed-group declaration is
the owner plan, and the marked release branch freezes it at cut. Contributors stage
work here; the release branch promotes it into the exact declared version folder.

## Authoring rules

- Add new transform modules directly under this directory.
- Add or update `index.mjs` so it exports transforms in run order.
- Keep tests beside each transform, following existing version-folder patterns.
- Do **not** guess a future `v0.x.y` folder in a feature PR.
- Do **not** put release-specific content in this README; it stays in `next`.

## Release promotion

On the marked release branch, `pnpm version-packages` runs
`scripts/promote-codemod-next.mjs` after writing changelogs under the cut's declared
version. It copies every entry except this README into
`packages/cli/assets/codemods/transforms/v<declared-core-version>/`, registers the
folder, and removes the promoted files from `next`.

The Version Packages PR reviews the generated folder with the changelogs. After
publication, trusted merge-back carries those exact promoted files to current main;
it does not regenerate them.
