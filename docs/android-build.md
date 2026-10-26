# Android Build & Deployment Guide

## Overview

Because RoadGuard utilizes `onnxruntime-react-native` for on-device C++ hardware-accelerated computer vision inference, standard Expo Go cannot be used for the final ML runtime. Instead, an **Expo Development Build** or standalone **Release APK** must be generated.

---

## Prerequisites

1. **Android SDK & Build Tools**:
   - Android SDK platform: Android 14+ (API 34/35/36).
   - Android NDK: Installed and located in `ANDROID_HOME/ndk` or `ANDROID_NDK_ROOT`.
   - Java Development Kit: JDK 17 or JDK 21 LTS (`JAVA_HOME` configured).
2. **Node.js**:
   - Node 20 LTS or Node 22+.
3. **Physical Android Device**:
   - USB Debugging enabled under Developer Options.

---

## Method 1: Local Prebuild & Run via ADB (Recommended for Testing)

Run the following commands from the root or `apps/mobile`:

```bash
# 1. Navigate to mobile directory
cd apps/mobile

# 2. Generate native Android project files
npx expo prebuild --platform android

# 3. Connect Android phone via USB and verify ADB recognizes it
adb devices

# 4. Build and install directly onto connected device
npx expo run:android --device
```

---

## Method 2: Standalone Release APK Build (Gradle)

To produce an installable `.apk` file directly:

```bash
cd apps/mobile

# 1. Run prebuild if android/ directory does not exist yet
npx expo prebuild --platform android

# 2. Build release APK via Gradle wrapper
cd android
./gradlew assembleRelease

# On Windows PowerShell:
# .\gradlew.bat assembleRelease
```

The compiled APK will be located at:
`apps/mobile/android/app/build/outputs/apk/release/app-release-unsigned.apk`

---

## Method 3: Cloud / Local EAS Build

If Expo Application Services (EAS CLI) is installed:

```bash
# 1. Install EAS CLI globally if not already installed
npm install -g eas-cli

# 2. Build locally without cloud queue:
eas build --platform android --profile preview --local
```

---

## Troubleshooting Common Native Issues

1. **`NDK at ... did not have a source.properties file`**:
   - Ensure `ndkVersion` in `apps/mobile/android/build.gradle` matches your installed NDK version (e.g., `27.1.12297006`).
2. **`Model asset not found`**:
   - Verify `apps/mobile/assets/models/pothole_yolov8n.onnx` is present before executing `expo prebuild`.
3. **Out of Memory during Gradle build**:
   - Add `org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m` to `apps/mobile/android/gradle.properties`.
