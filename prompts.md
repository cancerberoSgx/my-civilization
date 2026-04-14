
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


# unit movement
when a unit is selected and user right click another tile, a path to the tile must be drawn. 
The tile can be far away so it can take the unit many turns to reach destination
We want to save this unit-movement-paths so I don't need to re-enter movement orders to that unit next turn

p2
when unit is selected for movement, and I right click a tile to move it, while I'm pressing the button the path should be rendered in PINK color

p3
when I left-click a unit in the map, it gets selected for movement. Even if it already has a route assigned, as a user I can right click another route and override it

p4
as a user: 
 * I can select a unit for movement, even if it has no more movements in this turn
 * when unit is selected for movement I can see its current route (in pink)
 * when unit is selected for movement, entering "space" key will action "skip unit"
 * I can switch unit movement selection clicking left and right arrow keys
 * I can end turn pressing enter (only if end-turn action is available)

p5
as a user I can override unit movement path. If I select the unit I can right click another tile and redefine the current path


# unit images

can you help me using the right pixi.js assets packager so each unit is represented with transparent pngs in data/set1/units folder ? 
Create the necessary scripts to package individual image pngs to selected pixi.js assets package so we can add/edit more images and re-pack



# minimap

As a user I can see a minimap displaying the entire map in a component 1/4 the size of the screen. clicking inside the minimap will take me to that location in the main map. I can toggle minimap on-off from the top menu


# game builder

from the menu I can trigger the game builder which allows me:
 * i can add any unit belonging to any player on any tile. I see a list of players and a list of units, I can select a unit and then click on one tile of the map to add it there
 * I can change a tile's terrain
 * I can add or delete resources to a tile
 * I can add or remove  improvements from a tile
 * I can exit the game builder and continue playing


# game serialization

User should be able to save and load a game, this is the entire map, units and even units-movement-routes
let the user save the game, load a game. Use local storage. 
Also allow the user to save the game as .json file so they can continue the game in another device
In main menu there's a submenu file->save... and user can name the save, by default userName+timetamp
In main menu there's a submenu file->load... user can choose from all previously saved games
In main menu there's a submenu file->save as file... user can download the game as json file
In main menu there's a submenu file->load from file... user can select a local .json file to load the game




# FUTURE


# unit actions

besides moving, units can also perform actions. Depending on the current unit tile, actions can vary. 
For example, settlers can found a city and they are transformed into another unmovable unit called "city"
Workers can build roads so unit movement on roads multiplies x3, or irrigate a tile if it's adjacent to fresh water which gives more food  or build a mine in a hill or some particular resources which gives more production. shields  on current tile