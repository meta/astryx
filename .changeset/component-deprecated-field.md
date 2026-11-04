---
'@astryxdesign/cli': patch
'@astryxdesign/core': patch
---

[feat] A component doc can mark its component deprecated with `deprecated: {replacement, description}`: the `name` of the component to use instead and the modernization route. `astryx search` results and `astryx build` kit entries for that component carry the field as `deprecated` (a `deprecated:` line in their text output), and the docsite shows a Deprecated badge in the component's page header (beside any stability badge) and a notice at the top of its page that names and links the replacement, and labels it Deprecated on its components index tile and in site search. `BottomSheetSwitcher` sets it, naming `BottomSheet`; the component keeps working unchanged.

@imdreamrunner
