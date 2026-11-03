---
'@astryxdesign/core': patch
---

[feat] Calendar: weekday headers show the locale's abbreviated names where all seven fit in four characters, and keep the short names otherwise. English now reads `Sun Mon Tue` instead of `Su Mo Tu`; French reads `dim. lun. mar.`, and Spanish, Swedish, Norwegian, Romanian, Greek, Serbian, Turkish, German, and Traditional Chinese switch the same way. Portuguese (Portugal), Arabic, Hebrew, Polish, Danish, and Vietnamese, whose abbreviated names are longer, keep their short names. A locale Astryx ships no translations for, such as Indonesian, shows its own abbreviated names (`Min Sen Sel`) instead of English. The popovers of DateInput, DateRangeInput, and DateTimeInput follow because they render Calendar. The touch bottom sheets of DateInput and DateTimeInput now show the same names as Calendar in every locale: Portuguese (Portugal) no longer runs whole words such as `domingo` together, and Polish, Danish, Vietnamese, Arabic, and Hebrew switch to their short names there.

@imdreamrunner
