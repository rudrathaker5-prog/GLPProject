const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Declares the intents this app needs to *see* on Android 11+ (API 30).
 *
 * Since API 30, package visibility filtering means `PackageManager` pretends
 * other apps do not exist unless they are declared here. React Native's
 * `Linking.canOpenURL` is implemented with `resolveActivity`, so on a modern
 * phone it answers **false for `tel:`** even though the dialler is right there
 * — and every "Call doctor" button in this app would have reported
 * "This device cannot make phone calls".
 *
 * `openURL` itself is not filtered: firing an implicit intent still reaches the
 * dialler. `callNumber` no longer trusts `canOpenURL` for that reason. This
 * plugin fixes the other half, so the capability checks the app does make
 * (WhatsApp present? maps app installed?) return the truth.
 *
 * Lives as a config plugin rather than an edit to android/AndroidManifest.xml
 * because `expo prebuild` regenerates that file from scratch on every build.
 */

/** The intents and packages we need visibility of. */
const QUERY_INTENTS = [
  // Dialling a doctor — the one that matters most.
  { action: 'android.intent.action.DIAL', scheme: 'tel' },
  // Directions to a hospital.
  { action: 'android.intent.action.VIEW', scheme: 'geo' },
  // Web fallbacks: maps, meeting links, the AI provider's console.
  { action: 'android.intent.action.VIEW', scheme: 'https' },
  // Sending a prescription or report to the care team.
  { action: 'android.intent.action.SEND', mimeType: '*/*' },
];

const QUERY_PACKAGES = ['com.whatsapp', 'com.whatsapp.w4b'];

function intentNode({ action, scheme, mimeType }) {
  const data = {};
  if (scheme) data.$ = { 'android:scheme': scheme };
  if (mimeType) data.$ = { ...(data.$ ?? {}), 'android:mimeType': mimeType };
  return {
    action: [{ $: { 'android:name': action } }],
    data: [data],
  };
}

/** Key an existing intent node by action + scheme so re-runs do not duplicate. */
function intentKey(node) {
  const action = node.action?.[0]?.$?.['android:name'] ?? '';
  const scheme = node.data?.[0]?.$?.['android:scheme'] ?? '';
  const mimeType = node.data?.[0]?.$?.['android:mimeType'] ?? '';
  return `${action}|${scheme}|${mimeType}`;
}

module.exports = function withAndroidQueries(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;

    // `queries` is a sibling of `application`, directly under `manifest`.
    if (!Array.isArray(manifest.queries)) manifest.queries = [];
    if (manifest.queries.length === 0) manifest.queries.push({});
    const queries = manifest.queries[0];

    if (!Array.isArray(queries.intent)) queries.intent = [];
    if (!Array.isArray(queries.package)) queries.package = [];

    const existingIntents = new Set(queries.intent.map(intentKey));
    for (const intent of QUERY_INTENTS) {
      const node = intentNode(intent);
      if (!existingIntents.has(intentKey(node))) queries.intent.push(node);
    }

    const existingPackages = new Set(
      queries.package.map((entry) => entry.$?.['android:name']).filter(Boolean),
    );
    for (const name of QUERY_PACKAGES) {
      if (!existingPackages.has(name)) queries.package.push({ $: { 'android:name': name } });
    }

    return mod;
  });
};
