---
'@astryxdesign/core': patch
---

[feat] Calendar: weekday headers show the locale's abbreviated names where all seven fit in four characters, and keep the short names otherwise. English now reads `Sun Mon Tue` instead of `Su Mo Tu`; French reads `dim. lun. mar.`, and Spanish, Swedish, Norwegian, Romanian, Greek, Serbian, Turkish, German, and Traditional Chinese switch the same way. Portuguese (Portugal), Arabic, Hebrew, Polish, Danish, and Vietnamese, whose abbreviated names are longer, keep their short names. The popovers of DateInput, DateRangeInput, and DateTimeInput follow because they render Calendar, and the touch bottom sheets of DateInput and DateTimeInput now use the same names, so Portuguese (Portugal) no longer shows whole words such as `domingo` there.

@imdreamrunner
