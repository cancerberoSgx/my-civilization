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



# civ4 reference info extraction 

from nots/civ4-reference.xls  extract the table on tab "Units" in a unites.json file which is an array of objects with all the information one object per each row

from nots/civ4-reference.xls  extract the table on tab "Techs" in a techs.json file which is an array of objects with all the information one object per each row

from nots/civ4-reference.xls  extract the table on tab "Buildings" in a buildings.json file which is an array of objects with all the information one object per each row

from nots/civ4-reference.xls on tab "Resource and terrain" extract the table about "terrains" in a terrains.json file which is an array of objects with all the information one object per each row

from nots/civ4-reference.xls on tab "Resource and terrain" extract the table about "Resources" in a resources.json file which is an array of objects with all the information one object per each row

from nots/civ4-reference.xls  extract the table on tab "wonders" in a wonders.json file which is an array of objects with all the information one object per each row

from nots/civ4-reference.xls  extract the table on tab "civ & leader & traits" in a civilizations.json file which is an array of objects with all the information one object per each row


from nots/civ4-reference.xls  extract the table on tab "Resource and terrain" extract the table about "improvements" in a improvements.json file which is an array of objects with all the information one object per each row
