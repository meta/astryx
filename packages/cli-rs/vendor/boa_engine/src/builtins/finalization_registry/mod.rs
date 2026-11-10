//! Boa's implementation of ECMAScript's `FinalizationRegistry` object.

use std::{
    cell::{Cell, RefCell},
    slice,
};

use boa_gc::{Ephemeron, Finalize, Gc, Trace, WeakGc};

use crate::{
    Context, JsArgs, JsData, JsObject, JsResult, JsSymbol, JsValue, JsVariant,
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    job::{Job, JobCallback, NativeAsyncJob},
    js_error, js_string,
    object::{
        ErasedVTableObject, JsFunction, VTableObject,
        internal_methods::get_prototype_from_constructor,
    },
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
};

use super::{BuiltInConstructor, BuiltInObject, IntrinsicObject, builder::BuiltInBuilder};

#[cfg(test)]
mod tests;

/// On GG collection, sends a message to a [`FinalizationRegistry`] indicating that it needs to
/// be collected.
#[derive(Trace)]
struct CleanupSignaler(#[unsafe_ignore_trace] Cell<Option<async_channel::WeakSender<()>>>);

impl Finalize for CleanupSignaler {
    fn finalize(&self) {
        if let Some(sender) = self.0.take()
            && let Some(sender) = sender.upgrade()
        {
            // We don't need to handle errors:
            // - If the channel is full, the `FinalizationRegistry` has already
            //   been enqueued for cleanup.
            // - If the channel is closed, the `FinalizationRegistry` was
            //   GC'd, so we don't need to worry about cleanups.
            let _ = sender.try_send(());
        }
    }
}

///  A cell tracked by a [`FinalizationRegistry`].
#[derive(Trace, Finalize)]
pub(crate) struct RegistryCell {
    target: Ephemeron<ErasedVTableObject, CleanupSignaler>,
    held_value: JsValue,
    unregister_token: Option<WeakGc<ErasedVTableObject>>,
}

/// Boa's implementation of ECMAScript's [`FinalizationRegistry`] builtin object.
///
/// `FinalizationRegistry` provides a way to request that a cleanup callback get called at some point
/// when a value registered with the registry has been reclaimed (garbage-collected).
///
/// [`FinalizationRegistry`]: https://tc39.es/ecma262/#sec-finalization-registry-objects
#[derive(Trace, Finalize, JsData)]
pub(crate) struct FinalizationRegistry {
    realm: Realm,
    callback: JobCallback,
    #[unsafe_ignore_trace]
    cleanup_notifier: async_channel::Sender<()>,
    cells: Vec<RegistryCell>,
}

impl IntrinsicObject for FinalizationRegistry {
    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }

    fn init(realm: &Realm) {
        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .property(
                JsSymbol::to_string_tag(),
                js_string!("FinalizationRegistry"),
                Attribute::CONFIGURABLE,
            )
            .method(Self::register, js_string!("register"), 2)
            .method(Self::unregister, js_string!("unregister"), 1)
            .build();
    }
}

impl BuiltInObject for FinalizationRegistry {
    const NAME: crate::JsString = StaticJsStrings::FINALIZATION_REGISTRY;

    const ATTRIBUTE: Attribute = Attribute::WRITABLE.union(Attribute::CONFIGURABLE);
}

impl BuiltInConstructor for FinalizationRegistry {
    const CONSTRUCTOR_ARGUMENTS: usize = 1;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 0;
    const PROTOTYPE_STORAGE_SLOTS: usize = 3;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::finalization_registry;

    /// Constructor [`FinalizationRegistry ( cleanupCallback )`][cons]
    ///
    /// [cons]: https://tc39.es/ecma262/#sec-finalization-registry-cleanup-callback
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, throw a TypeError exception.
        if new_target.is_undefined() {
            return Err(js_error!(
                TypeError: "FinalizationRegistry: cannot call constructor without `new`"
            ));
        }

        // 2. If IsCallable(cleanupCallback) is false, throw a TypeError exception.
        let callback = args
            .get_or_undefined(0)
            .as_object()
            .and_then(JsFunction::from_object)
            .ok_or_else(|| {
                js_error!(
                    TypeError: "FinalizationRegistry: \
                        cleanup callback of registry must be callable"
                )
            })?;

        // 3. Let finalizationRegistry be ? OrdinaryCreateFromConstructor(NewTarget,
        //    "%FinalizationRegistry.prototype%", « [[Realm]], [[CleanupCallback]], [[Cells]] »).
        let prototype = get_prototype_from_constructor(
            new_target,
            StandardConstructors::finalization_registry,
            context,
        )?;

        // 4. Let fn be the active function object.
        // 5. Set finalizationRegistry.[[Realm]] to fn.[[Realm]].
        let realm = context.vm.frame().realm.clone();

        // 6. Set finalizationRegistry.[[CleanupCallback]] to HostMakeJobCallback(cleanupCallback).
        let callback = context.host_hooks().make_job_callback(callback, context);

        // 7. Set finalizationRegistry.[[Cells]] to a new empty List.
        let cells = Vec::new();

        let (sender, receiver) = async_channel::bounded(1);

        let registry = JsObject::new_unique(
            prototype,
            FinalizationRegistry {
                realm,
                callback,
                cells,
                cleanup_notifier: sender,
            },
        );

        let weak_registry = WeakGc::new(registry.inner());

        {
            async fn inner_cleanup(
                weak_registry: WeakGc<VTableObject<FinalizationRegistry>>,
                receiver: async_channel::Receiver<()>,
                context: &RefCell<&mut Context>,
            ) -> JsResult<JsValue> {
                let Ok(()) = receiver.recv().await else {
                    return Ok(JsValue::undefined());
                };

                let Some(registry) = weak_registry.upgrade().map(JsObject::from_inner) else {
                    return Ok(JsValue::undefined());
                };

                let result = FinalizationRegistry::cleanup(&registry, &mut context.borrow_mut());

                context
                    .borrow_mut()
                    .enqueue_job(Job::FinalizationRegistryCleanupJob(NativeAsyncJob::new(
                        async move |context| inner_cleanup(weak_registry, receiver, context).await,
                    )));

                result.map(|()| JsValue::undefined())
            }

            context.enqueue_job(Job::FinalizationRegistryCleanupJob(NativeAsyncJob::new(
                async move |ctx| inner_cleanup(weak_registry, receiver, ctx).await,
            )));
        }

        // 8. Return finalizationRegistry.
        Ok(registry.upcast().into())
    }
}

impl FinalizationRegistry {
    /// [`FinalizationRegistry.prototype.register ( target, heldValue [ , unregisterToken ] )`][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/sec-finalization-registry.prototype.register
    fn register(this: &JsValue, args: &[JsValue], _context: &mut Context) -> JsResult<JsValue> {
        // 1. Let finalizationRegistry be the this value.
        // 2. Perform ? RequireInternalSlot(finalizationRegistry, [[Cells]]).
        let this = this.as_object();
        let mut registry = this
            .as_ref()
            .and_then(JsObject::downcast_mut::<Self>)
            .ok_or_else(|| {
                js_error!(
                    TypeError: "FinalizationRegistry.prototype.register: \
                        invalid object type for `this`",
                )
            })?;

        let target = args.get_or_undefined(0);
        let held_value = args.get_or_undefined(1);
        let unregister_token = args.get_or_undefined(2);

        // 3. If CanBeHeldWeakly(target) is false, throw a TypeError exception.
        //
        // [`CanBeHeldWeakly ( v )`](https://tc39.es/ecma262/#sec-canbeheldweakly)
        //
        // 1. If v is an Object, return true.
        // 2. If v is a Symbol and KeyForSymbol(v) is undefined, return true.
        // 3. Return false.
        //
        // TODO: support Symbols
        let Some(target_obj) = target.as_object() else {
            return Err(js_error!(
                TypeError: "FinalizationRegistry.prototype.register: \
                    `target` must be an Object or Symbol",
            ));
        };

        // 4. If SameValue(target, heldValue) is true, throw a TypeError exception.
        if target == held_value {
            return Err(js_error!(
                TypeError: "FinalizationRegistry.prototype.register: \
                    `heldValue` cannot be the same as `target`"
            ));
        }

        // 5. If CanBeHeldWeakly(unregisterToken) is false, then
        //
        // // [`CanBeHeldWeakly ( v )`](https://tc39.es/ecma262/#sec-canbeheldweakly)
        //
        // 1. If v is an Object, return true.
        // 2. If v is a Symbol and KeyForSymbol(v) is undefined, return true.
        // 3. Return false.
        //
        // TODO: support Symbols
        let unregister_token = match unregister_token.variant() {
            JsVariant::Object(obj) => Some(WeakGc::new(obj.inner())),
            // b. Set unregisterToken to empty.
            JsVariant::Undefined => None,
            // a. If unregisterToken is not undefined, throw a TypeError exception.
            _ => {
                return Err(js_error!(
                    TypeError: "FinalizationRegistry.prototype.register: \
                        `unregisterToken` must be an Object, a Symbol, or undefined",
                ));
            }
        };

        // 6. Let cell be the Record { [[WeakRefTarget]]: target, [[HeldValue]]: heldValue, [[UnregisterToken]]: unregisterToken }.
        let cell = RegistryCell {
            target: Ephemeron::new(
                target_obj.inner(),
                CleanupSignaler(Cell::new(Some(
                    registry.cleanup_notifier.clone().downgrade(),
                ))),
            ),
            held_value: held_value.clone(),
            unregister_token,
        };

        // 7. Append cell to finalizationRegistry.[[Cells]].
        registry.cells.push(cell);

        // 8. Return undefined.
        Ok(JsValue::undefined())
    }

    /// [`FinalizationRegistry.prototype.unregister ( unregisterToken )`][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-finalization-registry.prototype.unregister
    fn unregister(this: &JsValue, args: &[JsValue], _context: &mut Context) -> JsResult<JsValue> {
        // 1. Let finalizationRegistry be the this value.
        // 2. Perform ? RequireInternalSlot(finalizationRegistry, [[Cells]]).
        let this = this.as_object();
        let mut registry = this
            .as_ref()
            .and_then(JsObject::downcast_mut::<Self>)
            .ok_or_else(|| {
                js_error!(
                    TypeError: "FinalizationRegistry.prototype.register: \
                    invalid object type for `this`",
                )
            })?;

        // 3. If CanBeHeldWeakly(unregisterToken) is false, throw a TypeError exception.\
        //
        // // [`CanBeHeldWeakly ( v )`](https://tc39.es/ecma262/#sec-canbeheldweakly)
        //
        // 1. If v is an Object, return true.
        // 2. If v is a Symbol and KeyForSymbol(v) is undefined, return true.
        // 3. Return false.
        //
        // TODO: support Symbols
        let unregister_token = args.get_or_undefined(0).as_object();
        let unregister_token = unregister_token
            .as_ref()
            .map(JsObject::inner)
            .ok_or_else(|| {
                js_error!(
                    TypeError: "FinalizationRegistry.prototype.unregister: \
                                `unregisterToken` must be an Object or a Symbol.",
                )
            })?;

        // 4. Let removed be false.
        let mut removed = false;
        let mut i = 0;
        // 5. For each Record { [[WeakRefTarget]], [[HeldValue]], [[UnregisterToken]] } cell of finalizationRegistry.[[Cells]], do
        while i < registry.cells.len() {
            let cell = &registry.cells[i];

            // a. If cell.[[UnregisterToken]] is not empty and SameValue(cell.[[UnregisterToken]], unregisterToken) is true, then
            if let Some(tok) = cell.unregister_token.as_ref()
                && let Some(tok) = tok.upgrade()
                && Gc::ptr_eq(&tok, unregister_token)
            {
                // i. Remove cell from finalizationRegistry.[[Cells]].
                let cell = registry.cells.swap_remove(i);
                let _key = cell.target.key();
                // TODO: it might be better to add a special ref for the value that
                // also preserves the original key instead.
                cell.target.value().and_then(|v| v.0.take());

                // ii. Set removed to true.
                removed = true;
            } else {
                i += 1;
            }
        }

        // 6. Return removed.
        Ok(removed.into())
    }

    /// Abstract operation [`CleanupFinalizationRegistry ( finalizationRegistry )`][spec].
    ///
    /// Cleans up all the cells of the finalization registry that are determined to be
    /// unreachable by the garbage collector.
    ///
    /// # Panics
    ///
    /// Panics if `obj` is not a `FinalizationRegistry` object.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-cleanup-finalization-registry
    pub(crate) fn cleanup(
        obj: &JsObject<FinalizationRegistry>,
        context: &mut Context,
    ) -> JsResult<()> {
        // 1. Assert: finalizationRegistry has [[Cells]] and [[CleanupCallback]] internal slots.
        // let obj = obj.borrow_mut();
        // let registry = obj.data_mut();

        // 2. Let callback be finalizationRegistry.[[CleanupCallback]].
        let callback = std::mem::replace(
            &mut obj.borrow_mut().data_mut().callback,
            JobCallback::new(context.intrinsics().objects().throw_type_error(), ()),
        );

        let mut i = 0;
        let result = loop {
            if i >= obj.borrow().data().cells.len() {
                break Ok(());
            }
            // 3. While finalizationRegistry.[[Cells]] contains a Record cell such that cell.[[WeakRefTarget]] is empty, an implementation may perform the following steps:
            if obj.borrow().data().cells[i].target.has_value() {
                i += 1;
            } else {
                // a. Choose any such cell.
                // b. Remove cell from finalizationRegistry.[[Cells]].
                let cell = obj.borrow_mut().data_mut().cells.swap_remove(i);
                // c. Perform ? HostCallJobCallback(callback, undefined, « cell.[[HeldValue]] »).
                let result = context.host_hooks().call_job_callback(
                    &callback,
                    &JsValue::undefined(),
                    slice::from_ref(&cell.held_value),
                    context,
                );

                if let Err(err) = result {
                    break Err(err);
                }
            }
        };

        obj.borrow_mut().data_mut().callback = callback;

        // 4. Return unused.
        result
    }
}
