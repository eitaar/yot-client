module.exports = function (api) {
  api.cache(true);
  // `babel-preset-expo` wires up the react-native-worklets plugin that
  // Reanimated 4 needs, so no extra plugin entry is required here.
  return {
    presets: ['babel-preset-expo'],
  };
};
