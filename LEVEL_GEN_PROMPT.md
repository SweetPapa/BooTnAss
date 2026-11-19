# STARBURST // Arcade Level Generator Prompt

You are an expert arcade rail-shooter level designer creating a new playable YAML level for **STARBURST** (a *Star Fox 64* meets neon arcade shooter).

## Output Rules
- Output **ONLY** valid YAML inside a single ```yaml code block. No intro text, no explanations.
- Every field must strictly match the schema and allowed enums below so it passes Zod validation on load.
- Timeline events MUST be sorted in strictly ascending order of `atDistance`.

## Play Space & Physics Reference
- **Player bounds**: `X` is `[-12, 12]` (left to right), `Y` is `[-7, 7]` (bottom to top).
- **Pacing math**: `time_in_seconds = distance / baseSpeed`.
- **Target level length**: `4000` to `6500` units (~80–120 seconds before the boss).

## Strict YAML Schema & Allowed Enums

```yaml
id: "kebab-case-unique-id"
name: "04 // LEVEL TITLE"
subtitle: "Short punchy subtitle"
baseSpeed: 52                # Recommended range: 45 (chill) to 68 (intense)
length: 4800                 # Total rail length; boss spawns ~600 units before end

environment:
  theme: "canyon"            # ENUM: "canyon" | "asteroid_field" | "cyber_spire"
  skyColor: "#07091a"        # 6-digit hex (very dark)
  fogColor: "#140b2e"        # 6-digit hex
  fogDensity: 0.0085         # Range: 0.005 to 0.014
  primaryColor: "#00f0ff"    # 6-digit hex
  secondaryColor: "#ff2a85"  # 6-digit hex
  ambientIntensity: 0.4      # Range: 0.25 to 0.6

timeline:
  - atDistance: 120
    type: "banner"
    text: "SHORT ALL-CAPS CALLOUT"

  - atDistance: 300
    type: "wave"
    enemy: "scout"           # ENUM: "scout" | "weaver" | "turret" | "interceptor"
    formation: "v_shape"     # ENUM: "line" | "v_shape" | "spiral" | "flanking"
    count: 5                 # Integer: 2 to 10
    spawnOffset: { x: 0, y: 2 }   # x: [-10, 10], y: [-5, 5]
    behavior: "swoop_pass"   # ENUM: "straight" | "sine_weave" | "swoop_pass" | "hover_fire"
    fireRate: 0.8            # Shots/sec: 0.3 to 1.8

  - atDistance: 650
    type: "obstacle"
    kind: "arch_gate"        # ENUM: "arch_gate" | "crystal_cluster" | "laser_bar" | "boost_ring"
    position: { x: -3, y: 0 }     # x: [-9, 9], y: [-5, 5]
    scale: 1.2               # Range: 0.8 to 2.0
    rotationSpeed: 0.0       # Radians/sec: -1.5 to 1.5

  - atDistance: 4200
    type: "boss"
    bossId: "aegis_dreadnought"   # ENUM: "aegis_dreadnought" | "octa_core_sentinel" | "solaris_leviathan"
    name: "CUSTOM BOSS DISPLAY NAME"
    hp: 750                  # Range: 500 to 1200
    phases: 2                # Integer: 2 or 3
```
