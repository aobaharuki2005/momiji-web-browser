/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.lib.state

/**
 * A [Middleware] sits between the store and the reducer. It provides an extension point between
 * dispatching an action, and the moment it reaches the reducer.
 *
 * A [Middleware] can rewrite an [Action], it can intercept an [Action], dispatch additional
 * [Action]s or perform side-effects when an [Action] gets dispatched.
 *
 * The [Store] will create a chain of [Middleware] instances and invoke them in order. Every
 * [Middleware] can decide to continue the chain (by calling `next`), intercept the chain (by not
 * invoking `next`). A [Middleware] has no knowledge of what comes before or after it in the chain.
 */
typealias Middleware<S, A> = (context: MiddlewareContext<S, A>, next: (A) -> Unit, action: A) -> Unit

/**
 * The context a Middleware is running in. Allows access to privileged [Store] functionality. It is
 * passed to a [Middleware] with every [Action].
 *
 * Note that the [MiddlewareContext] should not be passed to other components and calling methods
 * on non-[Store] threads may throw an exception. Instead the value of the [store] property, granting
 * access to the underlying store, can safely be used outside of the middleware.
 */
interface MiddlewareContext<S : State, A : Action> {
    /**
     * Returns the current state of the [Store].
     */
    val state: S

    /**
     * Returns a reference to the [Store] the [Middleware] is running in.
     */
    val store: Store<S, A>
}
