'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, RefreshCw, Volume2, VolumeX, User, Bot, Users, Globe, Play, HelpCircle, ArrowLeft, Send } from 'lucide-react';
import confetti from 'canvas-confetti';
import { io, Socket } from 'socket.io-client';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { classifyHandGesture, getStableGesture, Landmark } from '../utils/gestureClassifier';
import { playSound, toggleMute, getMutedState } from '../utils/audioSynth';

type GameType = 'cricket' | 'rps';
type GameMode = 'vs-ai' | 'local-coop' | 'online';
type PlayRole = 'batter' | 'bowler';

interface PlayerState {
  name: string;
  score: number;
  gesture: string | null;
  role?: PlayRole;
}

export default function GameArena() {
  // Navigation & Settings
  const [gameMode, setGameMode] = useState<GameMode | null>(null);
  const [gameType, setGameType] = useState<GameType>('cricket');
  const [showRules, setShowRules] = useState(false);
  const [isSoundMuted, setIsSoundMuted] = useState(false);

  // Match configurations
  const [overs, setOvers] = useState(2); // 12 throws for cricket
  const [maxRounds, setMaxRounds] = useState(5); // RPS best of 5
  
  // Game state variables
  const [status, setStatus] = useState<'setup' | 'waiting' | 'countdown' | 'evaluating' | 'finished'>('setup');
  const [countdownNum, setCountdownNum] = useState<string | number>('');
  const [p1State, setP1State] = useState<PlayerState>({ name: 'Player 1', score: 0, gesture: null, role: 'batter' });
  const [p2State, setP2State] = useState<PlayerState>({ name: 'AI', score: 0, gesture: null, role: 'bowler' });
  const [innings, setInnings] = useState<number>(1);
  const [target, setTarget] = useState<number | null>(null);
  const [throws, setThrows] = useState<number>(0);
  const [round, setRound] = useState<number>(1);
  const [winner, setWinner] = useState<string | null>(null);
  const [logText, setLogText] = useState<string>('Welcome to the Gesture Arena!');
  const [lastRoundDetail, setLastRoundDetail] = useState<string>('');
  const [visualEffect, setVisualEffect] = useState<'out' | 'four' | 'six' | 'tie' | 'win' | null>(null);

  // Webcam & Canvas Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Tracking histories for gesture debouncing
  const p1History = useRef<string[]>([]);
  const p2History = useRef<string[]>([]);
  const detectionFrameCount = useRef(0);
  const isLoopRunning = useRef(false);

  // Online Multiplayer State
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState<string>('');
  const [joinRoomId, setJoinRoomId] = useState<string>('');
  const [playerIndex, setPlayerIndex] = useState<number | null>(null); // 0 = host, 1 = joiner
  const [playerName, setPlayerName] = useState<string>('');

  // MediaPipe Hook
  const { loading: mpLoading, error: mpError, detect, drawSkeleton } = useMediaPipe();

  // Setup sound on mount
  useEffect(() => {
    setIsSoundMuted(getMutedState());
  }, []);

  const handleMuteToggle = () => {
    const nextMute = toggleMute();
    setIsSoundMuted(nextMute);
    playSound('click');
  };

  // Start webcam
  const startCamera = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
        };
      }
    } catch (err) {
      console.error('Camera open failed:', err);
      setLogText('Error: Camera permissions denied or unavailable.');
    }
  };

  // Stop webcam
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    isLoopRunning.current = false;
  };

  // Clean up socket & camera on unmount/mode change
  useEffect(() => {
    return () => {
      stopCamera();
      if (socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  // Connect to socket server
  const connectSocket = () => {
    if (socket) return socket;
    
    // Connect to server (runs locally on port 3001)
    const newSocket = io('http://localhost:3001');
    
    newSocket.on('connect', () => {
      console.log('Connected to socket server');
    });

    newSocket.on('roomCreated', ({ roomId, playerIndex: idx, roomState }) => {
      setRoomId(roomId);
      setPlayerIndex(idx);
      syncRoomState(roomState);
      setLogText(`Room created: ${roomId}. Send this code to a friend!`);
      setStatus('waiting');
    });

    newSocket.on('roomJoined', ({ roomId, playerIndex: idx, roomState }) => {
      setRoomId(roomId);
      if (playerIndex === null) setPlayerIndex(idx);
      syncRoomState(roomState);
      setLogText('Opponent joined! Ready to fight.');
      setStatus('waiting');
    });

    newSocket.on('gameConfigured', ({ roomState }) => {
      syncRoomState(roomState);
      setLogText('Host updated game configuration.');
    });

    newSocket.on('countdownTriggered', () => {
      runCountdownAnimation();
    });

    newSocket.on('roundResolved', ({ roomState, roundResult }) => {
      resolveOnlineRound(roomState, roundResult);
    });

    newSocket.on('rematchTriggered', ({ roomState }) => {
      syncRoomState(roomState);
      setLogText('Rematch initiated! Get ready.');
      setStatus('waiting');
    });

    newSocket.on('playerDisconnected', ({ message, roomState }) => {
      setLogText(message);
      syncRoomState(roomState);
      setStatus('waiting');
    });

    newSocket.on('errorMsg', ({ message }) => {
      alert(message);
    });

    setSocket(newSocket);
    return newSocket;
  };

  const syncRoomState = (room: any) => {
    setGameType(room.gameType);
    setInnings(room.innings);
    setTarget(room.target);
    setThrows(room.throws);
    setRound(room.round);
    setWinner(room.winner);
    
    // Set settings
    if (room.gameType === 'cricket') {
      setOvers(room.overs);
    } else {
      setMaxRounds(room.maxRounds);
    }

    if (playerIndex === 0) {
      setP1State({ name: room.players[0].name, score: room.players[0].score, gesture: room.players[0].gesture, role: room.players[0].role });
      if (room.players[1]) {
        setP2State({ name: room.players[1].name, score: room.players[1].score, gesture: room.players[1].gesture, role: room.players[1].role });
      } else {
        setP2State({ name: 'Waiting...', score: 0, gesture: null });
      }
    } else if (playerIndex === 1) {
      setP2State({ name: room.players[0].name, score: room.players[0].score, gesture: room.players[0].gesture, role: room.players[0].role });
      setP1State({ name: room.players[1].name, score: room.players[1].score, gesture: room.players[1].gesture, role: room.players[1].role });
    }

    if (room.status === 'finished') {
      setStatus('finished');
      if (room.winner === 'Tie') {
        setLogText('Game Over! It is a Tie!');
        setVisualEffect('tie');
      } else {
        setLogText(`Game Over! ${room.winner} wins the Match!`);
        // If local client is the winner
        const myStateName = playerIndex === 0 ? room.players[0].name : room.players[1].name;
        if (room.winner === myStateName) {
          triggerWinCelebration();
        } else {
          playSound('lose');
        }
      }
    } else if (room.status === 'ready') {
      setStatus('waiting');
    }
  };

  // Create room
  const handleCreateRoom = () => {
    if (!playerName.trim()) {
      alert('Please enter your name first!');
      return;
    }
    const sk = connectSocket();
    sk.emit('createRoom', { name: playerName });
  };

  // Join room
  const handleJoinRoom = () => {
    if (!playerName.trim()) {
      alert('Please enter your name first!');
      return;
    }
    if (!joinRoomId.trim()) {
      alert('Please enter a valid 4-letter Room Code.');
      return;
    }
    const sk = connectSocket();
    sk.emit('joinRoom', { roomId: joinRoomId, name: playerName });
  };

  const handleConfigureGame = (type: GameType) => {
    if (!socket || playerIndex !== 0) return;
    playSound('click');
    socket.emit('configureGame', {
      roomId,
      gameType: type,
      settings: type === 'cricket' ? { overs } : { maxRounds }
    });
  };

  // Trigger Online Countdown
  const triggerOnlineRound = () => {
    if (!socket || status !== 'waiting') return;
    playSound('click');
    socket.emit('startCountdown', { roomId });
  };

  // Local Game loop (Single player or Split Screen)
  const runLocalDetectionLoop = useCallback(() => {
    if (!isLoopRunning.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      requestAnimationFrame(runLocalDetectionLoop);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      requestAnimationFrame(runLocalDetectionLoop);
      return;
    }

    // Clear and match dims
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Mirror horizontal draws to match mirrored user camera stream preview
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    const timestamp = performance.now();
    const result = detect(video, timestamp);

    let detectedP1Gesture: string | null = null;
    let detectedP2Gesture: string | null = null;

    if (result && result.landmarks && result.landmarks.length > 0) {
      // Sort hands horizontally. In mirrored frame, wrist.x coordinates are flipped.
      // We look at the landmark[0] (wrist) to identify the split screen separation.
      // Left side of the screen is x < 0.5 (which is the right side of physical coordinate in non-mirrored frame)
      const sortedHands = result.landmarks.map((landmarks, index) => {
        const handName = result.handedness[index]?.[0]?.categoryName || 'Right';
        const wrist = landmarks[0];
        // wrist.x is normalized [0, 1]
        // Since we mirrored the canvas, we will separate hands by x coordinate directly
        return { landmarks, handedness: handName, x: wrist.x };
      });

      if (gameMode === 'local-coop') {
        // Double hand tracking mode
        // Hand 1 (P1): Left half of mirrored screen (wrist.x > 0.5 from perspective of raw camera coordinate, 
        // which becomes left-side after canvas mirror)
        // Wait, to keep it simple, let's sort hands by coordinate:
        // Left hand on screen = smaller coordinate in mirrored coordinates
        const mirroredHands = sortedHands.map(h => ({ ...h, screenX: 1 - h.x }));
        
        const leftHand = mirroredHands.find(h => h.screenX < 0.5);
        const rightHand = mirroredHands.find(h => h.screenX >= 0.5);

        if (leftHand) {
          drawSkeleton(ctx, leftHand.landmarks, 'green');
          const res = classifyHandGesture(leftHand.landmarks as Landmark[], leftHand.handedness as 'Left' | 'Right');
          detectedP1Gesture = gameType === 'cricket' ? String(res.fingerCount) : res.gesture;
        }

        if (rightHand) {
          drawSkeleton(ctx, rightHand.landmarks, 'pink');
          const res = classifyHandGesture(rightHand.landmarks as Landmark[], rightHand.handedness as 'Left' | 'Right');
          detectedP2Gesture = gameType === 'cricket' ? String(res.fingerCount) : res.gesture;
        }
      } else {
        // Single player mode (vs AI or Online)
        // We track the primary hand (closest or first)
        const primaryHand = sortedHands[0];
        drawSkeleton(ctx, primaryHand.landmarks, 'green');
        const res = classifyHandGesture(primaryHand.landmarks as Landmark[], primaryHand.handedness as 'Left' | 'Right');
        detectedP1Gesture = gameType === 'cricket' ? String(res.fingerCount) : res.gesture;
      }
    }

    ctx.restore();

    // Collect frames for debouncing during count-down evaluation phase
    if (status === 'countdown' && typeof countdownNum === 'string' && countdownNum === 'SHOW!') {
      detectionFrameCount.current += 1;
      
      if (detectedP1Gesture && detectedP1Gesture !== 'unknown') {
        p1History.current.push(detectedP1Gesture);
      }
      if (gameMode === 'local-coop' && detectedP2Gesture && detectedP2Gesture !== 'unknown') {
        p2History.current.push(detectedP2Gesture);
      }
    }

    requestAnimationFrame(runLocalDetectionLoop);
  }, [detect, drawSkeleton, gameMode, gameType, status, countdownNum]);

  // Restart frame loop when status or camera changes
  useEffect(() => {
    if (streamRef.current && !isLoopRunning.current) {
      isLoopRunning.current = true;
      requestAnimationFrame(runLocalDetectionLoop);
    }
  }, [runLocalDetectionLoop]);

  // Run Countdown Overlay
  const runCountdownAnimation = () => {
    setStatus('countdown');
    setVisualEffect(null);
    setCountdownNum(3);
    playSound('tick');

    p1History.current = [];
    p2History.current = [];
    detectionFrameCount.current = 0;

    let current = 3;
    const interval = setInterval(() => {
      current -= 1;
      if (current === 0) {
        setCountdownNum('SHOW!');
        playSound('show');
      } else if (current === -1) {
        clearInterval(interval);
        // Transition to evaluation
        setStatus('evaluating');
      } else {
        setCountdownNum(current);
        playSound('tick');
      }
    }, 850);
  };

  // Trigger Local Round (vs AI or Split)
  const triggerLocalRound = () => {
    if (status === 'countdown' || status === 'evaluating') return;
    playSound('click');
    runCountdownAnimation();
  };

  // Evaluate Round after countdown (Local mode only)
  useEffect(() => {
    if (status !== 'evaluating' || gameMode === 'online') return;

    // Retrieve stable gesture from history
    const finalP1 = getStableGesture(p1History.current, 5) || '0';
    let finalP2 = '0';

    if (gameMode === 'vs-ai') {
      // AI gesture selection
      if (gameType === 'cricket') {
        // AI chooses random 0-6
        finalP2 = String(Math.floor(Math.random() * 7));
      } else {
        const rps = ['rock', 'paper', 'scissors'];
        finalP2 = rps[Math.floor(Math.random() * 3)];
      }
    } else if (gameMode === 'local-coop') {
      finalP2 = getStableGesture(p2History.current, 5) || '0';
    }

    setP1State(prev => ({ ...prev, gesture: finalP1 }));
    setP2State(prev => ({ ...prev, gesture: finalP2 }));

    resolveLocalRound(finalP1, finalP2);
  }, [status]);

  // Helper to resolve RPS winner (0=draw, 1=p1 wins, 2=p2 wins)
  const resolveRPS = (g1: string, g2: string): number => {
    if (g1 === g2) return 0;
    if (
      (g1 === 'rock' && g2 === 'scissors') ||
      (g1 === 'paper' && g2 === 'rock') ||
      (g1 === 'scissors' && g2 === 'paper')
    ) {
      return 1;
    }
    return 2;
  };

  // Resolve Round logic (Local)
  const resolveLocalRound = (g1: string, g2: string) => {
    if (gameType === 'rps') {
      const outcome = resolveRPS(g1, g2); // 0=draw, 1=p1 wins, 2=p2 wins
      let detail = '';
      let winnerName = null;

      if (outcome === 1) {
        setP1State(prev => ({ ...prev, score: prev.score + 1 }));
        winnerName = p1State.name;
        detail = `${g1.toUpperCase()} beats ${g2.toUpperCase()}! ${p1State.name} scores.`;
        playSound('run');
      } else if (outcome === 2) {
        setP2State(prev => ({ ...prev, score: prev.score + 1 }));
        winnerName = p2State.name;
        detail = `${g2.toUpperCase()} beats ${g1.toUpperCase()}! ${p2State.name} scores.`;
        playSound('run');
      } else {
        detail = `Draw! Both threw ${g1.toUpperCase()}. No runs.`;
        playSound('tick');
      }

      setLastRoundDetail(detail);

      // Check Match Over
      const winsNeeded = Math.ceil(maxRounds / 2);
      const nextP1Score = outcome === 1 ? p1State.score + 1 : p1State.score;
      const nextP2Score = outcome === 2 ? p2State.score + 1 : p2State.score;

      if (nextP1Score >= winsNeeded) {
        setWinner(p1State.name);
        setLogText(`${p1State.name} wins the Best-of-${maxRounds} RPS Battle!`);
        setStatus('finished');
        triggerWinCelebration();
      } else if (nextP2Score >= winsNeeded) {
        setWinner(p2State.name);
        setLogText(`${p2State.name} wins the Best-of-${maxRounds} RPS Battle!`);
        setStatus('finished');
        playSound('lose');
      } else {
        setRound(prev => prev + 1);
        setStatus('setup');
      }

    } else {
      // Hand Cricket Logic
      const g1Num = parseInt(g1, 10);
      const g2Num = parseInt(g2, 10);
      
      const batterThrow = p1State.role === 'batter' ? g1Num : g2Num;
      const bowlerThrow = p1State.role === 'bowler' ? g1Num : g2Num;

      const nextThrows = throws + 1;
      setThrows(nextThrows);

      if (g1Num === g2Num) {
        // OUT!
        playSound('out');
        setVisualEffect('out');
        
        if (innings === 1) {
          setInnings(2);
          const nextTarget = (p1State.role === 'batter' ? p1State.score : p2State.score) + 1;
          setTarget(nextTarget);
          setThrows(0);
          
          // Swap roles
          setP1State(prev => ({ ...prev, role: prev.role === 'batter' ? 'bowler' : 'batter' }));
          setP2State(prev => ({ ...prev, role: prev.role === 'batter' ? 'bowler' : 'batter' }));
          setLogText(`OUT! Batter matched bowler with ${g1Num}. Roles swapped. Target to win: ${nextTarget}`);
          setLastRoundDetail(`WICKET! Batter dismissed for ${p1State.role === 'batter' ? p1State.score : p2State.score}.`);
          setStatus('setup');
        } else {
          // Game ends! Bowler successfully defended the target
          setStatus('finished');
          const firstInningsBatterName = p1State.role === 'bowler' ? p1State.name : p2State.name;
          const secondInningsBatter = p1State.role === 'batter' ? p1State : p2State;

          if (secondInningsBatter.score === (target || 1) - 1) {
            setWinner('Tie');
            setLogText('Tie Match! Scores are identical.');
            setVisualEffect('tie');
          } else {
            setWinner(firstInningsBatterName);
            setLogText(`${firstInningsBatterName} wins the match by defending ${target} runs!`);
            if (firstInningsBatterName === p1State.name) {
              triggerWinCelebration();
            } else {
              playSound('lose');
            }
          }
        }
      } else {
        // Runs Scored!
        const scoreToAdd = batterThrow;
        let detail = '';

        if (p1State.role === 'batter') {
          const nextScore = p1State.score + scoreToAdd;
          setP1State(prev => ({ ...prev, score: nextScore }));
          detail = `${p1State.name} scores ${scoreToAdd} run(s).`;
          
          if (scoreToAdd === 4) {
            playSound('boundary');
            setVisualEffect('four');
          } else if (scoreToAdd === 6) {
            playSound('boundary');
            setVisualEffect('six');
          } else {
            playSound('run');
          }

          // Chasing check in 2nd innings
          if (innings === 2 && nextScore >= (target || 0)) {
            setWinner(p1State.name);
            setLogText(`${p1State.name} chased down the target and wins the cricket match!`);
            setStatus('finished');
            triggerWinCelebration();
            return;
          }
        } else {
          const nextScore = p2State.score + scoreToAdd;
          setP2State(prev => ({ ...prev, score: nextScore }));
          detail = `${p2State.name} scores ${scoreToAdd} run(s).`;
          
          if (scoreToAdd === 4) {
            playSound('boundary');
            setVisualEffect('four');
          } else if (scoreToAdd === 6) {
            playSound('boundary');
            setVisualEffect('six');
          } else {
            playSound('run');
          }

          if (innings === 2 && nextScore >= (target || 0)) {
            setWinner(p2State.name);
            setLogText(`${p2State.name} chased down the target and wins the cricket match!`);
            setStatus('finished');
            playSound('lose');
            return;
          }
        }

        setLastRoundDetail(detail);

        // Overs / Balls Limit check
        const ballsLimit = overs * 6;
        if (nextThrows >= ballsLimit) {
          if (innings === 1) {
            setInnings(2);
            const nextTarget = (p1State.role === 'batter' ? p1State.score : p2State.score) + 1;
            setTarget(nextTarget);
            setThrows(0);
            
            setP1State(prev => ({ ...prev, role: prev.role === 'batter' ? 'bowler' : 'batter' }));
            setP2State(prev => ({ ...prev, role: prev.role === 'batter' ? 'bowler' : 'batter' }));
            setLogText(`Over Limit Reached! First innings finished. Target to win: ${nextTarget}`);
            setStatus('setup');
          } else {
            setStatus('finished');
            const firstInningsBatter = p1State.role === 'bowler' ? p1State : p2State;
            const secondInningsBatter = p1State.role === 'batter' ? p1State : p2State;

            if (secondInningsBatter.score === (target || 1) - 1) {
              setWinner('Tie');
              setLogText('Tie Match! Scores are identical.');
              setVisualEffect('tie');
            } else {
              setWinner(firstInningsBatter.name);
              setLogText(`${firstInningsBatter.name} wins by ${firstInningsBatter.score - secondInningsBatter.score} runs!`);
              if (firstInningsBatter.name === p1State.name) {
                triggerWinCelebration();
              } else {
                playSound('lose');
              }
            }
          }
        } else {
          setStatus('setup');
        }
      }
    }
  };

  // Resolve online round via server results
  const resolveOnlineRound = (room: any, roundResult: any) => {
    // 1. Trigger visuals/audios
    if (roundResult.type === 'out') {
      playSound('out');
      setVisualEffect('out');
      setLastRoundDetail(roundResult.detail);
    } else if (roundResult.type === 'runs') {
      if (roundResult.runs === 4) {
        playSound('boundary');
        setVisualEffect('four');
      } else if (roundResult.runs === 6) {
        playSound('boundary');
        setVisualEffect('six');
      } else {
        playSound('run');
      }
      setLastRoundDetail(roundResult.detail);
    } else if (roundResult.type === 'rps_win') {
      playSound('run');
      setLastRoundDetail(roundResult.detail);
    } else {
      playSound('tick');
      setLastRoundDetail(roundResult.detail);
    }

    // 2. Sync values
    syncRoomState(room);
  };

  // Capture local frame during online countdown
  useEffect(() => {
    if (status !== 'evaluating' || gameMode !== 'online' || !socket) return;

    // Send stable gesture to server
    const finalP1 = getStableGesture(p1History.current, 5) || '0';
    socket.emit('submitGesture', { roomId, gesture: finalP1 });
    
    // Optimistic local state update
    setP1State(prev => ({ ...prev, gesture: finalP1 }));
    setLogText('Gesture submitted! Waiting for opponent...');
    setStatus('waiting');
  }, [status]);

  // Restart entire match local
  const resetLocalMatch = () => {
    playSound('click');
    setP1State({ name: 'Player 1', score: 0, gesture: null, role: 'batter' });
    setP2State({ name: gameMode === 'vs-ai' ? 'AI' : 'Player 2', score: 0, gesture: null, role: 'bowler' });
    setInnings(1);
    setTarget(null);
    setThrows(0);
    setRound(1);
    setWinner(null);
    setStatus('setup');
    setVisualEffect(null);
    setLastRoundDetail('');
    setLogText('New match started! Press Start Round when ready.');
  };

  // Request rematch online
  const handleOnlineRematch = () => {
    if (!socket) return;
    playSound('click');
    socket.emit('rematch', { roomId });
  };

  // Play win confetti
  const triggerWinCelebration = () => {
    playSound('win');
    setVisualEffect('win');
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 }
    });
  };

  // Open & Close Camera based on setup view
  useEffect(() => {
    if (gameMode) {
      startCamera();
    } else {
      stopCamera();
    }
  }, [gameMode]);

  // View returns
  if (!gameMode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[85vh] px-4">
        {/* Title */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full glass-panel text-emerald-400 font-semibold tracking-wide text-xs mb-4 shadow-lg shadow-emerald-950/20 border border-emerald-500/20 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            COMPUTER VISION ARENA
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-rose-400 bg-clip-text text-transparent drop-shadow-sm select-none">
            BATTLE OF THE HANDS
          </h1>
          <p className="text-slate-400 mt-4 text-base md:text-lg max-w-xl mx-auto">
            Play classic multiplayer Hand Cricket and Rock-Paper-Scissors fully powered by real-time webcam hand tracking.
          </p>
        </div>

        {/* Mute Button */}
        <button
          onClick={handleMuteToggle}
          className="fixed top-6 right-6 p-3 rounded-xl glass-panel text-slate-400 hover:text-slate-200 transition-all shadow-md z-50 border border-slate-800"
          title={isSoundMuted ? "Unmute Audio" : "Mute Audio"}
        >
          {isSoundMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full">
          {/* Vs AI card */}
          <div 
            onClick={() => { playSound('click'); setGameMode('vs-ai'); setP2State(p => ({ ...p, name: 'AI' })); }}
            className="group cursor-pointer rounded-2xl glass-panel glass-panel-hover p-6 flex flex-col justify-between h-64 border border-slate-800 hover:border-emerald-500/30"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20 group-hover:bg-emerald-500/20 group-hover:text-emerald-300 transition-colors">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold mb-1 text-slate-100 group-hover:text-emerald-400 transition-colors">Vs AI Mode</h2>
              <p className="text-slate-400 text-sm">
                Fight a smart gesture-counting AI robot. Perfect for single player practice.
              </p>
            </div>
          </div>

          {/* Local Split Screen card */}
          <div 
            onClick={() => { playSound('click'); setGameMode('local-coop'); setP2State(p => ({ ...p, name: 'Player 2' })); }}
            className="group cursor-pointer rounded-2xl glass-panel glass-panel-hover p-6 flex flex-col justify-between h-64 border border-slate-800 hover:border-teal-500/30"
          >
            <div className="w-12 h-12 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400 border border-teal-500/20 group-hover:bg-teal-500/20 group-hover:text-teal-300 transition-colors">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold mb-1 text-slate-100 group-hover:text-teal-400 transition-colors">Local Split-Screen</h2>
              <p className="text-slate-400 text-sm">
                Dual tracking! Sit side-by-side with a friend and use one webcam to track both players' gestures.
              </p>
            </div>
          </div>

          {/* Online Multiplayer card */}
          <div 
            onClick={() => { playSound('click'); setGameMode('online'); }}
            className="group cursor-pointer rounded-2xl glass-panel glass-panel-hover p-6 flex flex-col justify-between h-64 border border-slate-800 hover:border-rose-500/30"
          >
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400 border border-rose-500/20 group-hover:bg-rose-500/20 group-hover:text-rose-300 transition-colors">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold mb-1 text-slate-100 group-hover:text-rose-400 transition-colors">Online Multiplayer</h2>
              <p className="text-slate-400 text-sm">
                Create a room or join a room code to battle online against anyone across devices.
              </p>
            </div>
          </div>
        </div>

        {/* Footer controls */}
        <div className="flex gap-4 mt-12">
          <button 
            onClick={() => { playSound('click'); setShowRules(true); }}
            className="flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/80 text-slate-300 font-semibold transition-all text-sm shadow-md"
          >
            <HelpCircle className="w-4 h-4 text-emerald-400" />
            How to Play / Rules
          </button>
        </div>

        {/* Dialog Rules Modal */}
        {showRules && (
          <dialog open className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="glass-panel p-8 max-w-2xl w-full rounded-2xl border border-slate-800 text-slate-300 relative shadow-2xl animate-shake">
              <h3 className="text-2xl font-bold text-slate-100 mb-4 border-b border-slate-850 pb-2">🎮 Gesture Rules</h3>
              
              <div className="space-y-4 text-sm leading-relaxed overflow-y-auto max-h-[60vh]">
                <div>
                  <h4 className="text-emerald-400 font-bold mb-1">🏏 HAND CRICKET RULES:</h4>
                  <ul className="list-disc list-inside space-y-1 pl-2">
                    <li>One player is **Batter**, the other is **Bowler**.</li>
                    <li>Wait for the countdown: **"3, 2, 1, SHOW!"**. Hold your hand up on **"SHOW!"**.</li>
                    <li>Fist = **6 runs**, 1 to 5 fingers = **1 to 5 runs**.</li>
                    <li>If both players throw the **SAME** number → Batter is **OUT**! Innings swap.</li>
                    <li>If numbers differ → Batter scores runs equal to their shown number.</li>
                    <li>First innings sets a Target. Second innings chases it under the overs limit.</li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-rose-400 font-bold mb-1">✊✋✌️ ROCK, PAPER, SCISSORS RULES:</h4>
                  <ul className="list-disc list-inside space-y-1 pl-2">
                    <li>**Rock**: 0 fingers up (fist).</li>
                    <li>**Paper**: 5 fingers up (flat palm).</li>
                    <li>**Scissors**: Exactly Index and Middle fingers up.</li>
                    <li>Rock beats Scissors; Scissors beats Paper; Paper beats Rock.</li>
                    <li>Best of 3, 5, or 7 rounds wins the match.</li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-teal-400 font-bold mb-1">🤖 COMPUTER VISION ENGINE TIPS:</h4>
                  <p className="pl-2">
                    Keep your hand centered and vertical in the camera frame. The glowing joint overlay shows active tracking. If tracking fails, hold your hand steady until it locks on.
                  </p>
                </div>
              </div>

              <button 
                onClick={() => { playSound('click'); setShowRules(false); }}
                className="mt-6 w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold transition-all text-sm"
              >
                Let's Go!
              </button>
            </div>
          </dialog>
        )}
      </div>
    );
  }

  // Active Arena Screen
  return (
    <div className="flex flex-col min-h-[90vh] px-4 py-6 max-w-7xl mx-auto">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-slate-900 pb-4">
        <button
          onClick={() => { playSound('click'); stopCamera(); setGameMode(null); }}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-sm font-semibold py-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Leave Arena
        </button>

        <div className="flex items-center gap-4">
          {gameMode === 'online' && roomId && (
            <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 px-3 py-1.5 rounded-lg">
              <span className="text-slate-500 text-xs font-bold">ROOM:</span>
              <span className="text-rose-400 font-mono font-bold text-sm tracking-widest">{roomId}</span>
            </div>
          )}

          <div className="text-center px-4 py-1.5 rounded-full bg-slate-900/40 border border-slate-800 text-xs font-bold text-slate-300">
            {gameType === 'cricket' ? '🏏 HAND CRICKET' : '✊✋✌️ ROCK-PAPER-SCISSORS'}
          </div>

          <button
            onClick={handleMuteToggle}
            className="p-2 rounded-lg glass-panel text-slate-400 hover:text-slate-200 transition-all border border-slate-850"
          >
            {isSoundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Online Nickname / Join Screen */}
      {gameMode === 'online' && !roomId && (
        <div className="flex flex-col items-center justify-center flex-1 max-w-md mx-auto w-full glass-panel p-8 rounded-2xl border border-slate-850">
          <Globe className="w-12 h-12 text-rose-400 mb-4 animate-pulse-glow" />
          <h2 className="text-2xl font-bold text-slate-100 mb-6 text-center">Join Online Lobby</h2>
          
          <div className="space-y-4 w-full">
            <div>
              <label className="block text-slate-400 text-xs font-bold mb-1.5">YOUR NICKNAME</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter nickname"
                maxLength={10}
                className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500/50 rounded-xl px-4 py-2.5 text-slate-100 outline-none text-sm transition-all font-semibold"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-900">
              <button
                onClick={handleCreateRoom}
                className="py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white font-bold transition-all text-xs shadow-md"
              >
                Create Room
              </button>

              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                  placeholder="Code (e.g. B7X9)"
                  maxLength={4}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500/50 rounded-xl px-3 py-1.5 text-center text-slate-100 outline-none text-xs font-mono font-bold tracking-widest uppercase"
                />
                <button
                  onClick={handleJoinRoom}
                  className="py-1.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900/90 text-rose-400 font-bold transition-all text-[11px]"
                >
                  Join Room Code
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Arena grid */}
      {(gameMode !== 'online' || roomId) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 items-start">
          {/* Webcam / Canvas panel - 7 columns */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {/* Live Camera Box */}
            <div className="relative rounded-2xl overflow-hidden glass-panel border border-slate-850 aspect-[4/3] max-w-[640px] mx-auto w-full bg-slate-950">
              {/* MediaPipe Loading overlay */}
              {mpLoading && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center text-slate-300 z-10">
                  <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-emerald-400 mb-4"></div>
                  <p className="text-sm font-bold tracking-wide">Initializing Computer Vision Models...</p>
                  <p className="text-xs text-slate-500 mt-1">This takes a few seconds via high-speed CDN.</p>
                </div>
              )}

              {/* MediaPipe Error overlay */}
              {mpError && (
                <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center text-rose-400 p-6 text-center z-10">
                  <h3 className="text-lg font-bold mb-2">Model Load Error</h3>
                  <p className="text-sm text-slate-400 mb-4">{mpError}</p>
                  <button 
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold"
                  >
                    Reload Page
                  </button>
                </div>
              )}

              {/* Countdown Numbers Overlay */}
              {status === 'countdown' && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 z-20">
                  <div className={`text-8xl md:text-9xl font-black tracking-widest drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)] scale-up select-none
                    ${countdownNum === 'SHOW!' ? 'text-emerald-400 neon-glow-green animate-pulse' : 'text-slate-100'}
                  `}>
                    {countdownNum}
                  </div>
                </div>
              )}

              {/* Visual Round FX Overlay (Out, Four, Six) */}
              {visualEffect && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45 z-20 animate-shake">
                  {visualEffect === 'out' && (
                    <div className="bg-red-950/90 border border-red-500/30 px-8 py-5 rounded-2xl text-center shadow-2xl max-w-xs w-full">
                      <span className="text-xs font-bold text-red-500 tracking-widest block mb-1">DECISION</span>
                      <h4 className="text-5xl font-black text-red-400 tracking-tight drop-shadow">OUT!</h4>
                      <p className="text-slate-400 text-xs mt-2">{lastRoundDetail}</p>
                    </div>
                  )}
                  {visualEffect === 'four' && (
                    <div className="bg-emerald-950/90 border border-emerald-500/30 px-8 py-5 rounded-2xl text-center shadow-2xl max-w-xs w-full">
                      <span className="text-xs font-bold text-emerald-400 tracking-widest block mb-1">BOUNDARY</span>
                      <h4 className="text-5xl font-black text-emerald-300 tracking-tight drop-shadow uppercase">FOUR!</h4>
                      <p className="text-slate-300 text-xs mt-2 font-bold">+4 runs scored</p>
                    </div>
                  )}
                  {visualEffect === 'six' && (
                    <div className="bg-teal-950/90 border border-teal-500/30 px-8 py-5 rounded-2xl text-center shadow-2xl max-w-xs w-full">
                      <span className="text-xs font-bold text-teal-400 tracking-widest block mb-1">MAXIMUM</span>
                      <h4 className="text-5xl font-black text-teal-300 tracking-tight drop-shadow uppercase">SIX!</h4>
                      <p className="text-slate-300 text-xs mt-2 font-bold">+6 runs scored</p>
                    </div>
                  )}
                  {visualEffect === 'win' && (
                    <div className="bg-slate-900/90 border border-emerald-500/30 px-8 py-5 rounded-2xl text-center shadow-2xl max-w-xs w-full">
                      <span className="text-xs font-bold text-emerald-400 tracking-widest block mb-1">VICTORY</span>
                      <h4 className="text-4xl font-black text-slate-100 tracking-tight drop-shadow uppercase">WINNER!</h4>
                      <p className="text-slate-400 text-xs mt-2">{winner} takes the crown</p>
                    </div>
                  )}
                  {visualEffect === 'tie' && (
                    <div className="bg-slate-900/90 border border-slate-800 px-8 py-5 rounded-2xl text-center shadow-2xl max-w-xs w-full">
                      <span className="text-xs font-bold text-slate-400 tracking-widest block mb-1">MATCH DRAWN</span>
                      <h4 className="text-4xl font-black text-slate-100 tracking-tight drop-shadow uppercase">TIE!</h4>
                      <p className="text-slate-400 text-xs mt-2">Perfect match deadlock</p>
                    </div>
                  )}
                </div>
              )}

              {/* Mirrored Local Camera and Canvas Layer */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full object-cover z-10"
              />

              {/* Local coop split overlay line */}
              {gameMode === 'local-coop' && (
                <div className="absolute top-0 bottom-0 left-1/2 w-0.5 border-l-2 border-dashed border-slate-700/50 z-20"></div>
              )}
            </div>

            {/* Config & Launch Controllers */}
            <div className="flex flex-col gap-3 max-w-[640px] mx-auto w-full">
              {/* Settings Configuration for Host */}
              {status === 'setup' && (gameMode !== 'online' || playerIndex === 0) && (
                <div className="glass-panel p-4 rounded-xl border border-slate-850 flex flex-wrap items-center justify-between gap-4">
                  {/* Select Game Type */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        playSound('click');
                        if (gameMode === 'online') {
                          handleConfigureGame('cricket');
                        } else {
                          setGameType('cricket');
                          resetLocalMatch();
                        }
                      }}
                      className={`px-4 py-2 rounded-lg font-bold text-xs border transition-all ${
                        gameType === 'cricket'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'border-slate-850 bg-slate-900/40 text-slate-400'
                      }`}
                    >
                      Hand Cricket
                    </button>
                    <button
                      onClick={() => {
                        playSound('click');
                        if (gameMode === 'online') {
                          handleConfigureGame('rps');
                        } else {
                          setGameType('rps');
                          resetLocalMatch();
                        }
                      }}
                      className={`px-4 py-2 rounded-lg font-bold text-xs border transition-all ${
                        gameType === 'rps'
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'border-slate-850 bg-slate-900/40 text-slate-400'
                      }`}
                    >
                      Rock Paper Scissors
                    </button>
                  </div>

                  {/* Settings Sliders */}
                  <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
                    {gameType === 'cricket' ? (
                      <div className="flex items-center gap-2">
                        <span>OVERS:</span>
                        <input
                          type="range"
                          min={1}
                          max={5}
                          value={overs}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setOvers(val);
                            if (gameMode === 'online' && socket) {
                              socket.emit('configureGame', { roomId, gameType: 'cricket', settings: { overs: val } });
                            }
                          }}
                          className="w-20 accent-emerald-500"
                        />
                        <span className="text-emerald-400 font-mono">{overs} ({overs * 6} balls)</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span>ROUNDS:</span>
                        <input
                          type="range"
                          min={3}
                          max={7}
                          step={2}
                          value={maxRounds}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setMaxRounds(val);
                            if (gameMode === 'online' && socket) {
                              socket.emit('configureGame', { roomId, gameType: 'rps', settings: { maxRounds: val } });
                            }
                          }}
                          className="w-20 accent-rose-500"
                        />
                        <span className="text-rose-400 font-mono">{maxRounds} (Best of)</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Start Round Button */}
              {status === 'setup' && (
                <button
                  onClick={gameMode === 'online' ? triggerOnlineRound : triggerLocalRound}
                  disabled={mpLoading}
                  className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${
                    gameType === 'cricket'
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-emerald-950/20 text-white'
                      : 'bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 shadow-rose-950/20 text-white'
                  }`}
                >
                  <Play className="w-5 h-5 fill-current" />
                  START GAME ROUND
                </button>
              )}

              {/* Game Over Reset Buttons */}
              {status === 'finished' && (
                <div className="flex gap-4">
                  <button
                    onClick={gameMode === 'online' ? handleOnlineRematch : resetLocalMatch}
                    className="flex-1 py-4 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-850 font-bold text-sm text-slate-300 transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4 text-emerald-400" />
                    REMATCH
                  </button>
                  {gameMode !== 'online' && (
                    <button
                      onClick={resetLocalMatch}
                      className="px-6 py-4 rounded-xl border border-slate-800 hover:bg-slate-900 bg-slate-950 text-slate-400 text-xs font-semibold"
                    >
                      Reset Settings
                    </button>
                  )}
                </div>
              )}

              {/* Waiting status for socket host */}
              {status === 'waiting' && gameMode === 'online' && playerIndex === 0 && p2State.name === 'Waiting...' && (
                <div className="py-4 text-center glass-panel border border-slate-850 rounded-xl text-slate-400 text-xs font-bold animate-pulse">
                  Waiting for Player 2 to join with room code: <span className="text-rose-400 text-sm font-mono tracking-widest font-extrabold ml-1">{roomId}</span>
                </div>
              )}
            </div>
          </div>

          {/* Scoreboard and Action logger - 5 columns */}
          <div className="lg:col-span-5 flex flex-col gap-6 w-full">
            {/* Split scoreboard view */}
            <div className="grid grid-cols-2 gap-4">
              {/* Player 1 Box */}
              <div className={`glass-panel p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                gameType === 'cricket' && p1State.role === 'batter' ? 'neon-box-green' : 'border-slate-850'
              }`}>
                <div className="flex items-center justify-between border-b border-slate-900 pb-2.5 mb-2.5">
                  <span className="text-slate-100 font-bold text-sm truncate max-w-[80px]" title={p1State.name}>{p1State.name}</span>
                  {gameType === 'cricket' && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                      p1State.role === 'batter' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-900 text-slate-500'
                    }`}>
                      {p1State.role}
                    </span>
                  )}
                </div>

                <div className="my-2 text-center">
                  <div className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">SCORE</div>
                  <div className="text-5xl font-black text-slate-100 font-mono tracking-tighter mt-1">{p1State.score}</div>
                </div>

                <div className="border-t border-slate-900 pt-2.5 mt-2.5 text-center flex flex-col items-center">
                  <span className="text-slate-500 text-[9px] font-bold uppercase">GESTURE</span>
                  <div className={`mt-1 font-bold text-sm font-mono uppercase ${
                    p1State.gesture ? 'text-emerald-400' : 'text-slate-600'
                  }`}>
                    {p1State.gesture ? (
                      gameType === 'cricket' ? `${p1State.gesture} Run(s)` : p1State.gesture
                    ) : '---'}
                  </div>
                </div>
              </div>

              {/* Player 2 Box */}
              <div className={`glass-panel p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                gameType === 'cricket' && p2State.role === 'batter' ? 'neon-box-pink' : 'border-slate-850'
              }`}>
                <div className="flex items-center justify-between border-b border-slate-900 pb-2.5 mb-2.5">
                  <span className="text-slate-100 font-bold text-sm truncate max-w-[80px]" title={p2State.name}>{p2State.name}</span>
                  {gameType === 'cricket' && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                      p2State.role === 'batter' ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-900 text-slate-500'
                    }`}>
                      {p2State.role}
                    </span>
                  )}
                </div>

                <div className="my-2 text-center">
                  <div className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">SCORE</div>
                  <div className="text-5xl font-black text-slate-100 font-mono tracking-tighter mt-1">{p2State.score}</div>
                </div>

                <div className="border-t border-slate-900 pt-2.5 mt-2.5 text-center flex flex-col items-center">
                  <span className="text-slate-500 text-[9px] font-bold uppercase">GESTURE</span>
                  <div className={`mt-1 font-bold text-sm font-mono uppercase ${
                    p2State.gesture ? 'text-rose-400' : 'text-slate-600'
                  }`}>
                    {p2State.gesture ? (
                      gameType === 'cricket' ? `${p2State.gesture} Run(s)` : p2State.gesture
                    ) : '---'}
                  </div>
                </div>
              </div>
            </div>

            {/* Target & Match State Logger */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-850 flex-1 flex flex-col justify-between min-h-[220px]">
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Match Standings</h3>
                
                <div className="space-y-4">
                  {gameType === 'cricket' ? (
                    <div className="grid grid-cols-2 gap-4 border-b border-slate-900 pb-4">
                      <div>
                        <span className="text-slate-500 text-[10px] font-bold block mb-0.5 uppercase">Innings</span>
                        <span className="text-slate-200 font-bold font-mono text-sm">{innings === 1 ? '1st Innings' : '2nd Innings'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] font-bold block mb-0.5 uppercase">Overs / Balls</span>
                        <span className="text-slate-200 font-bold font-mono text-sm">
                          {Math.floor(throws / 6)}.{throws % 6} / {overs} Ov
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] font-bold block mb-0.5 uppercase">Target Runs</span>
                        <span className={`font-black font-mono text-sm ${target ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {target ? `${target} runs` : '---'}
                        </span>
                      </div>
                      {innings === 2 && target && (
                        <div>
                          <span className="text-slate-500 text-[10px] font-bold block mb-0.5 uppercase">Required runs</span>
                          <span className="text-rose-400 font-black font-mono text-sm">
                            {Math.max(0, target - (p1State.role === 'batter' ? p1State.score : p2State.score))} runs
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 border-b border-slate-900 pb-4">
                      <div>
                        <span className="text-slate-500 text-[10px] font-bold block mb-0.5 uppercase">Current Round</span>
                        <span className="text-slate-200 font-bold font-mono text-sm">Round {round}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] font-bold block mb-0.5 uppercase">Best of</span>
                        <span className="text-slate-200 font-bold font-mono text-sm">{maxRounds} Rounds</span>
                      </div>
                    </div>
                  )}

                  {/* Sub-log detailing what happened in the last round */}
                  {lastRoundDetail && (
                    <div className="bg-slate-950/50 border border-slate-900 rounded-xl p-3 text-xs text-slate-300 font-medium">
                      <span className="text-slate-500 font-bold uppercase text-[9px] block mb-1">Last Ball Detail</span>
                      {lastRoundDetail}
                    </div>
                  )}
                </div>
              </div>

              {/* Main Log text */}
              <div className="bg-slate-950 border border-slate-900 rounded-xl p-3.5 mt-4 text-xs font-mono font-semibold text-emerald-400 flex items-start gap-2.5">
                <span className="text-emerald-500 select-none animate-pulse">&gt;</span>
                <span className="flex-1">{logText}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
