/* eslint-env jest */

// Reanimated 4 runs on react-native-worklets, whose `.native` entry point
// expects a real TurboModule and throws under Jest. The `resolver` entry in
// this project's jest config points at the resolver worklets ships for exactly
// this purpose — it strips the `.native` extension for worklets modules so the
// portable implementation is picked up instead. No module mock is needed.

// Gesture Handler's own jest setup registers its native module stubs.
require('react-native-gesture-handler/jestSetup');
