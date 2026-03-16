# Ball Roller 3D — Complete Technical & Experience Report

---

## 1. Technology Stack

| Layer | Technology |
|---|---|
| Rendering | Three.js (WebGL 2 / WebGL 1 fallback) |
| Physics | Cannon-es (Cannon.js ES module fork) |
| UI / App shell | React 18 + Vite (TypeScript) |
| Tone mapping | ACESFilmic, exposure 1.2 |
| Shadow maps | PCFSoft, 1024×1024 |

The game is a browser-native 3D application compiled as a React artifact. The entire game logic lives in four TypeScript modules that are fully decoupled from React — React is only used for the HUD overlay and restart button. The WebGL canvas is created imperatively and appended to a container div.

---

## 2. Source File Architecture

```
src/
├── game/
│   ├── Game.ts              — Main loop, physics integration, camera, input
│   ├── Physics.ts           — Cannon-es world + ball body factory
│   ├── RoadGenerator.ts     — Procedural ribbon road, gap logic, shared material
│   ├── SpaceScene.ts        — Level 1 environment: nebula, stars, UFOs, lasers, explosions
│   └── EnvironmentManager.ts— Level transitions, scenery, special events, gravity/speed
├── pages/
│   └── GamePage.tsx         — React HUD: distance counter, game-over overlay, speed lines
└── App.tsx                  — Root React component
```

### Module responsibilities

**Game.ts** owns the RAF loop, the Three.js scene/camera/renderer, and the Cannon-es world. It orchestrates all other modules and is the single source of truth for game state (`playing` / `dead`). On each frame it: (1) calls `EnvironmentManager.update()` to get the current speed multiplier, (2) drives the physics step, (3) syncs the ball mesh to the physics body, (4) spawns/prunes road pieces.

**Physics.ts** is a pure factory module. It creates the Cannon-es world with tuned parameters and creates the ball body. It exports `createGroundBody()` (a helper still used internally by RoadGenerator).

**RoadGenerator.ts** exports a singleton `roadMat` (`MeshStandardMaterial`) shared by every road segment. This single reference is what allows EnvironmentManager to change the road colour at runtime — updating the one material instantly repaints the entire visible road without re-creating any geometry.

**SpaceScene.ts** is self-contained. It builds a 2048×1024 procedural nebula canvas texture, near-star particles, 4 suns with corona halos and PointLights, 6 recycling moons, and 12 UFOs. It owns the laser and explosion lifecycle. It exposes `setVisible(bool)` so EnvironmentManager can hide the entire space environment when transitioning to later levels.

**EnvironmentManager.ts** is the level-state machine. Every frame it receives `(dt, distance, ballX, ballZ)` and returns `{ speedMultiplier }`. It smoothly lerps fog colour, fog density, road colour, road emissive, and the road glow light colour toward per-level targets. It manages scenery (trees, houses, kelp, submarines, craters, ruins) with a spawn-ahead / prune-behind queue and drives the two cinematic special events (Earth approach, Torus portal).

---

## 3. Rendering Pipeline

### Camera
- **Type:** PerspectiveCamera, 72° FOV
- **Near/far clip:** 0.1 / 420 units
- **Position target:** `(ballX, ballY + 1.8, ballZ − 3.5)` — sits 3.5 units behind and 1.8 above the ball
- **Look-at target:** `(ballX, ballY + 0.4, ballZ + 55)` — gazes 55 units ahead on the road horizon
- **Smoothing:** Position is lerped at factor 0.12 per frame, creating a slight camera lag that emphasises speed

This setup places the ball in the bottom-centre of the screen with the road stretching into a vanishing point — the classic "rail rush" first-person feel.

### Lighting (base scene, all levels)
| Light | Colour | Intensity | Notes |
|---|---|---|---|
| AmbientLight | #223355 (cool blue-grey) | 0.6 | fills dark areas |
| DirectionalLight | #aabbff (icy blue-white) | 0.8 | casts 1024px shadow map |
| HemisphereLight | sky #220044 / ground #000011 | 0.4 | purple-tinted fill |
| Ball PointLight | #2255ff | 1.5, range 8 | attached to ball mesh, bobs with it |
| Road GlowLight | colour lerped per level | 2.5, range 18 | tracks 3 units ahead of ball at Y=1 |

The road glow light is the key driver of the "neon road" look. Its colour changes with the level: red in space, green on Earth, gold underwater, pale yellow on the Moon, and orange on Mars.

### Post-processing
- ACES Filmic tone mapping with exposure 1.2 gives the scene a film-like contrast
- CSS radial-gradient vignette (darkens edges) is layered over the canvas in the React HUD
- 18 static CSS "speed streak" lines radiate from the centre at evenly-spaced angles, always visible

---

## 4. Road System

### Geometry
Each road piece is a custom `BufferGeometry` slab built from 5 quad faces:
- **Top face** (the surface the ball rolls on)
- **Left side face**
- **Right side face**
- **Front cap** (at zStart)
- **Back cap** (at zEnd)

Road width: **3.5 units**. Piece Z length: **7 units**. Thickness: **0.3 units**.

Each piece connects xStart (the previous piece's xEnd) to a new xEnd, creating a smoothly curving ribbon with no seams or gaps between normal segments.

### Curvature
A `xDrift` accumulator adds `±0.05` per piece (clamped to `±0.22`), then `xEnd = xStart + xDrift × 7`. This creates a gentle random S-curve feel. If the road drifts beyond ±16 units from centre the drift is reversed (×−0.6), keeping the road from wandering too far off-screen.

### Gaps
Every 9th piece (`GAP_EVERY = 9`) is a gap: `isGap = true`. A gap piece has **no mesh** and **no physics body** — it is a pure bookkeeping entry with a Z extent of 5 units (`GAP_Z_LEN`). The ball will fall through that void unless the player jumps. After a gap, the road resumes at a randomly shifted X (±1.5 units), making the landing require a small steering correction.

### Memory management
- **35 segments ahead** of the ball are maintained (`SEGMENTS_AHEAD`)
- **5 segments behind** are kept before cleanup (`SEGMENTS_BEHIND`)
- When a piece's zEnd falls more than 5×7 = 35 units behind the ball, its mesh is `scene.remove()`d, its `BufferGeometry` is `.dispose()`d, and its `CANNON.Body` is `world.removeBody()`d
- This keeps the active segment count roughly constant at ~40, regardless of how far the player has travelled

---

## 5. Physics System

### World configuration
| Parameter | Value |
|---|---|
| Gravity | −20 m/s² (default); −10 on the Moon; −20 on Mars |
| Broadphase | SAP (Sweep-and-Prune) |
| GSSolver iterations | 20 |
| Time step | 1/120 s (120 Hz fixed) |
| Max substeps | 10 per render frame |

Running at 120 Hz with 10 substeps means the physics can internally compute up to 10 × 1/120 = ~0.083 s of simulation per render frame. At 8.64 m/s the ball travels ~0.072 m per frame at 60 fps — well within the road's 0.3 m thickness, so tunnelling is prevented.

### Ball body
| Parameter | Value |
|---|---|
| Shape | Sphere, radius 0.5 |
| Mass | 1 kg |
| Linear damping | 0.1 |
| Angular damping | 0.4 |

### Road body
Each non-gap piece gets a static `CANNON.Box` body. The half-extents are `(roadWidth/2, 0.15, segmentDiagonalLength/2)`. The body is rotated on the Y axis by `atan2(xDelta, PIECE_Z_LEN)` to match the ribbon's diagonal angle when the road curves. This ensures collision response remains physically correct on curved segments.

### Ball motion
Forward velocity is **set directly** every frame (not via force), meaning the ball cannot slow down forward — it is always moving at exactly `forwardSpeed`. This is the core "endless runner" mechanic: Z velocity is authoritative, not simulated.

Lateral steering applies a **force** (`STEER_FORCE = 14 N`) rather than setting velocity directly. This gives the lateral movement a physical, slightly inertial feel — the ball accelerates sideways rather than teleporting. Lateral speed is hard-clamped to 6 m/s maximum.

The jump sets `velocity.y = 8 m/s` directly, bypassing force integration. A guard prevents double-jumping: the jump is only allowed when `|velocity.y| < 2.5`, meaning the ball must be near ground contact.

---

## 6. Speed Progression

```
forwardSpeed = (8.64 + distance × 0.0014) × speedMultiplier
```

| Milestone | Distance | Speed |
|---|---|---|
| Start | 0 m | 8.64 m/s |
| Earth surface | 500 m | 9.34 m/s |
| Ocean | 1000 m | 10.04 m/s |
| Moon | 1500 m | 10.74 m/s |
| Mars (×1.3 multiplier) | 2000 m | 14.26 m/s |
| Mars, deep run | 3000 m | 15.66 m/s |

The gradual ramp (+0.0014 per metre) is barely perceptible second-to-second but produces a 65% speed increase over 1000 m of travel before the Mars multiplier kicks in. On Mars the ×1.3 multiplier stacks on top, creating a sudden, jarring acceleration that is intended to push reflexes to the limit.

---

## 7. Level System & Cinematic Events

The `EnvironmentManager` uses a pure distance-based state machine. Level transitions fire instantly when the distance threshold is crossed, but all visual changes (fog, background, road colour) are smoothly lerped each frame so the player perceives a gradual shift rather than a hard cut.

### Level 1: The Cosmic Approach (0 – 500 m)
- **Background:** Procedural nebula skybox sphere (2048×1024 canvas with 8 layered radial gradient nebula clouds in purple, blue, pink, teal, orange, plus 9,000 individually tinted and glow-halocached stars)
- **Near stars:** 2,000 coloured Points particles at 40–140 unit radius, scrolling with the ball
- **Road:** Glowing neon red (`#dd1111`, emissive `#cc0000`)
- **UFOs:** 12 flying saucers (6 per side), each a disc + ridge + dome geometry group with a randomised green or blue PointLight underneath, bobbing sinusoidally and spinning. Their relZ values recycle between −25 and +130 relative to the ball so they always surround the player
- **Lasers:** Every 0.3–0.8 s, a `Line` is drawn between two random UFOs in one of six colours (green, cyan, red, yellow, white, magenta). It fades out over 0.25–0.6 s
- **Explosions:** Every 1.2–3.0 s, 40 particles burst from a random UFO with random spherical velocity (3–10 m/s) in an orange/red/yellow palette, fading over 0.7–1.1 s
- **4 suns:** Emissive spheres (radii 7–13) with PointLights (intensity 2.0, range 150) and translucent BackSide corona halos. They recycle every 280 units
- **6 moons:** Large grey Lambert spheres (radii 7–12) recycling every 280 units
- **Fog:** Exponential, density 0.009, dark near-black colour

**Special event — Earth approach (380–500 m):**
At 380 m, a large Earth sphere (radius 22, blue Lambert + semi-transparent cloud shell) is spawned 220 units ahead. As the player travels the remaining 120 m, a lerp parameter `t = (distance−380)/120` scales the Earth from `1×` to `7×` its original size, simulating falling toward a planet. At 500 m the sphere is removed and Level 2 begins.

---

### Level 2: Earth Surface (500 – 1000 m)
- **Background:** Sky blue `#87ceeb` (solid `scene.background`)
- **Road:** Vibrant green (`#44cc22`, emissive `#228800`), road glow light turns green
- **Fog:** Light blue, density 0.004
- **Scenery spawned every ~20–45 units along both sides:**
  - **Trees** (55% probability): brown CylinderGeometry trunk (r 0.3→0.45, h 2.5) + green ConeGeometry foliage (r 1.8, h 3.8)
  - **Houses** (45% probability): white BoxGeometry base (3.5×2.8×3.5) + red ConeGeometry roof (r 2.6, h 1.8, rotated 45°) + brown door slab
- **Scenery cleanup:** Objects more than 60 units behind the ball are removed from scene

**Sub-event — dusk approach (950–1000 m):**
`t = (distance−950)/50` linearly interpolates both the background and fog colour from sky blue to dark navy `#040820`, and fog density from 0.004 to 0.012. The player experiences a visual sunset effect in the final 50 metres before diving underwater.

---

### Level 3: The Deep Ocean (1000 – 1500 m)
- **Background:** Deep oceanic blue `#001832`
- **Road:** Sandy tan (`#ddbb55`, emissive `#aa8833`), road glow turns gold
- **Fog:** Dark deep blue `#001a38`, density 0.014 (visibly thicker, cutting the far road shorter)
- **Scenery:**
  - **Kelp** (60%): 3–5 CylinderGeometry segments (r 0.12→0.18, h 2) stacked vertically with sinusoidal Z/X rotation on each segment for an organic twisting shape
  - **Submarines** (40%): yellow CapsuleGeometry body rotated horizontal + BoxGeometry conning tower + TorusGeometry propeller ring
- **Bubbles:** 180 Points particles scatter around the ball's area (±25 X, ±15 Y, ±40 Z). Each frame they drift upward at 0.8–1.3 m/s, wrapping back to Y=−15 when they exceed Y=20. They also follow the ball's Z range, wrapping when ±45 units away.

**Special event — Torus portal (1400–1500 m):**
At 1400 m, a large glowing purple torus (outer radius 5, tube radius 1.2, `MeshStandardMaterial` with emissive `#6600aa` at intensity 0.8) is spawned 90 units ahead. A PointLight (purple, intensity 3.0, range 30) sits inside it. The torus rotates at 0.6 rad/s on X and 0.3 rad/s on Y. When the ball passes through at ~1500 m, Level 4 begins.

---

### Level 4: The Moon (1500 – 2000 m)
- **Background:** Near-black `#010101`
- **Road:** Pale dusty grey (`#ccccaa`, emissive `#999977`), road glow turns cream
- **Fog:** Dusty stark white `#ddddcc`, density 0.007 (creates an eerie misty horizon)
- **Gravity:** Reduced from −20 to **−10 m/s²** — the ball falls half as fast, jumps go nearly twice as high, and the floaty arcs make gap-crossing feel very different
- **Scenery:**
  - **Craters** (55%): a half-SphereGeometry bowl (r 3.5, phi range π/2→π/2) inverted to face down + a TorusGeometry rim ring
  - **Lunar rocks** (45%): 3–5 randomly positioned, randomly rotated IcosahedronGeometry chunks (r 0.6–2.0, detail 0) in grey

---

### Level 5: Mars (2000 m+)
- **Background:** Dark rusty brown `#2a0800`
- **Road:** Burnt orange (`#bb4411`, emissive `#992200`), road glow turns orange-red
- **Fog:** Rusty orange `#cc4400`, density **0.018** — the thickest fog in the game, hiding the road beyond ~80 units
- **Speed multiplier:** ×**1.3** — on top of the gradual ramp, effective speed at 2000 m is ~14.3 m/s, nearly 65% faster than the start
- **Gravity:** Restored to −20 m/s² (Mars surface gravity is ~3.7 m/s² in reality, but this is a game balance decision — the Moon's floatiness was a one-level mechanic)
- **Scenery:** `makeMartianRuin()` — 3–6 red BoxGeometry blocks of randomised height (3–12 units) and footprint (1.5–4.5 wide), scattered in a cluster to look like eroded canyon walls or ancient ruins

---

## 8. Memory & Performance Design

### Road streaming
The road is a sliding window. ~40 segments are alive at any given time. Old geometry is immediately disposed (`geometry.dispose()`) and old bodies removed from the Cannon world. Peak triangle count from road geometry alone stays under ~5,000 triangles.

### Scenery queue
Scenery is appended to a sorted array. Pruning scans from the front of the array (oldest Z) and removes any item that has fallen 60 units behind. Because items are inserted in Z order, the prune loop exits as soon as it finds an item still in range — O(k) where k is the number of items to remove.

### Laser & explosion cleanup
Both are sparse, short-lived effects. Lasers are Lines (2-vertex geometries). Explosions are 40-particle Points. Both call `geometry.dispose()` on removal. The explosion timer fires every 1.2–3.0 s so at most 2–3 are alive simultaneously.

### Starfield scrolling
The background sphere (radius 380) and near-star particle cloud both have their `.position` set to `(ballX, 0, ballZ)` every frame, keeping them centred on the ball. The player never reaches the edge of the skybox.

### UFO recycling
UFO relZ values are adjusted each frame: if `relZ < −25`, add 130; if `relZ > 130`, reset to −10. This keeps all 12 UFOs perpetually visible in a 155-unit window around the ball — no new objects are ever created, the pool is fixed at game start.

---

## 9. Input Handling

| Key | Action |
|---|---|
| A / ArrowLeft | Apply lateral force −14 N on ball |
| D / ArrowRight | Apply lateral force +14 N on ball |
| Space | Set `velocity.y = 8 m/s` (if `|vy| < 2.5`) |
| R | Restart game (only when dead) |

Input is captured via `keydown` / `keyup` on `window`. A `keys` record stores the current held state. Lateral force is applied inside the physics update loop each frame, giving analogue feel: tapping briefly applies a smaller total impulse than holding continuously.

---

## 10. Gamer Experience — Level by Level

### Opening moments (0–380 m)
The player drops into a cinematic space void. The road is a narrow red ribbon over infinite darkness, lit from below by its own emissive glow. UFOs dogfight to the left and right — lasers criss-cross, explosions spark. The first few gaps appear at piece 9 and every 9 thereafter, training the player on the Space key. The road curves gently, asking for occasional A/D corrections. The atmosphere is tense and exhilarating.

### The Earth approach (380–500 m)
Without warning, a blue planet appears in the dead centre of the road's vanishing point. It grows rapidly — within a few seconds it fills the screen. The player is simultaneously trying to avoid gaps and steer while this massive object bears down on them. The "clip-through" at 500 m is a sudden hard cut to daylight, providing a satisfying punctuation to the first leg.

### Earth surface (500–950 m)
The contrast is jarring in a good way — bright sky, green grass road, charming little trees and houses drifting by. The mood lifts. The road colour shift (red → green) is immediately obvious and recontextualises the road as a countryside path. Speed has noticeably increased. The scenery gives peripheral cues to speed that the void lacked.

### The dusk descent (950–1000 m)
The sky cools and darkens over 50 m. The fog thickens. Players who have been in a rhythm of smooth steering are suddenly fighting reduced visibility and rising tension.

### Deep ocean (1000–1400 m)
Dark blue, dense fog, bubbles rising. The road is now sandy-coloured, blending slightly more with the foggy background — making the edges harder to read. Kelp sways beside the player, submarines drift past. The bubble particle field adds a constant gentle upward motion that reinforces the underwater feel. The road's gap timing becomes more demanding as speed approaches 10+ m/s.

### Torus portal (1400–1500 m)
The pulsing purple torus spins ahead. Its purple point light casts coloured shadows across the road. The player is being chased by increasing speed and must thread through the portal — a visual gateway both beautiful and ominous. Passing through snaps the environment to black.

### Moon (1500–2000 m)
The gravity halving is immediately felt on the first gap. Jumps that cleared 5 units comfortably now send the ball high into the air, requiring a recalibration of muscle memory. Craters and rock clusters decorate the sides. The dusty white fog gives the scene an eerie, isolated quality. Speed is now ~10.7 m/s before the Mars multiplier.

### Mars — the endgame (2000 m+)
The ×1.3 speed boost fires. The rusty fog closes in. Red ruins loom. Gaps arrive faster than ever. The road colour — dark burnt orange — begins to blend subtly with the fog at the edges, making the lateral boundaries harder to judge. This is the true difficulty wall, designed as an escalating reflex test with no ceiling.

---

## 11. Death & Restart

Death occurs when `ballBody.position.y < −10`. The ball must fall at least 10 metres below the road surface, giving a brief moment of free-fall before the game-over state triggers (preventing false deaths from minor physics bounces at gap edges).

The game-over overlay shows distance reached with a red-glowing "GAME OVER" title. Restarting (`Play Again` or `R`) calls `Game.restart()`, which:
1. Disposes and removes all road pieces from scene and Cannon world
2. Resets ball position to `(0, 2, 0)` with zeroed velocity
3. Calls `EnvironmentManager.reset()` which clears all scenery, removes the Earth and Torus if present, re-shows SpaceScene, resets gravity, fog, and road colour to Level 1 values
4. Regenerates the initial road pool
5. Returns to `playing` state instantly — no reload, no pause

---

## 12. Summary Statistics

| Metric | Value |
|---|---|
| Active road segments | ~40 |
| Road triangles (peak) | ~4,800 |
| UFOs | 12 (permanent pool) |
| Suns | 4 (recycling) |
| Moons | 6 (recycling) |
| Near-star particles | 2,000 |
| Nebula skybox resolution | 2048 × 1024 px |
| Bubble particles | 180 (ocean only) |
| Physics Hz | 120 Hz, 10 substeps |
| Solver iterations | 20 |
| Starting speed | 8.64 m/s |
| Peak speed (Mars, 3000 m) | ~15.7 m/s |
| Levels | 5 |
| Game-over condition | Ball Y < −10 |
