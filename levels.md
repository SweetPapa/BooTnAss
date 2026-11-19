Save this as `LEVEL_GEN_PROMPT.md`. Whenever you want a new level, paste it into any LLM, fill in the 3 lines at the bottom, and drop the output straight into `src/levels/data/`.

```markdown
# STARBURST // Arcade Level Generator Prompt

You are an expert arcade rail-shooter level designer creating a new playable YAML level for **STARBURST** (a *Star Fox 64* meets neon arcade shooter).

## Output Rules
- Output **ONLY** valid YAML inside a single ```yaml code block. No intro text, no explanations.
- Every field must strictly match the schema and allowed enums below so it passes Zod validation on load.
- Timeline events MUST be sorted in strictly ascending order of `atDistance`.

---

## Play Space & Physics Reference
- **Player bounds**: `X` is `[-12, 12]` (left to right), `Y` is `[-7, 7]` (bottom to top).
- **Pacing math**: `time_in_seconds = distance / baseSpeed`.
  - Example: At `baseSpeed: 50`, `150` distance units = `3 seconds` of flight.
- **Target level length**: `4000` to `6500` units (~80–120 seconds before the boss).

---

## Strict YAML Schema & Allowed Enums

```yaml
id: "kebab-case-unique-id"
name: "04 // LEVEL TITLE"
subtitle: "Short punchy subtitle"
baseSpeed: 52                # Recommended range: 45 (chill) to 68 (intense)
length: 4800                 # Total rail length; boss spawns ~600 units before end

environment:
  theme: "canyon"            # ENUM: "canyon" | "asteroid_field" | "cyber_spire"
  skyColor: "#07091a"        # Hex (keep very dark for bloom contrast)
  fogColor: "#140b2e"        # Hex (deep saturated mid-dark)
  fogDensity: 0.0085         # Range: 0.005 to 0.014
  primaryColor: "#00f0ff"    # Hex (neon trim / grid highlight)
  secondaryColor: "#ff2a85"  # Hex (neon accent / rim lighting)
  ambientIntensity: 0.4      # Range: 0.25 to 0.6

timeline:
  # 1. Banner (HUD callout)
  - atDistance: 120
    type: "banner"
    text: "SHORT ALL-CAPS CALLOUT"

  # 2. Enemy Wave
  - atDistance: 300
    type: "wave"
    enemy: "scout"           # ENUM: "scout" | "weaver" | "turret" | "interceptor"
    formation: "v_shape"     # ENUM: "line" | "v_shape" | "spiral" | "flanking"
    count: 5                 # Integer: 2 to 10
    spawnOffset: { x: 0, y: 2 }   # x: [-10, 10], y: [-5, 5]
    behavior: "swoop_pass"   # ENUM: "straight" | "sine_weave" | "swoop_pass" | "hover_fire"
    fireRate: 0.8            # Shots/sec: 0.3 (easy) to 1.8 (bullet-hell)

  # 3. Obstacle / Ring
  - atDistance: 650
    type: "obstacle"
    kind: "arch_gate"        # ENUM: "arch_gate" | "crystal_cluster" | "laser_bar" | "boost_ring"
    position: { x: -3, y: 0 }     # x: [-9, 9], y: [-5, 5]
    scale: 1.2               # Range: 0.8 to 2.0
    rotationSpeed: 0.0       # Radians/sec: -1.5 to 1.5 (great for laser_bar)

  # 4. Boss Encounter (MUST be the final event, ~600 units before `length`)
  - atDistance: 4200
    type: "boss"
    bossId: "aegis_dreadnought"   # ENUM: "aegis_dreadnought" | "octa_core_sentinel" | "solaris_leviathan"
    name: "CUSTOM BOSS DISPLAY NAME"
    hp: 750                  # Range: 500 to 1200
    phases: 2                # Integer: 2 or 3
```

---

## Arcade Level Design Rules (Follow Strictly)
1. **Rhythm & Contrast**: Alternate between **Combat Waves** (high intensity), **Obstacle Gauntlets** (weaving/dodging), and **Breathers** (a `boost_ring` line or light `scout` wave to rebuild shield and combo).
2. **Minimum Spacing**: Keep at least `120–180` units between major waves so the screen stays readable, and at least `80` units between consecutive obstacles.
3. **Fairness**: Never place `laser_bar` or `arch_gate` obstacles at the exact same `atDistance` in a way that blocks the entire play plane. Always leave a clear flight corridor.
4. **Combo Bait**: Place `boost_ring` chains (3 rings spaced `90` units apart along a gentle S-curve) right before or after a tough gauntlet.
5. **Escalation**:
   - **0%–25%**: Warmup (`scout` + `arch_gate` / `boost_ring`).
   - **25%–60%**: Mix `weaver` and `turret` waves with `crystal_cluster` or `laser_bar` hazards.
   - **60%–85%**: Climax gauntlet (`interceptor` flanking waves + rotating `laser_bar`s + a `banner` warning).
   - **85%–100%**: Brief `boost_ring` recovery, boss warning `banner`, then the `boss` event.
6. **Density**: Aim for **28 to 40 timeline events** total so the level feels hand-crafted and action-packed from start to finish.

---

## New Level Request
- **Level Number & Vibe**: [e.g., "04 // Emerald Void — toxic green & gold asteroid run"]
- **Difficulty**: [e.g., "Hard — fast speed, lots of rotating laser bars and interceptors"]
- **Boss**: [e.g., "octa_core_sentinel, high HP, 3 phases"]

```

If you want to push it even further once Phase 3 is built, you can wire a tiny CLI script (`npm run gen-level -- "toxic green asteroid run"`) that sends this prompt to your local LLM or API, validates the returned YAML against `LevelSchema.ts`, and retries automatically if Zod flags any error.
