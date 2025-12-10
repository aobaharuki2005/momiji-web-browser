/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui

import android.os.Build
import android.view.autofill.AutofillManager
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.core.net.toUri
import androidx.test.filters.SdkSuppress
import org.junit.Before
import org.junit.Ignore
import org.junit.Rule
import org.junit.Test
import org.mozilla.fenix.customannotations.SkipLeaks
import org.mozilla.fenix.customannotations.SmokeTest
import org.mozilla.fenix.helpers.HomeActivityIntentTestRule
import org.mozilla.fenix.helpers.MatcherHelper.itemWithResId
import org.mozilla.fenix.helpers.MatcherHelper.itemWithText
import org.mozilla.fenix.helpers.TestAssetHelper.saveLoginAsset
import org.mozilla.fenix.helpers.TestAssetHelper.waitingTimeLong
import org.mozilla.fenix.helpers.TestHelper
import org.mozilla.fenix.helpers.TestHelper.exitMenu
import org.mozilla.fenix.helpers.TestHelper.mDevice
import org.mozilla.fenix.helpers.TestHelper.restartApp
import org.mozilla.fenix.helpers.TestHelper.scrollToElementByText
import org.mozilla.fenix.helpers.TestHelper.verifySnackBarText
import org.mozilla.fenix.helpers.TestHelper.waitForAppWindowToBeUpdated
import org.mozilla.fenix.helpers.TestHelper.waitUntilSnackbarGone
import org.mozilla.fenix.helpers.TestSetup
import org.mozilla.fenix.helpers.perf.DetectMemoryLeaksRule
import org.mozilla.fenix.ui.robots.browserScreen
import org.mozilla.fenix.ui.robots.clickPageObject
import org.mozilla.fenix.ui.robots.homeScreen
import org.mozilla.fenix.ui.robots.navigationToolbar
import org.mozilla.fenix.ui.robots.setPageObjectText

/**
 * Tests for verifying:
 * - the Logins and Passwords menu and sub-menus.
 * - save login prompts.
 * - saving logins based on the user's preferences.
 */
class LoginsTest : TestSetup() {
    @get:Rule
    val composeTestRule =
        AndroidComposeTestRule(
            HomeActivityIntentTestRule.withDefaultSettingsOverrides(),
        ) { it.activity }

    @get:Rule
    val memoryLeaksRule = DetectMemoryLeaksRule()

    @Before
    override fun setUp() {
        super.setUp()
        if (Build.VERSION.SDK_INT == Build.VERSION_CODES.R) {
            val autofillManager: AutofillManager =
                TestHelper.appContext.getSystemService(AutofillManager::class.java)
            autofillManager.disableAutofillServices()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2092713
    // Tests the Passwords menu items and default values
    @Test
    fun loginsAndPasswordsSettingsItemsTest() {
        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
            // Necessary to scroll a little bit for all screen sizes
            scrollToElementByText("Passwords")
        }.openLoginsAndPasswordSubMenu {
            verifyDefaultView()
            verifyAutofillInFirefoxToggle(true)
            verifyAutofillLoginsInOtherAppsToggle(false)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/517816
    // Tests only for initial state without signing in.
    // For tests after signing in, see SyncIntegration test suite
    @Test
    fun verifySavedLoginsListTest() {
        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
            // Necessary to scroll a little bit for all screen sizes
            scrollToElementByText("Passwords")
        }.openLoginsAndPasswordSubMenu {
            verifyDefaultView()
        }.openSavedLogins {
            verifySecurityPromptForLogins()
            tapSetupLater()
            // Verify that logins list is empty
            verifyEmptySavedLoginsListView(composeTestRule)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2092925
    @Test
    fun verifySyncLoginsOptionsTest() {
        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
            // Necessary to scroll a little bit for all screen sizes
            scrollToElementByText("Passwords")
        }.openLoginsAndPasswordSubMenu {
        }.openSyncLogins {
            verifyReadyToScanOption()
            verifyUseEmailOption()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/523839
    @Test
    fun saveLoginFromPromptTest() {
        val saveLoginTest = mockWebServer.saveLoginAsset

        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
        }.openSaveLoginsAndPasswordsOptions {
            verifySaveLoginsOptionsView()
        }

        exitMenu()

        navigationToolbar {
        }.enterURLAndEnterToBrowser(saveLoginTest.url) {
            clickSubmitLoginButton()
            verifySaveLoginPromptIsDisplayed()
            // Click save to save the login
            clickPageObject(itemWithText("Save"))
        }
        browserScreen {
        }.openThreeDotMenu {
        }.openSettings {
            scrollToElementByText("Passwords")
        }.openLoginsAndPasswordSubMenu {
            verifyDefaultView()
        }.openSavedLogins {
            verifySecurityPromptForLogins()
            tapSetupLater()
            // Verify that the login appears correctly
            verifySavedLoginsSectionUsername("test@example.com")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/960412
    @Test
    fun openLoginWebsiteInBrowserTest() {
        val loginPage = "https://mozilla-mobile.github.io/testapp/loginForm"
        val originWebsite = "mozilla-mobile.github.io"
        val userName = "test"
        val password = "pass"

        navigationToolbar {
        }.enterURLAndEnterToBrowser(loginPage.toUri()) {
            setPageObjectText(itemWithResId("username"), userName)
            waitForAppWindowToBeUpdated()
            setPageObjectText(itemWithResId("password"), password)
            waitForAppWindowToBeUpdated()
            clickPageObject(itemWithResId("submit"))
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Save"))
            mDevice.waitForIdle()
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
        }.openSavedLogins {
            verifySecurityPromptForLogins()
            tapSetupLater()
            viewSavedLoginDetails(composeTestRule, userName)
        }.goToSavedWebsite(composeTestRule) {
            verifyUrl(originWebsite)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/517817
    @Test
    fun neverSaveLoginFromPromptTest() {
        val saveLoginTest = mockWebServer.saveLoginAsset

        navigationToolbar {
        }.enterURLAndEnterToBrowser(saveLoginTest.url) {
            clickSubmitLoginButton()
            // Don't save the login, add to exceptions
            clickPageObject(itemWithText("Never save"))
            mDevice.waitForIdle()
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
            verifyDefaultView()
        }.openSavedLogins {
            verifySecurityPromptForLogins()
            tapSetupLater()
            // Verify that the login list is empty
            verifyEmptySavedLoginsListView(composeTestRule)
            verifyNotSavedLoginFromPrompt(composeTestRule)
        }.goBack(composeTestRule) {
        }.openLoginExceptions {
            // Verify localhost was added to exceptions list
            verifyLocalhostExceptionAdded()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1508171
    @SmokeTest
    @Test
    @SkipLeaks
    fun verifyUpdatedLoginIsSavedTest() {
        val saveLoginTest = mockWebServer.saveLoginAsset

        navigationToolbar {
        }.enterURLAndEnterToBrowser(saveLoginTest.url) {
            clickSubmitLoginButton()
            verifySaveLoginPromptIsDisplayed()
            // Click Save to save the login
            clickPageObject(itemWithText("Save"))
        }.openNavigationToolbar {
        }.enterURLAndEnterToBrowser(saveLoginTest.url) {
            enterPassword("test")
            mDevice.waitForIdle()
            clickSubmitLoginButton()
            verifySaveLoginPromptIsDisplayed()
            // Click Update to change the saved password
            clickPageObject(itemWithText("Update"))
        }.openThreeDotMenu {
        }.openSettings {
            scrollToElementByText("Passwords")
        }.openLoginsAndPasswordSubMenu {
        }.openSavedLogins {
            verifySecurityPromptForLogins()
            tapSetupLater()
            // Verify that the login appears correctly
            verifySavedLoginsSectionUsername("test@example.com")
            viewSavedLoginDetails(composeTestRule, "test@example.com")
            revealPassword(composeTestRule)
            verifyPasswordSaved(composeTestRule, "test")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1049971
    @SmokeTest
    @Test
    fun verifyMultipleLoginsSelectionsTest() {
        val loginPage = "https://mozilla-mobile.github.io/testapp/v2.0/loginForm.html"
        val firstUser = "mozilla"
        val firstPass = "firefox"
        val secondUser = "fenix"
        val secondPass = "pass"

        navigationToolbar {
        }.enterURLAndEnterToBrowser(loginPage.toUri()) {
            setPageObjectText(itemWithResId("username"), firstUser)
            waitForAppWindowToBeUpdated()
            setPageObjectText(itemWithResId("password"), firstPass)
            waitForAppWindowToBeUpdated()
            clickPageObject(itemWithResId("submit"))
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Save"))
            setPageObjectText(itemWithResId("username"), secondUser)
            waitForAppWindowToBeUpdated()
            setPageObjectText(itemWithResId("password"), secondPass)
            waitForAppWindowToBeUpdated()
            clickPageObject(itemWithResId("submit"))
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Save"))
            waitUntilSnackbarGone()
        }
        navigationToolbar {
        }.enterURLAndEnterToBrowser(loginPage.toUri()) {
            clickPageObject(itemWithResId("username"))
            clickSuggestedLoginsButton()
            verifySuggestedUserName(composeTestRule, firstUser)
            verifySuggestedUserName(composeTestRule, secondUser)
            clickSuggestedLogin(composeTestRule, firstUser)
            clickPageObject(itemWithResId("togglePassword"))
            verifyPrefilledLoginCredentials(composeTestRule, firstUser, firstPass, true)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/875849
    @Test
    @SkipLeaks(reasons = ["https://bugzilla.mozilla.org/show_bug.cgi?id=1935209"])
    fun verifyEditLoginsViewTest() {
        val loginPage = "https://mozilla-mobile.github.io/testapp/loginForm"
        val originWebsite = "https://mozilla-mobile.github.io"

        navigationToolbar {
        }.enterURLAndEnterToBrowser(loginPage.toUri()) {
            setPageObjectText(itemWithResId("username"), "mozilla")
            waitForAppWindowToBeUpdated()
            setPageObjectText(itemWithResId("password"), "firefox")
            waitForAppWindowToBeUpdated()
            clickPageObject(itemWithResId("submit"))
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Save"))
            mDevice.waitForIdle()
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
        }.openSavedLogins {
            tapSetupLater()
            viewSavedLoginDetails(composeTestRule, originWebsite)
            clickThreeDotButton(composeTestRule)
            clickEditLoginButton(composeTestRule)
            setNewPasswordWhileEditingALogin(composeTestRule, "fenix")
            saveEditedLogin(composeTestRule)
            clickThreeDotButton(composeTestRule)
            clickEditLoginButton(composeTestRule)
            verifyPasswordWhileEditingALogin(composeTestRule, "fenix")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/875851
    @Test
    fun verifyEditedLoginsAreSavedTest() {
        val loginPage = "https://mozilla-mobile.github.io/testapp/v2.0/loginForm.html"
        val originWebsite = "https://mozilla-mobile.github.io"

        navigationToolbar {
        }.enterURLAndEnterToBrowser(loginPage.toUri()) {
            waitForPageToLoad(pageLoadWaitingTime = waitingTimeLong)
            setPageObjectText(itemWithResId("username"), "mozilla")
            waitForAppWindowToBeUpdated()
            setPageObjectText(itemWithResId("password"), "firefox")
            waitForAppWindowToBeUpdated()
            clickPageObject(itemWithResId("submit"))
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Save"))
            mDevice.waitForIdle()
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
        }.openSavedLogins {
            tapSetupLater()
            viewSavedLoginDetails(composeTestRule, originWebsite)
            clickThreeDotButton(composeTestRule)
            clickEditLoginButton(composeTestRule)
            setNewUserNameWhileEditingALogin(composeTestRule, "android")
            setNewPasswordWhileEditingALogin(composeTestRule, "fenix")
            saveEditedLogin(composeTestRule)
            clickGoBackButton(composeTestRule)
        }.goBack(composeTestRule) {
        }

        exitMenu()

        browserScreen {
        }.openThreeDotMenu {
        }.refreshPage {
            waitForPageToLoad(pageLoadWaitingTime = waitingTimeLong)
            clickPageObject(itemWithResId("togglePassword"))
            verifyPrefilledLoginCredentials(composeTestRule, "android", "fenix", true)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2266452
    @Test
    @SkipLeaks(reasons = ["https://bugzilla.mozilla.org/show_bug.cgi?id=1935209"])
    fun verifyLoginWithNoUserNameCanNotBeSavedTest() {
        val loginPage = "https://mozilla-mobile.github.io/testapp/loginForm"
        val originWebsite = "https://mozilla-mobile.github.io"

        navigationToolbar {
        }.enterURLAndEnterToBrowser(loginPage.toUri()) {
            setPageObjectText(itemWithResId("username"), "mozilla")
            waitForAppWindowToBeUpdated()
            setPageObjectText(itemWithResId("password"), "firefox")
            waitForAppWindowToBeUpdated()
            clickPageObject(itemWithResId("submit"))
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Save"))
            mDevice.waitForIdle()
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
        }.openSavedLogins {
            tapSetupLater()
            viewSavedLoginDetails(composeTestRule, originWebsite)
            clickThreeDotButton(composeTestRule)
            clickEditLoginButton(composeTestRule)
            clickClearUserNameButton(composeTestRule)
            verifyUserNameRequiredErrorMessage(composeTestRule)
            verifySaveLoginButtonIsEnabled(composeTestRule, false)
            clickGoBackButton(composeTestRule)
            verifyLoginItemUsername(composeTestRule, "mozilla")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2266453
    @Test
    @SkipLeaks(reasons = ["https://bugzilla.mozilla.org/show_bug.cgi?id=1935209"])
    fun verifyLoginWithoutPasswordCanNotBeSavedTest() {
        val loginPage = "https://mozilla-mobile.github.io/testapp/loginForm"
        val originWebsite = "https://mozilla-mobile.github.io"

        navigationToolbar {
        }.enterURLAndEnterToBrowser(loginPage.toUri()) {
            setPageObjectText(itemWithResId("username"), "mozilla")
            waitForAppWindowToBeUpdated()
            setPageObjectText(itemWithResId("password"), "firefox")
            waitForAppWindowToBeUpdated()
            clickPageObject(itemWithResId("submit"))
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Save"))
            mDevice.waitForIdle()
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
        }.openSavedLogins {
            tapSetupLater()
            viewSavedLoginDetails(composeTestRule, originWebsite)
            clickThreeDotButton(composeTestRule)
            clickEditLoginButton(composeTestRule)
            clickClearPasswordButton(composeTestRule)
            verifyPasswordRequiredErrorMessage(composeTestRule)
            verifySaveLoginButtonIsEnabled(composeTestRule, false)
            clickGoBackButton(composeTestRule)
            revealPassword(composeTestRule)
            verifyPasswordSaved(composeTestRule, "firefox")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/876531
    @Test
    @SkipLeaks(reasons = ["https://bugzilla.mozilla.org/show_bug.cgi?id=1935209"])
    fun verifyEditModeDismissalDoesNotSaveLoginCredentialsTest() {
        val loginPage = "https://mozilla-mobile.github.io/testapp/loginForm"
        val originWebsite = "https://mozilla-mobile.github.io"

        navigationToolbar {
        }.enterURLAndEnterToBrowser(loginPage.toUri()) {
            setPageObjectText(itemWithResId("username"), "mozilla")
            waitForAppWindowToBeUpdated()
            setPageObjectText(itemWithResId("password"), "firefox")
            waitForAppWindowToBeUpdated()
            clickPageObject(itemWithResId("submit"))
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Save"))
            mDevice.waitForIdle()
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
        }.openSavedLogins {
            tapSetupLater()
            viewSavedLoginDetails(composeTestRule, originWebsite)
            clickThreeDotButton(composeTestRule)
            clickEditLoginButton(composeTestRule)
            setNewUserNameWhileEditingALogin(composeTestRule, "android")
            setNewPasswordWhileEditingALogin(composeTestRule, "fenix")
            clickGoBackButton(composeTestRule)
            verifyLoginItemUsername(composeTestRule, "mozilla")
            revealPassword(composeTestRule)
            verifyPasswordSaved(composeTestRule, "firefox")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/876532
    @Test
    fun verifyDeleteLoginButtonTest() {
        val loginPage = mockWebServer.saveLoginAsset

        navigationToolbar {
        }.enterURLAndEnterToBrowser(loginPage.url) {
            clickSubmitLoginButton()
            clickPageObject(itemWithText("Save"))
            mDevice.waitForIdle()
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
        }.openSavedLogins {
            tapSetupLater()
            viewSavedLoginDetails(composeTestRule, "test@example.com")
            clickThreeDotButton(composeTestRule)
            clickDeleteLoginButton(composeTestRule)
            verifyLoginDeletionPrompt(composeTestRule)
            clickCancelDeleteLogin(composeTestRule)
            verifyLoginItemUsername(composeTestRule, "test@example.com")
            viewSavedLoginDetails(composeTestRule, "test@example.com")
            clickThreeDotButton(composeTestRule)
            clickDeleteLoginButton(composeTestRule)
            verifyLoginDeletionPrompt(composeTestRule)
            clickConfirmDeleteLogin(composeTestRule)
            // The account remains displayed, see: https://bugzilla.mozilla.org/show_bug.cgi?id=1812431
            // verifyNotSavedLoginFromPrompt()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/517818
    @SmokeTest
    @Test
    @SkipLeaks(reasons = ["https://bugzilla.mozilla.org/show_bug.cgi?id=1935209"])
    fun verifyNeverSaveLoginOptionTest() {
        val loginPage = mockWebServer.saveLoginAsset

        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
        }.openSaveLoginsAndPasswordsOptions {
            clickNeverSaveOption()
        }.goBack {
        }

        exitMenu()

        navigationToolbar {
        }.enterURLAndEnterToBrowser(loginPage.url) {
            clickSubmitLoginButton()
            verifySaveLoginPromptIsNotDisplayed()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/517819
    @Test
    @SkipLeaks(reasons = ["https://bugzilla.mozilla.org/show_bug.cgi?id=1935209"])
    fun verifyAutofillToggleTest() {
        val loginPage = "https://mozilla-mobile.github.io/testapp/v2.0/loginForm.html"

        navigationToolbar {
        }.enterURLAndEnterToBrowser(loginPage.toUri()) {
            waitForPageToLoad(pageLoadWaitingTime = waitingTimeLong)
            setPageObjectText(itemWithResId("username"), "mozilla")
            waitForAppWindowToBeUpdated()
            setPageObjectText(itemWithResId("password"), "firefox")
            waitForAppWindowToBeUpdated()
            clickPageObject(itemWithResId("submit"))
            waitForPageToLoad(pageLoadWaitingTime = waitingTimeLong)
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Save"))
        }.openTabDrawer(composeTestRule) {
            closeTab()
        }

        navigationToolbar {
        }.enterURLAndEnterToBrowser(loginPage.toUri()) {
            waitForPageToLoad(pageLoadWaitingTime = waitingTimeLong)
            clickPageObject(itemWithResId("togglePassword"))
            verifyPrefilledLoginCredentials(composeTestRule, "mozilla", "firefox", true)
        }.openTabDrawer(composeTestRule) {
            closeTab()
        }

        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
            verifyAutofillInFirefoxToggle(true)
            clickAutofillInFirefoxOption()
            verifyAutofillInFirefoxToggle(false)
        }.goBack {
        }

        exitMenu()

        navigationToolbar {
        }.enterURLAndEnterToBrowser(loginPage.toUri()) {
            verifyPrefilledLoginCredentials(composeTestRule, "mozilla", "firefox", false)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/593768
    @Test
    @SkipLeaks(reasons = ["https://bugzilla.mozilla.org/show_bug.cgi?id=1935209"])
    fun doNotSaveOptionWillNotUpdateALoginTest() {
        val loginPage = "https://mozilla-mobile.github.io/testapp/v2.0/loginForm.html"
        val originWebsite = "https://mozilla-mobile.github.io"

        navigationToolbar {
        }.enterURLAndEnterToBrowser(loginPage.toUri()) {
            setPageObjectText(itemWithResId("username"), "mozilla")
            waitForAppWindowToBeUpdated()
            setPageObjectText(itemWithResId("password"), "firefox")
            waitForAppWindowToBeUpdated()
            clickPageObject(itemWithResId("submit"))
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Save"))
            waitForAppWindowToBeUpdated()
            clickPageObject(itemWithResId("togglePassword"))
            setPageObjectText(itemWithResId("username"), "mozilla")
            waitForAppWindowToBeUpdated()
            setPageObjectText(itemWithResId("password"), "fenix")
            waitForAppWindowToBeUpdated()
            clickPageObject(itemWithResId("submit"))
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Not now"))
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
        }.openSavedLogins {
            tapSetupLater()
            viewSavedLoginDetails(composeTestRule, originWebsite)
            revealPassword(composeTestRule)
            verifyPasswordSaved(composeTestRule, "firefox")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2090455
    @Test
    @SkipLeaks(reasons = ["https://bugzilla.mozilla.org/show_bug.cgi?id=1935209"])
    fun searchLoginsByUsernameTest() {
        val firstLoginPage = mockWebServer.saveLoginAsset
        val secondLoginPage = "https://mozilla-mobile.github.io/testapp/v2.0/loginForm.html"
        val originWebsite = "https://mozilla-mobile.github.io"

        navigationToolbar {
        }.enterURLAndEnterToBrowser(firstLoginPage.url) {
            clickSubmitLoginButton()
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Save"))
        }.openNavigationToolbar {
        }.enterURLAndEnterToBrowser(secondLoginPage.toUri()) {
            setPageObjectText(itemWithResId("username"), "android")
            setPageObjectText(itemWithResId("password"), "firefox")
            clickPageObject(itemWithResId("submit"))
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Save"))
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
        }.openSavedLogins {
            tapSetupLater()
            clickSearchLoginButton(composeTestRule)
            searchLogin(composeTestRule, "ANDROID")
            viewSavedLoginDetails(composeTestRule, originWebsite)
            verifyLoginItemUsername(composeTestRule, "android")
            revealPassword(composeTestRule)
            verifyPasswordSaved(composeTestRule, "firefox")
            clickGoBackButton(composeTestRule)
            clickSearchLoginButton(composeTestRule)
            searchLogin(composeTestRule, "android")
            viewSavedLoginDetails(composeTestRule, originWebsite)
            verifyLoginItemUsername(composeTestRule, "android")
            revealPassword(composeTestRule)
            verifyPasswordSaved(composeTestRule, "firefox")
            clickGoBackButton(composeTestRule)
            clickSearchLoginButton(composeTestRule)
            searchLogin(composeTestRule, "AnDrOiD")
            viewSavedLoginDetails(composeTestRule, originWebsite)
            verifyLoginItemUsername(composeTestRule, "android")
            revealPassword(composeTestRule)
            verifyPasswordSaved(composeTestRule, "firefox")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/608834
    @Test
    @SkipLeaks(reasons = ["https://bugzilla.mozilla.org/show_bug.cgi?id=1935209"])
    fun searchLoginsByUrlTest() {
        val firstLoginPage = mockWebServer.saveLoginAsset
        val secondLoginPage = "https://mozilla-mobile.github.io/testapp/v2.0/loginForm.html"
        val originWebsite = "https://mozilla-mobile.github.io"

        navigationToolbar {
        }.enterURLAndEnterToBrowser(firstLoginPage.url) {
            clickSubmitLoginButton()
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Save"))
        }.openNavigationToolbar {
        }.enterURLAndEnterToBrowser(secondLoginPage.toUri()) {
            setPageObjectText(itemWithResId("username"), "android")
            setPageObjectText(itemWithResId("password"), "firefox")
            clickPageObject(itemWithResId("submit"))
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Save"))
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
        }.openSavedLogins {
            tapSetupLater()
            clickSearchLoginButton(composeTestRule)
            searchLogin(composeTestRule, "MOZILLA")
            viewSavedLoginDetails(composeTestRule, originWebsite)
            verifyLoginItemUsername(composeTestRule, "android")
            revealPassword(composeTestRule)
            verifyPasswordSaved(composeTestRule, "firefox")
            clickGoBackButton(composeTestRule)
            clickSearchLoginButton(composeTestRule)
            searchLogin(composeTestRule, "mozilla")
            viewSavedLoginDetails(composeTestRule, originWebsite)
            verifyLoginItemUsername(composeTestRule, "android")
            revealPassword(composeTestRule)
            verifyPasswordSaved(composeTestRule, "firefox")
            clickGoBackButton(composeTestRule)
            clickSearchLoginButton(composeTestRule)
            searchLogin(composeTestRule, "MoZiLlA")
            viewSavedLoginDetails(composeTestRule, originWebsite)
            verifyLoginItemUsername(composeTestRule, "android")
            revealPassword(composeTestRule)
            verifyPasswordSaved(composeTestRule, "firefox")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2266441
    @Test
    fun verifyLastUsedLoginSortingOptionTest() {
        val firstLoginPage = mockWebServer.saveLoginAsset
        val secondLoginPage = "https://mozilla-mobile.github.io/testapp/v2.0/loginForm.html"

        navigationToolbar {
        }.enterURLAndEnterToBrowser(firstLoginPage.url) {
            clickSubmitLoginButton()
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Save"))
        }.openNavigationToolbar {
        }.enterURLAndEnterToBrowser(secondLoginPage.toUri()) {
            setPageObjectText(itemWithResId("username"), "mozilla")
            setPageObjectText(itemWithResId("password"), "firefox")
            clickPageObject(itemWithResId("submit"))
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Save"))
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
        }.openSavedLogins {
            tapSetupLater()
            clickSortPasswordsButton(composeTestRule)
            verifyLoginsSortingOptions(composeTestRule)
            clickLastUsedSortingOption(composeTestRule)
            verifySortedLogin(1, "https://mozilla-mobile.github.io")
            verifySortedLogin(2, "${firstLoginPage.url.scheme}://${firstLoginPage.url.authority}")
        }.goBack(composeTestRule) {
        }.openSavedLogins {
            verifySortedLogin(1, "https://mozilla-mobile.github.io")
            verifySortedLogin(2, "${firstLoginPage.url.scheme}://${firstLoginPage.url.authority}")
        }

        restartApp(composeTestRule.activityRule)

        browserScreen {
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
        }.openSavedLogins {
            verifySortedLogin(1, "https://mozilla-mobile.github.io")
            verifySortedLogin(2, "${firstLoginPage.url.scheme}://${firstLoginPage.url.authority}")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2266442
    @Test
    fun verifyAlphabeticalLoginSortingOptionTest() {
        val firstLoginPage = mockWebServer.saveLoginAsset
        val secondLoginPage = "https://mozilla-mobile.github.io/testapp/v2.0/loginForm.html"

        navigationToolbar {
        }.enterURLAndEnterToBrowser(firstLoginPage.url) {
            clickSubmitLoginButton()
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Save"))
        }.openNavigationToolbar {
        }.enterURLAndEnterToBrowser(secondLoginPage.toUri()) {
            setPageObjectText(itemWithResId("username"), "mozilla")
            setPageObjectText(itemWithResId("password"), "firefox")
            clickPageObject(itemWithResId("submit"))
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Save"))
            mDevice.waitForIdle()
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
        }.openSavedLogins {
            tapSetupLater()
            verifySortedLogin(1, "${firstLoginPage.url.scheme}://${firstLoginPage.url.authority}")
            verifySortedLogin(2, "https://mozilla-mobile.github.io")
        }.goBack(composeTestRule) {
        }.openSavedLogins {
            verifySortedLogin(1, "${firstLoginPage.url.scheme}://${firstLoginPage.url.authority}")
            verifySortedLogin(2, "https://mozilla-mobile.github.io")
        }

        restartApp(composeTestRule.activityRule)

        browserScreen {
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
        }.openSavedLogins {
            verifySortedLogin(1, "${firstLoginPage.url.scheme}://${firstLoginPage.url.authority}")
            verifySortedLogin(2, "https://mozilla-mobile.github.io")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1518435
    @Test
    fun verifyAddLoginManuallyTest() {
        val loginPage = "https://mozilla-mobile.github.io/testapp/v2.0/loginForm.html"

        homeScreen {
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
        }.openSavedLogins {
            tapSetupLater()
            clickAddLoginButton()
            verifyAddNewLoginView(composeTestRule)
            enterSiteCredentialWhileAddingALogin(composeTestRule, "mozilla")
            verifyHostnameErrorMessage(composeTestRule)
            enterSiteCredentialWhileAddingALogin(composeTestRule, loginPage)
            verifyHostnameClearButton(composeTestRule)
            setUserNameWhileAddingANewLogin(composeTestRule, "mozilla")
            setNewPasswordWhileAddingANewLogin(composeTestRule, "firefox")
            clickClearPasswordButton(composeTestRule)
            verifyPasswordErrorMessage(composeTestRule)
            setNewPasswordWhileAddingANewLogin(composeTestRule, "firefox")
            verifyPasswordClearButton(composeTestRule)
            saveNewLogin(composeTestRule)
            clickGoBackButton(composeTestRule)
        }.goBack(composeTestRule) {
        }

        exitMenu()

        navigationToolbar {
        }.enterURLAndEnterToBrowser(loginPage.toUri()) {
            clickPageObject(itemWithResId("username"))
            clickSuggestedLoginsButton()
            verifySuggestedUserName(composeTestRule, "mozilla")
            clickSuggestedLogin(composeTestRule, "mozilla")
            clickPageObject(itemWithResId("togglePassword"))
            verifyPrefilledLoginCredentials(composeTestRule, "mozilla", "firefox", true)
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2068215
    // The snackbar is not displayed for devices running on Android <= 12
    @Ignore("Failing, see: https://bugzilla.mozilla.org/show_bug.cgi?id=2005137")
    @Test
    @SdkSuppress(maxSdkVersion = 32)
    fun verifyCopyLoginCredentialsToClipboardTest() {
        val firstLoginPage = mockWebServer.saveLoginAsset

        navigationToolbar {
        }.enterURLAndEnterToBrowser(firstLoginPage.url) {
            clickSubmitLoginButton()
            verifySaveLoginPromptIsDisplayed()
            clickPageObject(itemWithText("Save"))
        }.openThreeDotMenu {
        }.openSettings {
        }.openLoginsAndPasswordSubMenu {
        }.openSavedLogins {
            tapSetupLater()
            viewSavedLoginDetails(composeTestRule, "test@example.com")
            clickCopyUserNameButton()
            verifySnackBarText("Username copied to clipboard")
            clickCopyPasswordButton()
            verifySnackBarText("Password copied to clipboard")
        }
    }
}
