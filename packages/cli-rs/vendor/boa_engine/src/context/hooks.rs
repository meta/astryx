use crate::{
    Context, JsResult, JsString, JsValue,
    builtins::{Promise, promise::OperationType},
    context::intrinsics::Intrinsics,
    job::JobCallback,
    object::{JsFunction, JsObject},
    realm::Realm,
};
use time::{OffsetDateTime, UtcOffset};

/// [`Host Hooks`] customizable by the host code or engine.
///
/// Every hook contains on its `Requirements` section the spec requirements
/// that the hook must abide to for spec compliance.
///
/// # Usage
///
/// Implement the trait for a custom struct (maybe with additional state), overriding the methods that
/// need to be redefined:
///
/// ```
/// use boa_engine::{
///     JsNativeError, JsResult, JsString, Source,
///     context::{Context, ContextBuilder, HostHooks},
///     realm::Realm,
/// };
/// use std::rc::Rc;
///
/// struct Hooks;
///
/// impl HostHooks for Hooks {
///     fn ensure_can_compile_strings(
///         &self,
///         _realm: Realm,
///         _parameters: &[JsString],
///         _body: &JsString,
///         _direct: bool,
///         _context: &mut Context,
///     ) -> JsResult<()> {
///         Err(JsNativeError::typ()
///             .with_message("eval calls not available")
///             .into())
///     }
/// }
///
/// let context = &mut ContextBuilder::new()
///     .host_hooks(Rc::new(Hooks))
///     .build()
///     .unwrap();
/// let result = context.eval(Source::from_bytes(r#"eval("let a = 5")"#));
/// assert!(
///     result
///         .unwrap_err()
///         .to_string()
///         .starts_with("TypeError: eval calls not available")
/// );
/// ```
///
/// [`Host Hooks`]: https://tc39.es/ecma262/#sec-host-hooks-summary
pub trait HostHooks {
    /// [`HostMakeJobCallback ( callback )`][spec]
    ///
    /// # Requirements
    ///
    /// - It must return a `JobCallback` Record whose `[[Callback]]` field is `callback`.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-hostmakejobcallback
    fn make_job_callback(&self, callback: JsFunction, _context: &mut Context) -> JobCallback {
        // The default implementation of HostMakeJobCallback performs the following steps when called:

        // 1. Return the JobCallback Record { [[Callback]]: callback, [[HostDefined]]: empty }.
        JobCallback::new(callback, ())
    }

    /// [`HostCallJobCallback ( jobCallback, V, argumentsList )`][spec]
    ///
    /// # Requirements
    ///
    /// - It must perform and return the result of `Call(jobCallback.[[Callback]], V, argumentsList)`.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-hostcalljobcallback
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    fn call_job_callback(
        &self,
        job: &JobCallback,
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // The default implementation of HostCallJobCallback performs the following steps when called:

        // 1. Assert: IsCallable(jobCallback.[[Callback]]) is true.
        // already asserted by `Call`.
        // 2. Return ? Call(jobCallback.[[Callback]], V, argumentsList).
        job.callback().call(this, args, context)
    }

    /// [`HostPromiseRejectionTracker ( promise, operation )`][spec]
    ///
    /// # Requirements
    ///
    /// - It must complete normally (i.e. not return an abrupt completion). This is already
    ///   ensured by the return type.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-host-promise-rejection-tracker
    fn promise_rejection_tracker(
        &self,
        _promise: &JsObject<Promise>,
        _operation: OperationType,
        _context: &mut Context,
    ) {
        // The default implementation of HostPromiseRejectionTracker is to return unused.
    }

    /// [`HostEnsureCanCompileStrings ( calleeRealm, parameterStrings, bodyString, direct )`][spec]
    ///
    /// # Requirements
    ///
    /// - If the returned Completion Record is a normal completion, it must be a normal completion
    ///   containing unused. This is already ensured by the return type.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-hostensurecancompilestrings
    fn ensure_can_compile_strings(
        &self,
        _realm: Realm,
        _parameters: &[JsString],
        _body: &JsString,
        _direct: bool,
        _context: &mut Context,
    ) -> JsResult<()> {
        // The default implementation of HostEnsureCanCompileStrings is to return NormalCompletion(unused).
        Ok(())
    }

    /// [`HostHasSourceTextAvailable ( func )`][spec]
    ///
    /// # Requirements
    ///
    /// - It must be deterministic with respect to its parameters. Each time it is called with a
    ///   specific `func` as its argument, it must return the same result.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-hosthassourcetextavailable
    fn has_source_text_available(&self, _function: &JsFunction, _context: &mut Context) -> bool {
        // The default implementation of HostHasSourceTextAvailable is to return true.
        true
    }

    /// [`HostEnsureCanAddPrivateElement ( O )`][spec]
    ///
    /// # Requirements
    ///
    /// - If `O` is not a host-defined exotic object, this abstract operation must return
    ///   `NormalCompletion(unused)` and perform no other steps.
    /// - Any two calls of this abstract operation with the same argument must return the same kind
    ///   of *Completion Record*.
    /// - This abstract operation should only be overridden by ECMAScript hosts that are web browsers.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-hostensurecanaddprivateelement
    fn ensure_can_add_private_element(
        &self,
        _o: &JsObject,
        _context: &mut Context,
    ) -> JsResult<()> {
        Ok(())
    }

    /// Creates the global object of a new [`Context`] from the initial intrinsics.
    ///
    /// Equivalent to the step 7 of [`InitializeHostDefinedRealm ( )`][ihdr].
    ///
    /// [ihdr]: https://tc39.es/ecma262/#sec-initializehostdefinedrealm
    fn create_global_object(&self, intrinsics: &Intrinsics) -> JsObject {
        JsObject::with_object_proto(intrinsics)
    }

    /// Creates the global `this` of a new [`Context`] from the initial intrinsics.
    ///
    /// Equivalent to the step 8 of [`InitializeHostDefinedRealm ( )`][ihdr].
    ///
    /// [ihdr]: https://tc39.es/ecma262/#sec-initializehostdefinedrealm
    fn create_global_this(&self, _intrinsics: &Intrinsics) -> Option<JsObject> {
        None
    }

    /// Gets the current UTC time of the host, in milliseconds since epoch.
    ///
    /// Defaults to using [`OffsetDateTime::now_utc`] on all targets,
    /// which can cause panics if the target doesn't support [`SystemTime::now`][time].
    ///
    /// [time]: std::time::SystemTime::now
    #[deprecated(
        since = "0.21.0",
        note = "Use `context.clock().now().millis_since_epoch()` instead"
    )]
    fn utc_now(&self) -> i64 {
        let now = OffsetDateTime::now_utc();
        now.unix_timestamp() * 1000 + i64::from(now.millisecond())
    }

    /// Returns the offset of the local timezone to the `utc` timezone in seconds.
    fn local_timezone_offset_seconds(&self, unix_time_seconds: i64) -> i32 {
        OffsetDateTime::from_unix_timestamp(unix_time_seconds)
            .ok()
            .and_then(|t| UtcOffset::local_offset_at(t).ok())
            .map_or(0, UtcOffset::whole_seconds)
    }

    /// Gets the maximum size in bits that can be allocated for an `ArrayBuffer` or a
    /// `SharedArrayBuffer`.
    ///
    /// This hook will be called before any buffer allocation, which allows to dynamically change
    /// the maximum size at runtime. By default, this is set to 1.5GiB per the recommendations of the
    /// [specification]:
    ///
    /// > If a host is multi-tenanted (i.e. it runs many ECMAScript applications simultaneously),
    /// > such as a web browser, and its implementations choose to implement in-place growth by reserving
    /// > virtual memory, we recommend that both 32-bit and 64-bit implementations throw for values of
    /// > "`maxByteLength`" ≥ 1GiB to 1.5GiB. This is to reduce the likelihood a single application can
    /// > exhaust the virtual memory address space and to reduce interoperability risk.
    ///
    ///
    /// [specification]: https://tc39.es/ecma262/#sec-resizable-arraybuffer-guidelines
    fn max_buffer_size(&self, _context: &mut Context) -> u64 {
        1_610_612_736 // 1.5 GiB
    }
}

/// Default implementation of [`HostHooks`], which doesn't carry any state.
#[derive(Debug, Clone, Copy)]
pub struct DefaultHooks;

impl HostHooks for DefaultHooks {}
