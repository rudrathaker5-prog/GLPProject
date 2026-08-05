module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './src',
            '@core': './src/core',
            '@features': './src/features',
            '@ui': './src/ui',
            '@integrations': './src/integrations',
            '@i18n': './src/i18n',
          },
        },
      ],
      'react-native-worklets/plugin',
    ],
  };
};
