# Probe Results — Checkpoint 1

> **Status:** probe run on 19 Nov 2026 at 15:13 CST. Found **four** Panasonic cameras: three **AW-HE40** and one **AW-HE2**. The RP50 cross-check is still open: which IPs are Cam 1, 2 and 3 on the RP50?
>
> The probe is **read-only**. It sends only query commands (`aw_cam` commands starting with `Q`, `aw_ptz` commands with no value) and plain web-page requests. Nothing moves, nothing is saved, no setting changes.
>
> Every value below has been decoded with Panasonic's *HD Integrated Camera Interface Specifications* (V1.07E). The full command reference is in [CAMERA_PROTOCOL.md](CAMERA_PROTOCOL.md).

## How to run the probe

Run it **only when no show is live**. Leave the RP50 plugged in.

1. **Write down the camera IPs from the RP50.** On the RP50, open the SYSTEM menu and note the IP address set for each camera number. Fill them into the [RP50 cross-check](#rp50-cross-check) table below.
2. **Plug in.** Connect the Mac's USB-C-to-Ethernet adapter to a free port on the **same network switch** as the RP50's blue cable.
3. **Turn Wi-Fi off and quit any VPN** (for example Tailscale). That keeps the scan on the camera network only. Last run, the probe also scanned the laptop's VPN network. It found nothing there, but it shouldn't scan it at all.
4. **Check the Mac's address.** System Settings → Network → the USB/Ethernet adapter. If it shows an address starting with `169.254`, the studio network gave no address: follow [Setting a manual IP](#setting-a-manual-ip), then come back.
5. **Run the probe.** Open Terminal and run:

   ```bash
   cd "$HOME/AI Apps/TSTV Camera Controller App"
   bash tools/tstv_camera_probe.sh
   ```

   If macOS asks whether Terminal may find devices on the local network, click **Allow**. It takes about a minute. Watch the studio monitor: **nothing should move**.

   To probe only specific cameras, put their IPs after the command:

   ```bash
   bash tools/tstv_camera_probe.sh 192.168.0.11 192.168.0.12 192.168.0.13
   ```

6. **Send the report.** Copy it to the clipboard and paste it into Claude Code, together with the RP50 IPs from step 1:

   ```bash
   pbcopy < tools/tstv_camera_probe_report.txt
   ```

7. **Afterwards**, turn Wi-Fi back on. You can leave the manual IP on the adapter; later checkpoints use the same setup.

### Setting a manual IP

Only needed if step 4 showed `169.254.x.x`.

1. The cameras are on `192.168.0.x`. The Mac needs `192.168.0.` plus a last number nothing else uses. **`192.168.0.250` worked on 19 Nov 2026.**
2. If you pick a different address, check it is free first. In Terminal: `ping -c 3 192.168.0.250`. If every line says "Request timeout", it is free.
3. System Settings → Network → the USB/Ethernet adapter → **Details…** → **TCP/IP**:
   - Configure IPv4: **Manually**
   - IP Address: `192.168.0.250`
   - Subnet Mask: `255.255.255.0`
   - Router: leave empty
4. Click **OK**, then go back to step 5 above.

## RP50 cross-check

The RP50 column is still to be filled in from the RP50's SYSTEM menu.

| RP50 camera number | IP in the RP50 SYSTEM menu | Camera found at that IP | Match? |
|---|---|---|---|
| Cam 1 | | | |
| Cam 2 | | | |
| Cam 3 | | | |
| (any other number) | | | |

Cameras found by the probe: `192.168.0.10` (AW-HE2), `192.168.0.11`, `192.168.0.12`, `192.168.0.13` (all AW-HE40).

## Run details

| | |
|---|---|
| Date and time | Thu 19 Nov 2026, 15:13:40 CST |
| Laptop | Apple Silicon Mac (Darwin arm64) |
| Laptop IP on the camera network | `192.168.0.250` on the USB Ethernet adapter (`en8`) |
| Wi-Fi | Off |
| Scan mode | Auto scan of `192.168.0.1–254` (it also scanned the VPN network, and found nothing there) |
| Devices with a web server | `192.168.0.10`, `.11`, `.12`, `.13`, all of them Panasonic cameras |

## Cameras found

| | 192.168.0.10 | 192.168.0.11 | 192.168.0.12 | 192.168.0.13 |
|---|---|---|---|---|
| Model (`QID`) | **AW-HE2** | **AW-HE40** | **AW-HE40** | **AW-HE40** |
| Software version (`QSV`) | 1.14-00-0.00 | Ver.1.03 | Ver.1.22 | Ver.1.03 |
| Web page title | AW-HE2 HD Integrated Camera | AW-HE40 HD Integrated Camera | AW-HE40 HD Integrated Camera | AW-HE40 HD Integrated Camera |
| Login required? | **No** (HTTP 200) | **No** (HTTP 200) | **No** (HTTP 200) | **No** (HTTP 200) |
| Power (`#O`) | On (`p1`) | On (`p1`) | On (`p1`) | On (`p1`) |
| RP50 camera number | ? | ? | ? | ? |

## Original image settings

The values each camera had when probed. **Checkpoint 4 restores these after testing.** The three AW-HE40s are decoded below. The AW-HE2 answered only a few of these queries (see the raw report).

| Setting | Command | .11 (HE40) | .12 (HE40) | .13 (HE40) |
|---|---|---|---|---|
| Gain | `QGU` | `14` = **12 dB** | `17` = **15 dB** | `23` = **27 dB** |
| White balance mode | `QAW` | `5` = Preset 5600K | `5` = Preset 5600K | `2` = **AWB B** |
| R gain | `QRI` | n/a in 5600K mode (`ER3`) | n/a in 5600K mode (`ER3`) | `0BE` = **+8** |
| B gain | `QBI` | n/a in 5600K mode (`ER3`) | n/a in 5600K mode (`ER3`) | `0AF` = **+5** |
| Iris auto/manual | `QRS` ¹ | `0` = Manual | `0` = Manual | `0` = Manual |
| Shutter | `QSH` | `0` = Off | `B` = **Synchro-Scan** | `0` = Off |
| Master pedestal (coarse) | `QTD` ¹ | `14` (raw) | `11` (raw) | `08` (raw) |
| Focus auto/manual | `QAF` | `0` = Manual | `0` = Manual | `0` = Manual |
| Auto focus (ptz) | `#D1` | `d10` = Off | `d10` = Off | `d10` = Off |
| Auto iris (ptz) | `#D3` | `d30` = Off | `d30` = Off | `d30` = Off |
| Preset speed | `#UPVS` | `500` | `500` | `500` |
| B pedestal | `QBS` | not supported (`ER1`) | not supported (`ER1`) | not supported (`ER1`) |
| Detail | `QDT` | not queried ² | not queried ² | not queried ² |

¹ The probe script labels these wrongly. `QRS` is **iris auto/manual**, not R pedestal. `QTD` is **master pedestal (coarse)**, not detail. `QIR` is not a Panasonic command (it answered `ER1`). See [CAMERA_PROTOCOL.md](CAMERA_PROTOCOL.md).
² The probe did not ask for detail (`QDT`) or fine master pedestal (`QTP`). Before Checkpoint 4 changes anything, the app reads and records them so they can be restored.

## Lens and position at probe time

Raw camera values (hex). Pan/tilt centre is `8000`. Zoom runs from `555` (wide) to `FFF` (tele).

| | Command | .11 (HE40) | .12 (HE40) | .13 (HE40) |
|---|---|---|---|---|
| Pan / tilt position | `#APC` | `7C38` / `7ECF` | `8A06` / `83DA` | `A315` / `7E91` |
| Zoom position | `#GZ` | `83E` | `555` (fully wide) | `938` |
| Focus position | `#GF` | `E4F` | `F4C` | `E85` |
| Iris position + mode | `#GI` | `D98`, manual | `C8A`, manual | `C4C`, manual |
| Last preset recalled | `#S` | not available (`eR2`) | not available (`eR2`) | not available (`eR2`) |

The AW-HE2 at `.10` reported its last preset as `s00` (preset 1). It refused the position and focus queries (`ER1`/`ER2`).

## Saved presets (angles) in each camera

Decoded from `#PE00` (presets 1–40), `#PE01` (41–80) and `#PE02` (81–100), reading the lowest bit as preset 1. Checkpoint 6 confirms this by recalling each one.

| Camera | Preset numbers in use | Count |
|---|---|---|
| 192.168.0.11 (HE40) | 1, 2, 3, 4, 5 | 5 |
| 192.168.0.12 (HE40) | 1, 2, 3, 4, 5, 10, 61, 62, 63 | 9 |
| 192.168.0.13 (HE40) | 1, 2, 3, 4, 5, 61, 63 | 7 |
| 192.168.0.10 (HE2) | query not supported (`ER3`) | ? |

## Worth knowing

- **The three HE40s don't match.** Cam `.13` runs at 27 dB gain with AWB B, while `.11` and `.12` run at 12 and 15 dB with the 5600K preset. `.12` alone uses Synchro-Scan shutter, which is the flicker-free setting for LED screens. This may be deliberate, but it's worth checking against what the crew expects.
- **Firmware differs.** `.11` and `.13` run Ver.1.03, `.12` runs Ver.1.22. The commands the app needs answered the same on both.

## Checkpoint 1 studio test

- [x] The report finds all three cameras. It found three AW-HE40s, plus an AW-HE2.
- [x] Each camera answers the model query (`QID`).
- [ ] The IPs match the RP50's SYSTEM menu (cross-check table above).
- [ ] Nothing moved, zoomed, refocused or changed picture during the probe.
- [ ] The RP50 still controls all three cameras afterwards.

## Raw report

From `tools/tstv_camera_probe_report.txt`. The GitHub repo is public, so hardware (MAC) addresses, the VPN address and 404 page bodies have been removed.

```
TSTV CAMERA PROBE REPORT
Run at: Thu Nov 19 15:13:40 CST 2026
Computer: Darwin arm64
---------------------------------------------------------------
1. THIS LAPTOP'S NETWORK
  utun8  ->  100.x.x.x (VPN interface)
  en8  ->  192.168.0.250

Wi-Fi network: You are not associated with an AirPort network.
Wi-Fi power is currently off.
---------------------------------------------------------------
2. SEARCHING FOR CAMERAS
  Scanning 100.x.x.1-254 (VPN interface) (about 20 seconds)...
  Scanning 192.168.0.1-254 (about 20 seconds)...
  Devices with a web server: 192.168.0.10 192.168.0.11 192.168.0.12 192.168.0.13 

  ARP table (every device this laptop has seen on the wire):
    ? (192.168.0.10) at [MAC removed] on en8 ifscope [ethernet]
    ? (192.168.0.11) at [MAC removed] on en8 ifscope [ethernet]
    ? (192.168.0.12) at [MAC removed] on en8 ifscope [ethernet]
    ? (192.168.0.13) at [MAC removed] on en8 ifscope [ethernet]
    ? (192.168.0.250) at [MAC removed] on en8 ifscope permanent [ethernet]
    ? (239.255.255.250) at [MAC removed] on en8 ifscope permanent [ethernet]
---------------------------------------------------------------
3. DEVICE DETAILS
---------------------------------------------------------------
DEVICE 192.168.0.10
  Web page: HTTP 200
  Page title: AW-HE2 HD Integrated Camera
  -> Panasonic camera control address answered (HTTP 200): OID:AW-HE2
  Camera settings (aw_cam):
    Model                  QID  ->  HTTP 200  OID:AW-HE2
    Software_version       QSV  ->  HTTP 200  OSV:1.14-00-0.00
    Gain                   QGU  ->  HTTP 200  ER1
    White_balance_mode     QAW  ->  HTTP 200  OAW:5
    R_gain                 QRI  ->  HTTP 200  ER1
    B_gain                 QBI  ->  HTTP 200  ER1
    R_pedestal             QRS  ->  HTTP 200  ORS:1
    B_pedestal             QBS  ->  HTTP 200  ER1
    Shutter_mode           QSH  ->  HTTP 200  ER1
    Detail                 QTD  ->  HTTP 200  ER1
    Focus_mode             QAF  ->  HTTP 200  ER1
    Iris_mode              QIR  ->  HTTP 200  ER1
  Pan/tilt/lens (aw_ptz):
    Power                  #O  ->  HTTP 200  p1
    Pan/Tilt_position      #APC  ->  HTTP 200  ER2:%23APC
    Zoom_position          #GZ  ->  HTTP 200  ER1
    Focus_position         #GF  ->  HTTP 200  ER1
    Iris_position          #GI  ->  HTTP 200  gi
    Focus_auto             #D1  ->  HTTP 200  ER1
    Iris_auto              #D3  ->  HTTP 200  d31
    Last_preset_recalled   #S  ->  HTTP 200  s00
    Presets_saved_1-40     #PE00  ->  HTTP 200  ER3:%23P
    Presets_saved_41-80    #PE01  ->  HTTP 200  ER3:%23P
    Presets_saved_81-100   #PE02  ->  HTTP 200  ER3:%23P
    Preset_speed           #UPVS  ->  HTTP 200  ER1
  Info file: HTTP 404  (Not Found page)
  Model/serial: HTTP 404  (Not Found page)
---------------------------------------------------------------
DEVICE 192.168.0.11
  Web page: HTTP 200
  Page title: AW-HE40 HD Integrated Camera
  -> Panasonic camera control address answered (HTTP 200): OID:AW-HE40
  Camera settings (aw_cam):
    Model                  QID  ->  HTTP 200  OID:AW-HE40
    Software_version       QSV  ->  HTTP 200  OSV:Ver.1.03
    Gain                   QGU  ->  HTTP 200  OGU:14
    White_balance_mode     QAW  ->  HTTP 200  OAW:5
    R_gain                 QRI  ->  HTTP 200  ER3:QRI
    B_gain                 QBI  ->  HTTP 200  ER3:QBI
    R_pedestal             QRS  ->  HTTP 200  ORS:0
    B_pedestal             QBS  ->  HTTP 200  ER1:QBS
    Shutter_mode           QSH  ->  HTTP 200  OSH:0
    Detail                 QTD  ->  HTTP 200  OTD:14
    Focus_mode             QAF  ->  HTTP 200  OAF:0
    Iris_mode              QIR  ->  HTTP 200  ER1:QIR
  Pan/tilt/lens (aw_ptz):
    Power                  #O  ->  HTTP 200  p1
    Pan/Tilt_position      #APC  ->  HTTP 200  aPC7C387ECF
    Zoom_position          #GZ  ->  HTTP 200  gz83E
    Focus_position         #GF  ->  HTTP 200  gfE4F
    Iris_position          #GI  ->  HTTP 200  giD980
    Focus_auto             #D1  ->  HTTP 200  d10
    Iris_auto              #D3  ->  HTTP 200  d30
    Last_preset_recalled   #S  ->  HTTP 200  eR2:S
    Presets_saved_1-40     #PE00  ->  HTTP 200  pE00000000001F
    Presets_saved_41-80    #PE01  ->  HTTP 200  pE010000000000
    Presets_saved_81-100   #PE02  ->  HTTP 200  pE020000000000
    Preset_speed           #UPVS  ->  HTTP 200  uPVS500
  Info file: HTTP 404  (Not Found page)
  Model/serial: HTTP 404  (Not Found page)
---------------------------------------------------------------
DEVICE 192.168.0.12
  Web page: HTTP 200
  Page title: AW-HE40 HD Integrated Camera
  -> Panasonic camera control address answered (HTTP 200): OID:AW-HE40
  Camera settings (aw_cam):
    Model                  QID  ->  HTTP 200  OID:AW-HE40
    Software_version       QSV  ->  HTTP 200  OSV:Ver.1.22
    Gain                   QGU  ->  HTTP 200  OGU:17
    White_balance_mode     QAW  ->  HTTP 200  OAW:5
    R_gain                 QRI  ->  HTTP 200  ER3:QRI
    B_gain                 QBI  ->  HTTP 200  ER3:QBI
    R_pedestal             QRS  ->  HTTP 200  ORS:0
    B_pedestal             QBS  ->  HTTP 200  ER1:QBS
    Shutter_mode           QSH  ->  HTTP 200  OSH:B
    Detail                 QTD  ->  HTTP 200  OTD:11
    Focus_mode             QAF  ->  HTTP 200  OAF:0
    Iris_mode              QIR  ->  HTTP 200  ER1:QIR
  Pan/tilt/lens (aw_ptz):
    Power                  #O  ->  HTTP 200  p1
    Pan/Tilt_position      #APC  ->  HTTP 200  aPC8A0683DA
    Zoom_position          #GZ  ->  HTTP 200  gz555
    Focus_position         #GF  ->  HTTP 200  gfF4C
    Iris_position          #GI  ->  HTTP 200  giC8A0
    Focus_auto             #D1  ->  HTTP 200  d10
    Iris_auto              #D3  ->  HTTP 200  d30
    Last_preset_recalled   #S  ->  HTTP 200  eR2:S
    Presets_saved_1-40     #PE00  ->  HTTP 200  pE00000000021F
    Presets_saved_41-80    #PE01  ->  HTTP 200  pE010000700000
    Presets_saved_81-100   #PE02  ->  HTTP 200  pE020000000000
    Preset_speed           #UPVS  ->  HTTP 200  uPVS500
  Info file: HTTP 404  (Not Found page)
  Model/serial: HTTP 404  (Not Found page)
---------------------------------------------------------------
DEVICE 192.168.0.13
  Web page: HTTP 200
  Page title: AW-HE40 HD Integrated Camera
  -> Panasonic camera control address answered (HTTP 200): OID:AW-HE40
  Camera settings (aw_cam):
    Model                  QID  ->  HTTP 200  OID:AW-HE40
    Software_version       QSV  ->  HTTP 200  OSV:Ver.1.03
    Gain                   QGU  ->  HTTP 200  OGU:23
    White_balance_mode     QAW  ->  HTTP 200  OAW:2
    R_gain                 QRI  ->  HTTP 200  ORI:0BE
    B_gain                 QBI  ->  HTTP 200  OBI:0AF
    R_pedestal             QRS  ->  HTTP 200  ORS:0
    B_pedestal             QBS  ->  HTTP 200  ER1:QBS
    Shutter_mode           QSH  ->  HTTP 200  OSH:0
    Detail                 QTD  ->  HTTP 200  OTD:08
    Focus_mode             QAF  ->  HTTP 200  OAF:0
    Iris_mode              QIR  ->  HTTP 200  ER1:QIR
  Pan/tilt/lens (aw_ptz):
    Power                  #O  ->  HTTP 200  p1
    Pan/Tilt_position      #APC  ->  HTTP 200  aPCA3157E91
    Zoom_position          #GZ  ->  HTTP 200  gz938
    Focus_position         #GF  ->  HTTP 200  gfE85
    Iris_position          #GI  ->  HTTP 200  giC4C0
    Focus_auto             #D1  ->  HTTP 200  d10
    Iris_auto              #D3  ->  HTTP 200  d30
    Last_preset_recalled   #S  ->  HTTP 200  eR2:S
    Presets_saved_1-40     #PE00  ->  HTTP 200  pE00000000001F
    Presets_saved_41-80    #PE01  ->  HTTP 200  pE010000500000
    Presets_saved_81-100   #PE02  ->  HTTP 200  pE020000000000
    Preset_speed           #UPVS  ->  HTTP 200  uPVS500
  Info file: HTTP 404  (Not Found page)
  Model/serial: HTTP 404  (Not Found page)
---------------------------------------------------------------
SUMMARY: found 4 Panasonic camera(s).
Report saved to: ~/AI Apps/TSTV Camera Controller App/tools/tstv_camera_probe_report.txt
```
