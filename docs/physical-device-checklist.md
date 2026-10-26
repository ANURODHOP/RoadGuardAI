# Physical Device Demonstration Checklist

Use this checklist during live assessment and physical smartphone evaluation of RoadGuard.

---

## 1. Pre-Demonstration Verification

- [ ] Android device connected to Wi-Fi or Cellular data.
- [ ] Developer Options & USB Debugging enabled on device.
- [ ] Device detected in terminal: `adb devices`.
- [ ] Application built and launched: `RoadGuard` app icon appears on phone home screen.
- [ ] Supabase credentials configured in mobile `.env`.

---

## 2. Permissions Verification

- [ ] **Camera Permission**: Launching "Capture" prompts for camera access with descriptive reason.
- [ ] **Location Permission**: Launching location capture requests foreground fine location.
- [ ] **Denial Handling**: If location is denied, user is informed and presented with manual location entry.

---

## 3. Real-Time Offline Inference Test (The Airplane Mode Test)

1. Turn on **Airplane Mode** on the Android device (disconnect Wi-Fi, Cellular, Bluetooth).
2. Open RoadGuard and navigate to the **Capture** tab.
3. Photograph a suspected road surface damage or select an image from the device gallery.
4. Observe the detection processing:
   - [ ] Spinner indicates "Analyzing road surface..."
   - [ ] YOLOv8n ONNX model executes completely on CPU/NPU on-device with 0 network calls.
   - [ ] Inference time is displayed in milliseconds (typically 10-60 ms on modern mobile chipsets).
   - [ ] Bounding boxes render accurately over the damage with confidence badges.
5. Disable Airplane Mode to proceed with submission.

---

## 4. Honest Uncertainty & Thresholding Test

- [ ] Clear road surface (no pothole): Results in `No Pothole Detected`.
- [ ] Clear pothole image: Results in `Pothole Detected` with confidence score >= 40%.
- [ ] Blurry / ambiguous patch: Results in `Uncertain / Low Confidence` (25% - 39%).
- [ ] Verify that uncertain results are labeled transparently and submitted with `pending_verification` tag.

---

## 5. Geospatial Duplicate Detection Test

1. Capture GPS coordinates at current location.
2. Advance to the **Nearby Reports** screen.
3. Observe duplicate screening:
   - [ ] If no complaints exist within 30 meters: Displays `Likely New Complaint`.
   - [ ] If a prior complaint was seeded or reported within 30 meters:
     - Displays `Potential Duplicate Found`.
     - Shows existing complaint ID, distance in meters, and damage type.
     - Offers citizen the option to "Support Existing Report" or "Continue as Separate Report".

---

## 6. End-to-End Submission & Administrator Review

1. Complete report submission from mobile app.
2. Verify immediate confirmation screen with assigned Complaint ID.
3. Open Administrator Dashboard (`http://localhost:3000` or production URL).
4. Log in with admin credentials.
5. In **Complaints Table**, find the newly submitted complaint:
   - [ ] Inspect citizen photo with signed URL viewer.
   - [ ] Check AI confidence score and GPS coordinates.
   - [ ] Change status to `Verified` -> `Assigned` -> `In Progress` -> `Resolved`.
   - [ ] Add resolution note.
6. Return to mobile app under **My Reports**:
   - [ ] Verify status automatically updates to `Resolved` with resolution details.
