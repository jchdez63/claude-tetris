# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Tetris in vanilla JS + HTML5 Canvas. No build, no dependencies, no package.json, no tests, no linter. README is in Spanish.

## Run

Open `index.html` directly, or serve statically: `python -m http.server 8000` → http://localhost:8000.

## Architecture

Three files: `index.html` (DOM + two canvases: `#board` 300×600, `#next-canvas` 120×120, overlay), `style.css`, `game.js` (all logic, global script scope, `'use strict'`).

`game.js` uses module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`...) reset by `init()`. Flow: `loop` (rAF) → gravity → `lockPiece` (`merge` → `clearLines` → `spawn`) → `draw`. `spawn` triggers `endGame` if the new piece collides. Board cells hold 0 or a color/piece index (1–7) shared by `COLORS` and `PIECES`.

Gotchas:
- `COLS`/`ROWS`/`BLOCK` must match the `<canvas id="board">` width/height in `index.html` (`COLS×BLOCK` × `ROWS×BLOCK`).
- Pause/game-over stop the loop via `cancelAnimationFrame(animId)`; resume calls `loop` manually. `init()` also cancels before restarting.
- Random piece is uniform (no 7-bag); rotation kicks are simple horizontal offsets `[0,-1,1,-2,2]` (no SRS).
- Speed: `max(100, 1000 − (level−1)×90)` ms; level = `floor(lines/10)+1`.

## Idioma

Responder siempre en español en este proyecto.
