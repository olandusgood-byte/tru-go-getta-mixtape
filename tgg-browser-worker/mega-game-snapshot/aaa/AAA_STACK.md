# TRU GO GETTA WORLD — AAA Production Stack

This folder is the single handoff point between the browser prototype and the premium 3D production build.

## 10-tool stack
1. Unreal Engine — primary premium runtime, world, vehicles, physics, lighting.
2. MetaHuman — hero characters, NPC heads, facial/body animation.
3. Fab / Megascans — production-ready environments, props, materials, VFX.
4. Houdini Engine — procedural roads, blocks, buildings, districts and variation.
5. Blender — custom vehicles, jewelry, props, clothing, buildings and cleanup.
6. Character Creator + iClone — high-volume NPC/clothing/animation pipeline.
7. NVIDIA ACE — conversational / intelligent NPC layer.
8. Runway — concepts, cinematics, trailers, shot exploration and promo.
9. Figma — HUD, phone, map, menus, career UI, garage UI and design system.
10. GitHub + AI coding — source of truth, automation, code review, QA and releases.

## Fast parallel workflow
- DESIGN: Figma -> /game/aaa/ui
- CONCEPT/CINEMATIC: Runway -> /game/aaa/cinematics
- CHARACTER: MetaHuman or CC/iClone -> /game/aaa/characters
- WORLD: Fab + Houdini -> /game/aaa/world
- CUSTOM MODELING: Blender -> /game/aaa/assets
- ENGINE: Unreal -> /game/aaa/unreal
- NPC AI: NVIDIA ACE -> /game/aaa/ai
- SOURCE/QA: GitHub -> branch + CI
- BROWSER PROTOTYPE: /game remains the rapid gameplay test bed.

## Asset handoff rules
Use glTF/GLB or FBX for 3D handoff, WAV for master audio, PNG/EXR for texture/image handoff, JSON for gameplay metadata, and keep all generated assets referenced by manifest instead of hard-coding local paths.

## Core principle
Do not rebuild proven browser mechanics from scratch. Port the certified gameplay systems:
- locomotion + sprint
- vehicle physics
- gamepad
- mobile controls
- World Life
- Career Director
- First Contract Story Mission
- inventory / crew / progression
into the premium runtime one system at a time while the browser build stays playable.
