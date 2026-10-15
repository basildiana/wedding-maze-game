# Path to the Chuppah 💍

A romantic, wedding-themed 2D maze game that runs entirely in the browser. Two partners start in opposite corners of a randomly generated maze. Find the **wedding ring**, dodge the wedding chaos, and meet under the **chuppah** at the exact centre of the maze for the wedding kiss.

**Play:** https://basildiana.github.io/wedding-maze-game/

## Setup

1. **Choose your couple:** Woman & Man, Two Women, or Two Men.
2. **Choose a game mode:**
   - **Single Player:** you guide the first partner (WASD *or* Arrow keys) from the top-left corner. The second partner walks from the bottom-right corner to the chuppah on their own.
   - **2 Players (Co-op):** both partners are controlled at the same time and share lives.
     - **Player 1:** WASD (top-left partner)
     - **Player 2:** Arrow keys (bottom-right partner)

| Key | Action |
| --- | --- |
| W A S D | Player 1 (or the solo player) |
| Arrow keys | Player 2 (or the solo player) |
| P / Esc | Pause |
| M | Toggle sound |

On touch devices an on-screen D-pad controls Player 1.

## Rules

- There is exactly **one wedding ring** per level. It is **required**: the kiss can't happen until it has been collected. Picking it up gives **+500 points** and a 3-second golden shield.
- Collect **hearts** for +100 points each.
- Avoid the hazards — each hit costs one shared life (3 in total):
  - **Wedding guests** wander unpredictably (and sometimes stop to chat).
  - **Champagne corks** shoot out of bottles — watch for the bottle shaking.
  - **Alarm clocks** are safe until they shake and start ringing.
- The chuppah plaza at the centre is a **safe zone**.
- When both partners are under the chuppah with the ring, the kiss animation plays and the level is won. Each level gets bigger and faster; finishing a level restores one life.
- Score = hearts + ring + time bonus + lives bonus + level bonus. Your best score and setup choices are saved in your browser.

## Tech

- Vanilla HTML, CSS and JavaScript — no frameworks, no build step, no backend, no external requests.
- HTML5 `<canvas>` rendering; all art is drawn in code and all sounds are synthesised with the Web Audio API.
- Mazes are generated with a recursive backtracker plus a little "braiding" so there are multiple routes, with a 3×3 plaza opened at the centre for the chuppah.

## Run locally

Just open `index.html` in a browser.

## Files

- `index.html` — markup, HUD, setup screens and overlays
- `style.css` — wedding-palette styling
- `game.js` — maze generation, game loop, characters, collisions, hazards, particles and audio
