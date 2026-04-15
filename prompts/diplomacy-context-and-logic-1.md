(
generated with prompt: 

role: you are helping me ask a prompt to claude code to implement the city management and production of a civilization 4 like game. 

task 1:
Explain the context of civilizations diplomacy, 
peace, 
open borders, 
war, 
basal, 
alliance / mutual protection sign. 
How points are gain or loose with other civilizations. 
Declare war. 
player glance, (a table displaying player x player glance, this is a positive number for good relationship, negative numbers for bad relationship)

task 2:
civilization leaders, when talking with a civilization in foreign advisor mode, the civilization is represented by name and leader, for example, Rome -> Julius Cesar. see notes/civ-reference/civilizations.json for civilization and leaders examples

task 3:
Implement the logic of diplomacy above and write 

task 4:
Then ask to implement this UI

 * a "foreign advisor" (diplomacy) where i can see all players relationships between them (war, open borders, basal, etc) as a player graph
 * glance table
 * Player can perform diplomacy actions on another user like: 
   * declare war, 
   * firm peace
   * open borders
 * please also add other details or nuances on civ 4 diplomacy and foreign advisor features.

task 5: 
on game creation, user can choose civilization by name and civilization leader

-----




Task 1 — Diplomacy context (Part A)
                                                                                                                                                    
  Four statuses: peace, war, openBorders, alliance. The glance score is computed from five accumulated modifiers rather than stored directly — this
  mirrors how Civ 4 actually works (modifiers decay/grow independently, score is derived). The formula is concrete: war memory penalizes up to −50  
  total, open borders rewards up to +8, the at-war flat −20 makes war feel immediately severe.
                                                                                                                                                    
  Task 2 — Civilization leaders (Parts C, H, K)                                                                                                     
   
  src/data/civilizations.ts extracts the 34 civilizations and their leaders from the JSON into a hardcoded CIV_DEFINITIONS constant. The Player     
  interface gains civName and leaderName. The New Game menu gets two dropdowns — civilization and leader — with the leader list filtering
  dynamically when the civ changes. AI players get randomly assigned civs.                                                                          
                                                                  
  Task 3 — Logic layer (Parts D–G)

  Three pure-function files: types.ts (data shapes), relations.ts (all state transitions + per-turn advancement), aiDiplomacy.ts (probabilistic AI  
  reactions). Tests verify the score formula, all bilateral state changes, and turn advancement with war/peace/shared-war.
                                                                                                                                                    
  Task 4 — Foreign Advisor UI (Part L)                                                                                                              
   
  Four sections in one panel: a status grid (symbols + color tints), a glance score matrix (color-coded by friendliness), per-player action buttons 
  filtered by current status, and a recent-events feed showing AI-initiated actions in amber and player actions in blue. The diplomacy action
  buttons call through the store's diplomacyActionFn wired in main.ts, keeping game logic out of React.                                             
                                                                  
  Task 5 — Civ selection at game creation (Parts C, H, K)                                                                                           
   
  Handled by adding playerCivs to GameConfig, two new dropdowns in NewGameMenu, and updating buildPlayers to consume the choices.  