import { act, create } from 'react-test-renderer';

/**
 * A broken audio module costs the microphone, not the app.
 *
 * `moduleEval` proves `VoiceRecorder` is the only file importing `expo-audio`.
 * That is the isolation; this is the behaviour. It simulates the exact failure
 * that shipped — `expo-audio` throwing while its module is evaluated, which is
 * what happens when `AudioModule.AudioPlayer` is undefined — and asserts the
 * button renders nothing rather than propagating.
 *
 * Without this, the quarantine could be intact while the guarded require still
 * rethrew, and the app would die at launch exactly as before.
 */
describe('VoiceInputButton when the audio module is unavailable', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('renders nothing instead of throwing', () => {
    jest.doMock('../VoiceRecorder', () => {
      throw new TypeError("Cannot read properties of undefined (reading 'prototype')");
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { VoiceInputButton } = require('../VoiceInputButton');

    let tree: ReturnType<typeof create> | undefined;
    expect(() => {
      act(() => {
        tree = create(<VoiceInputButton language="en" onTranscript={() => undefined} />);
      });
    }).not.toThrow();

    expect(tree!.toJSON()).toBeNull();
  });

  it('renders the recorder when the module loads', () => {
    jest.doMock('../VoiceRecorder', () => ({
      VoiceRecorder: () => null,
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { VoiceInputButton } = require('../VoiceInputButton');

    expect(() => {
      act(() => {
        create(<VoiceInputButton language="en" onTranscript={() => undefined} />);
      });
    }).not.toThrow();
  });
});
