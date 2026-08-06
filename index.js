import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { registerRootComponent } from 'expo';

/**
 * Entry point.
 *
 * `App` is required rather than imported so that a throw during its module
 * evaluation is catchable. Anything that fails while the bundle is being
 * evaluated — a native module whose JS and native halves disagree, a missing
 * autolinked package, a bad top-level call — happens before React mounts, so
 * the `ErrorBoundary` inside `App` cannot see it. Uncaught, it takes the
 * process down: the app installs, the icon appears, and tapping it returns to
 * the launcher with nothing on screen to say why.
 *
 * Catching it here costs nothing when the app is healthy, and turns that
 * silent failure into a readable message on the device.
 */
let Root;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Root = require('./App').default;
} catch (error) {
  console.error('[startup] the app module failed to evaluate', error);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { StartupFailure } = require('./src/app/StartupFailure');
  Root = function StartupFailureRoot() {
    return <StartupFailure error={error} />;
  };
}

registerRootComponent(Root);
