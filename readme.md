This is my attempt to my own civilization (IV) implementation using 100% web technologies and supporting large maps, it uses

typescript, pixi.js, web-workers



# Notes about architecture and technologies

                    
  Use PixiJS v8 (WebGL-based 2D renderer), not raw HTML Canvas or raw WebGL.                                                                                                  
                                                                                                                                                                              
  - WebGL renderer with WebGPU planned — handles 10K+ sprites at 60fps easily                                                                                                 
  - Sprite batching: all tile layers get batched into minimal draw calls                                                                                                      
  - pixi-viewport plugin: pan/zoom/cull — only renders the ~300 visible tiles from your 250K, automatically                                                                   
  - @pixi/tilemap: efficient instanced rendering for the static terrain layer                                                                                                 
  - TypeScript-first, active community                                                                                                                                        
                                                            
  Each tile is a PixiJS Container with stacked Sprite children:                                                                                                               
  Container (tile x,y)                                            
    ├── Sprite: terrain base (grassland.png)                                                                                                                                  
    ├── Sprite: feature overlay (forest.png, nullable)            
    ├── Sprite: resource icon (wheat.png, nullable)                                                                                                                           
    ├── Sprite: improvement (farm.png, nullable)                                                                                                                              
    └── Sprite: unit stack icon (settler.png, nullable, topmost)                                                                                                              
  All images are pre-packed into texture atlases (one spritesheet per category) to minimize GPU texture swaps.                                                                
                                                                                                                                                                              
  ---                                                                                                                                                                         
  Worker Architecture                                                                                                                                                         
                                                                                                                                                                              
  ┌──────────────────────────────────────────┐                    
  │              MAIN THREAD                 │                                                                                                                                
  │  PixiJS WebGL renderer                   │
  │  pixi-viewport (camera, culling)         │                                                                                                                                
  │  React UI overlay (HUD, menus)           │                                                                                                                                
  │  Zustand (UI state only)                 │
  │  Worker message dispatcher               │                                                                                                                                
  └───────┬────────┬────────┬────────────────┘                                                                                                                                
          │        │        │
          ▼        ▼        ▼                                                                                                                                                 
  ┌──────────┐ ┌──────┐ ┌──────────────────┐                      
  │  Game    │ │  AI  │ │  Pathfinding     │                                                                                                                                  
  │  Logic   │ │Worker│ │  Worker          │                                                                                                                                  
  │  Worker  │ │(×N)  │ │  (A*/HPA*)       │
  │          │ │      │ │                  │                                                                                                                                  
  │ ECS World│ │Strat │ │ Handles unit     │                      
  │ Turn eng.│ │Tact. │ │ move requests    │                                                                                                                                  
  │ Combat   │ │Diplo │ │ asynchronously   │                                                                                                                                  
  │ Cities   │ │      │ │                  │                                                                                                                                  
  └──────────┘ └──────┘ └──────────────────┘
                                                                  
  Shared Memory (SharedArrayBuffer):                                                                                                                                          
    TileBuffer   Int16Array[500×500×8]  terrain,feature,resource,improvement,visibility...
    UnitBuffer   Float32Array[10K×4]   x,y,civId,unitTypeId                                                                                                                   
                                                                                                                                                                              
  Golden rule: game state lives in workers. The main thread only renders and handles input. Workers send diffs/events to the renderer.                                        
                                                                                                                                                                              
  ---                                                                                                                                                                         
  ECS: bitECS                                                     
             
  For 10K units, use bitECS — the fastest JS ECS, designed for this scale:
                                                                                                                                                                              
  import { defineComponent, defineQuery, Types } from 'bitecs'
                                                                                                                                                                              
  // Components are typed arrays, zero GC pressure                
  const Position    = defineComponent({ x: Types.f32, y: Types.f32 })                                                                                                         
  const UnitStats   = defineComponent({ hp: Types.ui16, strength: Types.ui8, movement: Types.ui8 })
  const Ownership   = defineComponent({ civId: Types.ui8 })                                                                                                                   
  const Promotions  = defineComponent({ bitmask: Types.ui32 }) // 32 promotions as flags                                                                                      
                                                                                                                                                                              
  // Query runs over only matching entities                                                                                                                                   
  const combatQuery = defineQuery([Position, UnitStats, Ownership])                                                                                                           
                                                                                                                                                                              
  bitECS stores all component data in SharedArrayBuffer-backed TypedArrays, so unit state can be directly read by the main thread renderer with zero serialization cost.      
                                                                                                                                                                              
  ---                                                                                                                                                                         
  Communication Pattern                                           
                                                                                                                                                                              
  ┌─────────────────────────┬──────────────────────────────────────┬────────────────────────────────────┐
  │          Data           │              Mechanism               │                Why                 │                                                                     
  ├─────────────────────────┼──────────────────────────────────────┼────────────────────────────────────┤
  │ Tile terrain/visibility │ SharedArrayBuffer (read by renderer) │ Zero-copy, 2MB for 500×500         │
  ├─────────────────────────┼──────────────────────────────────────┼────────────────────────────────────┤
  │ Unit positions          │ SharedArrayBuffer (bitECS)           │ Renderer reads directly            │                                                                     
  ├─────────────────────────┼──────────────────────────────────────┼────────────────────────────────────┤
  │ Game events             │ MessageChannel structured clone      │ UNIT_MOVED, CITY_GREW, TURN_END    │                                                                     
  ├─────────────────────────┼──────────────────────────────────────┼────────────────────────────────────┤                                                                     
  │ AI → GameLogic commands │ MessageChannel                       │ ORDER_UNIT, BUILD_CITY             │
  ├─────────────────────────┼──────────────────────────────────────┼────────────────────────────────────┤                                                                     
  │ Worker RPC              │ Comlink                              │ Clean async/await over postMessage │
  └─────────────────────────┴──────────────────────────────────────┴────────────────────────────────────┘                                                                     
                                      
....

                                                                                                                                                                 
  Full Stack Summary                                              
                    
  ┌────────────────┬────────────────────────┬──────────────────────────────────────────────┐
  │    Concern     │         Choice         │                       Notes                       │                                                                             
  ├────────────────┼────────────────────────┼───────────────────────────────────────────────────┤
  │ Rendering         │ PixiJS v8              │ WebGL, sprite batching                            │                                                                          
  ├───────────────────┼────────────────────────┼───────────────────────────────────────────────────┤
  │ Camera/culling    │ pixi-viewport          │ Pan/zoom, only renders visible tiles              │
  ├───────────────────┼────────────────────────┼───────────────────────────────────────────────────┤                                                                          
  │ ECS               │ bitECS                 │ SharedArrayBuffer-native, handles 10K+            │
  ├───────────────────┼────────────────────────┼───────────────────────────────────────────────────┤                                                                          
  │ Worker RPC        │ Comlink                │ Clean async wrappers over postMessage             │
  ├───────────────────┼────────────────────────┼───────────────────────────────────────────────────┤                                                                          
  │ UI overlay        │ React + Zustand        │ Menus, HUD, city screens                          │
  ├───────────────────┼────────────────────────┼───────────────────────────────────────────────────┤                                                                          
  │ Build             │ Vite                   │ Native ?worker imports, fast HMR                  │
  ├───────────────────┼────────────────────────┼───────────────────────────────────────────────────┤                                                                          
  │ Pathfinding       │ Custom HPA* in worker  │ A* is too slow on 500×500; HPA* pre-clusters      │
  ├───────────────────┼────────────────────────┼───────────────────────────────────────────────────┤                                                                          
  │ Map gen           │ Worker (Simplex noise) │ Never blocks main thread                          │
  ├───────────────────┼────────────────────────┼───────────────────────────────────────────────────┤                                                                          
  │ Animation         │ PixiJS Ticker + GSAP   │ Unit move animations on main thread, non-blocking │
  ├───────────────────┼────────────────────────┼───────────────────────────────────────────────────┤                                                                          
  │ SharedArrayBuffer │ COOP + COEP headers    │ Required for SAB cross-origin isolation           │
  └───────────────────┴────────────────────────┴───────────────────────────────────────────────────┘                                                                          
                                                                  
  ---                                                                                                                                                                         
  Project Structure                                               
                                                                                                                                                                              
  src/                                                            
  ├── core/
  │   ├── registry/        # GameRegistry — units, terrains, buildings, etc.
  │   ├── rules/           # RulesEngine — combat, yields, diplomacy                                                                                                          
  │   └── turn/            # TurnManager
  ├── workers/                                                                                                                                                                
  │   ├── game-logic/      # Main game worker (ECS world, turn engine)
  │   ├── ai/              # AI worker(s) — strategic + tactical                                                                                                              
  │   └── pathfinding/     # HPA* pathfinder                                                                                                                                  
  ├── renderer/                                                                                                                                                               
  │   ├── map/             # PixiJS map, TileContainer, SpritePool                                                                                                            
  │   ├── viewport/        # Camera, culling, pan/zoom                                                                                                                        
  │   └── animations/      # Unit movement, combat animations                                                                                                                 
  ├── ui/                  # React components (HUD, city screen, tech tree)
  ├── shared/                                                                                                                                                                 
  │   ├── types/           # Shared TypeScript interfaces         
  │   ├── buffers/         # SharedArrayBuffer layout constants                                                                                                               
  │   └── events/          # Worker message type definitions                                                                                                                  
  └── data/
      ├── definitions/     # Your existing JSON files                                                                                                                         
      └── assets/          # Sprite atlases (packed at build time)
                                                                                                                                                                              
  ---                                                             
  Key Performance Notes
                                                                                                                                                                              
  1. Never render 250K tiles — pixi-viewport culls to ~400 visible tiles; only those Containers exist in the scene graph
  2. Sprite pooling — recycle Sprite objects as the viewport pans instead of destroying/creating                                                                              
  3. Dirty flags — the game worker sends only changed tile coords to the renderer; never full-map diffs                                                                       
  4. Texture atlases — pack all terrain/unit PNGs with TexturePacker at build time; one bind per category                                                                     
  5. bitECS queries are O(matching entities), not O(all entities) — AI and pathfinding workers iterate only relevant subsets                                                  
  6. SharedArrayBuffer for fog-of-war — the renderer reads visibility bits directly without a postMessage round trip per tile                                                 
                                                                                                                                                                              
  This stack gives you a clean separation: data (JSON) → rules engine (workers) → ECS state (SharedArrayBuffer) → renderer (PixiJS). Each layer is independently testable and   moddable.         

