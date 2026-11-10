use crate::{builtins::options::get_option, realm::Realm, string::StaticJsStrings};
use icu_locale::{
    extensions::unicode::Value,
    extensions_unicode_key as key, extensions_unicode_value as value,
    preferences::extensions::unicode::keywords::{CollationCaseFirst, HourCycle},
};

#[cfg(all(test, feature = "intl_bundled"))]
mod tests;

mod utils;
pub(crate) use utils::*;

mod options;

use crate::{
    Context, JsArgs, JsNativeError, JsResult, JsString, JsValue,
    builtins::{BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject},
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    js_string,
    object::{JsObject, internal_methods::get_prototype_from_constructor},
    property::Attribute,
    symbol::JsSymbol,
};

use super::options::coerce_options_to_object;

#[derive(Debug, Clone)]
pub(crate) struct Locale;

impl IntrinsicObject for Locale {
    fn init(realm: &Realm) {
        let base_name = BuiltInBuilder::callable(realm, Self::base_name)
            .name(js_string!("get baseName"))
            .build();

        let calendar = BuiltInBuilder::callable(realm, Self::calendar)
            .name(js_string!("get calendar"))
            .build();

        let case_first = BuiltInBuilder::callable(realm, Self::case_first)
            .name(js_string!("get caseFirst"))
            .build();

        let collation = BuiltInBuilder::callable(realm, Self::collation)
            .name(js_string!("get collation"))
            .build();

        let hour_cycle = BuiltInBuilder::callable(realm, Self::hour_cycle)
            .name(js_string!("get hourCycle"))
            .build();

        let numeric = BuiltInBuilder::callable(realm, Self::numeric)
            .name(js_string!("get numeric"))
            .build();

        let numbering_system = BuiltInBuilder::callable(realm, Self::numbering_system)
            .name(js_string!("get numberingSystem"))
            .build();

        let language = BuiltInBuilder::callable(realm, Self::language)
            .name(js_string!("get language"))
            .build();

        let script = BuiltInBuilder::callable(realm, Self::script)
            .name(js_string!("get script"))
            .build();

        let region = BuiltInBuilder::callable(realm, Self::region)
            .name(js_string!("get region"))
            .build();

        let variants = BuiltInBuilder::callable(realm, Self::variants)
            .name(js_string!("get variants"))
            .build();

        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .property(
                JsSymbol::to_string_tag(),
                js_string!("Intl.Locale"),
                Attribute::CONFIGURABLE,
            )
            .method(Self::maximize, js_string!("maximize"), 0)
            .method(Self::minimize, js_string!("minimize"), 0)
            .method(Self::to_string, js_string!("toString"), 0)
            .accessor(
                js_string!("baseName"),
                Some(base_name),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("calendar"),
                Some(calendar),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("caseFirst"),
                Some(case_first),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("collation"),
                Some(collation),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("hourCycle"),
                Some(hour_cycle),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("numeric"),
                Some(numeric),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("numberingSystem"),
                Some(numbering_system),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("language"),
                Some(language),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("script"),
                Some(script),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("region"),
                Some(region),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("variants"),
                Some(variants),
                None,
                Attribute::CONFIGURABLE,
            )
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for Locale {
    const NAME: JsString = StaticJsStrings::LOCALE;
}

impl BuiltInConstructor for Locale {
    const CONSTRUCTOR_ARGUMENTS: usize = 1;
    const PROTOTYPE_STORAGE_SLOTS: usize = 26;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 0;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::locale;

    /// Constructor [`Intl.Locale ( tag [ , options ] )`][spec].
    ///
    /// Constructor for `Locale` objects.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.Locale
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, throw a TypeError exception.
        if new_target.is_undefined() {
            return Err(JsNativeError::typ()
                .with_message("cannot call `Intl.Locale` constructor without `new`")
                .into());
        }

        let tag = args.get_or_undefined(0);
        let options = args.get_or_undefined(1);

        // 2. Let localeExtensionKeys be %Locale%.[[LocaleExtensionKeys]].
        // 3. Let internalSlotsList be « [[InitializedLocale]], [[Locale]], [[Calendar]], [[Collation]], [[HourCycle]], [[NumberingSystem]] ».
        // 4. If relevantExtensionKeys contains "kf", then
        //     a. Append [[CaseFirst]] as the last element of internalSlotsList.
        // 5. If relevantExtensionKeys contains "kn", then
        //     a. Append [[Numeric]] as the last element of internalSlotsList.
        // 6. Let locale be ? OrdinaryCreateFromConstructor(NewTarget, "%Locale.prototype%", internalSlotsList).
        let prototype =
            get_prototype_from_constructor(new_target, StandardConstructors::locale, context)?;

        // 7. If Type(tag) is not String or Object, throw a TypeError exception.
        let mut tag = locale_from_value(tag, context)?;

        // 10. Set options to ? CoerceOptionsToObject(options).
        let options = &coerce_options_to_object(options, context)?;

        // 11. Set tag to ? UpdateLanguageId(tag, options).

        // Abstract operation [`UpdateLanguageId ( tag, options )`][https://tc39.es/ecma402/#sec-updatelanguageid]
        {
            // 1. Let baseName be GetLocaleBaseName(tag).
            // 2. Let language be ? GetOption(options, "language", string, empty, GetLocaleLanguage(baseName)).
            // 3. If language cannot be matched by the unicode_language_subtag Unicode locale nonterminal, throw a RangeError exception.
            let language = get_option(options, js_string!("language"), context)?;

            // 4. Let script be ? GetOption(options, "script", string, empty, GetLocaleScript(baseName)).
            // 5. If script is not undefined, then
            //        a. If script cannot be matched by the unicode_script_subtag Unicode locale nonterminal, throw a RangeError exception.
            let script = get_option(options, js_string!("script"), context)?;

            // 6. Let region be ? GetOption(options, "region", string, empty, GetLocaleRegion(baseName)).
            // 7. If region is not undefined, then
            //        a. If region cannot be matched by the unicode_region_subtag Unicode locale nonterminal, throw a RangeError exception.
            let region = get_option(options, js_string!("region"), context)?;

            // 8. Let variants be ? GetOption(options, "variants", string, empty, GetLocaleVariants(baseName)).
            // 9. If variants is not undefined, then
            let variants = get_option(options, js_string!("variants"), context)?;

            // 10. Let allExtensions be the suffix of tag following baseName.
            // 11. Let newTag be language.
            if let Some(language) = language {
                tag.id.language = language;
            }
            // 12. If script is not undefined, set newTag to the string-concatenation of newTag, "-", and script.
            if let Some(script) = script {
                tag.id.script = Some(script);
            }
            // 13. If region is not undefined, set newTag to the string-concatenation of newTag, "-", and region.
            if let Some(region) = region {
                tag.id.region = Some(region);
            }
            // 14. If variants is not undefined, set newTag to the string-concatenation of newTag, "-", and variants.
            if let Some(variants) = variants {
                tag.id.variants = variants;
            }
            // 15. Set newTag to the string-concatenation of newTag and allExtensions.
            // 16. Return newTag.
        }

        // 14. Let opt be a new Record.
        // 15. Let calendar be ? GetOption(options, "calendar", string, empty, undefined).
        // 16. If calendar is not undefined, then
        //     a. If calendar cannot be matched by the type Unicode locale nonterminal, throw a RangeError exception.
        // 17. Set opt.[[ca]] to calendar.
        let ca = get_option(options, js_string!("calendar"), context)?;

        // 18. Let collation be ? GetOption(options, "collation", string, empty, undefined).
        // 19. If collation is not undefined, then
        //     a. If collation does not match the Unicode Locale Identifier type nonterminal, throw a RangeError exception.
        // 20. Set opt.[[co]] to collation.
        let co = get_option(options, js_string!("collation"), context)?;

        // 21. Let hc be ? GetOption(options, "hourCycle", string, « "h11", "h12", "h23", "h24" », undefined).
        // 22. Set opt.[[hc]] to hc.
        let hc = get_option::<HourCycle>(options, js_string!("hourCycle"), context)?;

        // 23. Let kf be ? GetOption(options, "caseFirst", string, « "upper", "lower", "false" », undefined).
        // 24. Set opt.[[kf]] to kf.
        let kf = get_option::<CollationCaseFirst>(options, js_string!("caseFirst"), context)?;

        // 25. Let kn be ? GetOption(options, "numeric", boolean, empty, undefined).
        // 26. If kn is not undefined, set kn to ! ToString(kn).
        // 27. Set opt.[[kn]] to kn.
        let kn = get_option::<bool>(options, js_string!("numeric"), context)?;

        // 28. Let numberingSystem be ? GetOption(options, "numberingSystem", string, empty, undefined).
        // 29. If numberingSystem is not undefined, then
        //     a. If numberingSystem does not match the Unicode Locale Identifier type nonterminal, throw a RangeError exception.
        // 30. Set opt.[[nu]] to numberingSystem.
        let nu = get_option(options, js_string!("numberingSystem"), context)?;

        // 31. Let r be MakeLocaleRecord(tag, opt, localeExtensionKeys).
        // 32. Set locale.[[Locale]] to r.[[locale]].
        if let Some(ca) = ca {
            // 33. Set locale.[[Calendar]] to r.[[ca]].
            tag.extensions.unicode.keywords.set(key!("ca"), ca);
        }
        if let Some(co) = co {
            // 34. Set locale.[[Collation]] to r.[[co]].
            tag.extensions.unicode.keywords.set(key!("co"), co);
        }
        if let Some(hc) = hc {
            // 35. Set locale.[[HourCycle]] to r.[[hc]].
            tag.extensions.unicode.keywords.set(key!("hc"), hc.into());
        }
        if let Some(kf) = kf {
            // 36. If localeExtensionKeys contains "kf", then
            //     a. Set locale.[[CaseFirst]] to r.[[kf]].
            tag.extensions.unicode.keywords.set(key!("kf"), kf.into());
        }
        if let Some(kn) = kn {
            // 37. If localeExtensionKeys contains "kn", then
            //     a. If SameValue(r.[[kn]], "true") is true or r.[[kn]] is the empty String, then
            //         i. Set locale.[[Numeric]] to true.
            //     b. Else,
            //         i. Set locale.[[Numeric]] to false.
            tag.extensions.unicode.keywords.set(
                key!("kn"),
                if kn { value!("true") } else { value!("false") },
            );
        }
        if let Some(nu) = nu {
            // 38. Set locale.[[NumberingSystem]] to r.[[nu]].
            tag.extensions.unicode.keywords.set(key!("nu"), nu);
        }

        context
            .intl_provider()
            .locale_canonicalizer()?
            .canonicalize(&mut tag);

        let locale =
            JsObject::from_proto_and_data_with_shared_shape(context.root_shape(), prototype, tag);

        // 39. Return locale.
        Ok(locale.into())
    }
}

impl Locale {
    /// [`Intl.Locale.prototype.maximize ( )`][spec].
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.Locale.prototype.maximize
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/maximize
    pub(crate) fn maximize(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let loc be the this value.
        // 2. Perform ? RequireInternalSlot(loc, [[InitializedLocale]]).
        let object = this.as_object();
        let mut loc = object
            .as_ref()
            .and_then(|o| o.downcast_ref::<icu_locale::Locale>())
            .ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("`Locale.maximize` can only be called on a `Locale` object")
            })?
            .clone();

        // 3. Let maximal be the result of the Add Likely Subtags algorithm applied to loc.[[Locale]]. If an error is signaled, set maximal to loc.[[Locale]].
        context
            .intl_provider()
            .locale_expander()?
            .maximize(&mut loc.id);

        // 4. Return ! Construct(%Locale%, maximal).
        let prototype = context.intrinsics().constructors().locale().prototype();
        Ok(
            JsObject::from_proto_and_data_with_shared_shape(context.root_shape(), prototype, loc)
                .into(),
        )
    }

    /// [`Intl.Locale.prototype.minimize ( )`][spec]
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.Locale.prototype.minimize
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/minimize
    pub(crate) fn minimize(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let loc be the this value.
        // 2. Perform ? RequireInternalSlot(loc, [[InitializedLocale]]).
        let object = this.as_object();
        let mut loc = object
            .as_ref()
            .and_then(|o| o.downcast_ref::<icu_locale::Locale>())
            .ok_or_else(|| {
                JsNativeError::typ().with_message(
                    "`Locale.prototype.minimize` can only be called on a `Locale` object",
                )
            })?
            .clone();

        // 3. Let minimal be the result of the Remove Likely Subtags algorithm applied to loc.[[Locale]]. If an error is signaled, set minimal to loc.[[Locale]].
        context
            .intl_provider()
            .locale_expander()?
            .minimize(&mut loc.id);

        // 4. Return ! Construct(%Locale%, minimal).
        let prototype = context.intrinsics().constructors().locale().prototype();
        Ok(
            JsObject::from_proto_and_data_with_shared_shape(context.root_shape(), prototype, loc)
                .into(),
        )
    }

    /// [`Intl.Locale.prototype.toString ( )`][spec].
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://tc39.es/ecma402/#sec-Intl.Locale.prototype.toString
    /// [spec]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/toString
    pub(crate) fn to_string(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let loc be the this value.
        // 2. Perform ? RequireInternalSlot(loc, [[InitializedLocale]]).
        let object = this.as_object();
        let loc = object
            .as_ref()
            .and_then(|o| o.downcast_ref::<icu_locale::Locale>())
            .ok_or_else(|| {
                JsNativeError::typ().with_message(
                    "`Locale.prototype.toString` can only be called on a `Locale` object",
                )
            })?;

        // 3. Return loc.[[Locale]].
        Ok(js_string!(loc.to_string()).into())
    }

    /// [`get Intl.Locale.prototype.baseName`][spec].
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/baseName
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.Locale.prototype.baseName
    pub(crate) fn base_name(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let loc be the this value.
        // 2. Perform ? RequireInternalSlot(loc, [[InitializedLocale]]).
        let object = this.as_object();
        let loc = object
            .as_ref()
            .and_then(|o| o.downcast_ref::<icu_locale::Locale>())
            .ok_or_else(|| {
                JsNativeError::typ().with_message(
                    "`get Locale.prototype.baseName` can only be called on a `Locale` object",
                )
            })?;

        // 3. Let locale be loc.[[Locale]].
        // 4. Return the substring of locale corresponding to the unicode_language_id production.
        Ok(js_string!(loc.id.to_string()).into())
    }

    /// [`get Intl.Locale.prototype.calendar`][spec].
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/calendar
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.Locale.prototype.calendar
    pub(crate) fn calendar(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let loc be the this value.
        // 2. Perform ? RequireInternalSlot(loc, [[InitializedLocale]]).
        let object = this.as_object();
        let loc = object
            .as_ref()
            .and_then(|o| o.downcast_ref::<icu_locale::Locale>())
            .ok_or_else(|| {
                JsNativeError::typ().with_message(
                    "`get Locale.prototype.calendar` can only be called on a `Locale` object",
                )
            })?;

        // 3. Return loc.[[Calendar]].
        Ok(loc
            .extensions
            .unicode
            .keywords
            .get(&key!("ca"))
            .map(|v| js_string!(v.to_string()).into())
            .unwrap_or_default())
    }

    /// [`get Intl.Locale.prototype.caseFirst`][spec].
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/calendar
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.Locale.prototype.calendar
    pub(crate) fn case_first(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let loc be the this value.
        // 2. Perform ? RequireInternalSlot(loc, [[InitializedLocale]]).
        let object = this.as_object();
        let loc = object
            .as_ref()
            .and_then(|o| o.downcast_ref::<icu_locale::Locale>())
            .ok_or_else(|| {
                JsNativeError::typ().with_message(
                    "`get Locale.prototype.caseFirst` can only be called on a `Locale` object",
                )
            })?;

        // 3. Return loc.[[CaseFirst]].
        Ok(loc
            .extensions
            .unicode
            .keywords
            .get(&key!("kf"))
            .map(|v| js_string!(v.to_string()).into())
            .unwrap_or_default())
    }

    /// [`get Intl.Locale.prototype.collation`][spec].
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/collation
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.Locale.prototype.collation
    pub(crate) fn collation(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let loc be the this value.
        // 2. Perform ? RequireInternalSlot(loc, [[InitializedLocale]]).
        let object = this.as_object();
        let loc = object
            .as_ref()
            .and_then(|o| o.downcast_ref::<icu_locale::Locale>())
            .ok_or_else(|| {
                JsNativeError::typ().with_message(
                    "`get Locale.prototype.collation` can only be called on a `Locale` object",
                )
            })?;

        // 3. Return loc.[[Collation]].
        Ok(loc
            .extensions
            .unicode
            .keywords
            .get(&key!("co"))
            .map(|v| js_string!(v.to_string()).into())
            .unwrap_or_default())
    }

    /// [`get Intl.Locale.prototype.hourCycle`][spec].
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/hourCycle
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.Locale.prototype.hourCycle
    pub(crate) fn hour_cycle(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let loc be the this value.
        // 2. Perform ? RequireInternalSlot(loc, [[InitializedLocale]]).
        let object = this.as_object();
        let loc = object
            .as_ref()
            .and_then(|o| o.downcast_ref::<icu_locale::Locale>())
            .ok_or_else(|| {
                JsNativeError::typ().with_message(
                    "`get Locale.prototype.hourCycle` can only be called on a `Locale` object",
                )
            })?;

        // 3. Return loc.[[HourCycle]].
        Ok(loc
            .extensions
            .unicode
            .keywords
            .get(&key!("hc"))
            .map(|v| js_string!(v.to_string()).into())
            .unwrap_or_default())
    }

    /// [`get Intl.Locale.prototype.numeric`][spec].
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/numeric
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.Locale.prototype.numeric
    pub(crate) fn numeric(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let loc be the this value.
        // 2. Perform ? RequireInternalSlot(loc, [[InitializedLocale]]).
        let object = this.as_object();
        let loc = object
            .as_ref()
            .and_then(|o| o.downcast_ref::<icu_locale::Locale>())
            .ok_or_else(|| {
                JsNativeError::typ().with_message(
                    "`get Locale.prototype.numeric` can only be called on a `Locale` object",
                )
            })?;

        // 3. Return loc.[[Numeric]].
        let kn = loc
            .extensions
            .unicode
            .keywords
            .get(&key!("kn"))
            .is_some_and(Value::is_empty);

        Ok(JsValue::from(kn))
    }

    /// [`get Intl.Locale.prototype.numberingSystem`][spec].
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/numeric
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.Locale.prototype.numeric
    pub(crate) fn numbering_system(
        this: &JsValue,
        _: &[JsValue],
        _: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let loc be the this value.
        // 2. Perform ? RequireInternalSlot(loc, [[InitializedLocale]]).
        let object = this.as_object();
        let loc = object
            .as_ref()
            .and_then(|o| o.downcast_ref::<icu_locale::Locale>())
            .ok_or_else(|| {
                JsNativeError::typ().with_message(
                    "`get Locale.prototype.numberingSystem` can only be called on a `Locale` object",
                )
            })?;

        // 3. Return loc.[[NumberingSystem]].
        Ok(loc
            .extensions
            .unicode
            .keywords
            .get(&key!("nu"))
            .map(|v| js_string!(v.to_string()).into())
            .unwrap_or_default())
    }

    /// [`get Intl.Locale.prototype.language`][spec].
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/language
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.Locale.prototype.language
    pub(crate) fn language(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let loc be the this value.
        // 2. Perform ? RequireInternalSlot(loc, [[InitializedLocale]]).
        let object = this.as_object();
        let loc = object
            .as_ref()
            .and_then(|o| o.downcast_ref::<icu_locale::Locale>())
            .ok_or_else(|| {
                JsNativeError::typ().with_message(
                    "`get Locale.prototype.language` can only be called on a `Locale` object",
                )
            })?;

        // 3. Let locale be loc.[[Locale]].
        // 4. Assert: locale matches the unicode_locale_id production.
        // 5. Return the substring of locale corresponding to the unicode_language_subtag production of the unicode_language_id.
        Ok(js_string!(loc.id.language.to_string()).into())
    }

    /// [`get Intl.Locale.prototype.script`][spec].
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/script
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.Locale.prototype.script
    pub(crate) fn script(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let loc be the this value.
        // 2. Perform ? RequireInternalSlot(loc, [[InitializedLocale]]).
        let object = this.as_object();
        let loc = object
            .as_ref()
            .and_then(|o| o.downcast_ref::<icu_locale::Locale>())
            .ok_or_else(|| {
                JsNativeError::typ().with_message(
                    "`get Locale.prototype.script` can only be called on a `Locale` object",
                )
            })?;

        // 3. Let locale be loc.[[Locale]].
        // 4. Assert: locale matches the unicode_locale_id production.
        // 5. If the unicode_language_id production of locale does not contain the ["-" unicode_script_subtag] sequence, return undefined.
        // 6. Return the substring of locale corresponding to the unicode_script_subtag production of the unicode_language_id.
        Ok(loc
            .id
            .script
            .map(|sc| js_string!(sc.to_string()).into())
            .unwrap_or_default())
    }

    /// [`get Intl.Locale.prototype.region`][spec].
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/region
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.Locale.prototype.region
    pub(crate) fn region(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let loc be the this value.
        // 2. Perform ? RequireInternalSlot(loc, [[InitializedLocale]]).
        let object = this.as_object();
        let loc = object
            .as_ref()
            .and_then(|o| o.downcast_ref::<icu_locale::Locale>())
            .ok_or_else(|| {
                JsNativeError::typ().with_message(
                    "`get Locale.prototype.region` can only be called on a `Locale` object",
                )
            })?;

        // 3. Let locale be loc.[[Locale]].
        // 4. Assert: locale matches the unicode_locale_id production.
        // 5. If the unicode_language_id production of locale does not contain the ["-" unicode_region_subtag] sequence, return undefined.
        // 6. Return the substring of locale corresponding to the unicode_region_subtag production of the unicode_language_id.
        Ok(loc
            .id
            .region
            .map(|sc| js_string!(sc.to_string()).into())
            .unwrap_or_default())
    }

    /// [`get Intl.Locale.prototype.variants`][spec].
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/variants
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.Locale.prototype.variants
    pub(crate) fn variants(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let loc be the this value.
        // 2. Perform ? RequireInternalSlot(loc, [[InitializedLocale]]).
        let loc = this.as_object();
        let loc = loc
            .as_ref()
            .and_then(|o| o.downcast_ref::<icu_locale::Locale>())
            .ok_or_else(|| {
                JsNativeError::typ().with_message(
                    "`get Locale.prototype.variants` can only be called on a `Locale` object",
                )
            })?;

        // 3. Return GetLocaleVariants(loc.[[Locale]]).

        // Abstract operation `GetLocaleVariants ( locale )`
        // <https://tc39.es/ecma402/#sec-getlocalevariants>

        // 1. Let baseName be GetLocaleBaseName(locale).
        // 2. NOTE: Each subtag in baseName that is preceded by "-" is either a unicode_script_subtag,
        //    unicode_region_subtag, or unicode_variant_subtag, but any substring matched by unicode_variant_subtag
        //    is strictly longer than any prefix thereof which could also be matched by one of the other productions.
        // 3. Let variants be the longest suffix of baseName that starts with a "-" followed by a substring
        //    that is matched by the unicode_variant_subtag Unicode locale nonterminal. If there is no such
        //    suffix, return undefined.
        if loc.id.variants.is_empty() {
            return Ok(JsValue::undefined());
        }

        // 4. Return the substring of variants from 1.
        Ok(js_string!(loc.id.variants.to_string()).into())
    }
}
