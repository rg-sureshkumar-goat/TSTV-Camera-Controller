# Cam Controller

A Mac and Windows app that replaces TSTV's Panasonic AW-RP50 for the studio's three AW-HE40 PTZ cameras.

- What it does and how it is built: [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md)
- Camera facts and commands: [docs/CAMERA_PROTOCOL.md](docs/CAMERA_PROTOCOL.md)
- Decisions made so far: [docs/DECISIONS.md](docs/DECISIONS.md)

> **Status: Checkpoint 3 (movement and lens) passed its studio test.** The app moves the selected camera (pan/tilt joystick, zoom, focus, iris, speed). Image settings, saved angles and the playlist come in later checkpoints. Installers for the crew come in Checkpoint 8. Until then, run it from source as below.

### Safety: how moves stop

Every pan/tilt, zoom and focus move stops:
- when you **let go** of the control (anywhere: a mouse-up outside the window counts),
- when the **window loses focus**, is hidden or minimized, or the app closes, crashes or hangs,
- when you **switch camera** (keys 1/2/3 or a tile) or open **Settings**,
- when the camera's **connection drops**: the stop is resent until the camera confirms it, including after the cable is plugged back in,
- if the window stops confirming that a control is still held for 0.7 s (**dead-man switch**).

After any of these safety stops, that control is **locked** until you release it and press again, so a stuck control can never restart a camera. The red **Stop all** button stops every camera at once. The app only ever sends stops for moves it started itself, so it never interrupts the RP50.

## Run it from source (Mac or Windows)

You only need to do steps 1–3 once per laptop.

1. **Install Node.js** (free): download the **LTS** installer from [nodejs.org](https://nodejs.org) and run it. Use the default options.
2. **Get the code:** on the [GitHub page](https://github.com/rg-sureshkumar-goat/TSTV-Camera-Controller), click **Code → Download ZIP** and unzip it. Or, if you use git, `git clone` the repo.
3. **Install the app's parts.** Open Terminal (Mac) or **Command Prompt** (Windows; PowerShell can block npm), go into the unzipped folder, and run:
   ```
   npm install
   ```
   This takes a minute or two and downloads about 370 MB (mostly Electron itself).
4. **Start the app:**
   ```
   npm start
   ```

To update to a newer checkpoint later, download the ZIP again (or `git pull`), then run `npm install` and `npm start`.

### Connecting to the cameras

Plug the USB-C Ethernet adapter into a free port on the same switch as the RP50. If the app shows a yellow **"no address on the camera network"** warning, follow the steps in the warning to set a manual IP (for example `192.168.0.250`, mask `255.255.255.0`).

The app starts with the studio's order: **Cam 1 = `192.168.0.13`, Cam 2 = `.11`, Cam 3 = `.12`**. To change them, go to **Settings** (or use **Find cameras** there). Settings are saved on the laptop.

## For developers

| Command | What it does |
|---|---|
| `npm start` | Build and run the app |
| `npm run dev` | Run with live reload while editing |
| `npm test` | Unit tests (protocol decoding, read-only safety gate, command queue timing, network check, settings) |
| `npm run typecheck` | TypeScript check |
| `CAMCTRL_SELFTEST=1 npm start` (with `npm run mock-cameras` running, and the app's Settings pointed at `127.0.0.1:8081–8083`) | Self-test: drives the real window with mouse and keyboard input (drag, release, window blur, camera switch, cable pull mid-move, lens commands). Watch the fake cameras' log: every MOVING must be followed by a stop. Add `CAMCTRL_DEBUG_MOTION=1` to log every move/stop the app sends |
| `npm run mock-cameras` | Three fake AW-HE40s on `127.0.0.1:8081–8083` for testing away from the studio. Type `1`/`2`/`3` + Enter to unplug/replug one. The fake cameras warn if the app ever sends a write command or sends faster than 130 ms |

Code layout:

- `src/main/camera/`: everything that talks to cameras. `protocol.ts` holds the **safety gate** (queries plus the listed movement/lens commands only). `motionController.ts` holds the **stop rules**. `commandQueue.ts` is the per-camera queue (one command at a time, 130 ms after each reply). `cameraConnection.ts` handles the heartbeat and value reading.
- `src/main/network.ts`: detects "no address on the camera network". `discovery.ts` runs **Find cameras**. `settings.ts` saves the camera IPs.
- `src/preload/`: the narrow bridge between the window and the camera code.
- `src/renderer/`: the window (React).

Built with Electron + TypeScript (see [docs/DECISIONS.md](docs/DECISIONS.md)). Everything is free and open source.
