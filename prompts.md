
# civ4 reference info extraction 

from nots/civ4-reference.xls  extract the table on tab "Units" in a unites.json file which is an array of objects with all the information one object per each row

from nots/civ4-reference.xls  extract the table on tab "Techs" in a techs.json file which is an array of objects with all the information one object per each row

from nots/civ4-reference.xls  extract the table on tab "Buildings" in a buildings.json file which is an array of objects with all the information one object per each row

from nots/civ4-reference.xls on tab "Resource and terrain" extract the table about "terrains" in a terrains.json file which is an array of objects with all the information one object per each row

from nots/civ4-reference.xls on tab "Resource and terrain" extract the table about "Resources" in a resources.json file which is an array of objects with all the information one object per each row

from nots/civ4-reference.xls  extract the table on tab "wonders" in a wonders.json file which is an array of objects with all the information one object per each row

from nots/civ4-reference.xls  extract the table on tab "civ & leader & traits" in a civilizations.json file which is an array of objects with all the information one object per each row


from nots/civ4-reference.xls  extract the table on tab "Resource and terrain" extract the table about "improvements" in a improvements.json file which is an array of objects with all the information one object per each row



# initial prompt

I want to build a civilization 4 like game. 
I want it to support easy extensions to customize everything such as units, terrains, buildings, etc
I want to be a webapp 100% in the browser, using typescript and webworkers
performance is important, I want to support maps up to 500x500 tiles and 10K units, ai players. 
Can you recommend UI frameworks to build such game and technologies such as html vs webgl, etc or gaming libraries that allow to do this ? 
each tile in the map must render, terrain, resources, improvements, units, etc. Each of them will be a transparent image one on top of each other.
I don't want the user to be blocked when calculating animations, tile rendering

could you recommend me the architecture for such a game in terms of web libraries, application state, webworkers, etc ? 

You can have a sense of each concept using these files:
[buildings](civ-reference/buildings.json) 
[civ4](civ-reference/civ4-reference.xls) 
[improvements](civ-reference/improvements.json) 
[resources](civ-reference/resources.json) 
[techs](civ-reference/techs.json) 
[terrains](civ-reference/terrains.json) 
[units](civ-reference/units.json) 
[wonders](civ-reference/wonders.json)


Rsepoinse:

 Here's my comprehensive architecture recommendation for your Civ4-like game:                                                                                                
                                                                                                                                                                              
  ---                                                                                                                                                                         
  Rendering: PixiJS v8                                                                                                                                                        
                                                                                                                                                                              
  Use PixiJS v8 (WebGL-based 2D renderer), not raw HTML Canvas or raw WebGL.                                                                                                  
                                                                                                                                                                              
  - WebGL renderer with WebGPU planned — handles 10K+ sprites at 60fps easily                                                                                                 
  - Sprite batching: all tile layers get batched into minimal draw calls                                                                                                      
  - pixi-viewport plugin: pan/zoom/cull — only renders the ~300 visible tiles from your 250K, automatically                                                                   
  - @pixi/tilemap: efficient instanced rendering for the static terrain layer                                                                                                 
  - TypeScript-first, active community                                                                                                                                        
                                                                                                                                                                              
  Do not use: Phaser (too opinionated, game-loop battles your workers), Three.js (3D overhead for a 2D game), plain Canvas (CPU-bound, 250K tiles will kill it).              
                                                                  
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


# first map impl: 
could you please implement it using a few terrains, units. By default use a 500x500 map with random units, terrain, resources, improvements, units so I can test it  performance. I should be able to zoom in-out, scroll vertical and horizontal, select units, get terrain info 


# players

context:
this is a civilization like game, so each unit belongs to a player. Players move their units turn based, in order
A game which includes N players. 
Some players can be human, meaning user need to move their units, and some players can be AI (moved from algorithms automatically)
tasks:
implement the concept of game and player
assign each unit to a player
to simplify all units can move only 1 tile on each turn _ in the future movement each unit have movement restrictions
by default start a game with two players, one human and one ai
on ai player turn, move all units randomly
on human turn, for each of its units, ask the player to move. Accomplish this by first focusing the unit in the board and make it selected. User can right click the map to move it to a tile. 
for both players, only when all units mvoe there's a "next turn" action. AI execute it automatically when all units moved. human player must click the button manually



# image generation tests:

given units data in notes/civ-reference/units-and-descriptions.json create a script scripts/src/generate-unit-images.ts which:
 * is based on scripts/src/gemini-image-generation/gemini-image-generation.ts to generate images using gemini
 * for each unit in notes/civ-reference/units-and-descriptions.json, it uses its "image-description" field to create a png image on scripts/tmp_units/$UNIT_NAME.png
 * runs the following shell script to generate a transparent background version and saves it to scripts/tmp_units/$UNIT_NAME-transparent.png
 * the script will run in the context of the "scripts" folder which is a typescript+node.js project already

p2: 
in scripts/src/generate-unit-images.ts "Strip green background" you don't use BG_COLOR variable but instead get the real background color using this command `convert input2.png -format "%[pixel:p{0,0}]" info:`. In summary you must execute these two commands:

bg=$(convert input2.png -format "%[pixel:p{0,0}]" info:)
convert input2.png -fuzz 20% -transparent "$bg" output2.png

in scripts/src/generate-unit-images.ts, implement the function applyTransparencyAgain() which will re-generate x-transparent.png files by executing the imagemagick commands again. The script will execute only that funcion if --regenerate-transparency is passed in cli command



# board

Concepts such as MAP_WIDTH, MAP_HEIGHT, NUM_CIVS, and CIV_COLORS which currently are defined in src/shared/constants.ts should be part of Game class and not hardcoded
Before loading the map, there's a menu which have an option "new game" where user can enter map width, height, and number of civs. Only after new game is created, the map is rendered using those values. 

when game start, each player has only these units: 1 settler, 1 worker 1 scout and 1 warrior 

# rivers

terrain tiles must support rivers. Rivers are drawn between two tiles and those two tiles will contain the "resource" "fresh water". Rivers are continuous curves flow from mountains or hills to ocean or lakes
rivers are drawn on the border of two adjacent tiles and affect both (fresh water)

p2: 
in rivers drawing algorithm: 
 * make sure the river line is continous, currently if the river direction is vertical, the river tile line is horizontal
 * make sure rivers always ends in ocean, or lake (water tile)
 * all the map must have rivers tiles uniformly more or less...


# map layouts

Context: 
there will be different map layouts, for example:
 * "islands" (10 or more islands)
 * continents
 * "panagea" (a bit single continent)
 * "inland sea" (a big sea sorounded by land)
 * "lakes" all tiles in the map are land with the exception of inner big lakes
tasks:
On create game modal, allow the user to configure which kind of terrain layout they want

