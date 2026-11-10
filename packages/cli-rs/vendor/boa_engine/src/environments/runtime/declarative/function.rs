use boa_ast::scope::Scope;
use boa_gc::{Finalize, GcRefCell, Trace, custom_trace};
use std::cell::RefCell;

use crate::{JsNativeError, JsObject, JsResult, JsValue, builtins::function::OrdinaryFunction};

#[derive(Debug, Trace, Finalize)]
pub(crate) struct FunctionEnvironment {
    bindings: GcRefCell<Vec<Option<JsValue>>>,
    #[unsafe_ignore_trace]
    deletable_bindings: RefCell<Vec<bool>>,
    #[unsafe_ignore_trace]
    deleted_bindings: RefCell<Vec<bool>>,
    slots: Box<FunctionSlots>,

    // Safety: Nothing in `Scope` needs tracing.
    #[unsafe_ignore_trace]
    scope: Scope,
}

impl FunctionEnvironment {
    /// Creates a new `FunctionEnvironment`.
    pub(crate) fn new(bindings_count: u32, slots: FunctionSlots, scope: Scope) -> Self {
        Self {
            bindings: GcRefCell::new(vec![None; bindings_count as usize]),
            deletable_bindings: RefCell::new(vec![false; bindings_count as usize]),
            deleted_bindings: RefCell::new(vec![false; bindings_count as usize]),
            slots: Box::new(slots),
            scope,
        }
    }

    /// Gets the slots of this function environment.
    pub(crate) const fn slots(&self) -> &FunctionSlots {
        &self.slots
    }

    /// Gets the compile time environment of this function environment.
    pub(crate) const fn compile(&self) -> &Scope {
        &self.scope
    }

    /// Gets the binding value from the environment by it's index.
    ///
    /// # Panics
    ///
    /// Panics if the binding value is out of range or not initialized.
    #[track_caller]
    pub(crate) fn get(&self, index: u32) -> Option<JsValue> {
        self.bindings.borrow()[index as usize].clone()
    }

    /// Sets the binding value from the environment by index.
    ///
    /// # Panics
    ///
    /// Panics if the binding value is out of range.
    #[track_caller]
    pub(crate) fn set(&self, index: u32, value: JsValue) {
        self.bindings.borrow_mut()[index as usize] = Some(value);
    }

    pub(crate) fn extend_from_compile(&self) {
        let compile_bindings_len = self.scope.num_bindings() as usize;
        let mut bindings = self.bindings.borrow_mut();
        let bindings_len = bindings.len();

        if compile_bindings_len <= bindings_len {
            return;
        }

        bindings.resize(compile_bindings_len, None);

        let mut deletable_bindings = self.deletable_bindings.borrow_mut();
        deletable_bindings.resize(compile_bindings_len, false);
        deletable_bindings[bindings_len..].fill(true);

        self.deleted_bindings
            .borrow_mut()
            .resize(compile_bindings_len, false);
    }

    pub(crate) fn is_deleted_binding(&self, index: u32) -> bool {
        self.deleted_bindings
            .borrow()
            .get(index as usize)
            .copied()
            .unwrap_or_default()
    }

    #[track_caller]
    pub(crate) fn restore_deleted_binding(&self, index: u32) {
        let index = index as usize;
        if let Some(deleted) = self.deleted_bindings.borrow_mut().get_mut(index) {
            *deleted = false;
        }
    }

    #[track_caller]
    pub(crate) fn delete_binding(&self, index: u32) -> bool {
        let index = index as usize;

        if self
            .deleted_bindings
            .borrow()
            .get(index)
            .copied()
            .unwrap_or_default()
        {
            return true;
        }

        if !self
            .deletable_bindings
            .borrow()
            .get(index)
            .copied()
            .unwrap_or_default()
        {
            return false;
        }

        self.bindings.borrow_mut()[index] = None;
        self.deleted_bindings.borrow_mut()[index] = true;
        true
    }

    /// `BindThisValue`
    ///
    /// Sets the given value as the `this` binding of the environment.
    /// Returns `false` if the `this` binding has already been initialized.
    ///
    /// More information:
    ///  - [ECMAScript specification][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-bindthisvalue
    pub(crate) fn bind_this_value(&self, value: JsObject) -> JsResult<()> {
        let mut this = self.slots.this.borrow_mut();
        match &*this {
            ThisBindingStatus::Lexical => {
                unreachable!("1. Assert: envRec.[[ThisBindingStatus]] is not lexical.")
            }
            ThisBindingStatus::Initialized(_) => {
                // 2. If envRec.[[ThisBindingStatus]] is initialized, throw a ReferenceError exception.
                return Err(JsNativeError::reference()
                    .with_message("cannot reinitialize `this` binding")
                    .into());
            }
            ThisBindingStatus::Uninitialized => {
                // 3. Set envRec.[[ThisValue]] to V.
                // 4. Set envRec.[[ThisBindingStatus]] to initialized.
                *this = ThisBindingStatus::Initialized(value.into());
            }
        }

        // 5. Return V.
        Ok(())
    }

    /// `HasSuperBinding`
    ///
    /// Returns `true` if the environment has a `super` binding.
    ///
    /// More information:
    ///  - [ECMAScript specification][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-function-environment-records-hassuperbinding
    ///
    /// # Panics
    ///
    /// Panics if the function object of the environment is not a function.
    #[track_caller]
    pub(crate) fn has_super_binding(&self) -> bool {
        // 1.If envRec.[[ThisBindingStatus]] is lexical, return false.
        if matches!(&*self.slots.this.borrow(), ThisBindingStatus::Lexical) {
            return false;
        }

        // 2. If envRec.[[FunctionObject]].[[HomeObject]] is undefined, return false; otherwise, return true.
        self.slots
            .function_object
            .downcast_ref::<OrdinaryFunction>()
            .expect("function object must be function")
            .get_home_object()
            .is_some()
    }

    /// `HasThisBinding`
    ///
    /// Returns `true` if the environment has a `this` binding.
    ///
    /// More information:
    ///  - [ECMAScript specification][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-function-environment-records-hasthisbinding
    pub(crate) fn has_this_binding(&self) -> bool {
        // 1. If envRec.[[ThisBindingStatus]] is lexical, return false; otherwise, return true.
        !matches!(&*self.slots.this.borrow(), ThisBindingStatus::Lexical)
    }

    /// `GetThisBinding`
    ///
    /// Returns the `this` binding of the current environment.
    ///
    /// Differs slightly from the spec where lexical this (arrow functions) doesn't get asserted,
    /// but instead is returned as `None`.
    ///
    /// More information:
    ///  - [ECMAScript specification][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-function-environment-records-getthisbinding
    pub(crate) fn get_this_binding(&self) -> JsResult<Option<JsValue>> {
        match &*self.slots.this.borrow() {
            ThisBindingStatus::Lexical => Ok(None),
            // 2. If envRec.[[ThisBindingStatus]] is uninitialized, throw a ReferenceError exception.
            ThisBindingStatus::Uninitialized => Err(JsNativeError::reference()
                .with_message(
                    "Must call super constructor in derived \
                    class before accessing 'this' or returning from derived constructor",
                )
                .into()),
            // 3. Return envRec.[[ThisValue]].
            ThisBindingStatus::Initialized(this) => Ok(Some(this.clone())),
        }
    }
}

/// Describes the status of a `this` binding in function environments.
#[derive(Clone, Debug, Finalize)]
pub(crate) enum ThisBindingStatus {
    /// Function doesn't have a `this` binding. (arrow functions and async arrow functions)
    Lexical,
    /// Function has a `this` binding, but is uninitialized. (derived constructors)
    Uninitialized,
    /// Function has an initialized `this` binding. (base constructors and most callable objects)
    Initialized(JsValue),
}

unsafe impl Trace for ThisBindingStatus {
    custom_trace!(this, mark, {
        match this {
            Self::Initialized(obj) => mark(obj),
            Self::Lexical | Self::Uninitialized => {}
        }
    });
}

/// Holds the internal slots of a function environment.
#[derive(Clone, Debug, Trace, Finalize)]
pub(crate) struct FunctionSlots {
    /// The `[[ThisValue]]` and `[[ThisBindingStatus]]`  internal slots.
    this: GcRefCell<ThisBindingStatus>,

    /// The `[[FunctionObject]]` internal slot.
    function_object: JsObject,

    /// The `[[NewTarget]]` internal slot.
    new_target: Option<JsObject>,
}

impl FunctionSlots {
    /// Creates a new `FunctionSluts`.
    pub(crate) fn new(
        this: ThisBindingStatus,
        function_object: JsObject,
        new_target: Option<JsObject>,
    ) -> Self {
        Self {
            this: GcRefCell::new(this),
            function_object,
            new_target,
        }
    }

    /// Returns the value of the `[[FunctionObject]]` internal slot.
    pub(crate) const fn function_object(&self) -> &JsObject {
        &self.function_object
    }

    /// Returns the value of the `[[NewTarget]]` internal slot.
    pub(crate) const fn new_target(&self) -> Option<&JsObject> {
        self.new_target.as_ref()
    }
}
