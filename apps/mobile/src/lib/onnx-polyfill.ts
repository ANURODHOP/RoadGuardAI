import { NativeModules } from 'react-native'

// Polyfill for onnxruntime-react-native in environments without custom native C++ code (e.g. Expo Go).
// onnxruntime-react-native's binding.ts calls Module.install() unconditionally if globalThis.OrtApi is undefined.
// In Expo Go, NativeModules.Onnxruntime is null, which throws an uncaught TypeError on startup.

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

if (NativeModules && !NativeModules.Onnxruntime) {
  NativeModules.Onnxruntime = {
    install: () => {
      // No-op fallback
    },
  }
}
