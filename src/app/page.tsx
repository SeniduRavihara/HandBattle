import GameArena from '../components/GameArena';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 bg-grid-pattern relative flex flex-col justify-center">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-emerald-500/5 blur-[120px] pointer-events-none animate-pulse-glow"></div>
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[500px] h-[500px] rounded-full bg-rose-500/5 blur-[120px] pointer-events-none animate-pulse-glow" style={{ animationDelay: '1.2s' }}></div>

      <div className="relative z-10 w-full py-8">
        <GameArena />
      </div>
    </main>
  );
}
