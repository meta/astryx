use temporal_rs::error::{ErrorKind, TemporalError};

use crate::{JsError, JsNativeError};

impl From<TemporalError> for JsNativeError {
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    fn from(value: TemporalError) -> Self {
        match value.kind() {
            ErrorKind::Range | ErrorKind::Syntax => {
                JsNativeError::range().with_message(value.into_message().to_owned())
            }
            ErrorKind::Type => JsNativeError::typ().with_message(value.into_message().to_owned()),
            ErrorKind::Generic => {
                JsNativeError::error().with_message(value.into_message().to_owned())
            }
            ErrorKind::Assert => JsNativeError::error().with_message("internal engine error"),
        }
    }
}

impl From<TemporalError> for JsError {
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    fn from(value: TemporalError) -> Self {
        let native: JsNativeError = value.into();
        native.into()
    }
}
