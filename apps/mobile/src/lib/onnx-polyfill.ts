// Polyfill for onnxruntime-react-native in environments without custom native C++ code (e.g. Expo Go).
// onnxruntime-react-native's binding.ts calls Module.install() if globalThis.OrtApi is undefined.
// In Expo Go, the custom native module is null, which throws an uncaught TypeError on startup.
// By defining globalThis.OrtApi beforehand, binding.ts completely skips calling Module.install().

if (typeof (globalThis as any).OrtApi === 'undefined') {
  (globalThis as any).OrtApi = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'createInferenceSession') {
          return () => {
            throw new Error(
              'ONNX Runtime native binary is not available in Expo Go. Please use a development build (npx expo run:android) or standalone APK for offline YOLO inference.'
            )
          }
        }
        return () => {
          throw new Error('ONNX Runtime native module is not available in Expo Go.')
        }
      },
    }
  )
}
