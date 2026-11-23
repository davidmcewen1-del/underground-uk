# Primordial (evolution game prototype)

Open `index.html` in a browser. No build step. Files: `shared.js` (saving and popups) and `world.js` (the game). The game autosaves to the browser every 15 seconds.

## Open world

One generated map (a continent, islands and ocean) where life evolves on its own from start to finish:

1. **Cells** appear at a vent in shallow coastal water.
2. **Swimmers:** after enough generations a cell species becomes multicellular.
3. **Plants** spread over the bare land once multicellular life exists.
4. **Amphibians:** swimmers living near the coast grow legs and crawl onto the beach.
5. **Land animals:** amphibians that live on land for generations lose their need for water. Herds form, and predators branch off.

Every creature has a small neural-network brain (10 senses, 6 hidden neurons, turn and move) that is inherited with mutations. New species branch off at each stage, some becoming predators. The clock runs from 3.8 billion years ago and slows down as life gets more complex.

**The player is natural selection:** pan and zoom around the world, inspect or follow any creature, favour one species (less energy use, faster evolution to the next stage), cull creatures, drop food, or strike with a meteor. A history panel records milestones and says what comes next. Tap an entry to jump there.

Tribes, settlements, cities and civilization are planned for this same map.

`age1.js` and `age2.js` are the earlier stage-by-stage prototype (single cells, then the Shallow Sea). They are kept for reference but no longer loaded.
