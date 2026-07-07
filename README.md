# 🎮 HandBattle — Gesture Arena

An interactive, real-time, computer-vision-powered gaming platform where players use hand gestures captured via their webcams to compete in two classic games: **Hand Cricket** and **Rock, Paper, Scissors (RPS)**.

Built with **Next.js App Router**, **Tailwind CSS**, **Socket.IO**, and **Google MediaPipe Hands**, it runs entirely in the browser using WebAssembly. **No Python or OpenCV backend is required.**

---

## ⚡ Key Features

*   **🏏 Hand Cricket Mode:**
    *   Play turns as Batter and Bowler.
    *   Match gestures on a countdown sync.
    *   Wickets (OUT) on matching numbers.
    *   Special graphic effects for boundaries (**FOUR!** and **SIX!**).
*   **✊✋✌️ Rock, Paper, Scissors Mode:**
    *   Best-of-N configuration.
    *   Classic rules: Rock beats Scissors, Scissors beats Paper, Paper beats Rock.
*   **🤖 Vs AI Mode:**
    *   Play offline against a randomized AI opponent.
*   **👥 Local Split-Screen:**
    *   Play with a friend on the same screen/camera.
    *   Tracks two hands simultaneously (Left & Right of frame) with distinctive green & rose neon skeletons.
*   **🌐 Online Multiplayer:**
    *   Create rooms, share room codes, and sync game states in real-time via Socket.IO.
*   **🎵 8-bit Audio Engine:**
    *   Dynamic retro audio synthesized via the Web Audio API (zero external sound file dependencies).
*   **✨ Premium Visuals:**
    *   Glassmorphic dark UI with animated neon grids, ambient glows, confetti effects, and visual overlays.

---

## ⚙️ Architecture & How It Works

```
[ Webcam Feed ]
       │
       ▼
[ Browser getUserMedia API ]
       │
       ▼
[ MediaPipe Tasks-Vision (WASM) ]  <--- Runs client-side (no video streamed to servers)
       │ (Generates 21 3D Landmarks)
       ▼
[ gestureClassifier.ts (TS) ]      <--- Measures joint distances to determine poses
       │ (e.g. 0-5 fingers up / Rock-Paper-Scissors)
       ▼
┌──────────────────────────────────────┐
│        Game Manager (UI)             │
│   (Human vs AI / Local Split-Screen)  │
└──────────────────┬───────────────────┘
                   │
         (For Online Multiplayer)
                   ▼
  [ Socket.IO Events (Port 3001) ] <--- Only sends small JSON events (e.g. {"gesture": "rock"})
```

### 🧠 Gesture Classification Without Python/OpenCV
Instead of streaming video to a heavy Python backend running OpenCV and a CNN, HandBattle performs all calculations in-browser:
1.  **MediaPipe Hand Landmarker** detects the hand and maps it to **21 3D landmarks** (x, y, z coordinates).
2.  The application calculates Euclidean distances between landmarks (e.g., comparing fingertip distance to the wrist versus knuckle distance to the wrist).
3.  If a fingertip is extended further than its base knuckle, it is labeled **Up**.
4.  **Gesture Mapping:**
    *   **Rock:** 0 fingers up.
    *   **Paper:** 5 fingers up.
    *   **Scissors:** Exactly Index & Middle fingers up, others down.
    *   **Hand Cricket Numbers:** Count of fingers up (0 fingers up maps to standard Cricket "6").

---

## 📂 Project Structure

```
HandBattle/
├── docs/
│   ├── plan.md               # Original architectural plan
│   └── documentation.md      # Detailed system documentation
├── server/
│   └── server.js             # Socket.IO node backend server for online matches
└── src/
    ├── app/
    │   ├── globals.css       # Neon glassmorphism theme and utilities
    │   ├── layout.tsx
    │   └── page.tsx          # Main layout and ambient glows
    ├── components/
    │   └── GameArena.tsx     # Core game state, UI rendering, camera, and loop
    ├── hooks/
    │   └── useMediaPipe.ts   # MediaPipe HandLandmarker loading and canvas draw logic
    └── utils/
        ├── audioSynth.ts     # Synthesized 8-bit sound effects (Web Audio API)
        └── gestureClassifier.ts # Vector geometry-based hand gesture detector
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed (v18+ recommended).

### Install Dependencies

From the project root directory, install all required frontend and backend dependencies:

```bash
npm install
```

### Running the Project

Start the Next.js frontend (port 3000) and the Socket.IO server (port 3001) concurrently:

```bash
npm run dev:all
```

*   **Frontend UI:** `http://localhost:3000`
*   **Socket.IO Backend:** `http://localhost:3001`

*(Alternatively, you can run `npm run dev` to start only the frontend, or `npm run server` to start only the backend.)*

### Production Build

To build the application for deployment:

```bash
npm run build
```

---

## 📝 License

This project is open-source and free to use.
