---
description: Deep binary inspection of a built APK — checks every native .so library for 16 KB page-size alignment.
---

# /inspect-apk

Deep binary inspection of a built APK — checks every native `.so` library for 16 KB page-size alignment.

Dispatches to the `inspect-apk` skill.

**Usage:**
- `/inspect-apk` — auto-discover APK under `android/app/build/outputs/apk/`
- `/inspect-apk /path/to/app.apk` — inspect a specific APK

Pass all arguments through to the skill unchanged.
