//! Boa's implementation of ECMAScript's global `Intl` object.
//!
//! The `Intl` namespace object contains several constructors as well as functionality common to the
//! internationalization constructors and other language sensitive functions. Collectively, they
//! comprise the ECMAScript Internationalization API, which provides language sensitive string
//! comparison, number formatting, date and time formatting, and more.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!  - [MDN documentation][mdn]
//!
//!
//! [spec]: https://tc39.es/ecma402/#intl-object
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl

use crate::{
    Context, JsArgs, JsData, JsResult, JsString, JsValue,
    builtins::{Array, BuiltInBuilder, BuiltInObject, IntrinsicObject},
    context::{icu::IntlProvider, intrinsics::Intrinsics},
    js_string,
    object::JsObject,
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
    symbol::JsSymbol,
};

use boa_gc::{Finalize, Trace};
use icu_locale::{LanguageIdentifier, extensions::unicode};
use icu_provider::{DataMarker, DataMarkerAttributes};
use static_assertions::const_assert;

pub(crate) use self::{
    collator::Collator, date_time_format::DateTimeFormat, list_format::ListFormat, locale::Locale,
    number_format::NumberFormat, plural_rules::PluralRules, segmenter::Segmenter,
};

/// Macro to easily implement `ServicePreferences`.
///
/// This macro receives a list of fields, and adds the methods to
/// correctly implement `ServicePreferences` from the provided fields.
macro_rules! impl_service_preferences {
    ($($field:ident),*) => {
        fn extended(&self, other: &Self) -> Self {
            let mut result = *self;
            result.extend(*other);
            result
        }

        fn as_unicode(&self) -> unicode::Unicode {
            let mut exts = unicode::Unicode::new();

            $(
                if let Some(key) = &self.$field
                    && let Some((key, value)) = $crate::builtins::intl::get_kv_from_pref(key)
                {
                    exts.keywords.set(key, value);
                }
            )*

            exts
        }

        fn intersection(&self, other: &Self) -> Self {
            let mut inter = *self;
            if inter.locale_preferences != other.locale_preferences {
                inter.locale_preferences = LocalePreferences::default();
            }

            $(
                if inter.$field != other.$field {
                    inter.$field.take();
                }
            )*

            inter
        }
    };
}

pub(crate) mod collator;
pub(crate) mod date_time_format;
pub(crate) mod list_format;
pub(crate) mod locale;
pub(crate) mod number_format;
pub(crate) mod plural_rules;
pub(crate) mod segmenter;

mod options;

// No singletons are allowed as lang markers.
// Hopefully, we'll be able to migrate this to the definition of `Service` in the future
// (https://github.com/rust-lang/rust/issues/76560)
const_assert! {!<Collator as Service>::LangMarker::INFO.is_singleton}
const_assert! {!<ListFormat as Service>::LangMarker::INFO.is_singleton}
const_assert! {!<NumberFormat as Service>::LangMarker::INFO.is_singleton}
const_assert! {!<PluralRules as Service>::LangMarker::INFO.is_singleton}
const_assert! {!<Segmenter as Service>::LangMarker::INFO.is_singleton}
const_assert! {!<DateTimeFormat as Service>::LangMarker::INFO.is_singleton}

/// JavaScript `Intl` object.
#[derive(Debug, Clone, Trace, Finalize, JsData)]
#[boa_gc(unsafe_empty_trace)]
pub struct Intl {
    fallback_symbol: JsSymbol,
}

impl Intl {
    /// Gets this realm's `Intl` object's `[[FallbackSymbol]]` slot.
    #[must_use]
    pub fn fallback_symbol(&self) -> JsSymbol {
        self.fallback_symbol.clone()
    }

    pub(crate) fn new() -> Option<Self> {
        let fallback_symbol = JsSymbol::new(Some(js_string!("IntlLegacyConstructedSymbol")))?;
        Some(Self { fallback_symbol })
    }
}

impl IntrinsicObject for Intl {
    fn init(realm: &Realm) {
        BuiltInBuilder::with_intrinsic::<Self>(realm)
            .static_property(
                JsSymbol::to_string_tag(),
                Self::NAME,
                Attribute::CONFIGURABLE,
            )
            .static_property(
                Collator::NAME,
                realm.intrinsics().constructors().collator().constructor(),
                Collator::ATTRIBUTE,
            )
            .static_property(
                ListFormat::NAME,
                realm
                    .intrinsics()
                    .constructors()
                    .list_format()
                    .constructor(),
                ListFormat::ATTRIBUTE,
            )
            .static_property(
                Locale::NAME,
                realm.intrinsics().constructors().locale().constructor(),
                Locale::ATTRIBUTE,
            )
            .static_property(
                Segmenter::NAME,
                realm.intrinsics().constructors().segmenter().constructor(),
                Segmenter::ATTRIBUTE,
            )
            .static_property(
                PluralRules::NAME,
                realm
                    .intrinsics()
                    .constructors()
                    .plural_rules()
                    .constructor(),
                PluralRules::ATTRIBUTE,
            )
            .static_property(
                DateTimeFormat::NAME,
                realm
                    .intrinsics()
                    .constructors()
                    .date_time_format()
                    .constructor(),
                DateTimeFormat::ATTRIBUTE,
            )
            .static_property(
                NumberFormat::NAME,
                realm
                    .intrinsics()
                    .constructors()
                    .number_format()
                    .constructor(),
                NumberFormat::ATTRIBUTE,
            )
            .static_method(
                Self::get_canonical_locales,
                js_string!("getCanonicalLocales"),
                1,
            )
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        intrinsics.objects().intl().upcast()
    }
}

impl BuiltInObject for Intl {
    const NAME: JsString = StaticJsStrings::INTL;
}

impl Intl {
    /// `Intl.getCanonicalLocales ( locales )`
    ///
    /// Returns an array containing the canonical locale names.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN docs][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-intl.getcanonicallocales
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/getCanonicalLocales
    pub(crate) fn get_canonical_locales(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let locales = args.get_or_undefined(0);

        // 1. Let ll be ? CanonicalizeLocaleList(locales).
        let ll = locale::canonicalize_locale_list(locales, context)?;

        // 2. Return CreateArrayFromList(ll).
        Ok(JsValue::new(Array::create_array_from_list(
            ll.into_iter().map(|loc| js_string!(loc.to_string()).into()),
            context,
        )))
    }
}

fn get_kv_from_pref<T: icu_locale::preferences::PreferenceKey>(
    pref: &T,
) -> Option<(unicode::Key, unicode::Value)> {
    T::unicode_extension_key().zip(pref.unicode_extension_value())
}

/// A set of preferences that can be provided to a [`Service`] through
/// a locale.
trait ServicePreferences: for<'a> From<&'a icu_locale::Locale> + Clone {
    /// Validates that every preference value is available.
    ///
    /// This usually entails having to query the `IntlProvider` to check
    /// if it has the required data to support the requested values.
    fn validate(&mut self, id: &LanguageIdentifier, provider: &IntlProvider);

    /// Converts this set of preferences into a Unicode locale extension.
    fn as_unicode(&self) -> unicode::Unicode;

    /// Extends all values set in `self` with the values set in `other`.
    fn extended(&self, other: &Self) -> Self;

    /// Gets the set of preference values that are the same in `self` and `other`.
    fn intersection(&self, other: &Self) -> Self;
}

/// A service component that is part of the `Intl` API.
///
/// This needs to be implemented for every `Intl` service in order to use the functions
/// defined in `locale::utils`, such as [`resolve_locale`][locale::resolve_locale].
trait Service {
    /// The data marker used to decide which locales are supported by this service.
    type LangMarker: DataMarker;

    /// The attributes used to resolve the locale.
    const ATTRIBUTES: &'static DataMarkerAttributes = DataMarkerAttributes::empty();

    /// The set of preferences used to resolve the provided locale.
    type Preferences: ServicePreferences;
}
