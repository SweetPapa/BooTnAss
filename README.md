# BOOT N ASS

**3D On-Rails Neon Arcade Space Shooter** built with Three.js, TypeScript, Web Audio, and **Tauri v2** for macOS, Windows, and Linux.

## Downloads

Grab the latest signed native desktop installer from [GitHub Releases](https://github.com/SweetPapa/BooTnAss/releases/latest):

- **macOS (Apple Silicon & Intel)**: `BOOT-N-ASS-*-macos-arm64.dmg` / `BOOT-N-ASS-*-macos-x64.dmg` *(Developer ID signed & notarized)*
- **Windows (x64)**: `BOOT-N-ASS-*-windows-x64-setup.exe` *(Azure Trusted Signing Authenticode)*
- **Linux (x64)**: `BOOT-N-ASS-*-linux-amd64.deb` / `BOOT-N-ASS-*-linux-x86_64.AppImage`

## Features

- **3 High-Octane Neon Sectors** with dynamic curved rail tracks, racing turbo slalom gates, and cosmic landmarks.
- **3 Distinct Multi-Phase Bosses**:
  - **Aegis Dreadnought** — armored orbital carrier with tracking wing turrets shielding the central reactor core and telegraphed laser sweeps.
  - **Octa-Core Sentinel** — sacred-geometry monolith defended by rotating wireframe prism shields shattered via barrel-roll reflections and a rotating X-Cross laser cage.
  - **Solaris Leviathan** — 7-segment articulated cyber-dragon weaving in 3D figure-8 patterns with snapping jaws and solar hyper-beams.
- **Zorp's Hangar & Boot Bucks** — persistent meta-upgrades across runs (`Turbo Boots`, `Chrome Rollers`, `Hull Plating`, `Twin-Boot Missiles`, `Overdrive Magnet`).
- **3 Difficulty Modes & S-Rank Targets** — `ROOKIE`, `ACE`, and `MAXIMUM BOOT-N-ASS`, plus a local top-10 arcade leaderboard.
- **Full Animated Cutscenes, Original Soundtrack & 65+ Voice Lines** — including dramatic ship death spirals, 3D wreckage explosions, multi-stage boss meltdowns, near-miss graze bonuses, and mid-boss tactical supply drops.
- **Universal Gamepad & Desktop Ready** — 100% gamepad-navigable menus, dual-API rumble, `F11` fullscreen, and 100% offline bundled fonts & assets.

## Controls

| Action | Keyboard / Mouse | Gamepad |
| --- | --- | --- |
| Fly & Bank | `WASD` / Arrow Keys | Left Stick / D-Pad |
| Rapid Plasma Fire | `Space` / Left Click | `RT` / `A` |
| Homing Lock-On | Hold `Shift` / Right Click / Hold Fire `1s` | `LT` / `B` |
| Barrel Roll (Deflect) | `Q` / `E` (or double-tap `A`/`D`) | `LB` / `RB` |
| Somersault EMP Flip | `R` | `Y` |
| Nova Smart Bomb | `B` / `G` | `X` |
| Boost / Brake | `F` / `C` | `L3` / `R3` |
| Pause / Fullscreen | `Esc` / `F11` | `Start` |

## Development

```bash
npm install
npm run dev          # Web dev server (http://localhost:5173)
npm run lan          # Serve on local network
npm run tauri:dev    # Native desktop app (hot reload)
npm run tauri:build  # Build native desktop bundle
```

## Releases & Code Signing

Pushing a version tag (`vX.Y.Z`) triggers `.github/workflows/release.yml` to build, sign, notarize, and publish macOS (`arm64` + `x64`), Windows (`x64`), and Linux (`.deb` + `.AppImage`) installers.
