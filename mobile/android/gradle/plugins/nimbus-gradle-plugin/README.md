This directory contains a Gradle plugin for that wraps Nimbus FML. It was copied from https://github.com/mozilla/application-services/tree/main/tools/nimbus-gradle-plugin.
This commit holds an exact copy of the plugin - other than this paragraph in this README.
Thus, it doesn't work in this state, but exists so that `blame` etc is better able to track the history of changes across the repos.

It knows how to process feature manifest definitions and generate Kotlin bindings for the configured features.

This directory contains a Gradle plugin for that wraps Nimbus FML. It knows how to process feature manifest definitions and generate Kotlin bindings for the configured features.

This is mostly a thin wrapper around the actual code generator whose implementation lives in [A-S Nimbus FML.](https://github.com/mozilla/application-services/tree/main/components/support/nimbus-fml).
