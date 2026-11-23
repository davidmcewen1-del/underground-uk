# Primordial (evolution game prototype)

Open `index.html` in a browser. No build step.

Files: `shared.js` (saving, popups, age list), `age1.js`, `age2.js`. The game autosaves to the browser every 15 seconds and offers Continue on the next visit.

## Age 1: Primordial Soup

Four species of single cells share one pool. Yours are teal.

- **Swim:** you control one cell (gold ring). Hold or drag anywhere and it swims there (arrow keys or WASD on desktop). Eat algae and swim into smaller rival cells to eat them.
- **DNA:** your species earns DNA by eating and hunting, and your own cell earns the most. Spend it on species-wide upgrades: flagella, eyespot, metabolism, rapid division, spines and shell. Rival species buy upgrades too.
- **Abilities:** Split (divide your cell on command), Rally (nearby cells swarm after you and attack smaller rivals) and Dash (burst of speed; ram smaller cells). Keys F, R and Space; P pauses.
- **Missions** every 30 seconds or so: grow your colony, race to golden algae (pick 1 of 3 free mutations), hunt a rival species, or kill an elite hunter.
- **Natural selection:** cull your weak cells for free, or rivals for 3 DNA. Favour good cells, or drop food.
- **Learning:** every cell has a small neural network brain (11 senses, 8 hidden neurons, 3 actions) that evolves across generations. Inspect any cell to watch its brain live.
- **Disasters:** volcanic vent, giant amoeba, ice age, plague (hits the most crowded species) and algae bloom. Extinct rivals come back as new strains after a disaster.
- **Win:** own 40% of the pool, reach generation 20, survive 3 disasters and win 25 hunts. **Lose:** your species goes extinct.

## Age 2: Shallow Sea

Unlocked by winning Age 1. Your Age 1 upgrades become starting body parts, and the 24 best brains carry over (their first 11 inputs mean the same thing in both ages).

- A large sea with four zones: shore, sunny shallows (most plants), reef and the dark deep (meat, and a hunter that can be killed for 40 DNA).
- **Body editor:** body segments, fins, eyes, spikes, armour, tail fluke (unlocks Dash) and legs, plus a choice of mouth: grazer, beak or jaws.
- Creatures have health and bite each other. Dead bodies drop meat.
- Disasters: red tide, the hunter rising, cold current, storm surge and plague.
- **Win:** 8 body parts, generation 15, 15 fights won, 3 disasters survived, and walk on the shore for 5 seconds with legs.

## Planned ages

1. Primordial Soup (built)
2. Shallow Sea (built)
3. Creatures
4. Tribe
5. Settlement (Settlers-style economy)
6. Kingdom (Warcraft-style RTS)
7. City (SimCity-style city building)
8. Civilization (Civ-style world map)
