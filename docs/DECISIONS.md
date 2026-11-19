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
