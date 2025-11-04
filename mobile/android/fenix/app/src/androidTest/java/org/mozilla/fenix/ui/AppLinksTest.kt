/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui

import android.app.Instrumentation
import android.content.Intent
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.test.espresso.intent.Intents.intended
import androidx.test.espresso.intent.Intents.intending
import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction
import androidx.test.espresso.intent.matcher.IntentMatchers.hasDataString
import org.hamcrest.Matchers.equalTo
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mozilla.fenix.helpers.AppAndSystemHelper.assertNativeAppOpens
import org.mozilla.fenix.helpers.Constants
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.MatcherHelper.itemContainingText
import org.mozilla.fenix.helpers.MatcherHelper.itemWithResIdAndText
import org.mozilla.fenix.helpers.OpenLinksInApp
import org.mozilla.fenix.helpers.TestAssetHelper
import org.mozilla.fenix.helpers.TestAssetHelper.appLinksRedirectAsset
import org.mozilla.fenix.helpers.TestHelper.mDevice
import org.mozilla.fenix.helpers.TestSetup
import org.mozilla.fenix.helpers.perf.DetectMemoryLeaksRule
import org.mozilla.fenix.ui.robots.clickPageObject
import org.mozilla.fenix.ui.robots.navigationToolbar

class AppLinksTest : TestSetup() {
    private val youtubeSchemaUrlLink = itemContainingText("Youtube schema link")
    private val youtubeUrlLink = itemContainingText("Youtube link")
    private val intentSchemaUrlLink = itemContainingText("Intent schema link")
    private val phoneUrlLink = itemContainingText("Telephone link")
    private val formRedirectLink = itemContainingText("Telephone post navigation link")
    private val intentSchemeWithExampleAppLink = itemContainingText("Example app link")

    private val phoneSchemaLink = "tel://1234567890"

    @get:Rule
    val composeTestRule =
        AndroidComposeTestRule(
            HomeActivityIntentTestRule(openLinksInExternalApp = OpenLinksInApp.ASK),
        ) { it.activity }

    @get:Rule
    val memoryLeaksRule = DetectMemoryLeaksRule()

    lateinit var externalLinksPage: TestAssetHelper.TestAsset

    @Before
    override fun setUp() {
        super.setUp()
        externalLinksPage = mockWebServer.appLinksRedirectAsset
    }

    @Test
    fun askBeforeOpeningLinkInAppYoutubeSchemeCancelTest() {
        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(youtubeSchemaUrlLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "YouTube")
            clickPageObject(itemWithResIdAndText("android:id/button2", "Cancel"))
            mDevice.waitForIdle()
            verifyUrl(externalLinksPage.url.toString())
        }
    }

    @Test
    fun askBeforeOpeningLinkWithIntentSchemeTest() {
        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(intentSchemaUrlLink)
            mDevice.waitForIdle()
            verifyOpenLinkInAnotherAppPromptIsNotShown()
            verifyUrl(externalLinksPage.url.toString())
        }
    }

    @Test
    fun askBeforeOpeningLinkInAppYoutubeSchemeCancelMultiTapTest() {
        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(youtubeSchemaUrlLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "YouTube")
            clickPageObject(itemWithResIdAndText("android:id/button2", "Cancel"))
            mDevice.waitForIdle()
            verifyUrl(externalLinksPage.url.toString())
            clickPageObject(youtubeSchemaUrlLink)
            mDevice.waitForIdle()
            verifyUrl(externalLinksPage.url.toString())
            verifyOpenLinkInAnotherAppPromptIsNotShown()
            mDevice.waitForIdle()
            verifyUrl(externalLinksPage.url.toString())
            verifyOpenLinkInAnotherAppPromptIsNotShown()
        }
    }

    @Test
    fun askBeforeOpeningLinkInAppYoutubeSchemeCancelOnlyAffectCurrentTabTest() {
        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(youtubeSchemaUrlLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "YouTube")
            clickPageObject(itemWithResIdAndText("android:id/button2", "Cancel"))
            mDevice.waitForIdle()
            verifyUrl(externalLinksPage.url.toString())
        }.openTabDrawer(composeTestRule) {
        }.openNewTab {
        }.submitQuery(externalLinksPage.url.toString()) {
            clickPageObject(youtubeSchemaUrlLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "YouTube")
            clickPageObject(itemWithResIdAndText("android:id/button2", "Cancel"))
            mDevice.waitForIdle()
            verifyUrl(externalLinksPage.url.toString())
        }
    }

    @Test
    fun neverOpeningLinkInAppYoutubeTest() {
        composeTestRule.activityRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.NEVER
        }

        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(youtubeUrlLink)
            mDevice.waitForIdle()
            verifyOpenLinkInAnotherAppPromptIsNotShown()
            verifyUrl("youtube.com")
        }
    }

    @Test
    fun neverOpeningLinkInAppYoutubeSchemeCancelTest() {
        composeTestRule.activityRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.NEVER
        }

        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(youtubeSchemaUrlLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "YouTube")
            clickPageObject(itemWithResIdAndText("android:id/button2", "Cancel"))
            mDevice.waitForIdle()
            verifyUrl(externalLinksPage.url.toString())
        }
    }

    @Test
    fun askBeforeOpeningLinkInAppYoutubeCancelTest() {
        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(youtubeUrlLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "YouTube")
            clickPageObject(itemWithResIdAndText("android:id/button2", "Cancel"))
            mDevice.waitForIdle()
            verifyUrl("youtube.com")
        }
    }

    @Test
    fun appLinksRedirectPhoneLinkPromptTest() {
        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(phoneUrlLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "Phone")
            clickPageObject(itemWithResIdAndText("android:id/button2", "Cancel"))
            mDevice.waitForIdle()
            verifyUrl(externalLinksPage.url.toString())
        }
    }

    @Test
    fun askBeforeOpeningLinkInAppPhoneCancelTest() {
        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(phoneUrlLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "Phone")
        }
    }

    @Test
    fun alwaysOpenPhoneLinkInAppTest() {
        composeTestRule.activityRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.ALWAYS
        }

        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(phoneUrlLink)
            mDevice.waitForIdle()
            assertNativeAppOpens(Constants.PackageName.PHONE_APP, phoneSchemaLink)
        }
    }

    @Test
    fun askBeforeOpeningPhoneLinkInAcceptTest() {
        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(phoneUrlLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "Phone")
            clickPageObject(itemWithResIdAndText("android:id/button1", "Open"))
            mDevice.waitForIdle()
            assertNativeAppOpens(Constants.PackageName.PHONE_APP, phoneSchemaLink)
            mDevice.waitForIdle()
            verifyUrl(externalLinksPage.url.toString())
        }
    }

    @Test
    fun appLinksNewTabRedirectAskTest() {
        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(formRedirectLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "Phone")
        }
    }

    @Test
    fun appLinksNewTabRedirectAlwaysTest() {
        composeTestRule.activityRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.ALWAYS
        }

        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(formRedirectLink)
            mDevice.waitForIdle()
            assertNativeAppOpens(Constants.PackageName.PHONE_APP, phoneSchemaLink)
        }
    }

    @Test
    fun appLinksNewTabRedirectNeverTest() {
        composeTestRule.activityRule.applySettingsExceptions {
            it.openLinksInExternalApp = OpenLinksInApp.NEVER
        }

        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(formRedirectLink)
            verifyOpenLinkInAnotherAppPrompt(appName = "Phone")
        }
    }

    @Test
    fun marketingIntentWhenOpeningLinkWithoutApp() {
        // Use ACTION_DIAL as a non-ACTION_VIEW intent to verify that the marketing flow always
        // launches with ACTION_VIEW instead of reusing the original intent action.
        intending(hasAction(Intent.ACTION_DIAL)).respondWith(Instrumentation.ActivityResult(0, null))

        navigationToolbar {
        }.enterURLAndEnterToBrowser(externalLinksPage.url) {
            clickPageObject(intentSchemeWithExampleAppLink)
            clickPageObject(itemWithResIdAndText("android:id/button1", "Open"))
            mDevice.waitForIdle()
            intended(hasAction(Intent.ACTION_VIEW))
            intended(hasDataString(equalTo("market://details?id=com.example.app")))
        }
    }
}
