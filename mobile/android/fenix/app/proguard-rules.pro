-dontobfuscate

####################################################################################################
# Sentry
####################################################################################################

# Recommended config via https://docs.sentry.io/clients/java/modules/android/#manual-integration
# Since we don't obfuscate, we don't need to use their Gradle plugin to upload ProGuard mappings.
-keepattributes LineNumberTable,SourceFile
-dontwarn org.slf4j.**
-dontwarn javax.**

# Our addition: this class is saved to disk via Serializable, which ProGuard doesn't like.
# If we exclude this, upload silently fails (Sentry swallows a NPE so we don't crash).
# I filed https://github.com/getsentry/sentry-java/issues/572
#
# If Sentry ever mysteriously stops working after we upgrade it, this could be why.
-keep class io.sentry.event.Event { *; }

####################################################################################################
# GeckoView built-ins
####################################################################################################

-dontwarn org.mozilla.geckoview.**

# Raptor now writes a *-config.yaml file to specify Gecko runtime settings (e.g. the profile dir). This
# file gets deserialized into a DebugConfig object, which is why we need to keep this class
# and its members.
-keep class org.mozilla.gecko.util.DebugConfig { *; }

####################################################################################################
# kotlinx.coroutines: use the fast service loader to init MainDispatcherLoader by including a rule
# to rewrite this property to return true:
# https://github.com/Kotlin/kotlinx.coroutines/blob/8c98180f177bbe4b26f1ed9685a9280fea648b9c/kotlinx-coroutines-core/jvm/src/internal/MainDispatchers.kt#L19
#
# R8 is expected to optimize the default implementation to avoid a performance issue but a bug in R8
# as bundled with AGP v7.0.0 causes this optimization to fail so we use the fast service loader instead. See:
# https://github.com/mozilla-mobile/focus-android/issues/5102#issuecomment-897854121
#
# The fast service loader appears to be as performant as the R8 optimization so it's not worth the
# churn to later remove this workaround. If needed, the upstream fix is being handled in
# https://issuetracker.google.com/issues/196302685
####################################################################################################
-assumenosideeffects class kotlinx.coroutines.internal.MainDispatcherLoader {
    boolean FAST_SERVICE_LOADER_ENABLED return true;
}

####################################################################################################
# Remove debug logs from release builds
####################################################################################################
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int d(...);
}

####################################################################################################
# Mozilla Application Services
####################################################################################################

-keep class mozilla.appservices.** { *; }

# Keep code generated from Glean Metrics
-keep class org.mozilla.fenix.GleanMetrics.** {  *; }

-dontwarn java.beans.BeanInfo
-dontwarn java.beans.FeatureDescriptor
-dontwarn java.beans.IntrospectionException
-dontwarn java.beans.Introspector
-dontwarn java.beans.PropertyDescriptor
