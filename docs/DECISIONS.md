# Decisions

Choices made during the build, with the reason, so later checkpoints follow them.

## 2026-11-19 · Desktop framework: Electron + TypeScript

**Approved by RG at Checkpoint 1.**

- **What:** Electron, written in TypeScript. Installers are built for free on GitHub Actions (unsigned).
- **Why Electron over Tauri:**
  - It uses the same browser engine (Chromium) on Mac and Windows, so the live preview, playlist drag-and-drop and game controller input behave the same on both. Tauri uses Safari's engine on Mac and Edge's on Windows.
  - Camera commands and the per-camera command queue run in Electron's main (Node) process, outside the window. If the window loses focus, freezes or crashes, the main process still sends stop.
  - The whole app is one language, and building it only needs Node.js, with no Rust toolchain. That makes it easier for future TSTV students to maintain.
  - Video: MJPEG plays directly. RTSP-only cameras can be handled by bundling the free ffmpeg.
- **Cost accepted:** a larger download (about 100 MB, against about 10 MB for Tauri) and higher memory use.

## 2026-11-19 · Who runs the app: a separate camera operator

**Answered by RG before Checkpoint 2** (brief's open question "Who runs it").

- **What:** on show day, a dedicated camera operator runs Cam Controller. The TD and producer don't.
- **Effect on the design:** the main screen can show the full Camera Control Panel at once, with no "simple mode" and nothing hidden behind toggles. Labels stay in plain English, and keyboard shortcuts are a convenience, not the main way to work.

## 2026-11-19 · Camera login: none needed

**Answered by the Checkpoint 1 probe** (brief's open question "Camera login").

- All three AW-HE40s accept control and video with no username or password (User auth is off). The app needs no login screen in v1. If a camera starts replying HTTP 401, the app says so plainly instead of calling it offline.

## 2026-11-19 · Camera order: Cam 1 = .13, Cam 2 = .11, Cam 3 = .12

**Confirmed by RG at the Checkpoint 2 studio test**, which passed on Mac and Windows.

| Crew camera | IP |
|---|---|
| Cam 1 | `192.168.0.13` |
| Cam 2 | `192.168.0.11` |
| Cam 3 | `192.168.0.12` |

These are now the app's default settings, so a fresh install starts in the right order. The fake cameras (`npm run mock-cameras`) use the same order.
