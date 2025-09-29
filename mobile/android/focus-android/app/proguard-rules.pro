
# We do not want to obfuscate - It's just painful to debug without the right mapping file.
# If we update this, we'll have to update our Sentry config to upload ProGuard mappings.
-dontobfuscate


##### Default proguard settings:

# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /Users/sebastian/Library/Android/sdk/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

####################################################################################################
# Okhttp
####################################################################################################

# JSR 305 annotations are for embedding nullability information.
-dontwarn javax.annotation.**

# A resource is loaded with a relative path so the package of this class must be preserved.
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# Animal Sniffer compileOnly dependency to ensure APIs are compatible with older versions of Java.
-dontwarn org.codehaus.mojo.animal_sniffer.*

# OkHttp platform used only on JVM and when Conscrypt dependency is available.
-dontwarn okhttp3.internal.platform.ConscryptPlatform

####################################################################################################
# Android architecture components
####################################################################################################

-dontwarn org.mozilla.geckoview.**
-dontwarn mozilla.components.**

####################################################################################################
# Mozilla Application Services
####################################################################################################

-keep class mozilla.appservices.** { *; }

####################################################################################################
# snakeyaml
####################################################################################################

-dontwarn java.beans.PropertyDescriptor
-dontwarn java.beans.Introspector
-dontwarn java.beans.BeanInfo
-dontwarn java.beans.IntrospectionException
-dontwarn java.beans.FeatureDescriptor

####################################################################################################
# REMOVE all Log messages except warnings and errors
####################################################################################################
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int i(...);
    public static int d(...);
}
