// React Hook to load and run MediaPipe Tasks-Vision Hand Landmarker client-side

import { useEffect, useRef, useState } from 'react';

// Connection pairs for drawing the hand skeleton
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [0, 9], [9, 10], [10, 11], [11, 12],   // Middle
  [0, 13], [13, 14], [14, 15], [15, 16], // Ring
  [0, 17], [17, 18], [18, 19], [19, 20]  // Pinky
];

export interface HandDetectionResult {
  landmarks: any[][];
  handedness: { score: number; index: number; categoryName: 'Left' | 'Right'; displayName: string }[][];
}

export const useMediaPipe = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const landmarkerRef = useRef<any>(null);

  useEffect(() => {
    let active = true;

    const initMediaPipe = async () => {
      try {
        setLoading(true);
        setError(null);

        // Dynamically import Tasks Vision to ensure no SSR errors
        const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm'
        );

        if (!active) return;

        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
        });

        if (active) {
          landmarkerRef.current = landmarker;
          setLoading(false);
        }
      } catch (err: any) {
        console.error('Failed to initialize MediaPipe:', err);
        if (active) {
          setError(err?.message || 'Failed to load hand tracking model.');
          setLoading(false);
        }
      }
    };

    initMediaPipe();

    return () => {
      active = false;
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
      }
    };
  }, []);

  const detect = (videoElement: HTMLVideoElement, timestamp: number): HandDetectionResult | null => {
    if (!landmarkerRef.current || !videoElement || videoElement.readyState < 2) {
      return null;
    }

    try {
      const results = landmarkerRef.current.detectForVideo(videoElement, timestamp);
      return {
        landmarks: results.landmarks || [],
        handedness: results.handednesses || [],
      };
    } catch (err) {
      console.error('Error running hand landmarker:', err);
      return null;
    }
  };

  const drawSkeleton = (
    ctx: CanvasRenderingContext2D,
    landmarks: any[],
    colorTheme: 'green' | 'pink'
  ) => {
    const dotColor = colorTheme === 'green' ? '#10b981' : '#f43f5e';     // emerald or rose
    const lineColor = colorTheme === 'green' ? '#34d399' : '#fb7185';    // emerald-400 or rose-400
    const glowColor = colorTheme === 'green' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)';

    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    // Draw connecting lines with glow
    ctx.lineWidth = 3;
    ctx.strokeStyle = lineColor;
    ctx.shadowBlur = 8;
    ctx.shadowColor = lineColor;

    HAND_CONNECTIONS.forEach(([startIdx, endIdx]) => {
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];
      
      if (start && end) {
        ctx.beginPath();
        // Landmarks are normalized [0, 1] relative to video dimensions
        ctx.moveTo(start.x * width, start.y * height);
        ctx.lineTo(end.x * width, end.y * height);
        ctx.stroke();
      }
    });

    // Reset shadow for dots
    ctx.shadowBlur = 0;

    // Draw joint dots with a small glow ring
    landmarks.forEach((landmark) => {
      const x = landmark.x * width;
      const y = landmark.y * height;

      // Glow ring
      ctx.fillStyle = glowColor;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 2 * Math.PI);
      ctx.fill();

      // Inner dot
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, 2 * Math.PI);
      ctx.fill();
    });
  };

  return {
    loading,
    error,
    detect,
    drawSkeleton,
  };
};
