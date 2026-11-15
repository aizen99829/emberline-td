# emberline-td

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/aizen99829/emberline-td/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/aizen99829/emberline-td/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**EMBERLINE: Hold the Last Light** — an original tower-defense game in pure Canvas 2D
with no library and no asset files. Ember-creatures march a winding path through a dark
valley toward the Core, a glowing crystal. Build Spark, Frost, Mortar and Lance towers
on the stone pads, earn gold from kills and wave-clear bonuses, and survive all 12
waves — including the Ember Colossus boss on wave 12. Four tower types with genuinely
different roles (the Lance fires a slow piercing beam down the line), two upgrade
levels each, and per-tower targeting — every tower can be set to fire at the First,
Strongest or Closest enemy, and sold back for 70% of its cost. Five enemy types (fast
scuttlers, armoured brutes, splitters that break in two, regenerators, and the Aegis,
whose shield aura blunts damage to nearby allies), a telegraphed Ember Surge rush on
wave 6, kill-streak announcements with gold bonuses, synthesized WebAudio sound
effects, and a fixed-timestep simulation under a 60 fps render loop.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Click a stone pad to build (hover a
card to preview its range), click a tower to upgrade, sell it for 70%, or set its
targeting — First, Strong or Close, also on keys **1**/**2**/**3**. **P** pauses,
**Space** toggles 1x/2x speed, **M** mutes, **R** restarts. Survive wave 12 to win;
the Core falling to 0 HP ends the run.

## Files

- `game/index.html` — the page and canvas
- `game/src/config.js` — map, path, pads, tower/enemy/wave tuning, palette
- `game/src/main.js` — game state machine, fixed-timestep loop, debug hooks
- `game/src/towers.js` — tower placement, targeting, firing, upgrades, selling
- `game/src/enemies.js` — enemy movement, slow, regeneration, splitting, boss
- `game/src/waves.js` — the 12-wave composition and spawn schedule
- `game/src/economy.js` — gold, score, lives and wave bonuses
- `game/src/render.js` — all canvas drawing: valley, path, towers, enemies, HUD
- `game/src/input.js` — mouse and keyboard, pads, buttons, build menu
- `game/src/ui.js` — title, victory, defeat and pause screens, HUD data
- `game/src/audio.js` — synthesized WebAudio sound effects
- `main.ts` — hands the game in: copies `game/` + `screenshots/` to the output
  directory and writes `dossier.json` with the vendored make.fun library

---

<sub>Entered on [make.fun](https://make.fun/?ref=2a9s4gx3&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
