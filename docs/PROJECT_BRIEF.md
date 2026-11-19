# TSTV Cam Controller — Project Brief

Nov 19, 2026 · @RG Sureshkumar

> Transcribed from *TSTV Cam Controller — Project Brief.pdf*. This file is the source of truth for features, UI layout, technical approach and build schedule.

## Goal and current setup

Cam Controller is a Mac and Windows laptop app that replaces TSTV's Panasonic AW-RP50 controller. It controls the studio's three PTZ cameras over the network and lets one person line up camera angles for a live show.

**Why:** the RP50 is hard to use. Settings sit behind a MENU button, a two-line LCD and two unlabeled F1/F2 dials, and saved angles are numbered buttons with no names.

### Current studio setup

- Three Panasonic PTZ cameras. The exact model is unknown until the probe runs (Checkpoint 1).
- One AW-RP50 Remote Camera Controller. It connects to the camera network by Ethernet (blue cable) and drives the cameras over IP. It does not handle video.
- The RP50 controls iris, zoom, focus, pan/tilt, speed, image settings and saved angles (presets).
- Saved angles (presets) are stored in each camera, not in the RP50. The app can recall the angles the crew already saved.
- Switching between cameras on air happens on the TriCaster TC1. RiGster, the existing TSTV automation app, already drives the TC1.

### Ground rules

- Runs on Mac and Windows laptops.
- Entirely free: no paid services, licenses or hosting.
- Nothing gets installed on the cameras or the RP50.
- The RP50 stays connected as the backup. Panasonic cameras accept commands from more than one controller at once.
- RG creates the GitHub repo himself and pastes the URL into Claude Code. Claude Code never creates repos.

## Features

The app must cover every RP50 function the crew uses, each with a plain-English label instead of a menu code.

| Area | Control | What it does |
|---|---|---|
| Camera | Select camera 1, 2 or 3 | Every control below acts on the selected camera |
| Movement | Pan / tilt | Moves the camera left/right and up/down; stops the moment the control is released |
| Movement | Speed (low to high) | How fast pan, tilt, zoom and focus respond |
| Lens | Zoom (tele / wide) | Zooms in and out; variable speed |
| Lens | Focus | Manual focus, plus Auto Focus on/off and One-push Auto Focus (focus once, then hold) |
| Lens | Iris | Opens or closes the aperture (brightness), plus Auto Iris on/off |
| Image | Gain | Electronic brightness boost (adds noise) |
| Image | Pedestal | Master black level |
| Image | R/B gain | Red and blue in the highlights, for matching cameras |
| Image | R/B pedestal | Red and blue in the shadows |
| Image | AWB / ABB | Run Auto White Balance and Auto Black Balance |
| Image | Shutter | Shutter speed, including flicker-free settings for LED screens |
| Image | Detail | Edge sharpening |
| Angles | Recall | Moves the camera to a saved angle |
| Angles | Store | Saves the current shot as an angle, with a name |
| Angles | Rename / delete | Names angles ("Anchor wide") and clears old ones, with a confirm step |
| Show | Up Next playlist | An ordered list of camera angles for the show, run with one Switch Camera button |
| Status | Connection | Shows whether each camera is reachable, and its current values |

Controls that appear on the RP50 but are not needed in v1: Scene/Mode files, the camera's on-screen menu (Camera OSD), the RP50's own SETUP/SYSTEM pages and USER buttons.

## UI layout

The app is one window with three zones, taken from RG's hand-drawn mockup: a viewing and control area top left, a saved-angles grid below it, and an Up Next playlist down the right side.

**Cam Controller main screen: one window, three zones** (main screen layout · from RG's mockup)

```
+-----------------------------+  +-------------------------+  +-------------------+
|                             |  |  Camera Control Panel   |  |  Up Next Playlist |
|       Camera Display        |  |  Pan/tilt, zoom, focus, |  | [Cam 1 · Angle 2] |
|  Live view of the selected  |  |  iris, speed and image  |  | [Cam 2 · Angle 3] |
|          camera             |  |  settings               |  | [Cam 1 · Angle 4] |
|                             |  |                         |  | [+ Drag an angle  |
+-----------------------------+  +-------------------------+  |    here         ] |
[ Cam 1 (selected) ] [ Cam 2 ]   [ Cam 3 ]                     |                   |
                                                               | [ Switch Camera ] |
Saved Camera Angles (one column per camera)                    |  Runs the top     |
[ Cam 1 · Angle 1 ] [ Cam 2 · Angle 1 ] [ Cam 3 · Angle 1 ]    |  item, then the   |
[ Cam 1 · Angle 2 ] [ Cam 2 · Angle 2 ] [ Cam 3 · Angle 2 ]    |  list moves up    |
[ Cam 1 · Angle 3 ] [ Cam 2 · Angle 3 ] [ Cam 3 · Angle 3 ]    +-------------------+
```

| Zone | Position | Behavior |
|---|---|---|
| Camera Display | Top left, largest panel | Live picture from the selected camera, so the operator sees the move while making it |
| Camera Control Panel | Top, right of the display | All movement, lens and image controls for the selected camera (see Features) |
| Cam 1 / Cam 2 / Cam 3 tiles | Row under the display | Click to select which camera the panel controls; the selected tile is highlighted; each shows connection status |
| Saved Camera Angles | Grid under the tiles, one column per camera | Click a card to recall that angle; cards show the angle's name; more than 3 per camera must fit (scroll or extra rows) |
| Up Next Playlist | Right sidebar, full height | Ordered list of camera-angle cards for the show; drag cards in from the Saved Camera Angles grid; reorder by dragging; remove a card |
| Switch Camera button | Bottom of the sidebar | Runs the next angle in the playlist, then moves the list up one |

The exact meaning of Switch Camera (camera move only, or also a cut on the TriCaster) is an open question below.

## Technical approach

The app sends Panasonic's standard HTTP commands straight to each camera's IP address, the same commands the RP50 sends. No extra hardware is needed beyond the laptop's USB-C Ethernet adapter.

### Network

- The laptop plugs into a free port on the same network switch as the RP50, using a USB-C-to-Ethernet adapter (most student laptops have no Ethernet port).
- If the studio network gives no address (macOS shows a self-assigned 169.254.x.x), the laptop needs a manual IP on the cameras' subnet. The app should detect this and explain the fix in plain words.
- Camera IPs come from the probe or from the RP50's SYSTEM menu. The app also needs a settings screen to enter or auto-discover them.

### Camera control protocol (Panasonic "HD Integrated Camera Interface")

- Movement and lens: `http://<ip>/cgi-bin/aw_ptz?cmd=%23<command>&res=1`. Examples: `#PTS` pan/tilt speed, `#Z` zoom speed, `#F` focus, `#I` iris, `#R` recall preset, `#M` save preset, `#C` delete preset.
- Image settings: `http://<ip>/cgi-bin/aw_cam?cmd=<command>&res=1`. Commands that start with `Q` are read-only queries; others change settings.
- Queries read current values back so the panel always shows the camera's real state.
- Panasonic cameras drop commands sent too quickly. Each camera needs its own command queue with a minimum gap (about 130 ms, to be confirmed in testing).
- Pan, tilt, zoom and focus are speed commands: the app sends "move at speed X" on press and "stop" on release. If the app loses focus or the connection drops mid-move, it must send stop.
- The exact command list depends on the camera model. Checkpoint 1 (the probe) confirms the model and which commands answer, and Claude Code adjusts the command table to match.
- Some newer models require a username and password for control. The probe reports this.

### Saved angles

- Presets live in the cameras (up to 100 per camera). The app recalls, saves and deletes them by preset number.
- The app stores its own data locally: a name for each preset number, the camera IPs, and saved playlists. A camera knows only preset numbers, not names.

### Live camera display

- How the app gets video depends on the camera model. Candidates are the camera's built-in IP video stream (JPEG/MJPEG or RTSP) or NDI if the cameras support it. Checkpoint 5 decides, based on the probe.
- A short delay in the preview is acceptable; it is for framing, not for air.

### App platform

- Desktop app for macOS and Windows, built from one codebase. Claude Code proposes the framework (for example Electron or Tauri) and explains the tradeoff before building. It must be able to send HTTP requests to local network devices and receive video.
- Installers for Mac and Windows, built free (for example with GitHub Actions). Unsigned builds are fine; the README explains how to open an unsigned app on each system.

## Build schedule

The build runs in eight checkpoints, starting with the probe. Each ends with a test at the studio, and the next checkpoint starts only after RG confirms the test passed. There are no fixed dates: the goal is as soon as possible.

**Eight checkpoints; each must pass its test before the next starts** (build checkpoints · in order, each gated by a studio test)

```
1. Probe            -> 2. App shell             -> 3. Move and lens          -> 4. Image settings
   Find cameras,       Settings + connections      Pan, tilt, zoom, focus      Gain, color, shutter
   read only
-> 5. Camera display -> 6. Saved angles          -> 7. Up Next                -> 8. Ship it
   Live preview        Recall, store, name         Playlist + Switch Camera    Installers + show test
```

Checkpoint 1 decides the command table, login and video options that every later checkpoint uses.

**Studio test rules for every checkpoint:** test only when no show is live; keep the RP50 connected as the fallback; Claude Code commits and pushes to GitHub at the end of each checkpoint and writes a short test checklist RG can follow.

1. **Checkpoint 1: Probe (read-only)**
   - Build: commit `tools/tstv_camera_probe.sh` (already written) and add a `docs/PROBE_RESULTS.md` template. RG runs the probe at the studio and pastes the report into the repo. Claude Code reads it and writes the confirmed camera model, IPs, login requirement, supported commands and video options into `docs/CAMERA_PROTOCOL.md`.
   - Test: the report finds all three cameras, each answers the model query, and RG confirms the IPs match the RP50's SYSTEM menu. Nothing moved during the probe.
2. **Checkpoint 2: App shell and connections**
   - Build: the Mac/Windows app window with the full mockup layout (placeholders where features come later), a settings screen for the three camera IPs (with auto-discover), connection status on each Cam tile, the per-camera command queue, and the "no network address" warning.
   - Test: on both a Mac and a Windows laptop, all three tiles show connected. Unplugging the Ethernet adapter turns them red within a few seconds; plugging back in recovers without restarting.
3. **Checkpoint 3: Movement and lens**
   - Build: Camera Control Panel with pan/tilt, zoom, focus (manual, auto, one-push), iris (manual, auto) and speed, acting on the selected camera; stop on release; keyboard shortcuts for selecting cameras.
   - Test: each control moves the right camera and only that one; every move stops on release, and when the app window loses focus; the RP50 still works afterward.
4. **Checkpoint 4: Image settings**
   - Build: gain, pedestal, R/B gain, R/B pedestal, AWB, ABB, shutter and detail, each showing the camera's current value read back from it.
   - Test: change each setting and confirm the change on the studio monitor; the panel matches what the camera reports; restore the original values from the probe report afterward.
5. **Checkpoint 5: Camera display**
   - Build: live preview of the selected camera in the Camera Display, plus small thumbnails on the Cam tiles if the camera's stream allows it. Method chosen from the probe results.
   - Test: preview shows on Mac and Windows for all three cameras; switching cameras changes the preview; delay is short enough to frame shots; the app stays responsive over a 30-minute run.
6. **Checkpoint 6: Saved angles**
   - Build: the Saved Camera Angles grid showing every preset already stored in each camera; click to recall; save the current shot to a new slot with a name; rename; delete with a confirm step. Names and IPs saved locally.
   - Test: recall every existing preset and check it matches the RP50's recall of the same number; store a new angle in an unused slot; nothing already saved is overwritten without a confirm.
7. **Checkpoint 7: Up Next playlist**
   - Build: drag angle cards into the playlist, reorder, remove, Switch Camera runs the top item and moves the list up; save and load playlists per show.
   - Test: build a 6-item playlist that uses all three cameras and run it end to end; reorder mid-run; reopen the app and load the saved playlist.
8. **Checkpoint 8: Ship it**
   - Build: Mac and Windows installers built free on GitHub Actions; a crew README (install, connect, first-time setup, what to do if a camera goes red).
   - Test: a crew member who did not build it installs and sets it up from the README alone; a full off-air rehearsal; then a live show with the RP50 on standby.

## Open questions

None of these block Checkpoint 1. Claude Code should ask each one when it reaches the checkpoint that needs the answer.

- [ ] **Switch Camera:** does it only move the camera to the next angle, or should it also cut the TriCaster to that camera through RiGster? Needed by Checkpoint 7.
- [ ] **Moving a live camera:** if the next playlist item is on the camera that is on air, should the app warn, block, or just move it? Needed by Checkpoint 7.
- [ ] **Pan/tilt input:** on-screen joystick only, or also keyboard arrows and a USB game controller? Needed by Checkpoint 3.
- [ ] **Camera login:** if the probe shows the cameras need a password, who at TSTV has it? Needed by Checkpoint 2.
- [ ] **Not in v1:** is it fine to leave out Scene/Mode files, the Camera OSD menu and USER buttons for now? Needed by Checkpoint 4.
- [ ] **Playlists and the rundown:** should playlists stay inside this app, or later be linked to the rundown website RiGster uses? Needed by Checkpoint 7.
- [ ] **Who runs it:** the TD, a separate camera operator, or the producer running the show alone? This decides how simple the screen must be. Needed by Checkpoint 2.

## Claude Code starter prompt

To start: create an empty GitHub repo; make a new folder and put this brief (exported as Markdown, saved as `PROJECT_BRIEF.md`) and `tstv_camera_probe.sh` in it; open Claude Code in that folder; paste the prompt below with the repo URL filled in.

```
I'm building Cam Controller, a Mac and Windows desktop app that replaces
TSTV's Panasonic AW-RP50 camera controller for our three studio PTZ cameras.
Read PROJECT_BRIEF.md in this folder first. It is the source of truth for the
features, the UI layout, the technical approach and the build schedule.

Setup:
1. I created the GitHub repo myself. Its URL is: https://github.com/rg-sureshkumar-goat/TSTV-Camera-Controller. Connect this folder to that repo.
Never create GitHub repos yourself; if you need another one, ask me and I'll
make it and give you the URL.
2. Commit PROJECT_BRIEF.md as docs/PROJECT_BRIEF.md and tstv_camera_probe.sh
as tools/tstv_camera_probe.sh. Push to GitHub at the end of every checkpoint.

How we work:
- Follow the eight checkpoints in the brief's Build schedule, in order.
- At the end of each checkpoint, stop. Give me a short test checklist I can
run at the studio, and wait for me to confirm it passed before starting the
next checkpoint.
- When a checkpoint needs an answer from the brief's Open questions, ask me
that question first. Ask one question at a time.
- Everything must be free: no paid services, licenses or hosting. It must run
on both macOS and Windows.

Safety rules (these cameras are used on live shows):
- Until Checkpoint 3, send cameras only read-only query commands (aw_cam
commands starting with Q, aw_ptz commands with no value). Nothing may move or
change.
- Every pan, tilt, zoom and focus move must send a stop on release, when the
window loses focus, and when a connection drops.
- Never store over or delete a camera preset without a confirm step.
- Rate-limit commands per camera, as the brief describes.

Start with Checkpoint 1:
- Before writing any app code, propose the desktop framework you recommend
(for example Electron or Tauri) with a short tradeoff, and wait for my OK.
- Create docs/PROBE_RESULTS.md as a template, then tell me how to run
tools/tstv_camera_probe.sh at the studio.
- When I paste the probe report, write docs/CAMERA_PROTOCOL.md: camera model,
IPs, whether a login is required, which commands answered, and the live-video
options for that model.
```
