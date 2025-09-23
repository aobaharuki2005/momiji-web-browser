/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.base.modifier

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.tooling.preview.Preview
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.ui.icons.R as iconsR

/**
 * Default animation duration in milliseconds.
 * If it is set to a low number, the speed of the rotation will be higher.
 */
private const val DEFAULT_ANIMATION_DURATION_MS = 2000

/**
 * Adds a continuous rotation animation to current composable.
 *
 * @param durationMillis Duration of one full rotation in milliseconds. Default is [DEFAULT_ANIMATION_DURATION_MS].
 */
fun Modifier.animateRotation(durationMillis: Int = DEFAULT_ANIMATION_DURATION_MS) = composed {
    this.then(
        Modifier.rotate(rotationAnimation(durationMillis)),
    )
}

/**
 * Creates an infinite rotation animation and returns the current angle.
 *
 * @param durationMillis Duration of one full rotation in milliseconds.
 * @return Current rotation angle in degrees.
 */
@Composable
private fun rotationAnimation(durationMillis: Int): Float {
    val infiniteTransition = rememberInfiniteTransition()
    val angle by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
    )
    return angle
}

@Preview
@Composable
private fun AnimateRotationPreview() {
    var syncing by remember { mutableStateOf(false) }
    AcornTheme {
        Button(onClick = { syncing = !syncing }) {
            Icon(
                painter = painterResource(id = iconsR.drawable.mozac_ic_sync_24),
                contentDescription = null,
                modifier = if (syncing) {
                    Modifier.animateRotation()
                } else {
                    Modifier
                },
            )
        }
    }
}
