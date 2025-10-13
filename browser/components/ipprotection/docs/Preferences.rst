Preferences
===========

This document describes preferences affecting Firefox's IP Protection.
These preferences are normally hidden and should not be used unless you really
know what you are doing.

``browser.ipProtection.enabled`` (boolean, default: ``false``)
  Controls the entire feature.

``browser.ipProtection.autoStartEnabled`` (boolean, default: ``false``)
  Enables the auto‑start feature.

``browser.ipProtection.log`` (boolean, default: ``false``)
  Enable/disable logging.

``browser.ipProtection.stateCache`` (string, default: ``""``)
  Caches the latest ``IPProtectionStates`` value for use during startup.

``browser.ipProtection.entitlementCache`` (string, default: ``""``)
  Cached entitlement JSON string used during startup to avoid network requests.

``browser.ipProtection.cacheDisabled`` (boolean, default: ``false``)
  For testing; disables caching of the entitlement and the state.

``browser.ipProtection.guardian.endpoint`` (string, default: ``"https://vpn.mozilla.org/"``)
  Endpoint for the server‑side infrastructure.

``browser.ipProtection.exceptionsMode`` (string, default: ``"all"``)
  Defines which network requests are processed. Default: all.

``browser.ipProtection.domainExclusions`` (string)
  Comma‑separated list of domains to exclude from the proxy.

``browser.ipProtection.userEnabled`` (boolean, default: ``false``)
  For testing; simulates user‑enabled state.
