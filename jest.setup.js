/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en', languageTag: 'en-IN' }],
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => 'test-uuid-0000-0000-0000-000000000000',
}));

jest.mock('expo-constants', () => ({
  default: { expoConfig: { name: 'GLP Care', version: '1.0.0', extra: {} } },
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
