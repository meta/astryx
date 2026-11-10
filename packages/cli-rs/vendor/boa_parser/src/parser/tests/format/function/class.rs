use crate::parser::tests::format::test_formatting;

#[test]
fn class_declaration_empty() {
    test_formatting(
        r#"
        class A {}
        "#,
    );
}

#[test]
fn class_declaration_empty_extends() {
    test_formatting(
        r#"
        class A extends Object {}
        "#,
    );
}

#[test]
fn class_declaration_constructor() {
    test_formatting(
        r#"
        class A {
            constructor(a, b, c) {
                this.value = a + b + c;
            }
        }
        "#,
    );
}

#[test]
fn class_declaration_elements() {
    test_formatting(
        r#"
        class A {
            a;
            b = 1;
            c() {}
            d(a, b, c) {
                return a + b + c;
            }
            set e(value) {}
            get e() {}
            set(a, b) {}
            get(a, b) {}
        }
        "#,
    );
}

#[test]
fn class_declaration_elements_private() {
    test_formatting(
        r#"
        class A {
            #a;
            #b = 1;
            #c() {}
            #d(a, b, c) {
                return a + b + c;
            }
            set #e(value) {}
            get #e() {}
        }
        "#,
    );
}

#[test]
fn class_declaration_elements_static() {
    test_formatting(
        r#"
        class A {
            static a;
            static b = 1;
            static c() {}
            static d(a, b, c) {
                return a + b + c;
            }
            static set e(value) {}
            static get e() {}
        }
        "#,
    );
}

#[test]
fn class_declaration_elements_private_static() {
    test_formatting(
        r#"
        class A {
            static #a;
            static #b = 1;
            static #c() {}
            static #d(a, b, c) {
                return a + b + c;
            }
            static set #e(value) {}
            static get #e() {}
        }
        "#,
    );
}

// https://github.com/boa-dev/boa/issues/4605
#[test]
fn class_declaration_boolean_literal_method_names() {
    test_formatting(
        r#"
        class A {
            true() {}
            false() {}
            null() {}
            get true() {}
            set true(value) {}
            get false() {}
            set false(value) {}
            static true() {}
            static false() {}
        }
        "#,
    );
}
