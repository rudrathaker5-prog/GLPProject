import { act, create } from 'react-test-renderer';

/**
 * The app mounts.
 *
 * `moduleEval` proves nothing throws while the bundle is being evaluated; this
 * proves React then gets far enough to produce a tree. Together they cover the
 * two ways the app can die before anyone sees a screen — and both had to be
 * discovered by installing an APK, because nothing in the suite rendered
 * anything above the level of a single component.
 *
 * Native modules are mocked by jest-expo, so a green run here is not a promise
 * that a given phone is happy. It is a promise that the JavaScript is.
 */

/*
  The first render pulls the entire module graph through the jest-expo
  transform: ~2s locally with a warm cache, but 14s on a cold CI runner against
  Jest's 5s default, which is what failed the first build. Generous on purpose —
  a real hang still fails here, just later.
*/
const MOUNT_TIMEOUT_MS = 120_000;

describe('app root', () => {
  it(
    'renders without throwing',
    async () => {
      // Required lazily so a module-scope failure surfaces as this test failing
      // rather than as the whole suite failing to load.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const App = require('../../../App').default as () => React.ReactElement;

      let tree: ReturnType<typeof create> | undefined;
      await act(async () => {
        tree = create(<App />);
      });

      expect(tree).toBeDefined();
      expect(tree!.toJSON()).not.toBeNull();

      await act(async () => {
        tree!.unmount();
      });
    },
    MOUNT_TIMEOUT_MS,
  );
});
