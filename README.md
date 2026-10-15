# Path to the Chuppah 💍

A romantic, wedding-themed 2D maze game that runs entirely in the browser. Guide the **Bride** through a randomly generated maze, dodging wedding hazards, to meet her **Groom** under the chuppah for the wedding kiss.

**Play:** https://basildiana.github.io/wedding-maze-game/

## How to play

| Key | Action |
| --- | --- |
| Arrow keys / WASD | Move the Bride |
| P / Esc | Pause |
| M | Toggle sound |

On touch devices an on-screen D-pad appears.

- Collect **hearts** for +100 points each.
- Avoid the hazards — each hit costs one life (you have 3):
  - **Wedding guests** wander unpredictably (and sometimes stop to chat).
  - **Flying rings** bounce back and forth along corridors.
  - **Champagne corks** shoot out of bottles — watch for the bottle shaking.
  - **Alarm clocks** are safe until they shake and start ringing.
- Reach the Groom to win the level. Each level is bigger and faster; finishing a level restores one life.
- Score = hearts + time bonus + lives bonus + level bonus. Your best score is saved in your browser.

## Tech

- Vanilla HTML, CSS and JavaScript — no frameworks, no build step, no backend, no external requests.
- HTML5 `<canvas>` rendering; all art is drawn in code and all sounds are synthesised with the Web Audio API.
- Mazes are generated with a recursive backtracker plus a little "braiding" so there are multiple routes.

## Run locally

Just open `index.html` in a browser.

## Files

- `index.html` — markup, HUD and screens
- `style.css` — wedding-palette styling
- `game.js` — maze generation, game loop, collisions, obstacles, particles and audio
