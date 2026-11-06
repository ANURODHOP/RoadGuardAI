// Polyfill for onnxruntime-react-native in environments without custom native C++ code (e.g. Expo Go).
// onnxruntime-react-native requires OrtApi to be present on globalThis.
// At module load time, onnxruntime-react-native/lib/index.ts calls:
// - listSupportedBackends() -> must return an array
// - initOrtOnce() -> must be a function
// - version -> must be a string

if (typeof (globalThis as any).OrtApi === 'undefined') {
  (globalThis as any).OrtApi = {
    listSupportedBackends: () => [],
    initOrtOnce: () => {},
    version: '1.24.3',
    createInferenceSession: () => {
      throw new Error(
        'ONNX Runtime native C++ binary is not bundled in Expo Go. Real offline inference runs in a standalone APK / development build.'
      )
    },
  }
}
