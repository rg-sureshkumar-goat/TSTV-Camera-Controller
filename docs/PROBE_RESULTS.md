# Probe Results — Checkpoint 1

> **Status: TEMPLATE, not run yet.** RG runs `tools/tstv_camera_probe.sh` at the studio and pastes the report to Claude Code. Claude Code fills in the tables below from the report and writes `docs/CAMERA_PROTOCOL.md`.
>
> The probe is **read-only**. It sends only query commands (`aw_cam` commands starting with `Q`, `aw_ptz` commands with no value) and plain web-page requests. Nothing moves, nothing is saved, no setting changes.

## How to run the probe

Run it **only when no show is live**. Leave the RP50 plugged in.

1. **Write down the camera IPs from the RP50.** On the RP50, open the SYSTEM menu and note the IP address set for Cam 1, Cam 2 and Cam 3. Fill them into the [RP50 cross-check](#rp50-cross-check) table below.
2. **Plug in.** Connect the Mac's USB-C-to-Ethernet adapter to a free port on the **same network switch** as the RP50's blue cable.
3. **Turn Wi-Fi off** (menu bar → Wi-Fi → off). This keeps the scan on the camera network only, not the campus Wi-Fi.
4. **Check the Mac's address.** System Settings → Network → the USB/Ethernet adapter. If it shows an address starting with `169.254`, the studio network gave no address: follow [Setting a manual IP](#setting-a-manual-ip), then come back.
5. **Run the probe.** Open Terminal and run:

   ```bash
   cd "$HOME/AI Apps/TSTV Camera Controller App"
   bash tools/tstv_camera_probe.sh
   ```

   If macOS asks whether Terminal may find devices on the local network, click **Allow**. It takes about a minute. Watch the studio monitor: **nothing should move**.

   If the scan finds fewer than three cameras, run it again with the IPs from the RP50 (replace these example IPs with yours):

   ```bash
   bash tools/tstv_camera_probe.sh 192.168.0.10 192.168.0.11 192.168.0.12
   ```

6. **Send the report.** Copy it to the clipboard and paste it into Claude Code, together with the RP50 IPs from step 1:

   ```bash
   pbcopy < tools/tstv_camera_probe_report.txt
   ```

7. **Put the laptop back.** If you set a manual IP, switch the adapter back to "Using DHCP". Turn Wi-Fi back on.

### Setting a manual IP

Only needed if step 4 showed `169.254.x.x`.

1. Look at the camera IPs from the RP50, e.g. `192.168.0.10`. The Mac needs an address with the **same first three numbers** and a last number nothing else uses. `250` is usually free, so `192.168.0.250`.
2. Check it is free first. In Terminal: `ping -c 3 192.168.0.250`. If every line says "Request timeout", it is free. If you get replies, try `.249`, `.248`, and so on.
3. System Settings → Network → the USB/Ethernet adapter → **Details…** → **TCP/IP**:
   - Configure IPv4: **Manually**
   - IP Address: `192.168.0.250` (your free address)
   - Subnet Mask: `255.255.255.0`
   - Router: leave empty
4. Click **OK**, then go back to step 5 above.

## RP50 cross-check

Filled in by RG from the RP50's SYSTEM menu.

| Camera | IP in the RP50 SYSTEM menu | IP found by the probe | Match? |
|---|---|---|---|
| Cam 1 | | | |
| Cam 2 | | | |
| Cam 3 | | | |

## Run details

| | |
|---|---|
| Date and time | |
| Run by | |
| Laptop (model, macOS version) | |
| Laptop IP on the camera network | |
| DHCP or manual IP? | |
| Scan mode (auto scan, or IPs given) | |

## Cameras found

Filled in by Claude Code from the report.

| | Cam 1 | Cam 2 | Cam 3 |
|---|---|---|---|
| IP | | | |
| Model (`QID`) | | | |
| Software version (`QSV`) | | | |
| Web page title / server | | | |
| Login required (HTTP 401)? | | | |
| Power (`#O`) | | | |

## Original image settings

The values each camera had when probed. **Checkpoint 4 restores these after testing.**

| Setting | Command | Cam 1 | Cam 2 | Cam 3 |
|---|---|---|---|---|
| Gain | `QGU` | | | |
| White balance mode | `QAW` | | | |
| R gain | `QRI` | | | |
| B gain | `QBI` | | | |
| R pedestal | `QRS` | | | |
| B pedestal | `QBS` | | | |
| Shutter mode | `QSH` | | | |
| Detail | `QTD` | | | |
| Focus mode | `QAF` | | | |
| Iris mode | `QIR` | | | |
| Auto focus (ptz) | `#D1` | | | |
| Auto iris (ptz) | `#D3` | | | |
| Preset speed | `#UPVS` | | | |

## Lens and position at probe time

| | Command | Cam 1 | Cam 2 | Cam 3 |
|---|---|---|---|---|
| Pan/tilt position | `#APC` | | | |
| Zoom position | `#GZ` | | | |
| Focus position | `#GF` | | | |
| Iris position | `#GI` | | | |
| Last preset recalled | `#S` | | | |

## Saved presets (angles) in each camera

Decoded from `#PE00` (presets 1–40), `#PE01` (41–80) and `#PE02` (81–100).

| Camera | Preset numbers in use | Count |
|---|---|---|
| Cam 1 | | |
| Cam 2 | | |
| Cam 3 | | |

## Checkpoint 1 studio test

- [ ] The report finds all three cameras.
- [ ] Each camera answers the model query (`QID`).
- [ ] The IPs match the RP50's SYSTEM menu (cross-check table above).
- [ ] Nothing moved, zoomed, refocused or changed picture during the probe.
- [ ] The RP50 still controls all three cameras afterwards.

## Raw report

Pasted from `tools/tstv_camera_probe_report.txt`. The GitHub repo is public, so the ARP table's hardware (MAC) addresses and the Wi-Fi network name are removed before committing.

```
(paste report here)
```
