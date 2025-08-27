/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.startupCrash

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.ComposeView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import org.mozilla.fenix.R
import org.mozilla.fenix.crashes.StartupCrashCanary
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * The [StartupCrashActivity] is the app activity launched when the ExceptionHandler is invoked
 * before the visualCompletenessQueue is ready. It will handle the crash report and app restart.
 */
class StartupCrashActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_startup_crash)

        findViewById<ComposeView>(R.id.startupCrashActivity).setContent {
            FirefoxTheme {
                StartupCrashScreen()
            }
        }
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main)) { v, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom)
            insets
        }
    }

    @Composable
    private fun StartupCrashScreen() {
        LaunchedEffect(CoroutineScope(Dispatchers.IO)) {
            StartupCrashCanary.build(applicationContext).clearCanary()
        }
        Text(text = "YOU HAVE ARRIVED AT THE STARTUP CRASH SCREEN")
    }
}
