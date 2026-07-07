// Gesture Classifier for Hand Cricket and Rock, Paper, Scissors

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

// Calculate Euclidean distance between two 3D landmarks
export const getDistance = (p1: Landmark, p2: Landmark): number => {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = p1.z - p2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

export interface GestureResult {
  fingersUp: boolean[];
  fingerCount: number; // 0 to 5 (or 6 for fist)
  gesture: 'rock' | 'paper' | 'scissors' | 'unknown';
}

/**
 * Classifies a hand pose based on MediaPipe 21 landmarks.
 * Landmarks list:
 * 0: Wrist, 1-4: Thumb, 5-8: Index, 9-12: Middle, 13-16: Ring, 17-20: Pinky
 * 
 * Handedness is 'Left' or 'Right' as returned by MediaPipe.
 */
export const classifyHandGesture = (landmarks: Landmark[], handedness: 'Left' | 'Right'): GestureResult => {
  if (!landmarks || landmarks.length < 21) {
    return {
      fingersUp: [false, false, false, false, false],
      fingerCount: 0,
      gesture: 'unknown',
    };
  }

  // 1. Calculate Palm Size reference (Wrist to Middle Finger MCP)
  const palmSize = getDistance(landmarks[0], landmarks[9]);

  // 2. Classify Index, Middle, Ring, Pinky
  // A finger is extended if its TIP is further from the wrist than its PIP joint,
  // or simply if tip.y is lower (smaller value) than the PIP joint (for vertical hands).
  // To handle various hand rotations, comparing the tip-to-wrist distance versus PIP-to-wrist distance is more robust.
  const isIndexUp = getDistance(landmarks[8], landmarks[0]) > getDistance(landmarks[6], landmarks[0]);
  const isMiddleUp = getDistance(landmarks[12], landmarks[0]) > getDistance(landmarks[10], landmarks[0]);
  const isRingUp = getDistance(landmarks[16], landmarks[0]) > getDistance(landmarks[14], landmarks[0]);
  const isPinkyUp = getDistance(landmarks[20], landmarks[0]) > getDistance(landmarks[18], landmarks[0]);

  // 3. Classify Thumb
  // The thumb moves sideways relative to the palm.
  // We can measure the distance between thumb tip (4) and the index finger knuckle (5).
  // If it's stretched out, the distance is large.
  const thumbTipToIndexKnuckle = getDistance(landmarks[4], landmarks[5]);
  
  // Also compare the thumb tip to the thumb IP joint (3) to make sure it's not curled inward.
  const isThumbUp = thumbTipToIndexKnuckle > palmSize * 0.45 && 
                    getDistance(landmarks[4], landmarks[2]) > palmSize * 0.35;

  const fingersUp = [isThumbUp, isIndexUp, isMiddleUp, isRingUp, isPinkyUp];
  const activeFingersCount = fingersUp.filter(Boolean).length;

  // 4. Determine Cricket values (0-6 fingers)
  // Standard Cricket:
  // - Fist (0 fingers up) is treated as a "6"
  // - Otherwise, count is the number of extended fingers (1-5)
  // If all 5 fingers are up, that's 5. If thumb + others are down, it maps directly.
  let fingerCount = activeFingersCount;
  if (activeFingersCount === 0) {
    fingerCount = 6; // Fist = 6 runs
  }

  // 5. Determine Rock, Paper, Scissors gesture
  // - Rock: 0 fingers up (fist)
  // - Paper: 5 fingers up (open palm)
  // - Scissors: Exactly Index and Middle fingers up, and Ring, Pinky and Thumb are down
  let gesture: 'rock' | 'paper' | 'scissors' | 'unknown' = 'unknown';

  if (activeFingersCount === 0) {
    gesture = 'rock';
  } else if (activeFingersCount === 5) {
    gesture = 'paper';
  } else if (isIndexUp && isMiddleUp && !isRingUp && !isPinkyUp) {
    gesture = 'scissors';
  }

  return {
    fingersUp,
    fingerCount,
    gesture,
  };
};

/**
 * Helper to debounce gestures over a series of frames.
 * Returns the most stable gesture in a list of history frames.
 */
export const getStableGesture = <T>(history: T[], requiredMatches = 5): T | null => {
  if (history.length < requiredMatches) return null;
  
  // Count occurrences of each value in history
  const counts = new Map<T, number>();
  for (const item of history) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }

  // Check if any item meets the required consecutive match count
  for (const [item, count] of counts.entries()) {
    if (count >= requiredMatches) {
      return item;
    }
  }

  return null;
};
