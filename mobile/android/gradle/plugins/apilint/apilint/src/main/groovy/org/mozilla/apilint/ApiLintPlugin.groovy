/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.apilint

import org.gradle.api.GradleException
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.tasks.Copy
import org.gradle.api.tasks.Exec

class ApiLintPlugin implements Plugin<Project> {
    void apply(Project project) {
        def extension = project.extensions.create('apiLint', ApiLintPluginExtension)

        Plugin android = project.getPlugins().findPlugin('android-library')

        if (!android) {
            throw new GradleException('You need the Android Library plugin to run ApiLint.')
        }

        // TODO: support applications
        project.android.libraryVariants.all { variant ->
            def name = variant.name.capitalize()
            def apiFileName = "${variant.javaCompileProvider.get().destinationDirectory.get()}/${extension.apiOutputFileName}"
            def apiFile = project.file(apiFileName)
            def variantClasspath = variant.javaCompileProvider.get().classpath

            def currentApiFile = project.file(extension.currentApiRelativeFilePath)

            def apiGenerate = project.task("apiGenerate${name}", type: ApiCompatLintTask) {
                description = "Generates API file for build variant ${name}"
                doFirst {
                    classpath = variantClasspath
                }

                source = variant.sourceSets.collect({ it.java.srcDirs })
                exclude '**/R.java'
                include '**/**.java'

                sourcePath =
                    variant.sourceSets.collect({ it.java.srcDirs }).flatten() +
                    variant.generateBuildConfigProvider.get().sourceOutputDir.asFile.get() +
                    variant.aidlCompileProvider.get().sourceOutputDir.asFile.get()

                rootDir = project.rootDir
                outputFile = apiFile
                packageFilter = extension.packageFilter
                skipClassesRegex = extension.skipClassesRegex
                destinationDir = new File(destinationDir, variant.baseName)
            }
            apiGenerate.dependsOn variant.javaCompileProvider.get()
            apiGenerate.dependsOn variant.aidlCompileProvider.get()
            apiGenerate.dependsOn variant.generateBuildConfigProvider.get()

            def apiCompatLint = project.task("apiCompatLint${name}", type: PythonExec) {
                description = "Runs API compatibility lint checks for variant ${name}"
                workingDir '.'
                scriptPath 'apilint.py'
                args '--show-noticed'
                args apiFile
                args currentApiFile
                args '--result-json'
                args project.file(
                        "${variant.javaCompileProvider.get().destinationDirectory.get()}/${extension.jsonResultFileName}")
                args '--append-json'
                args '--api-map'
                args project.file(apiFileName + ".map")
                if (extension.deprecationAnnotation != null) {
                    args '--deprecation-annotation'
                    args extension.deprecationAnnotation
                }
                if (extension.libraryVersion != null) {
                    args '--library-version'
                    args extension.libraryVersion
                }
            }

            apiCompatLint.dependsOn apiGenerate

            def apiLintSingle = project.task("apiLintSingle${name}", type: PythonExec) {
                description = "Runs API lint checks for variant ${name}"
                workingDir '.'
                scriptPath 'apilint.py'
                args apiFile
                args '--result-json'
                args project.file(
                        "${variant.javaCompileProvider.get().destinationDirectory.get()}/${extension.jsonResultFileName}")
                if (extension.lintFilters != null) {
                    args '--filter-errors'
                    args extension.lintFilters
                }
                if (extension.allowedPackages != null) {
                    args '--allowed-packages'
                    args extension.allowedPackages
                }
                if (extension.deprecationAnnotation != null) {
                    args '--deprecation-annotation'
                    args extension.deprecationAnnotation
                }
                if (extension.libraryVersion != null) {
                    args '--library-version'
                    args extension.libraryVersion
                }
                args '--api-map'
                args project.file(apiFileName + ".map")
            }

            apiCompatLint.dependsOn apiLintSingle
            apiLintSingle.dependsOn apiGenerate

            def apiLint = project.task("apiLint${name}") {
                description = "Runs API lint checks for variant ${name}"
                group = 'Verification'
            }

            if (extension.changelogFileName) {
                def apiChangelogCheck = project.task("apiChangelogCheck${name}", type: PythonExec) {
                    description = "Checks that the API changelog has been updated."
                    group = 'Verification'
                    workingDir '.'
                    scriptPath 'changelog-check.py'
                    args '--api-file'
                    args apiFile
                    args '--changelog-file'
                    args project.file(extension.changelogFileName)
                    args '--result-json'
                    args project.file(
                            "${variant.javaCompileProvider.get().destinationDirectory.get()}/${extension.jsonResultFileName}")
                }

                apiChangelogCheck.dependsOn apiGenerate
                apiChangelogCheck.dependsOn apiCompatLint
                apiLint.dependsOn apiChangelogCheck
            } else {
                apiLint.dependsOn apiLintSingle
            }

            project.tasks.check.dependsOn apiLint

            def apiDiff = project.task("apiDiff${name}", type: Exec) {
                description = "Prints the diff between the existing API and the local API."
                workingDir '.'
                commandLine 'diff'
                args '-U5'
                args currentApiFile
                args '--label', 'Existing API'
                args apiFile
                args '--label', 'Local API'

                // diff exit value is != 0 if the files are different
                ignoreExitValue true
            }

            def apiLintHelp = project.task("apiLintHelp${name}") {
                description = "Prints help for when an API change is detected."
                onlyIf {
                    apiCompatLint.state.failure != null
                }
                doLast {
                    println ""
                    println "The API has been modified. If the changes look correct, please run"
                    println ""
                    println "\$ ./gradlew apiUpdateFile${name}"
                    println ""
                    println "to update the API file."
                }
            }

            apiLintHelp.dependsOn apiDiff
            apiCompatLint.finalizedBy apiLintHelp

            def apiUpdate = project.task("apiUpdateFile${name}", type: Copy) {
                description = "Updates the API file from the local one for variant ${name}"
                group = 'Verification'
                from apiFile
                into currentApiFile.getParent()
                rename { apiFile.getName() }
            }

            apiUpdate.dependsOn apiGenerate
        }
    }
}
