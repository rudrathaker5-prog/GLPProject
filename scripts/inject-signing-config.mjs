#!/usr/bin/env node
/**
 * Points the Android release build at our signing keystore.
 *
 * `expo prebuild` regenerates android/app/build.gradle from scratch, and the
 * generated release buildType is signed with the *debug* key. That produces an
 * APK Android will install but that cannot be distributed. This rewrites it to
 * use the release keystore supplied through gradle.properties.
 *
 * Kept as a real script rather than an inline heredoc in the workflow: embedding
 * a multi-line script inside a YAML block scalar is how you silently break the
 * workflow file, because any line indented less than the block terminates it.
 *
 * Idempotent — safe to run twice.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const GRADLE_PATH = process.argv[2] ?? 'android/app/build.gradle';

const RELEASE_SIGNING_CONFIG = `
        release {
            if (project.hasProperty('GLPCARE_UPLOAD_STORE_FILE')) {
                storeFile file(GLPCARE_UPLOAD_STORE_FILE)
                storePassword GLPCARE_UPLOAD_STORE_PASSWORD
                keyAlias GLPCARE_UPLOAD_KEY_ALIAS
                keyPassword GLPCARE_UPLOAD_KEY_PASSWORD
            }
        }`;

let gradle;
try {
  gradle = readFileSync(GRADLE_PATH, 'utf8');
} catch {
  console.error(`Could not read ${GRADLE_PATH}. Run "expo prebuild" first.`);
  process.exit(1);
}

if (gradle.includes('GLPCARE_UPLOAD_STORE_FILE')) {
  console.log('Signing config already present — nothing to do.');
  process.exit(0);
}

if (!gradle.includes('signingConfigs {')) {
  console.error('No signingConfigs block found in build.gradle — cannot inject.');
  process.exit(1);
}

// 1. Add a `release` signing config alongside the generated `debug` one.
gradle = gradle.replace('signingConfigs {', `signingConfigs {${RELEASE_SIGNING_CONFIG}`);

// 2. Point the release buildType at it instead of the debug key.
const before = gradle;
gradle = gradle.replace(
  /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
  '$1signingConfig signingConfigs.release',
);

if (gradle === before) {
  console.error('Could not repoint the release buildType — check build.gradle by hand.');
  process.exit(1);
}

writeFileSync(GRADLE_PATH, gradle);
console.log('Release signing config injected.');
