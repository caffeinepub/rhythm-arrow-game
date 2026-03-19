# Rhythm Arrow Game (Neon Beatdown)

## Current State
New project. No existing application.

## Requested Changes (Diff)

### Add
- Full rhythm arrow game playable in browser
- Four arrow lanes (left, down, up, right) mapped to arrow keys
- Scrolling arrow notes generated to a beat pattern
- Hit detection with PERFECT / GOOD / MISS judgements
- Score, combo counter, and health bar HUD
- Multiple songs with beat maps stored in backend
- Global leaderboard: submit score with player name after game over
- Start screen, gameplay screen, and results screen
- Neon cyberpunk visual theme with character silhouettes

### Modify
- N/A (new project)

### Remove
- N/A

## Implementation Plan
1. Backend: store songs (name, BPM, beat map pattern), leaderboard entries (player name, song, score)
2. Backend: query songs list, get song beat map, submit score, get top scores per song
3. Frontend: game engine using Canvas + requestAnimationFrame for scrolling arrows
4. Frontend: keyboard input handler for arrow keys with precise timing
5. Frontend: hit judgement logic (PERFECT <50ms, GOOD <100ms, MISS otherwise)
6. Frontend: HUD overlay (score, combo, health bar)
7. Frontend: start screen with song selection
8. Frontend: results screen with score summary and leaderboard submission
9. Frontend: neon cyberpunk design matching design preview
