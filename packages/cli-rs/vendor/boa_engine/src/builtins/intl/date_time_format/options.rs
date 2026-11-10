//! Intl.DateTimeFormat options module

use crate::{
    Context, JsError, JsNativeError, JsObject, JsResult, JsValue,
    builtins::{
        intl::{
            ServicePreferences, date_time_format::FormatType, locale::validate_extension,
            options::get_number_option,
        },
        options::{OptionType, get_option},
    },
    context::icu::IntlProvider,
    js_error, js_string,
};
use icu_calendar::cal::{
    Buddhist, ChineseTraditional, Coptic, Ethiopian, Gregorian, Hebrew, Hijri, Indian, Japanese,
    KoreanTraditional, Persian, Roc, hijri,
};
use icu_datetime::{
    DateTimeFormatterPreferences,
    fieldsets::builder::{DateFields, ZoneStyle},
    options::{Length, SubsecondDigits as IcuSubsecondDigits, TimePrecision},
    preferences::{CalendarAlgorithm, HijriCalendarAlgorithm, HourCycle as IcuHourCycle},
    scaffold::CldrCalendar,
};

use icu_decimal::provider::DecimalSymbolsV1;
use icu_locale::extensions::unicode::Value;
use icu_provider::{
    DataMarker, DataMarkerAttributes, DryDataProvider,
    prelude::icu_locale_core::{
        LanguageIdentifier, extensions::unicode, preferences::LocalePreferences,
    },
};

pub(crate) enum HourCycle {
    H11,
    H12,
    H23,
    H24,
}

impl OptionType for HourCycle {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        match value.to_string(context)?.to_std_string_escaped().as_ref() {
            "h11" => Ok(Self::H11),
            "h12" => Ok(Self::H12),
            "h23" => Ok(Self::H23),
            "h24" => Ok(Self::H24),
            _ => Err(js_error!(RangeError: "unknown hourCycle option")),
        }
    }
}

impl TryFrom<HourCycle> for IcuHourCycle {
    type Error = JsError;
    fn try_from(hc: HourCycle) -> Result<Self, Self::Error> {
        match hc {
            HourCycle::H11 => Ok(IcuHourCycle::H11),
            HourCycle::H12 => Ok(IcuHourCycle::H12),
            HourCycle::H23 => Ok(IcuHourCycle::H23),
            // TODO: Work on support for H24, potentially remove depending on fate
            // of H24 option.
            HourCycle::H24 => Err(js_error!(RangeError: "h24 not currently supported.")),
        }
    }
}

pub(super) enum FormatMatcher {
    Basic,
    BestFit,
}

impl OptionType for FormatMatcher {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        match value.to_string(context)?.to_std_string_escaped().as_ref() {
            "basic" => Ok(Self::Basic),
            "best fit" => Ok(Self::BestFit),
            _ => Err(js_error!(RangeError: "unknown formatMatcher option")),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(super) enum DateStyle {
    Full,
    Long,
    Medium,
    Short,
}

impl OptionType for DateStyle {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        match value.to_string(context)?.to_std_string_escaped().as_ref() {
            "full" => Ok(Self::Full),
            "long" => Ok(Self::Long),
            "medium" => Ok(Self::Medium),
            "short" => Ok(Self::Short),
            _ => Err(js_error!(RangeError: "unknown dateStyle option")),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(super) enum TimeStyle {
    Full,
    Long,
    Medium,
    Short,
}

impl OptionType for TimeStyle {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        match value.to_string(context)?.to_std_string_escaped().as_ref() {
            "full" => Ok(Self::Full),
            "long" => Ok(Self::Long),
            "medium" => Ok(Self::Medium),
            "short" => Ok(Self::Short),
            _ => Err(js_error!(RangeError: "unknown timeStyle option")),
        }
    }
}

impl OptionType for CalendarAlgorithm {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        let s = value.to_string(context)?.to_std_string_escaped();
        Value::try_from_str(&s)
            .ok()
            .and_then(|v| CalendarAlgorithm::try_from(&v).ok())
            .ok_or_else(|| {
                JsNativeError::range()
                    .with_message(format!("provided calendar `{s}` is invalid"))
                    .into()
            })
    }
}

// TODO: track https://github.com/unicode-org/icu4x/issues/6597 and
// https://github.com/tc39/ecma402/issues/1002 for resolution on
// `HourCycle::H24`.
impl OptionType for IcuHourCycle {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        match value.to_string(context)?.to_std_string_escaped().as_str() {
            "h11" => Ok(IcuHourCycle::H11),
            "h12" => Ok(IcuHourCycle::H12),
            "h23" => Ok(IcuHourCycle::H23),
            _ => Err(js_error!(RangeError: "provided hour cycle was not `h11`, `h12` or `h23`")),
        }
    }
}

// ==== Formatting options ====
//
// This section includes formatting options that act as an intermediary between
// user space and ICU4X's datetimeformat composite fields.

pub(super) struct FormatOptions {
    _hour_cycle: Option<IcuHourCycle>,                 // -> ???
    week_day: Option<WeekDay>,                         // e -> Maps to DateField
    era: Option<Era>,                                  // G -> Maps to YearStyle
    year: Option<Year>,                                // Y -> Maps to DateField
    month: Option<Month>,                              // M -> Maps to DateField
    day: Option<Day>,                                  // D -> Maps to DateField
    day_period: Option<DayPeriod>,                     // a -> ???
    hour: Option<Hour>,                                // Maps to TimePrecision
    minute: Option<Minute>,                            // Maps to TimePrecision
    second: Option<Second>,                            // Maps to TimePrecision
    fractional_second_digits: Option<SubsecondDigits>, // Maps to TimePrecision
    time_zone_name: Option<TimeZoneName>,              // Maps to ZoneStyle
}

impl FormatOptions {
    pub(super) fn try_init(
        options: &JsObject,
        hour_cycle: Option<IcuHourCycle>, // TODO: Is option correct?
        context: &mut Context,
    ) -> JsResult<Self> {
        // Below is adapted and inlined from Step 24 of `CreateDateTimeFormat`
        let week_day = get_option::<WeekDay>(options, js_string!("weekday"), context)?;
        let era = get_option::<Era>(options, js_string!("era"), context)?;
        let year = get_option::<Year>(options, js_string!("year"), context)?;
        let month = get_option::<Month>(options, js_string!("month"), context)?;
        let day = get_option::<Day>(options, js_string!("day"), context)?;
        let day_period = get_option::<DayPeriod>(options, js_string!("dayPeriod"), context)?;
        let hour = get_option::<Hour>(options, js_string!("hour"), context)?;
        let minute = get_option::<Minute>(options, js_string!("minute"), context)?;
        let second = get_option::<Second>(options, js_string!("second"), context)?;
        let fractional_second_digits =
            get_number_option(options, js_string!("fractionalSecondDigits"), 1, 3, context)?
                .map(SubsecondDigits::from_i32);
        let time_zone_name =
            get_option::<TimeZoneName>(options, js_string!("timeZoneName"), context)?;

        Ok(Self {
            _hour_cycle: hour_cycle,
            week_day,
            era,
            year,
            month,
            day,
            day_period,
            hour,
            minute,
            second,
            fractional_second_digits,
            time_zone_name,
        })
    }

    pub(super) fn fractional_second_digits(&self) -> Option<SubsecondDigits> {
        self.fractional_second_digits
    }

    pub(super) fn set_date_defaults(&mut self) {
        self.year = Some(Year::Numeric);
        self.month = Some(Month::Numeric);
        self.day = Some(Day::Numeric);
    }

    pub(super) fn set_time_defaults(&mut self) {
        self.hour = Some(Hour::Numeric);
        self.minute = Some(Minute::Numeric);
        self.second = Some(Second::Numeric);
    }

    pub(super) fn has_explicit_format_components(&self) -> bool {
        match self {
            Self {
                week_day: None,
                era: None,
                year: None,
                month: None,
                day: None,
                day_period: None,
                hour: None,
                minute: None,
                second: None,
                fractional_second_digits: None,
                time_zone_name: None,
                ..
            } => false,
            // If any of the format fields is Some(_), return true
            _ => true,
        }
    }

    pub(super) fn check_dtf_type(&self, required: FormatType) -> bool {
        // a. Let needDefaults be true.
        // b. If required is date or any, then
        // i. For each property name prop of « "weekday", "year", "month", "day" », do
        // 1. Let value be formatOptions.[[<prop>]].
        // 2. If value is not undefined, set needDefaults to false.
        // c. If required is time or any, then
        // i. For each property name prop of « "dayPeriod", "hour", "minute", "second", "fractionalSecondDigits" », do
        // 1. Let value be formatOptions.[[<prop>]].
        // 2. If value is not undefined, set needDefaults to false.
        if required != FormatType::Time && self.has_date_defaults() {
            return false;
        }
        if required != FormatType::Date && self.has_time_defaults() {
            return false;
        }
        true
    }

    pub(super) fn has_date_defaults(&self) -> bool {
        self.week_day.is_some() || self.year.is_some() || self.month.is_some() || self.day.is_some()
    }

    pub(super) fn has_time_defaults(&self) -> bool {
        self.day_period.is_some()
            || self.hour.is_some()
            || self.minute.is_some()
            || self.second.is_some()
            || self.fractional_second_digits.is_some()
    }

    pub(super) fn to_length(&self) -> Option<Length> {
        match (self.month, self.week_day, self.day_period, self.era) {
            (Some(month), _, _, _) => Some(month.to_length()),
            (None, Some(week_day), _, _) => Some(week_day.to_length()),
            (None, None, Some(day_period), _) => Some(day_period.to_length()),
            (None, None, None, Some(era)) => Some(era.to_length()),
            (None, None, None, None) => None,
        }
    }

    /// Convert the current `FormatOptions` to a [`DateFields`].
    pub(super) fn to_date_fields(&self) -> Option<DateFields> {
        match (self.year, self.month, self.day, self.week_day) {
            (Some(_y), _m, _d, Some(_e)) => Some(DateFields::YMDE),
            (Some(_y), _m, Some(_d), None) => Some(DateFields::YMD),
            (Some(_y), Some(_m), None, None) => Some(DateFields::YM),
            (Some(_y), None, None, None) => Some(DateFields::Y),
            (None, Some(_m), _d, Some(_e)) => Some(DateFields::MDE),
            (None, Some(_m), Some(_d), None) => Some(DateFields::MD),
            (None, Some(_m), None, None) => Some(DateFields::M),
            (None, None, Some(_d), Some(_e)) => Some(DateFields::DE),
            (None, None, Some(_d), None) => Some(DateFields::D),
            (None, None, None, Some(_e)) => Some(DateFields::E),
            (None, None, None, None) => None,
        }
    }

    /// Convert the current `FormatOptions` to a [`TimePrecision`].
    pub(super) fn to_time_fields(&self) -> Option<TimePrecision> {
        match (
            self.hour,
            self.minute,
            self.second,
            self.fractional_second_digits,
        ) {
            (_h, _m, _s, Some(digits)) => Some(TimePrecision::Subsecond(digits.into())),
            (_h, _m, Some(_s), None) => Some(TimePrecision::Second),
            (_h, Some(_m), None, None) => Some(TimePrecision::Minute),
            (Some(_h), None, None, None) => Some(TimePrecision::Hour),
            (None, None, None, None) => None,
        }
    }

    /// Convert the current `FormatOptions` to a [`ZoneStyle`].
    pub(super) fn to_zone_style(&self) -> Option<ZoneStyle> {
        self.time_zone_name.map(TimeZoneName::to_zone_style)
    }
}

// ==== Format Options ====

#[derive(Debug, Clone, Copy)]
pub(crate) enum WeekDay {
    Narrow,
    Short,
    Long,
}

impl OptionType for WeekDay {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        match value.to_string(context)?.to_std_string_escaped().as_ref() {
            "narrow" => Ok(Self::Narrow),
            "short" => Ok(Self::Short),
            "long" => Ok(Self::Long),
            _ => Err(js_error!(RangeError: "unknown weekDay option")),
        }
    }
}

impl WeekDay {
    pub(crate) fn to_length(self) -> Length {
        match self {
            Self::Long => Length::Long,
            Self::Short => Length::Medium,
            Self::Narrow => Length::Short,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum Era {
    Narrow,
    Short,
    Long,
}

impl Era {
    pub(crate) fn to_length(self) -> Length {
        match self {
            Self::Long => Length::Long,
            Self::Short => Length::Medium,
            Self::Narrow => Length::Short,
        }
    }
}

impl OptionType for Era {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        match value.to_string(context)?.to_std_string_escaped().as_ref() {
            "narrow" => Ok(Self::Narrow),
            "short" => Ok(Self::Short),
            "long" => Ok(Self::Long),
            _ => Err(js_error!(RangeError: "unknown era option")),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum Year {
    TwoDigit,
    Numeric,
}

impl OptionType for Year {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        match value.to_string(context)?.to_std_string_escaped().as_ref() {
            "2-digit" => Ok(Self::TwoDigit),
            "numeric" => Ok(Self::Numeric),
            _ => Err(js_error!(RangeError: "unknown year option")),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum Month {
    TwoDigit,
    Numeric,
    Narrow,
    Short,
    Long,
}

impl Month {
    pub(crate) fn to_length(self) -> Length {
        // NOTE (nekevss): after a brief glance, narrow does not appear to be
        // currently supported by ICU4X ... TBD
        match self {
            Self::Long => Length::Long,
            Self::Short => Length::Medium,
            _ => Length::Short,
        }
    }
}

impl OptionType for Month {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        match value.to_string(context)?.to_std_string_escaped().as_ref() {
            "2-digit" => Ok(Self::TwoDigit),
            "numeric" => Ok(Self::Numeric),
            "narrow" => Ok(Self::Narrow),
            "short" => Ok(Self::Short),
            "long" => Ok(Self::Long),
            _ => Err(js_error!(RangeError: "unknown month option")),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum Day {
    TwoDigit,
    Numeric,
}

impl OptionType for Day {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        match value.to_string(context)?.to_std_string_escaped().as_ref() {
            "2-digit" => Ok(Self::TwoDigit),
            "numeric" => Ok(Self::Numeric),
            _ => Err(js_error!(RangeError: "unknown day option")),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum DayPeriod {
    Narrow,
    Short,
    Long,
}

impl DayPeriod {
    pub(crate) fn to_length(self) -> Length {
        match self {
            Self::Long => Length::Long,
            Self::Short => Length::Medium,
            Self::Narrow => Length::Short,
        }
    }
}

impl OptionType for DayPeriod {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        match value.to_string(context)?.to_std_string_escaped().as_ref() {
            "narrow" => Ok(Self::Narrow),
            "short" => Ok(Self::Short),
            "long" => Ok(Self::Long),
            _ => Err(js_error!(RangeError: "unknown dayPeriod option")),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum Hour {
    TwoDigit,
    Numeric,
}

impl OptionType for Hour {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        match value.to_string(context)?.to_std_string_escaped().as_ref() {
            "2-digit" => Ok(Self::TwoDigit),
            "numeric" => Ok(Self::Numeric),
            _ => Err(js_error!(RangeError: "unknown hour option")),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum Minute {
    TwoDigit,
    Numeric,
}

impl OptionType for Minute {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        match value.to_string(context)?.to_std_string_escaped().as_ref() {
            "2-digit" => Ok(Self::TwoDigit),
            "numeric" => Ok(Self::Numeric),
            _ => Err(js_error!(RangeError: "unknown minute option")),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum Second {
    TwoDigit,
    Numeric,
}

impl OptionType for Second {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        match value.to_string(context)?.to_std_string_escaped().as_ref() {
            "2-digit" => Ok(Self::TwoDigit),
            "numeric" => Ok(Self::Numeric),
            _ => Err(js_error!(RangeError: "unknown second option")),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum SubsecondDigits {
    S1,
    S2,
    S3,
}

impl SubsecondDigits {
    fn from_i32(i: i32) -> SubsecondDigits {
        match i {
            1 => SubsecondDigits::S1,
            2 => SubsecondDigits::S2,
            3 => SubsecondDigits::S3,
            _ => unreachable!("subSecondDigits must be previously constrained."),
        }
    }

    pub(super) fn digits(self) -> u8 {
        match self {
            SubsecondDigits::S1 => 1,
            SubsecondDigits::S2 => 2,
            SubsecondDigits::S3 => 3,
        }
    }
}

impl From<SubsecondDigits> for IcuSubsecondDigits {
    fn from(value: SubsecondDigits) -> Self {
        match value {
            SubsecondDigits::S1 => IcuSubsecondDigits::S1,
            SubsecondDigits::S2 => IcuSubsecondDigits::S2,
            SubsecondDigits::S3 => IcuSubsecondDigits::S3,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum TimeZoneName {
    Short,
    Long,
    ShortOffset,
    LongOffset,
    ShortGeneric,
    LongGeneric,
}

impl OptionType for TimeZoneName {
    fn from_value(value: JsValue, context: &mut Context) -> JsResult<Self> {
        match value.to_string(context)?.to_std_string_escaped().as_ref() {
            "short" => Ok(Self::Short),
            "long" => Ok(Self::Long),
            "shortOffset" => Ok(Self::ShortOffset),
            "longOffset" => Ok(Self::LongOffset),
            "shortGeneric" => Ok(Self::ShortGeneric),
            "longGeneric" => Ok(Self::LongGeneric),
            _ => Err(js_error!(RangeError: "unknown timeZoneName option")),
        }
    }
}

impl TimeZoneName {
    fn to_zone_style(self) -> ZoneStyle {
        match self {
            TimeZoneName::LongGeneric => ZoneStyle::GenericLong,
            TimeZoneName::ShortGeneric => ZoneStyle::GenericShort,
            TimeZoneName::LongOffset => ZoneStyle::LocalizedOffsetLong,
            TimeZoneName::ShortOffset => ZoneStyle::LocalizedOffsetShort,
            TimeZoneName::Long => ZoneStyle::SpecificLong,
            TimeZoneName::Short => ZoneStyle::SpecificShort,
        }
    }
}

// The below handles the [[RelevantExtensionKeys]] of DateTimeFormatters
// internal slots.
//
// See https://tc39.es/ecma402/#sec-intl.datetimeformat-internal-slots
impl ServicePreferences for DateTimeFormatterPreferences {
    fn validate(&mut self, id: &LanguageIdentifier, provider: &IntlProvider) {
        // Handle LDML unicode key "nu", Numbering system
        self.numbering_system = self.numbering_system.take().filter(|nu| {
            let attr = DataMarkerAttributes::from_str_or_panic(nu.as_str());
            validate_extension::<DecimalSymbolsV1>(id, attr, provider)
        });

        // Handle LDML unicode key "ca", Calendar algorithm
        self.calendar_algorithm = self.calendar_algorithm.take().filter(|ca| match ca {
            CalendarAlgorithm::Buddhist => has_calendar_data_for_locale::<Buddhist>(id, provider),
            CalendarAlgorithm::Chinese => {
                has_calendar_data_for_locale::<ChineseTraditional>(id, provider)
            }
            CalendarAlgorithm::Coptic => has_calendar_data_for_locale::<Coptic>(id, provider),
            CalendarAlgorithm::Dangi => {
                has_calendar_data_for_locale::<KoreanTraditional>(id, provider)
            }
            CalendarAlgorithm::Ethiopic => has_calendar_data_for_locale::<Ethiopian>(id, provider),
            CalendarAlgorithm::Gregory => has_calendar_data_for_locale::<Gregorian>(id, provider),
            CalendarAlgorithm::Hebrew => has_calendar_data_for_locale::<Hebrew>(id, provider),
            CalendarAlgorithm::Indian => has_calendar_data_for_locale::<Indian>(id, provider),
            CalendarAlgorithm::Japanese => has_calendar_data_for_locale::<Japanese>(id, provider),
            CalendarAlgorithm::Persian => has_calendar_data_for_locale::<Persian>(id, provider),
            CalendarAlgorithm::Roc => has_calendar_data_for_locale::<Roc>(id, provider),
            CalendarAlgorithm::Hijri(Some(
                HijriCalendarAlgorithm::Civil | HijriCalendarAlgorithm::Tbla,
            )) => has_calendar_data_for_locale::<Hijri<hijri::TabularAlgorithm>>(id, provider),
            CalendarAlgorithm::Hijri(Some(HijriCalendarAlgorithm::Umalqura)) => {
                has_calendar_data_for_locale::<Hijri<hijri::UmmAlQura>>(id, provider)
            }
            CalendarAlgorithm::Hijri(Some(HijriCalendarAlgorithm::Rgsa) | None) => true,
            _ => false,
        });

        // NOTE (nekevss): issue: this will not support `H24` as ICU4X does
        // not currently support it.
        //
        // track: https://github.com/unicode-org/icu4x/issues/6597
        // Handle LDML unicode key "hc", Hour cycle
        // No need to validate hour_cycle since it only affects formatting
        // behaviour.
    }

    impl_service_preferences!(numbering_system, calendar_algorithm, hour_cycle);
}

fn has_calendar_data_for_locale<C: CldrCalendar>(
    id: &LanguageIdentifier,
    provider: &IntlProvider,
) -> bool
where
    IntlProvider: DryDataProvider<C::YearNamesV1>,
{
    use icu_datetime::provider::semantic_skeletons::marker_attrs;
    use icu_provider::prelude::{
        DataIdentifierBorrowed, DataRequest, DataRequestMetadata,
        icu_locale_core::preferences::LocalePreferences,
    };

    let info = <C::YearNamesV1 as DataMarker>::INFO;
    let locale = info.make_locale(LocalePreferences::from(id));
    let req = DataRequest {
        id: DataIdentifierBorrowed::for_marker_attributes_and_locale(marker_attrs::ABBR, &locale),
        metadata: {
            let mut md = DataRequestMetadata::default();
            md.silent = true;
            md
        },
    };

    let Ok(md) = DryDataProvider::dry_load(provider, req) else {
        return false;
    };

    md.locale.is_none_or(|loc| !loc.is_unknown())
}
