# Known Limitations & Civic Technology Constraints

## Honest Representation of System Boundaries

In accordance with civic technology best practices and academic integrity standards, the RoadGuard system documents the following known limitations and operational constraints.

---

## 1. Computer Vision & Model Limitations

1. **Monocular 2D Image Depth Ambiguity**:
   - The on-device vision model operates on monocular 2D images. It cannot physically calculate pothole depth or volume without specialized LiDAR, stereo cameras, or multi-view depth sensors.
   - Puddles, fresh asphalt patches, and shadows cast by roadside foliage may occasionally present visual characteristics similar to shallow road depressions.

2. **Lighting and Adverse Weather**:
   - Detection accuracy drops under night-time conditions, extreme lens glare (facing direct sun), and during heavy rainfall where water covers surface irregularities.
   - The app mitigates this by flagging low-confidence and uncertain predictions, rather than fabricating a detection.

3. **Bundled Model Size vs. Precision Trade-off**:
   - The mobile runtime packages YOLOv8n (nano variant, input resolution 320x320, ~12.1 MB) to ensure rapid on-device execution (sub-50ms) and low battery/memory footprints on budget Android smartphones.
   - While YOLOv8x or larger backbones would achieve higher mean Average Precision (mAP), their size (~140MB+) and latency would hinder mobile deployment without server offloading.

---

## 2. Geospatial & GPS Limitations

1. **Consumer GPS Inaccuracy**:
   - Standard consumer smartphone GPS typically provides an accuracy radius of 3 to 15 meters depending on satellite visibility, urban canyons (tall buildings), and weather conditions.
   - To counteract drift, RoadGuard displays the GPS accuracy radius (`location_accuracy_m`) and provides a map pin adjustment tool for citizen corrections.

2. **Map Tiles & Tile Usage**:
   - The mobile map view and duplicate check utilize OpenStreetMap tiles via Leaflet / WebView overlays to operate freely without requiring proprietary Google Maps Android API billing keys.
   - High-frequency map requests in high-scale municipal deployments should switch to a self-hosted tile server or dedicated commercial vector map provider (Mapbox / Stadia Maps / Google Maps).

---

## 3. Storage & Network Limitations

1. **Offline Queuing of Image Uploads**:
   - While image inference and duplicate analysis algorithms run locally offline on the smartphone, final submission to the municipality database requires network access (Wi-Fi or Cellular).
   - If the user is in a remote dead-zone, the app prompts the user to save the draft locally and sync upon reconnection.

2. **Street-Level Imagery APIs**:
   - Mapillary or KartaView integrations depend on third-party commercial API availability and image coverage. In rural or newly constructed residential roads, street-level coverage may be sparse or outdated.
   - RoadGuard treats street-level imagery strictly as optional auxiliary evidence and never relies on it as the sole proof of damage.
