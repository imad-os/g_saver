# MyPC Cinematic Realistic Fireplace Screensaver

This plan details the additive implementation of **Cinematic Fireplace**, a photorealistic WebGL2 and GLSL ES 3.00 luxury stone fireplace screensaver integrated into the existing MyPC screensaver suite while preserving all existing scenes, settings, and MyPC SDK behaviors.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and product choices incorporate your confirmed selections and preserve all existing screensaver functionality without modification.

- **Confirmed Decision — Additive Scene Option**: **Cinematic Fireplace** will be registered as a new scene option in the existing scene dock, settings modal, and pause menu. All existing scenes, custom video support, saved preferences, and the default startup scene remain untouched.
- **Confirmed Decision — Architectural Stone Style**: The photographic fireplace composition will feature a **dark hand-carved limestone and fieldstone hearth** with a thick traditional stone mantel, deep recessed firebox, glowing ember bed, and split aged oak logs in a straight-on, fixed 16:9 camera framing.
- **Confirmed Decision — Diagnostic Overlay Trigger**: A dedicated **WebGL2 Diagnostics Overlay** toggle will be added inside the Settings Modal (hidden during normal operation) to display real-time FPS, internal render resolution, active GPU spark count, WebGL2 context status, and active quality level.
- **Default Rendering Quality**: **Maximum** quality (native 1920×1080 internal resolution, full multi-octave domain-warped FBM shader passes, and full GPU spark budget) is set as the default for the Cinematic Fireplace engine, with **High** and **Automatic** adaptive modes selectable in Settings.

---

## 1. Overview & Core Concept

- **What It Does**: Delivers a continuous, non-looping, camera-grade traditional stone fireplace simulation powered by a hybrid WebGL2 pipeline combining genuine high-resolution photographic plates (stone hearth, firebox mask, and foreground split oak logs) with multi-layered GLSL ES 3.00 procedural combustion, glowing log fissures, GPU-instanced rising sparks, subtle woodsmoke, heat refraction, and dynamic environmental firelight.
- **Target Audience / Persona**: MyPC users on 2024+ Samsung Smart TVs (Tizen 8+ / Chromium 108+) and desktop browsers seeking a realistic living-room hearth ambiance that burns naturally for hours without repetitive video loops or cartoon graphics.
- **Key Value**: Achieves true optical depth and organic chaos—where back flames burn behind aged oak logs, mid-flames lick through log gaps, and embers pulse across the hearth floor—while strictly honoring the 1 GB TV RAM budget and zero-allocation-per-frame WebGL2 lifecycle.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Selecting Cinematic Fireplace**: Users select **Cinematic Fireplace** from the bottom HUD scene dock, the Settings Modal scene grid, the MyPC pause menu, or via deep link (`?scene=cinematic`), immediately launching the WebGL2 fireplace engine.
  2. **Pure Fullscreen Viewing**: During normal screensaver operation (Pure View), all UI, text, and menus are hidden, presenting a fixed straight-on 16:9 view of the dark limestone hearth illuminated by flickering firelight.
  3. **Customizing Quality & Diagnostics**: Opening the Settings Modal (via TV Remote `OK`, Gamepad `Start`, or Keyboard `Enter`) allows adjusting flame intensity, ember glow, spark density, rendering quality preset (**Maximum** [default], **High**, **Automatic**), crackling audio volume, and toggling the **WebGL2 Diagnostics Overlay**.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Photographic dark-parlor luxury architecture paired with physically inspired Planckian blackbody combustion.
  - *Color Palette & Mood*:
    - `--background`: Deep parlor obsidian (`#070605`) and shadowed hand-carved limestone (`#181512`).
    - `--primary`: Incandescent hearth amber (`#F59E0B`) and molten log-fissure orange (`#EA580C`).
    - `--accent`: White-hot flame core (`#FFFBEB` / `3600K`) transitioning through golden yellow (`#FBBF24` / `2600K`), deep crimson-orange (`#DC2626` / `1600K`), and dark translucent soot edges (`1000K`).
  - *Typography & Hierarchy*: Retains the established 10-foot Smart TV typographic hierarchy (`Outfit` for display clock and modal headings; `Plus Jakarta Sans` for single-line controls; `JetBrains Mono` with `tabular-nums` for diagnostic metrics).
  - *Component Styling & Layout*: Full-viewport `100vw × 100vh` 16:9 WebGL2 canvas (`z-0`) layered beneath the OLED-orbit-protected clock and 2D spatial TV focus HUD (`z-20`). Metadata and diagnostic readouts use clean unboxed text with `·` separators.
- **Interactive Feedback & Motion**:
  - TV Remote (`Arrows + OK`), Gamepad (`D-Pad / Sticks + A/B/LB/RB/LT/RT`), and Keyboard (`Arrows/WASD + Enter/Esc`) navigate all controls with a 3-meter-visible amber focus ring within a `< 150ms` response budget.
  - Gamepad analog triggers (`LT`/`RT`) and Up/Down remote arrows smoothly modulate live WebGL2 shader uniforms (`u_fireIntensity`, `u_emberGlow`, `u_windDraft`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Hybrid Multi-Layer WebGL2 Compositing vs. Pure Procedural or Video Loop**
  - *Chosen Approach*: Combine high-resolution photographic textures for static architectural stone and aged oak logs with GLSL ES 3.00 procedural shaders for flames, ember beds, log fissure emission, heat distortion, and GPU particles.
  - *Why*: Pure procedural stone/wood looks synthetic, while looping video files repeat noticeably and consume large network/RAM buffers. Hybrid WebGL2 compositing preserves photographic realism for stone and bark while generating infinite, non-repeating combustion and real-time environmental lighting on the stone.
  - *Alternatives Considered*: Canvas 2D particles (rejected—cannot achieve realistic domain-warped FBM flame tongues or per-pixel stone normal illumination) and Three.js (rejected—unnecessary framework overhead for a dedicated 2D/2.5D multi-pass GLSL shader compositor).
- **Decision 2: Dual-Depth Flame Layering with Log Alpha Occlusion**
  - *Chosen Approach*: Render the flame field in two depth passes within the shader pipeline—a deep rear flame sheet behind the log stack and a foreground/inter-log flame pass rising between and in front of the split oak logs, masked by a dedicated foreground log occlusion and emissive crack map.
  - *Why*: Prevents the "flat sticker fire pasted on top of logs" artifact and creates convincing 3D depth where flames wrap around and emerge from between charred oak logs.
- **Decision 3: GPU-Driven Instanced Spark System with Zero Per-Frame CPU Allocation**
  - *Chosen Approach*: Pre-allocate a static WebGL2 vertex buffer of spark attributes (seed, spawn phase, buoyancy speed, lateral curl frequency, size, temperature decay) and compute all position advection, turbulence, and blackbody cooling inside the GLSL vertex and fragment shaders using continuous elapsed time.
  - *Why*: Eliminates JavaScript array iteration and garbage collection pauses on Samsung Smart TV CPUs while supporting hundreds of organic rising sparks at 60 FPS.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        MyPC SDK v1 Host & Input Bridge                       │
│   onInit / onStart / onPause / onResume / onDestroy / onInput / MyPC.gamepad │
└──────────────────────┬───────────────────────────────────────┬───────────────┘
                       │                                       │
                       ▼                                       ▼
┌─────────────────────────────────────────┐   ┌────────────────────────────────┐
│       Screensaver State & Settings      │   │   Acoustic Audio Engine (CC0)  │
│  • SceneId ('cinematic' added as #7)    │   │  • Seamless fireplace crackle  │
│  • fireplaceQuality: Max | High | Auto  │   │  • Deep chimney draft roar     │
│  • showDiagnostics: boolean (Settings)  │   │  • Independent of render loop  │
└──────────────────────┬──────────────────┘   └────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                 CinematicFireplaceWebGL2 (GLSL ES 3.00 Engine)               │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Pass 1: Photographic Background, Heat Refraction & Dynamic Stone Light │  │
│  │  • High-res Dark Limestone & Fieldstone Plate + Firebox Mask           │  │
│  │  • Anisotropic UV heat shimmer above flame tips                        │  │
│  │  • Multi-zone radial & directional firelight illuminating stone & floor│  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
│                                      ▼                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Pass 2: Firebox Interior, Cellular Ember Bed & Rear Flame Sheet        │  │
│  │  • Voronoi + FBM pulsing incandescent coal bed (hundreds of cells)     │  │
│  │  • Domain-warped multi-octave FBM rear flames behind log stack         │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
│                                      ▼                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Pass 3: Foreground Aged Oak Logs, Emissive Fissures & Inter-Log Flames │  │
│  │  • Alpha-masked oak log texture occluding rear flames                  │  │
│  │  • Animated red/orange glowing bark cracks & charcoal embers           │  │
│  │  • Foreground flame tongues rising between log crevices (Planckian LUT)│  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
│                                      ▼                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Pass 4: GPU Batched Sparks & Low-Opacity Turbulent Woodsmoke           │  │
│  │  • Pre-allocated VAO/VBO point-sprite sparks with curl-noise drift     │  │
│  │  • Subtle dark grey-brown turbulent smoke plume inside upper firebox   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────┬───────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│              Optional Settings-Toggled Diagnostic Overlay (DOM)              │
│   FPS · Internal Render Resolution · Active Spark Count · WebGL2 · Quality   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Photographic & Texture Asset Pipeline

To ensure zero geometric primitives or cartoon drawings, we will generate and bundle high-resolution photographic assets loaded into WebGL2 textures (`LINEAR` filtering, `CLAMP_TO_EDGE`):
1. **Dark Limestone & Fieldstone Fireplace Plate (16:9)**: Straight-on architectural photograph of a grand dark hand-carved limestone and fieldstone fireplace with a thick stone mantel, recessed dark stone firebox (without pre-baked flames), and stone hearth slab in a dimly lit luxury living room.
2. **Aged Split Oak Logs & Ember Bed Composite Texture**: High-detail charred oak logs with deep bark grain, glowing ember fissures, and an incandescent coal bed mapped to the firebox floor, paired with a shader-derived alpha occlusion mask and emissive crack mask so flames render naturally behind, between, and around the logs.

### GLSL ES 3.00 Shader & Simulation Details

- **Procedural Flame Mathematics**:
  - Combines 6-octave **Simplex / Value Fractal Brownian Motion (FBM)** with two-stage **2D Domain Warping** (`q = fbm(p + v1 * t)`, `r = fbm(p + 3.5 * q + v2 * t)`) and vertical buoyancy advection (`p.y -= u_time * speed`).
  - Generates three distinct depth-staggered flame layers (deep hearth sheet, mid-log tongues, and bright foreground licks) with independent prime-ratio temporal frequencies so patterns never loop or synchronize.
  - Applies an organic firebox mask (`smoothstep` arch and side jamb containment) and log-gap emitter mask so individual flame tongues split, merge, and taper naturally inside the firebox opening.
  - Maps scalar thermal density `T ∈ [0, 1]` through a **Planckian Blackbody Radiance Curve**: translucent dark soot crimson (`T < 0.25`) → deep orange (`0.25..0.55`) → luminous amber-gold (`0.55..0.82`) → white-hot incandescent core (`T > 0.82`).
- **Dynamic Environmental Illumination**:
  - Computes real-time low-frequency and high-frequency flicker envelopes in the shader from the active flame energy integral and applies directional/radial normal-like lighting across the limestone jambs, mantel underside, and hearth stone floor.
- **Adaptive Quality & MyPC Lifecycle**:
  - **Quality Tiers**:
    - `Maximum` (Default): `1.0×` resolution (`1920×1080`), 6 FBM octaves, `240` GPU spark particles, full heat refraction and smoke passes.
    - `High`: `0.85×` resolution (`1632×918`), 5 FBM octaves, `160` GPU spark particles.
    - `Automatic`: Starts at `Maximum` and monitors rolling 60-frame frametime; scales internal render resolution (`1.0` ↔ `0.85` ↔ `0.70`) and spark count dynamically to sustain 60 FPS (30 FPS minimum floor on lower-tier TVs).
  - **Lifecycle & Memory Safety**:
    - `onPause`: Cancels `requestAnimationFrame` and records pause timestamp.
    - `onResume`: Offsets elapsed simulation clock by paused duration to prevent time jumps.
    - `onDestroy`: Cancels animation loop, removes `webglcontextlost` / `webglcontextrestored` listeners, deletes all WebGL2 textures, buffers, VAOs, and shader programs, and closes audio resources.
