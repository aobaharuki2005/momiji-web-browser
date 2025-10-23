State Machine
=============

The finite state machine is implemented in the ``IPProtectionService`` class
and the states are defined in the ``IPProtectionStates`` object.

States
------

The service transitions across the following states:

- ``UNINITIALIZED``: Service not initialized or feature disabled.
- ``UNAVAILABLE``: User not eligible (Nimbus) or signed out with no eligibility; UI hidden.
- ``UNAUTHENTICATED``: User signed out but eligible; UI shows login.
- ``ENROLLING``: User signed in and eligible; enrollment in progress.
- ``READY``: Ready to activate the proxy.
- ``ACTIVE``: Proxy is active.
- ``ERROR``: An error occurred (see ``IPProtectionService.errors``).

High‑level transitions
----------------------

- Feature disabled → ``UNINITIALIZED``.
- During startup, if initialization isn’t complete, use cached state from ``IPPStartupCache``.
- Not signed in → ``UNAVAILABLE`` if not eligible, otherwise ``UNAUTHENTICATED``.
- Proxy already active → ``ACTIVE``.
- If an entitlement is cached/valid → ``READY``.
- Otherwise, check enrollment with Guardian:
  - Not enrolled → ``UNAVAILABLE`` (not eligible) or ``ENROLLING`` (eligible).
  - Enrolled → fetch entitlement; if successful → ``READY``, else ``UNAVAILABLE`` when not eligible.

Events and integration points
-----------------------------

- ``IPProtectionService:StateChanged`` is dispatched on state changes with
  ``detail.state`` and ``detail.prevState``.
- Helpers can call ``IPProtectionService.updateState()`` to request a recomputation.
- Public actions: ``start(userAction)``, ``stop(userAction)``, ``maybeEnroll()``,
  ``resetAccount()``, and ``startLoginFlow(browser)``.
