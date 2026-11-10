use boa_gc::{Finalize, Trace, custom_trace};
use icu_collator::{
    CollatorPreferences,
    options::{AlternateHandling, MaxVariable},
    preferences::{CollationCaseFirst, CollationNumericOrdering, CollationType},
    provider::CollationMetadataV1,
};

use icu_locale::{Locale, extensions::unicode};

use crate::{
    Context, JsArgs, JsData, JsExpect, JsNativeError, JsResult, JsString, JsValue,
    builtins::{
        BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject, OrdinaryObject,
        options::get_option,
    },
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    js_string,
    native_function::NativeFunction,
    object::{
        FunctionObjectBuilder, JsFunction, JsObject,
        internal_methods::get_prototype_from_constructor,
    },
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
    symbol::JsSymbol,
};

use super::{
    Service,
    locale::{canonicalize_locale_list, filter_locales, resolve_locale},
    options::{IntlOptions, coerce_options_to_object},
};

mod options;
pub(crate) use options::*;

#[derive(Debug, Finalize, JsData)]
#[allow(clippy::struct_field_names)]
pub(crate) struct Collator {
    locale: Locale,
    collation: Option<CollationType>,
    numeric: bool,
    case_first: Option<CollationCaseFirst>,
    usage: Usage,
    sensitivity: Sensitivity,
    ignore_punctuation: bool,
    collator: icu_collator::Collator,
    bound_compare: Option<JsFunction>,
}

// SAFETY: only `bound_compare` is a traceable object.
unsafe impl Trace for Collator {
    custom_trace!(this, mark, mark(&this.bound_compare));
}

impl Collator {
    /// Gets the inner [`icu_collator::Collator`] comparator.
    pub(crate) const fn collator(&self) -> &icu_collator::Collator {
        &self.collator
    }
}

impl Service for Collator {
    type LangMarker = CollationMetadataV1;

    type Preferences = CollatorPreferences;
}

impl IntrinsicObject for Collator {
    fn init(realm: &Realm) {
        let compare = BuiltInBuilder::callable(realm, Self::compare)
            .name(js_string!("get compare"))
            .build();

        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .static_method(
                Self::supported_locales_of,
                js_string!("supportedLocalesOf"),
                1,
            )
            .property(
                JsSymbol::to_string_tag(),
                js_string!("Intl.Collator"),
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("compare"),
                Some(compare),
                None,
                Attribute::CONFIGURABLE,
            )
            .method(Self::resolved_options, js_string!("resolvedOptions"), 0)
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for Collator {
    const NAME: JsString = StaticJsStrings::COLLATOR;
}

impl BuiltInConstructor for Collator {
    const CONSTRUCTOR_ARGUMENTS: usize = 0;
    const PROTOTYPE_STORAGE_SLOTS: usize = 4;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 1;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::collator;

    /// Constructor [`Intl.Collator ( [ locales [ , options ] ] )`][spec].
    ///
    /// Constructor for `Collator` objects.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-intl.collator
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Collator
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, let newTarget be the active function object, else let newTarget be NewTarget.
        let new_target = &if new_target.is_undefined() {
            context
                .active_function_object()
                .unwrap_or_else(|| context.intrinsics().constructors().collator().constructor())
                .into()
        } else {
            new_target.clone()
        };
        // 2. Let internalSlotsList be « [[InitializedCollator]], [[Locale]], [[Usage]], [[Sensitivity]], [[IgnorePunctuation]], [[Collation]], [[BoundCompare]] ».
        // 3. If %Collator%.[[RelevantExtensionKeys]] contains "kn", then
        //     a. Append [[Numeric]] as the last element of internalSlotsList.
        // 4. If %Collator%.[[RelevantExtensionKeys]] contains "kf", then
        //     a. Append [[CaseFirst]] as the last element of internalSlotsList.
        // 5. Let collator be ? OrdinaryCreateFromConstructor(newTarget, "%Collator.prototype%", internalSlotsList).
        // 6. Return ? InitializeCollator(collator, locales, options).

        let locales = args.get_or_undefined(0);
        let options = args.get_or_undefined(1);

        // Abstract operation `InitializeCollator ( collator, locales, options )`
        // https://tc39.es/ecma402/#sec-initializecollator

        // 1. Let requestedLocales be ? CanonicalizeLocaleList(locales).
        let requested_locales = canonicalize_locale_list(locales, context)?;

        // 2. Set options to ? CoerceOptionsToObject(options).
        let options = coerce_options_to_object(options, context)?;

        // 3. Let usage be ? GetOption(options, "usage", string, « "sort", "search" », "sort").
        // 4. Set collator.[[Usage]] to usage.
        // 5. If usage is "sort", then
        //     a. Let localeData be %Collator%.[[SortLocaleData]].
        // 6. Else,
        //     a. Let localeData be %Collator%.[[SearchLocaleData]].
        let usage = get_option(&options, js_string!("usage"), context)?.unwrap_or_default();

        // 7. Let opt be a new Record.
        // 8. Let matcher be ? GetOption(options, "localeMatcher", string, « "lookup", "best fit" », "best fit").
        // 9. Set opt.[[localeMatcher]] to matcher.
        let matcher =
            get_option(&options, js_string!("localeMatcher"), context)?.unwrap_or_default();

        // 10. Let collation be ? GetOption(options, "collation", string, empty, undefined).
        // 11. If collation is not undefined, then
        //     a. If collation does not match the Unicode Locale Identifier type nonterminal, throw a RangeError exception.
        // 12. Set opt.[[co]] to collation.
        // unicode `type`s that are not valid collation types are considered
        // "unsupported" instead of invalid.
        let collation = get_option::<unicode::Value>(&options, js_string!("collation"), context)?
            .and_then(|val| CollationType::try_from(&val).ok());

        // 13. Let numeric be ? GetOption(options, "numeric", boolean, empty, undefined).
        // 14. If numeric is not undefined, then
        //     a. Let numeric be ! ToString(numeric).
        // 15. Set opt.[[kn]] to numeric.
        let numeric = get_option(&options, js_string!("numeric"), context)?;

        // 16. Let caseFirst be ? GetOption(options, "caseFirst", string, « "upper", "lower", "false" », undefined).
        // 17. Set opt.[[kf]] to caseFirst.
        let case_first = get_option(&options, js_string!("caseFirst"), context)?;

        let mut intl_options = IntlOptions {
            matcher,
            preferences: {
                let mut prefs = CollatorPreferences::default();
                prefs.collation_type = collation;
                prefs.numeric_ordering = numeric.map(|kn| {
                    if kn {
                        CollationNumericOrdering::True
                    } else {
                        CollationNumericOrdering::False
                    }
                });
                prefs.case_first = case_first;
                prefs
            },
        };

        // 18. Let relevantExtensionKeys be %Collator%.[[RelevantExtensionKeys]].
        // 19. Let r be ResolveLocale(%Collator%.[[AvailableLocales]], requestedLocales, opt, relevantExtensionKeys, localeData).
        let locale = resolve_locale::<Self>(
            requested_locales,
            &mut intl_options,
            context.intl_provider(),
        )?;

        // 20. Set collator.[[Locale]] to r.[[locale]].
        // 21. Let collation be r.[[co]].
        // 22. If collation is null, let collation be "default".
        // 23. Set collator.[[Collation]] to collation.
        let collation = intl_options.preferences.collation_type;

        // 24. If relevantExtensionKeys contains "kn", then
        //     a. Set collator.[[Numeric]] to SameValue(r.[[kn]], "true").
        let numeric =
            intl_options.preferences.numeric_ordering == Some(CollationNumericOrdering::True);

        // 25. If relevantExtensionKeys contains "kf", then
        //     a. Set collator.[[CaseFirst]] to r.[[kf]].
        let case_first = intl_options.preferences.case_first;

        // 26. Let sensitivity be ? GetOption(options, "sensitivity", string, « "base", "accent", "case", "variant" », undefined).
        // 28. Set collator.[[Sensitivity]] to sensitivity.
        let sensitivity = get_option(&options, js_string!("sensitivity"), context)?
            // 27. If sensitivity is undefined, then
            //     a. If usage is "sort", then
            //         i. Let sensitivity be "variant".
            //     b. Else,
            //         i. Let dataLocale be r.[[dataLocale]].
            //         ii. Let dataLocaleData be localeData.[[<dataLocale>]].
            //         iii. Let sensitivity be dataLocaleData.[[sensitivity]].
            .or_else(|| (usage == Usage::Sort).then_some(Sensitivity::Variant));

        // 29. Let ignorePunctuation be ? GetOption(options, "ignorePunctuation", boolean, empty, false).
        // 30. Set collator.[[IgnorePunctuation]] to ignorePunctuation.
        let ignore_punctuation = get_option(&options, js_string!("ignorePunctuation"), context)?;

        let (strength, case_level) = sensitivity.map(Sensitivity::to_collator_options).unzip();

        let (alternate_handling, max_variable) = match ignore_punctuation {
            Some(true) => Some((AlternateHandling::Shifted, MaxVariable::Punctuation)).unzip(),
            Some(false) => (Some(AlternateHandling::NonIgnorable), None),
            None => None.unzip(),
        };

        let mut options = icu_collator::options::CollatorOptions::default();
        options.strength = strength;
        options.case_level = case_level;
        options.alternate_handling = alternate_handling;
        options.max_variable = max_variable;

        if usage == Usage::Search {
            intl_options.preferences.collation_type = Some(CollationType::Search);
        }

        let collator = icu_collator::Collator::try_new_with_buffer_provider(
            context.intl_provider().erased_provider(),
            intl_options.preferences,
            options,
        )
        .map_err(|e| JsNativeError::typ().with_message(e.to_string()))?;

        let resolved_options = collator.as_borrowed().resolved_options();

        let prototype =
            get_prototype_from_constructor(new_target, StandardConstructors::collator, context)?;
        let collator = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            prototype,
            Self {
                locale,
                collation,
                numeric,
                case_first,
                usage,
                sensitivity: sensitivity.unwrap_or(Sensitivity::Variant),
                ignore_punctuation: resolved_options.alternate_handling
                    == AlternateHandling::Shifted
                    && resolved_options.max_variable != MaxVariable::Space,
                collator,
                bound_compare: None,
            },
        );

        // 31. Return collator.
        Ok(collator.into())
    }
}

impl Collator {
    /// [`Intl.Collator.supportedLocalesOf ( locales [ , options ] )`][spec].
    ///
    /// Returns an array containing those of the provided locales that are supported in collation
    /// without having to fall back to the runtime's default locale.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-intl.collator.supportedlocalesof
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Collator/supportedLocalesOf
    fn supported_locales_of(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let locales = args.get_or_undefined(0);
        let options = args.get_or_undefined(1);

        // 1. Let availableLocales be %Collator%.[[AvailableLocales]].
        // 2. Let requestedLocales be ? CanonicalizeLocaleList(locales).
        let requested_locales = canonicalize_locale_list(locales, context)?;

        // 3. Return ? FilterLocales(availableLocales, requestedLocales, options).
        filter_locales::<Self>(requested_locales, options, context).map(JsValue::from)
    }

    /// [`get Intl.Collator.prototype.compare`][spec].
    ///
    /// Compares two strings according to the sort order of this Intl.Collator object.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-intl.collator.prototype.compare
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Collator/compare
    fn compare(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let collator be the this value.
        // 2. Perform ? RequireInternalSlot(collator, [[InitializedCollator]]).
        let this = this.as_object().ok_or_else(|| {
            JsNativeError::typ()
                .with_message("`resolvedOptions` can only be called on a `Collator` object")
        })?;
        let collator_obj = this.clone();
        let mut collator = this.downcast_mut::<Self>().ok_or_else(|| {
            JsNativeError::typ()
                .with_message("`resolvedOptions` can only be called on a `Collator` object")
        })?;

        // 3. If collator.[[BoundCompare]] is undefined, then
        //     a. Let F be a new built-in function object as defined in 10.3.3.1.
        //     b. Set F.[[Collator]] to collator.
        //     c. Set collator.[[BoundCompare]] to F.
        let bound_compare = if let Some(f) = collator.bound_compare.clone() {
            f
        } else {
            let bound_compare = FunctionObjectBuilder::new(
                context.realm(),
                // 10.3.3.1. Collator Compare Functions
                // https://tc39.es/ecma402/#sec-collator-compare-functions
                NativeFunction::from_copy_closure_with_captures(
                    |_, args, collator, context| {
                        // 1. Let collator be F.[[Collator]].
                        // 2. Assert: Type(collator) is Object and collator has an [[InitializedCollator]] internal slot.
                        let collator = collator
                            .downcast_ref::<Self>()
                            .js_expect("checked above that the object was a collator object")?;

                        // 3. If x is not provided, let x be undefined.
                        // 5. Let X be ? ToString(x).
                        let x = args
                            .get_or_undefined(0)
                            .to_string(context)?
                            .iter()
                            .collect::<Vec<_>>();

                        // 4. If y is not provided, let y be undefined.
                        // 6. Let Y be ? ToString(y).
                        let y = args
                            .get_or_undefined(1)
                            .to_string(context)?
                            .iter()
                            .collect::<Vec<_>>();

                        // 7. Return CompareStrings(collator, X, Y).

                        let result = collator.collator.as_borrowed().compare_utf16(&x, &y) as i32;

                        Ok(result.into())
                    },
                    collator_obj,
                ),
            )
            .length(2)
            .build();

            collator.bound_compare = Some(bound_compare.clone());
            bound_compare
        };

        // 4. Return collator.[[BoundCompare]].
        Ok(bound_compare.into())
    }

    /// [`Intl.Collator.prototype.resolvedOptions ( )`][spec].
    ///
    /// Returns a new object with properties reflecting the locale and collation options computed
    /// during initialization of this `Intl.Collator` object.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-intl.collator.prototype.resolvedoptions
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Collator/resolvedOptions
    fn resolved_options(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let collator be the this value.
        // 2. Perform ? RequireInternalSlot(collator, [[InitializedCollator]]).
        let object = this.as_object();
        let collator = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("`resolvedOptions` can only be called on a `Collator` object")
            })?;

        // 3. Let options be OrdinaryObjectCreate(%Object.prototype%).
        let options = context
            .intrinsics()
            .templates()
            .ordinary_object()
            .create(OrdinaryObject, vec![]);

        // 4. For each row of Table 4, except the header row, in table order, do
        //     a. Let p be the Property value of the current row.
        //     b. Let v be the value of collator's internal slot whose name is the Internal Slot value of the current row.
        //     c. If the current row has an Extension Key value, then
        //         i. Let extensionKey be the Extension Key value of the current row.
        //         ii. If %Collator%.[[RelevantExtensionKeys]] does not contain extensionKey, then
        //             1. Let v be undefined.
        //     d. If v is not undefined, then
        //         i. Perform ! CreateDataPropertyOrThrow(options, p, v).
        // 5. Return options.
        options
            .create_data_property_or_throw(
                js_string!("locale"),
                js_string!(collator.locale.to_string()),
                context,
            )
            .js_expect("operation must not fail per the spec")?;
        options
            .create_data_property_or_throw(
                js_string!("usage"),
                match collator.usage {
                    Usage::Search => js_string!("search"),
                    Usage::Sort => js_string!("sort"),
                },
                context,
            )
            .js_expect("operation must not fail per the spec")?;
        options
            .create_data_property_or_throw(
                js_string!("sensitivity"),
                match collator.sensitivity {
                    Sensitivity::Base => js_string!("base"),
                    Sensitivity::Accent => js_string!("accent"),
                    Sensitivity::Case => js_string!("case"),
                    Sensitivity::Variant => js_string!("variant"),
                },
                context,
            )
            .js_expect("operation must not fail per the spec")?;
        options
            .create_data_property_or_throw(
                js_string!("ignorePunctuation"),
                collator.ignore_punctuation,
                context,
            )
            .js_expect("operation must not fail per the spec")?;
        options
            .create_data_property_or_throw(
                js_string!("collation"),
                collator
                    .collation
                    .map(|co| js_string!(co.as_str()))
                    .unwrap_or(js_string!("default")),
                context,
            )
            .js_expect("operation must not fail per the spec")?;
        options
            .create_data_property_or_throw(js_string!("numeric"), collator.numeric, context)
            .js_expect("operation must not fail per the spec")?;
        if let Some(kf) = collator.case_first {
            options
                .create_data_property_or_throw(
                    js_string!("caseFirst"),
                    js_string!(kf.as_str()),
                    context,
                )
                .js_expect("operation must not fail per the spec")?;
        }

        // 5. Return options.
        Ok(options.into())
    }
}
