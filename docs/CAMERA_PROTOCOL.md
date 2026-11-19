# Camera Protocol

The confirmed camera facts that the app's command table is built from. Sources: the studio probe of 19 Nov 2026 ([PROBE_RESULTS.md](PROBE_RESULTS.md)) and Panasonic's official documents (listed at the end).

## Summary

| | |
|---|---|
| Show cameras | **Panasonic AW-HE40** (×3), confirmed by RG. Starting order: Cam 1 = `192.168.0.11`, Cam 2 = `.12`, Cam 3 = `.13`. The order can be changed on the settings screen. |
| Other camera | **Panasonic AW-HE2** at `192.168.0.10`. **Not used by this app.** The auto-discover feature must not add it as a show camera. |
| Network | `192.168.0.x`, subnet mask `255.255.255.0`. The laptop worked at `192.168.0.250` with a manual IP. |
| Login | **None.** Every control and query command answered HTTP 200 with no username or password. On these cameras, User auth is off. |
| Control | HTTP GET, `aw_ptz` (pan/tilt/lens/presets) and `aw_cam` (image settings). |
| Live video | MJPEG over HTTP (recommended), JPEG snapshots, H.264 over RTSP. NDI is a paid add-on, so it's not used. |

## Network and login

- **Subnet:** all four cameras sit in `192.168.0.10–13`. The laptop needs an address on `192.168.0.x` with mask `255.255.255.0`. On 19 Nov the laptop used `192.168.0.250`.
- **Login:** none needed. Panasonic's web-control supplement says that with **User auth OFF** (the factory setting), live video and camera control need no authentication, and only the SETUP pages need the admin login. The probe matches this: every command returned HTTP 200, and none returned 401.
  - If someone turns User auth ON later, control and video need a username/password and return 401. The app should then show a clear message rather than "camera offline".
  - That settles the brief's open question "Camera login" for now: no password is needed.

## Rules for talking to the cameras

From Panasonic's interface spec (V1.07E §3.1). The app's per-camera command queue must follow these:

1. **Leave at least 130 ms between commands** to the same camera. Commands sent faster are dropped.
2. **One HTTP request per command.** The cameras don't support Keep-Alive: each command opens and closes its own connection.
3. **Max 72 HTTP sessions** per camera at once. Not a concern for one laptop, but the app should never fire requests in parallel to one camera.
4. **Don't repeat setting commands.** Gain, white balance, shutter and similar settings are written to the camera's EEPROM, which wears out after a limited number of writes. So sliders send a value only when it changes, and never on a timer. Queries are fine to repeat.
5. **Update notifications:** at most 5 controllers can receive a camera's "something changed" pushes, and the RP50 counts as one. Plain polling with queries is safer and doesn't use up a slot.
6. **Error replies:**

   | Reply | Meaning (Panasonic spec §6) | Seen in the probe |
   |---|---|---|
   | `ER1:<cmd>` | Command not supported by this camera | `QBS`, `QIR` on HE40; many on HE2 |
   | `ER2:<cmd>` | Camera busy (or in standby) | `#APC` on HE2; `eR2:S` for `#S` on HE40 |
   | `ER3:<cmd>` | Value outside the acceptable range, or not allowed in the current mode | `QRI`/`QBI` on HE40 in 5600K mode; `#PE0x` on HE2 |

   The app treats `ER2` as "try again later", and `ER1`/`ER3` as "not available here", greying out the control instead of retrying.

**URL format** (the `#` must be sent as `%23`):
```
http://<ip>/cgi-bin/aw_ptz?cmd=%23<command>&res=1     → reply e.g. "pTS5050"
http://<ip>/cgi-bin/aw_cam?cmd=<command>&res=1        → reply e.g. "OGU:14"
```

## AW-HE40 command table

**Answered in probe** means the camera replied to that query on 19 Nov. Commands marked *write* change the camera, so per the safety rules the app may not send them before **Checkpoint 3**.

### Movement and lens (`aw_ptz`) — Checkpoint 3

| Feature | Command | Values | Answered in probe |
|---|---|---|---|
| Pan + tilt (speed) | `#PTS[pp][tt]` *write* | `01`–`49` left/down (01 = fastest), **`50` = stop**, `51`–`99` right/up (99 = fastest) | — |
| **Pan/tilt stop** | `#PTS5050` | Sent on release, on window blur, and when a connection drops | — |
| Zoom (speed) | `#Z[nn]` *write* | `01`–`49` wide, **`50` = stop**, `51`–`99` tele | — |
| Focus (speed) | `#F[nn]` *write* | `01`–`49` near, **`50` = stop**, `51`–`99` far. `ER3` when auto focus is on | — |
| Auto focus on/off | `#D1[0/1]` *write* | 0 = manual, 1 = auto | ✅ `#D1` → `d10` |
| One-push auto focus | `aw_cam` `OSE:69:1` *write* | Focuses once, then holds | — |
| Iris (position) | `#I[nn]` *write* | `01` closed – `99` open | — |
| Auto iris on/off | `#D3[0/1]` *write* (or `aw_cam ORS:[0/1]`) | 0 = manual, 1 = auto | ✅ `#D3` → `d30`, `QRS` → `ORS:0` |
| Pan/tilt position | `#APC` (query) | `aPC[pan 4 hex][tilt 4 hex]`, centre `8000` | ✅ |
| Zoom / focus / iris position | `#GZ`, `#GF`, `#GI` (query) | `555`–`FFF`. `#GI` adds a final digit: 0 = manual, 1 = auto iris | ✅ |
| All lens positions at once | `#LPI` (query) | `lPI[zoom][focus][iris]` | (not probed) |
| Power | `#O` (query) | `p0` standby, `p1` on, `p3` powering on | ✅ `p1` |

The speed control (low to high) maps the operator's speed setting onto how far from `50` the app sends, e.g. low = `50±10`, high = `50±49`.

### Saved angles (presets) — Checkpoint 6

| Feature | Command | Values | Answered in probe |
|---|---|---|---|
| Recall preset | `#R[nn]` *write* | `00`–`99` = preset 1–100 | — |
| Store preset | `#M[nn]` *write* | `00`–`99`. **Confirm step required before overwriting** | — |
| Delete preset | `#C[nn]` *write* | `00`–`99`. **Confirm step required**. In the brief and the HE2 spec, but not in the HE40 table of spec V1.07. Confirm at Checkpoint 6 | — |
| Which presets exist | `#PE00`, `#PE01`, `#PE02` (query) | `pE0x` + 10 hex digits = bitmap of presets 1–40, 41–80, 81–100 (lowest bit = lowest number) | ✅ |
| Last preset recalled | `#S` (query) | `s[nn]` | ⚠️ `eR2` (busy/no value) on all HE40s |
| Preset move speed | `#UPVS` (query) / `#UPVS[nnn]` *write* | `250` (slow) – `999` (fast) | ✅ `500` |

### Image settings (`aw_cam`) — Checkpoint 4

| Feature | Query → reply | Set (*write*) | Values (AW-HE40) | Answered in probe |
|---|---|---|---|---|
| Gain | `QGU` → `OGU:[hh]` | `OGU:[hh]` | `08` = 0 dB, then 3 dB steps (`0B` = 3 dB … `38` = 48 dB), `80` = auto. **dB = hex − 8** | ✅ 12 / 15 / 27 dB |
| Master pedestal | `QTP` → `OTP:[hhh]` | `OTP:[hhh]` | `000`–`096`–`12C` = −10…0…+10 | (not probed) |
| Master pedestal (coarse) | `QTD` → `OTD:[hh]` | `OTD:[hh]` | `00`–`1E`–`3C` = −10…0…+10. Probe values don't decode to whole steps, so the app uses `QTP` | ✅ raw `14` / `11` / `08` |
| R gain | `QRI` → `ORI:[hhh]` | `ORI:[hhh]` | `000`–`096`–`12C` = −30…0…+30. **Setting = (hex − 0x96) / 5**. Only in AWB A/B mode (`ER3` in preset modes) | ✅ `.13`: +8 |
| B gain | `QBI` → `OBI:[hhh]` | `OBI:[hhh]` | Same as R gain | ✅ `.13`: +5 |
| R/B pedestal | `QRP` / `QBP` | `ORP` / `OBP` | **Not listed for AW-HE40** (spec: HE120/HE130 only). `QBS` → `ER1` | ❌ |
| White balance mode | `QAW` → `OAW:[n]` | `OAW:[n]` | 0 = ATW, 1 = AWB A, 2 = AWB B, 4 = 3200K, 5 = 5600K, 9 = VAR | ✅ |
| Run AWB | — | `OWS` | Fails with `ER3`/`ER2` if it can't balance | — |
| Run ABB | — | `OAS` | Fails with `ER3`/`ER2` if it can't balance | — |
| Shutter | `QSH` → `OSH:[h]` | `OSH:[h]` | 0 = off, 3 = 1/100, 5 = 1/250, 6 = 1/500, 7 = 1/1000, 8 = 1/2000, 9 = 1/4000, A = 1/10000, **B = Synchro-Scan** (flicker-free for LED screens) | ✅ |
| Detail | `QDT` → `ODT:[n]` | `ODT:[n]` | 0 = off, 1 = low, 2 = high | (not probed) |
| Focus auto/manual | `QAF` → `OAF:[n]` | `OAF:[n]` | 0 = manual, 1 = auto | ✅ |
| Iris auto/manual | `QRS` → `ORS:[n]` | `ORS:[n]` | 0 = manual, 1 = auto | ✅ |
| Model / software | `QID`, `QSV` | — | `OID:AW-HE40`, `OSV:Ver.1.03` | ✅ |

Many image settings are refused (`ER3`) when the camera is in **Full Auto** mode. The app shows them greyed out in that case.

### Probe script label errors

`tools/tstv_camera_probe.sh` labels three queries wrongly. The values in PROBE_RESULTS.md use the correct meanings:

| Command | Probe label | Actual meaning |
|---|---|---|
| `QRS` | R pedestal | Iris auto/manual |
| `QTD` | Detail | Master pedestal (coarse) |
| `QIR` | Iris mode | Not a Panasonic command (`ER1`) |

## Live video options (AW-HE40)

From Panasonic's *Supplement for Web Control* (AW-HE40/UE70). With User auth off, the **Live** access level (video + control) needs no login.

| Option | URL | Details | Fit for this app |
|---|---|---|---|
| **MJPEG stream** | `http://<ip>/cgi-bin/mjpeg?resolution=640&framerate=15` | Resolution `320` / `640` / `1280` / `1920` (16:9). Frame rate `1` / `5` / `15` / `30`. Capped by the camera's WEB menu → Video over IP → JPEG settings. With no parameters: JPEG(1) resolution at 5 fps | **Recommended for Checkpoint 5.** Plain HTTP, low delay, plays natively in Electron |
| JPEG snapshot | `http://<ip>/cgi-bin/camera?resolution=640` | Same resolutions, one image per request | Good for the small Cam tile thumbnails |
| H.264 over RTSP | `rtsp://<ip>/mediainput/h264/stream_1` (to `stream_4`), port 554 | Needs "H.264 transmission" ON in the camera's WEB menu. Up to 60 fps on stream 1 | Fallback. Electron can't play RTSP by itself, so this would need bundled ffmpeg |
| NDI\|HX | — | Needs a **paid** license (about $299 per camera) | ❌ Not allowed (must be free) |
| HDMI/SDI out + capture card | — | Needs extra hardware | ❌ Not planned |

Notes for Checkpoint 5:
- The camera's own WEB menu JPEG settings limit the MJPEG stream. If the preview is choppy, check that menu (setup pages, admin login) before changing code.
- **The app must not send `#RZL`.** It changes JPEG(1)'s resolution on the camera, so it is a write command.
- Three cameras at 640×360 / 15 fps is light on the network. One full-size preview plus two small thumbnails is the target.

## AW-HE2 (`192.168.0.10`)

A compact camera with a much smaller command set. Per its own interface spec (V1.00E):
- **Pan/tilt is digital** (moves a crop of the image), not a motorised head. It refused the position query (`#APC` → `ER2`).
- **Presets 1–9 only** (`#R00`–`#R08`), not 100. The preset-list query `#PE0x` is not supported (`ER3`).
- Supports zoom (`#Z`), iris (`#AXI`, `#GI`, `#D3`), white balance mode (`QAW`) and iris auto (`QRS`). Gain, focus, shutter and detail queries returned `ER1`.
- At probe time: iris auto (`d31`, `ORS:1`), WB `OAW:5`, last preset `s00` (preset 1).

RG confirmed on 19 Nov 2026 that the HE2 is not one of the show cameras, so v1 has no control panel for it.

## Still to confirm

| Item | Confirmed by |
|---|---|
| Which AW-HE40 the crew calls Cam 1 / 2 / 3 (the RP50 doesn't show its IPs) | Checkpoint 2: assign on the settings screen, then check each tile against the studio monitor |
| Detail (`QDT`) and fine pedestal (`QTP`) original values | The app reads and logs them before Checkpoint 4 changes anything |
| Whether R/B pedestal exists on the HE40 at all | Checkpoint 4, by checking the camera's menu |
| Preset bitmap bit order, and that `#C` (delete) works on the HE40 | Checkpoint 6 |
| The 130 ms command gap is enough in practice | Checkpoint 2/3 testing |

## Sources

- Panasonic, *HD Integrated Camera Interface Specifications* V1.07E (covers AW-HE40): [PDF](https://ap.connect.panasonic.com/sites/default/files/media/document/2019-02/HDIntegratedCamera_InterfaceSpecifications-V1.07E.pdf)
- Panasonic, *Integrated Camera Interface Specifications / Supplement for Web Control* (AW-HE40/UE70): [PDF](https://eww.pass.panasonic.co.jp/pro-av/support/content/guide/DEF/HE40_UE70_CGI/Supplement_for_Web_Control-V1.00E.pdf)
- Panasonic, *AW-HE2 HD Integrated Camera Interface Specifications* V1.00E: [PDF](https://eww.pass.panasonic.co.jp/pro-av/support/content/guide/DEF/HE2_IP/HE2_HDIntegratedCamera_InterfaceSpecifications-V1.00E.pdf)
- Panasonic, NDI|HX license for PTZ cameras (paid): [page](https://connect.na.panasonic.com/av/video/software/ndi-hx)
