
# OpenCV Gesture Arena — Full Project Plan

### "Battle of the Hands" — Multiplayer Hand Cricket + Rock, Paper, Scissors

---

## 1. Project Overview

**OpenCV Gesture Arena** is a real-time, computer-vision-powered gaming platform where players use hand gestures (captured via webcam) to play two classic games:

1. **Hand Cricket** — a finger-count guessing game popular across South Asia.
2. **Rock, Paper, Scissors (RPS)** — a globally recognized hand gesture game.

The system uses **MediaPipe Hands** (or OpenCV + a custom CNN) for real-time hand landmark detection, translates hand poses into game inputs, and supports both **Human vs AI** and **Human vs Human (multiplayer)** modes — locally (split-screen, single device, two webcams or one wide-angle feed) or online (two separate devices connected via WebRTC/WebSocket).

The end goal is a shareable, visually striking demo (for LinkedIn/portfolio) built on a genuinely reusable gesture-recognition engine.

---

## 2. Tech Stack

| Layer                        | Technology                                                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hand tracking                | MediaPipe Hands (21-point landmark model)                                                                                                                                        |
| Computer vision              | OpenCV (Python)                                                                                                                                                                  |
| Gesture classification       | Custom rule-based logic (landmark angles/distances) or lightweight ML model (scikit-learn/TensorFlow Lite)                                                                       |
| Backend / game server        | Python (FastAPI) or Node.js (Express)                                                                                                                                            |
| Real-time sync (multiplayer) | WebSockets (Socket.IO) or WebRTC data channels                                                                                                                                   |
| Frontend                     | Next.js + TypeScript + Tailwind (matches your existing stack) rendering a`<canvas>`/video overlay                                                                              |
| Video capture                | Browser`getUserMedia` API (if browser-based) or OpenCV `VideoCapture` (if native/Python app)                                                                                 |
| Deployment                   | Vercel (frontend) + a Python microservice (Render/Railway/Fly.io) for CV inference, or fully client-side via`mediapipe.js`/TensorFlow.js to avoid server video streaming costs |

**Recommendation:** Run hand-tracking **client-side** in the browser using `@mediapipe/tasks-vision` (JS) or TensorFlow.js. This avoids streaming raw video to a server (cheaper, faster, more private) — you only send small JSON gesture events ("fist", "4 fingers", "player scored") over WebSockets for multiplayer sync.

---

## 3. Core Gesture Recognition Engine (shared by both games)

### 3.1 Hand Landmark Detection

- MediaPipe returns 21 (x, y, z) landmarks per detected hand.
- Landmarks include fingertips, knuckles, and wrist — enough to compute finger curl state.

### 3.2 Finger Counting Logic

For each finger, compare the tip landmark's position to the joint below it:

- **Thumb:** compare x-position relative to the palm (special case, since it moves sideways not up/down).
- **Index, Middle, Ring, Pinky:** finger is "up" if tip.y < pip_joint.y (tip is higher than the middle joint).
- Sum of "up" fingers = the number shown (0–5 per hand).

### 3.3 Gesture Classification (for RPS)

| Gesture  | Rule                                           |
| -------- | ---------------------------------------------- |
| Rock     | 0 fingers up (closed fist)                     |
| Paper    | 5 fingers up (open palm)                       |
| Scissors | Exactly index + middle fingers up, others down |

### 3.4 Stability & Debounce

- Require the same gesture to be detected for **N consecutive frames** (e.g., 15 frames ≈ 0.5s at 30fps) before locking it in, to avoid false triggers from a hand mid-motion.
- Show a **countdown overlay ("3...2...1...SHOW!")** so both players commit their gesture at the same instant — critical for fairness in RPS and for simultaneous Hand Cricket "throws."

---

## 4. Game 1: Hand Cricket

### 4.1 Rules (Standard Hand Cricket)

1. Two players (or Human vs AI) take turns being **Batter** and **Bowler**.
2. On a synchronized countdown ("1, 2, 3, Show!"), both players simultaneously hold up 0–6 fingers.
3. **If the numbers match** → Batter is **OUT**. Innings ends, roles swap.
4. **If the numbers differ** → the Batter's number is **added to their score** (runs).
5. A coin toss (can be simulated via a random gesture round) decides who bats first.
6. Each side gets **one innings** (or a fixed number of overs/throws if you want a timed mode).
7. The side with the higher score wins.

### 4.2 Digital Adaptation Rules

- **Finger range:** 0–6 (cricket convention treats a fist as 6, not 0 — configurable).
- **Overs mode (optional):** Limit each innings to a fixed number of throws (e.g., 12 throws = "2 overs" of 6 balls) for faster games.
- **Boundary triggers:** A throw of 4 or 6 = visual "boundary" effect (red flash + "FOUR!"/"SIX!" graphic).
- **Wicket trigger:** Matching numbers = red "OUT!" graphic over animated wicket stumps.

### 4.3 Scoring Display

```
┌─────────────────────────────┐
│  🏏 HAND CRICKET             │
│  Batter: Player 1            │
│  Score: 24 / — (throws: 7)   │
│  Target: 31 (if 2nd innings) │
└─────────────────────────────┘
```

### 4.4 Win Condition

- 1st innings: batting side sets a target.
- 2nd innings: chasing side wins if they pass the target before getting out; otherwise the first side wins.
- Tie → sudden-death "super over" (one throw each, higher number wins).

---

## 5. Game 2: Rock, Paper, Scissors

### 5.1 Rules (Standard)

- Rock beats Scissors
- Scissors beats Paper
- Paper beats Rock
- Same gesture = Draw, replay the round

### 5.2 Digital Adaptation

- **Best-of-N format:** Best of 3, 5, or 7 rounds (configurable pre-match).
- **Countdown sync:** Same "Rock, Paper, Scissors, Shoot!" countdown overlay used for fairness.
- **Sudden death mode:** Optional endless mode — first to win by 2 clear rounds.

### 5.3 Scoring Display

```
┌─────────────────────────────┐
│  ✊✋✌️  RPS BATTLE            │
│  Player 1: ✋ Paper           │
│  Player 2: ✊ Rock            │
│  Round Winner: Player 1      │
│  Score: 2 - 1 (Best of 5)    │
└─────────────────────────────┘
```

---

## 6. Multiplayer Design

You want **true multiplayer** (not just Human vs AI). Here are the three modes to build, in order of complexity:

### 6.1 Mode A — Local Split-Screen (Same Device, Two Webcams or Wide Frame)

- Simplest to build first.
- Single machine runs two hand-tracking pipelines: left half of the camera frame = Player 1, right half = Player 2 (or two separate USB webcams).
- Game logic runs entirely client-side; no networking needed.
- **Best for:** demo videos, in-person events, your LinkedIn viral video.

### 6.2 Mode B — Online Multiplayer (Two Devices, Room-Based)

- Each player uses their own device/webcam, hand tracking runs locally in their browser (privacy + performance).
- Only the **classified gesture result** (e.g., `{"gesture": "rock", "player": "p1", "round": 3}`) is sent to a lightweight WebSocket server — not video.
- **Flow:**
  1. Player 1 creates a room → gets a shareable room code (like Kahoot/Jackbox).
  2. Player 2 joins via the code.
  3. Server broadcasts a synchronized countdown to both clients.
  4. Both clients detect gestures locally and submit results simultaneously.
  5. Server compares results, computes the winner, broadcasts the outcome + updated score to both.
- **Tech:** Socket.IO room feature handles this cleanly. Server holds minimal state per room: `{players: [], scores: {}, round: n, gameType: 'rps'|'cricket'}`.

### 6.3 Mode C — Spectator / Tournament Mode

- Add a spectator link so others can watch a live match (great for virality — "watch my AI battle live").
- Optional bracket system for tournament-style RPS/Cricket competitions among multiple friends — useful for a follow-up viral post ("48 people fought my AI, here's who won").

### 6.4 Networking Data Model (example)

```json
{
  "roomId": "AB12CD",
  "gameType": "handCricket",
  "players": {
    "p1": { "name": "Hello", "score": 24, "role": "batter" },
    "p2": { "name": "Guest", "score": 0, "role": "bowler" }
  },
  "round": 7,
  "status": "awaiting_gesture" | "revealing" | "finished"
}
```

---

## 7. System Architecture

```
┌─────────────────────┐        ┌─────────────────────┐
│   Player 1 Browser   │        │   Player 2 Browser   │
│  (Next.js + Camera)  │        │  (Next.js + Camera)  │
│  MediaPipe Hands JS  │        │  MediaPipe Hands JS  │
│  Local gesture calc  │        │  Local gesture calc  │
└──────────┬───────────┘        └──────────┬───────────┘
           │  WebSocket (gesture events)   │
           └───────────────┬───────────────┘
                            ▼
                 ┌────────────────────┐
                 │  Game Server        │
                 │  (Node/FastAPI +    │
                 │   Socket.IO rooms)  │
                 │  - Room management  │
                 │  - Score/rules logic│
                 │  - Broadcast state  │
                 └────────────────────┘
```

---

## 8. Suggested Build Order (Phased Roadmap)

**Phase 1 — Core Gesture Engine**

- Integrate MediaPipe Hands in browser.
- Build finger-counting + RPS gesture classifiers.
- Draw the "green skeleton" landmark overlay (this is your key visual/educational hook).

**Phase 2 — Single Player vs AI**

- RPS vs AI (AI picks randomly, or counter-strategy based on player history).
- Hand Cricket vs AI.
- Build scorecards and win/lose overlays (OUT!, FOUR!, SIX!, AI WINS, etc.)

**Phase 3 — Local Multiplayer (Split Screen)**

- Two-hand detection in a single frame, or dual camera input.
- This is your fastest path to a **viral demo video**.

**Phase 4 — Online Multiplayer**

- WebSocket room system.
- Synchronized countdown + simultaneous gesture submission.
- Handle disconnects/reconnects gracefully.

**Phase 5 — Polish for Virality**

- Add sound effects, crowd-cheer audio on boundaries/wins.
- Animated overlays (confetti on win, red flash on OUT).
- One-click clip export/share button (auto-generates a 15-sec highlight clip).
- Public leaderboard (Supabase table: `wins`, `losses`, `best_streak`).

**Phase 6 — Launch Content**

- Record the split-screen demo video.
- Post to LinkedIn with the CTA: *"Drop a comment for the full GitHub code link! What hand gesture game should my AI learn next?"*
- Open-source the repo to drive engagement/stars.

---

## 9. Content & Virality Notes

- **Educational hook:** Keep the green joint-tracking skeleton visible at all times — this is what makes engineers save/share the post.
- **Emotional hook:** Cricket taps a passionate fan base (South Asia); RPS taps a universal one. Splitting the screen shows range without diluting either game.
- **CTA:** Ask a question in the caption to drive comments (e.g., "What gesture game should I build next?").
- **Follow-up content ideas:** "I let 50 strangers play my AI," "Building a gesture-controlled tournament," "How I got 30ms gesture detection latency."

---

## 10. Open Questions to Decide Before Building

1. Should Hand Cricket use 0–6 finger range (fist = 6) or 0–5?
2. Best-of-3/5/7 default for RPS, or first-to-N?
3. Local split-screen first, or jump straight to online multiplayer?
4. Python-based (OpenCV native app) vs fully browser-based (MediaPipe.js/TF.js)? Browser-based is recommended for shareability and multiplayer networking.
5. Do you want persistent accounts/leaderboards (Supabase, matching your existing stack) or fully anonymous/session-based play?

---

*Next step: pick a phase from the roadmap above and we can scaffold the actual code (Next.js + MediaPipe Hands integration is the natural starting point).*

# OpenCV Gesture Arena — Full Project Plan

### "Battle of the Hands" — Multiplayer Hand Cricket + Rock, Paper, Scissors

---

## 1. Project Overview

**OpenCV Gesture Arena** is a real-time, computer-vision-powered gaming platform where players use hand gestures (captured via webcam) to play two classic games:

1. **Hand Cricket** — a finger-count guessing game popular across South Asia.
2. **Rock, Paper, Scissors (RPS)** — a globally recognized hand gesture game.

The system uses **MediaPipe Hands** (or OpenCV + a custom CNN) for real-time hand landmark detection, translates hand poses into game inputs, and supports both **Human vs AI** and **Human vs Human (multiplayer)** modes — locally (split-screen, single device, two webcams or one wide-angle feed) or online (two separate devices connected via WebRTC/WebSocket).

The end goal is a shareable, visually striking demo (for LinkedIn/portfolio) built on a genuinely reusable gesture-recognition engine.

---

## 2. Tech Stack

| Layer                        | Technology                                                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hand tracking                | MediaPipe Hands (21-point landmark model)                                                                                                                                        |
| Computer vision              | OpenCV (Python)                                                                                                                                                                  |
| Gesture classification       | Custom rule-based logic (landmark angles/distances) or lightweight ML model (scikit-learn/TensorFlow Lite)                                                                       |
| Backend / game server        | Python (FastAPI) or Node.js (Express)                                                                                                                                            |
| Real-time sync (multiplayer) | WebSockets (Socket.IO) or WebRTC data channels                                                                                                                                   |
| Frontend                     | Next.js + TypeScript + Tailwind (matches your existing stack) rendering a`<canvas>`/video overlay                                                                              |
| Video capture                | Browser`getUserMedia` API (if browser-based) or OpenCV `VideoCapture` (if native/Python app)                                                                                 |
| Deployment                   | Vercel (frontend) + a Python microservice (Render/Railway/Fly.io) for CV inference, or fully client-side via`mediapipe.js`/TensorFlow.js to avoid server video streaming costs |

**Recommendation:** Run hand-tracking **client-side** in the browser using `@mediapipe/tasks-vision` (JS) or TensorFlow.js. This avoids streaming raw video to a server (cheaper, faster, more private) — you only send small JSON gesture events ("fist", "4 fingers", "player scored") over WebSockets for multiplayer sync.

---

## 3. Core Gesture Recognition Engine (shared by both games)

### 3.1 Hand Landmark Detection

- MediaPipe returns 21 (x, y, z) landmarks per detected hand.
- Landmarks include fingertips, knuckles, and wrist — enough to compute finger curl state.

### 3.2 Finger Counting Logic

For each finger, compare the tip landmark's position to the joint below it:

- **Thumb:** compare x-position relative to the palm (special case, since it moves sideways not up/down).
- **Index, Middle, Ring, Pinky:** finger is "up" if tip.y < pip_joint.y (tip is higher than the middle joint).
- Sum of "up" fingers = the number shown (0–5 per hand).

### 3.3 Gesture Classification (for RPS)

| Gesture  | Rule                                           |
| -------- | ---------------------------------------------- |
| Rock     | 0 fingers up (closed fist)                     |
| Paper    | 5 fingers up (open palm)                       |
| Scissors | Exactly index + middle fingers up, others down |

### 3.4 Stability & Debounce

- Require the same gesture to be detected for **N consecutive frames** (e.g., 15 frames ≈ 0.5s at 30fps) before locking it in, to avoid false triggers from a hand mid-motion.
- Show a **countdown overlay ("3...2...1...SHOW!")** so both players commit their gesture at the same instant — critical for fairness in RPS and for simultaneous Hand Cricket "throws."

---

## 4. Game 1: Hand Cricket

### 4.1 Rules (Standard Hand Cricket)

1. Two players (or Human vs AI) take turns being **Batter** and **Bowler**.
2. On a synchronized countdown ("1, 2, 3, Show!"), both players simultaneously hold up 0–6 fingers.
3. **If the numbers match** → Batter is **OUT**. Innings ends, roles swap.
4. **If the numbers differ** → the Batter's number is **added to their score** (runs).
5. A coin toss (can be simulated via a random gesture round) decides who bats first.
6. Each side gets **one innings** (or a fixed number of overs/throws if you want a timed mode).
7. The side with the higher score wins.

### 4.2 Digital Adaptation Rules

- **Finger range:** 0–6 (cricket convention treats a fist as 6, not 0 — configurable).
- **Overs mode (optional):** Limit each innings to a fixed number of throws (e.g., 12 throws = "2 overs" of 6 balls) for faster games.
- **Boundary triggers:** A throw of 4 or 6 = visual "boundary" effect (red flash + "FOUR!"/"SIX!" graphic).
- **Wicket trigger:** Matching numbers = red "OUT!" graphic over animated wicket stumps.

### 4.3 Scoring Display

```
┌─────────────────────────────┐
│  🏏 HAND CRICKET             │
│  Batter: Player 1            │
│  Score: 24 / — (throws: 7)   │
│  Target: 31 (if 2nd innings) │
└─────────────────────────────┘
```

### 4.4 Win Condition

- 1st innings: batting side sets a target.
- 2nd innings: chasing side wins if they pass the target before getting out; otherwise the first side wins.
- Tie → sudden-death "super over" (one throw each, higher number wins).

---

## 5. Game 2: Rock, Paper, Scissors

### 5.1 Rules (Standard)

- Rock beats Scissors
- Scissors beats Paper
- Paper beats Rock
- Same gesture = Draw, replay the round

### 5.2 Digital Adaptation

- **Best-of-N format:** Best of 3, 5, or 7 rounds (configurable pre-match).
- **Countdown sync:** Same "Rock, Paper, Scissors, Shoot!" countdown overlay used for fairness.
- **Sudden death mode:** Optional endless mode — first to win by 2 clear rounds.

### 5.3 Scoring Display

```
┌─────────────────────────────┐
│  ✊✋✌️  RPS BATTLE            │
│  Player 1: ✋ Paper           │
│  Player 2: ✊ Rock            │
│  Round Winner: Player 1      │
│  Score: 2 - 1 (Best of 5)    │
└─────────────────────────────┘
```

---

## 6. Multiplayer Design

You want **true multiplayer** (not just Human vs AI). Here are the three modes to build, in order of complexity:

### 6.1 Mode A — Local Split-Screen (Same Device, Two Webcams or Wide Frame)

- Simplest to build first.
- Single machine runs two hand-tracking pipelines: left half of the camera frame = Player 1, right half = Player 2 (or two separate USB webcams).
- Game logic runs entirely client-side; no networking needed.
- **Best for:** demo videos, in-person events, your LinkedIn viral video.

### 6.2 Mode B — Online Multiplayer (Two Devices, Room-Based)

- Each player uses their own device/webcam, hand tracking runs locally in their browser (privacy + performance).
- Only the **classified gesture result** (e.g., `{"gesture": "rock", "player": "p1", "round": 3}`) is sent to a lightweight WebSocket server — not video.
- **Flow:**
  1. Player 1 creates a room → gets a shareable room code (like Kahoot/Jackbox).
  2. Player 2 joins via the code.
  3. Server broadcasts a synchronized countdown to both clients.
  4. Both clients detect gestures locally and submit results simultaneously.
  5. Server compares results, computes the winner, broadcasts the outcome + updated score to both.
- **Tech:** Socket.IO room feature handles this cleanly. Server holds minimal state per room: `{players: [], scores: {}, round: n, gameType: 'rps'|'cricket'}`.

### 6.3 Mode C — Spectator / Tournament Mode

- Add a spectator link so others can watch a live match (great for virality — "watch my AI battle live").
- Optional bracket system for tournament-style RPS/Cricket competitions among multiple friends — useful for a follow-up viral post ("48 people fought my AI, here's who won").

### 6.4 Networking Data Model (example)

```json
{
  "roomId": "AB12CD",
  "gameType": "handCricket",
  "players": {
    "p1": { "name": "Hello", "score": 24, "role": "batter" },
    "p2": { "name": "Guest", "score": 0, "role": "bowler" }
  },
  "round": 7,
  "status": "awaiting_gesture" | "revealing" | "finished"
}
```

---

## 7. System Architecture

```
┌─────────────────────┐        ┌─────────────────────┐
│   Player 1 Browser   │        │   Player 2 Browser   │
│  (Next.js + Camera)  │        │  (Next.js + Camera)  │
│  MediaPipe Hands JS  │        │  MediaPipe Hands JS  │
│  Local gesture calc  │        │  Local gesture calc  │
└──────────┬───────────┘        └──────────┬───────────┘
           │  WebSocket (gesture events)   │
           └───────────────┬───────────────┘
                            ▼
                 ┌────────────────────┐
                 │  Game Server        │
                 │  (Node/FastAPI +    │
                 │   Socket.IO rooms)  │
                 │  - Room management  │
                 │  - Score/rules logic│
                 │  - Broadcast state  │
                 └────────────────────┘
```

---

## 8. Suggested Build Order (Phased Roadmap)

**Phase 1 — Core Gesture Engine**

- Integrate MediaPipe Hands in browser.
- Build finger-counting + RPS gesture classifiers.
- Draw the "green skeleton" landmark overlay (this is your key visual/educational hook).

**Phase 2 — Single Player vs AI**

- RPS vs AI (AI picks randomly, or counter-strategy based on player history).
- Hand Cricket vs AI.
- Build scorecards and win/lose overlays (OUT!, FOUR!, SIX!, AI WINS, etc.)

**Phase 3 — Local Multiplayer (Split Screen)**

- Two-hand detection in a single frame, or dual camera input.
- This is your fastest path to a **viral demo video**.

**Phase 4 — Online Multiplayer**

- WebSocket room system.
- Synchronized countdown + simultaneous gesture submission.
- Handle disconnects/reconnects gracefully.

**Phase 5 — Polish for Virality**

- Add sound effects, crowd-cheer audio on boundaries/wins.
- Animated overlays (confetti on win, red flash on OUT).
- One-click clip export/share button (auto-generates a 15-sec highlight clip).
- Public leaderboard (Supabase table: `wins`, `losses`, `best_streak`).

**Phase 6 — Launch Content**

- Record the split-screen demo video.
- Post to LinkedIn with the CTA: *"Drop a comment for the full GitHub code link! What hand gesture game should my AI learn next?"*
- Open-source the repo to drive engagement/stars.

---

## 9. Content & Virality Notes

- **Educational hook:** Keep the green joint-tracking skeleton visible at all times — this is what makes engineers save/share the post.
- **Emotional hook:** Cricket taps a passionate fan base (South Asia); RPS taps a universal one. Splitting the screen shows range without diluting either game.
- **CTA:** Ask a question in the caption to drive comments (e.g., "What gesture game should I build next?").
- **Follow-up content ideas:** "I let 50 strangers play my AI," "Building a gesture-controlled tournament," "How I got 30ms gesture detection latency."

---

## 10. Open Questions to Decide Before Building

1. Should Hand Cricket use 0–6 finger range (fist = 6) or 0–5?
2. Best-of-3/5/7 default for RPS, or first-to-N?
3. Local split-screen first, or jump straight to online multiplayer?
4. Python-based (OpenCV native app) vs fully browser-based (MediaPipe.js/TF.js)? Browser-based is recommended for shareability and multiplayer networking.
5. Do you want persistent accounts/leaderboards (Supabase, matching your existing stack) or fully anonymous/session-based play?

---

*Next step: pick a phase from the roadmap above and we can scaffold the actual code (Next.js + MediaPipe Hands integration is the natural starting point).*
