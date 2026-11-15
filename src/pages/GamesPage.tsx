import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import { supabase } from '@/lib/supabase';
import { Gamepad2, Trophy, Play, ArrowLeft, Zap, Star, Rocket, Ghost, Sparkles, Music2, Type, Pause, X, HeadphonesIcon, Music, Users, Plus, LogOut, Check, Loader2, Send, Drum, Trash2, Volume2, Repeat, Headphones, Bot, User } from 'lucide-react';
import GarticPhonePage from '@/pages/GarticPhonePage';

type Reward = (xp: number, coins: number, gameType?: string) => void;
type V = { x: number; y: number };

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const TAU = Math.PI * 2;

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.44;
    const a = spin + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1, flame = true) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  if (flame) {
    const f = 10 + Math.random() * 7;
    ctx.fillStyle = '#ffd9a0'; ctx.beginPath(); ctx.moveTo(-5, 17); ctx.lineTo(0, 17 + f); ctx.lineTo(5, 17); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff6b9d'; ctx.beginPath(); ctx.moveTo(-2.5, 17); ctx.lineTo(0, 22 + f * .5); ctx.lineTo(2.5, 17); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#8b5cf6'; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(11, 7); ctx.lineTo(19, 17); ctx.lineTo(7, 14); ctx.lineTo(0, 20); ctx.lineTo(-7, 14); ctx.lineTo(-19, 17); ctx.lineTo(-11, 7); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c4b5fd'; ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(6, 6); ctx.lineTo(0, 11); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#45d8b8'; ctx.beginPath(); ctx.ellipse(0, -3, 4.5, 7, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.restore();
}

function drawAsteroid(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = '#6f7897'; ctx.strokeStyle = '#b3bdd8'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  const pts = [1,.82,1.07,.76,.95,.83,.72,.9,1.03,.79];
  pts.forEach((m, i) => { const a = (i / pts.length) * TAU; const px = Math.cos(a) * r * m, py = Math.sin(a) * r * m; if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3e4664';
  [[-.3,-.22,.2],[.25,.12,.16],[-.05,.38,.11]].forEach(([cx,cy,cr]) => { ctx.beginPath(); ctx.ellipse(cx*r, cy*r, cr*r, cr*r*.75, .4, 0, TAU); ctx.fill(); });
  ctx.restore();
}

function drawUfo(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1, phase = 0) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  const pulse = 0.9 + Math.sin(phase) * 0.08;
  ctx.shadowColor = '#45d8b8'; ctx.shadowBlur = 12;
  ctx.fillStyle = '#a78bfa'; ctx.beginPath(); ctx.ellipse(0, 2, 18, 7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#45d8b8'; ctx.beginPath(); ctx.ellipse(0, -4, 10*pulse, 7*pulse, 0, Math.PI, TAU); ctx.fill();
  ctx.fillStyle = '#d8fbff'; ctx.beginPath(); ctx.ellipse(0, -5, 5, 3.5, 0, Math.PI, TAU); ctx.fill();
  ctx.shadowBlur=0; ctx.fillStyle='#ffd166';
  [-10,0,10].forEach((dx,i)=>{ctx.globalAlpha=.55+.35*Math.sin(phase+i);ctx.beginPath();ctx.arc(dx,8,2.2,0,TAU);ctx.fill();});
  ctx.globalAlpha=1; ctx.strokeStyle='rgba(255,255,255,.5)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,2,18,7,0,0,TAU);ctx.stroke();
  ctx.restore();
}

function drawGhost(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, dx = 0) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, -2, r, Math.PI, 0); ctx.lineTo(r, r); ctx.lineTo(r*.5, r*.55); ctx.lineTo(0,r); ctx.lineTo(-r*.5,r*.55); ctx.lineTo(-r,r); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#eef1ff'; ctx.beginPath(); ctx.ellipse(-r*.38,-r*.15,r*.25,r*.32,0,0,TAU); ctx.ellipse(r*.38,-r*.15,r*.25,r*.32,0,0,TAU); ctx.fill();
  ctx.fillStyle = '#172554'; ctx.beginPath(); ctx.arc(-r*.38 + dx*1.5,-r*.12,r*.11,0,TAU); ctx.arc(r*.38 + dx*1.5,-r*.12,r*.11,0,TAU); ctx.fill(); ctx.restore();
}

function GameShell({ title, hint, score, meta, onExit, children }: { title: string; hint: string; score: number; meta?: string; onExit: () => void; children: React.ReactNode }) {
  const { t } = useLocale();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button onClick={onExit} onTouchStart={(e) => { e.preventDefault(); onExit(); }} className="game-exit-btn flex items-center gap-2 text-theme-muted hover:text-theme-text text-sm transition-colors px-3 py-2 rounded-lg">
          <ArrowLeft className="w-5 h-5" /> {t('Все игры')}
        </button>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-theme-border px-3 py-1.5 font-mono text-[10px] font-bold text-theme-warning">{t('очки')}: {score}</span>
          {meta && <span className="rounded-full border border-theme-border px-3 py-1.5 font-mono text-[10px] font-bold text-theme-success">{meta}</span>}
          <button
            onClick={onExit}
            onTouchStart={(e) => { e.preventDefault(); onExit(); }}
            className="game-exit-btn flex items-center justify-center w-11 h-11 rounded-lg bg-theme-danger/15 border border-theme-danger/30 text-theme-danger hover:bg-theme-danger/25 transition-all"
            title={t('Выйти в меню')}
            aria-label={t('Выйти в меню')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <h3 className="text-lg font-bold text-theme-text">{title}</h3>
      <p className="text-xs text-theme-muted">{hint}</p>
      {children}
    </div>
  );
}

// ===== Snake =====
function SnakeGame({ onExit, onReward }: { onExit: () => void; onReward: Reward }) {
  const { t } = useLocale();
  const ref = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const touch = useRef<V | null>(null);
  const rewarded = useRef(false);
  const nextDir = useRef<V>({ x: 1, y: 0 });
  const st = useRef({
    snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }] as V[],
    prev: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }] as V[],
    dir: { x: 1, y: 0 } as V,
    food: { x: 15, y: 10 } as V,
    score: 0, over: false, last: 0, acc: 0,
  });

  const spawnFood = (snake: V[]) => {
    const free: V[] = [];
    for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) if (!snake.some(s => s.x === x && s.y === y)) free.push({ x, y });
    return free[Math.floor(Math.random() * free.length)] ?? { x: 1, y: 1 };
  };
  const reset = () => {
    const snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    st.current = { snake, prev: snake.map(p => ({ ...p })), dir: { x: 1, y: 0 }, food: spawnFood(snake), score: 0, over: false, last: 0, acc: 0 };
    nextDir.current = { x: 1, y: 0 }; setScore(0); setOver(false); rewarded.current = false;
  };
  const steer = (d: V) => { const s = st.current; if (d.x !== -s.dir.x || d.y !== -s.dir.y) nextDir.current = d; };

  useEffect(() => {
    reset();
    const key = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const map: Record<string, V> = { arrowup: { x: 0, y: -1 }, w: { x: 0, y: -1 }, arrowdown: { x: 0, y: 1 }, s: { x: 0, y: 1 }, arrowleft: { x: -1, y: 0 }, a: { x: -1, y: 0 }, arrowright: { x: 1, y: 0 }, d: { x: 1, y: 0 } };
      if (map[k]) { e.preventDefault(); steer(map[k]); }
    };
    window.addEventListener('keydown', key, { passive: false });
    let raf = 0;
    const step = 92;
    const loop = (now: number) => {
      const s = st.current, cv = ref.current, ctx = cv?.getContext('2d');
      if (!cv || !ctx) { raf = requestAnimationFrame(loop); return; }
      if (!s.last) s.last = now; s.acc += Math.min(40, now - s.last); s.last = now;
      if (!s.over) while (s.acc >= step) {
        s.acc -= step; s.prev = s.snake.map(p => ({ ...p })); s.dir = nextDir.current;
        const h = { x: s.snake[0].x + s.dir.x, y: s.snake[0].y + s.dir.y };
        const grows = h.x === s.food.x && h.y === s.food.y;
        const body = grows ? s.snake : s.snake.slice(0, -1);
        if (h.x < 0 || h.x >= 21 || h.y < 0 || h.y >= 21 || body.some(p => p.x === h.x && p.y === h.y)) {
          s.over = true; setOver(true);
          if (!rewarded.current && s.score) { rewarded.current = true; onReward(Math.round(s.score / 2), Math.round(s.score / 4)); }
          break;
        }
        s.snake.unshift(h);
        if (grows) { s.score += 10; setScore(s.score); s.food = spawnFood(s.snake); } else { s.snake.pop(); s.prev.pop(); }
      }
      const t = s.over ? 1 : clamp(s.acc / step, 0, 1), cell = cv.width / 21;
      ctx.fillStyle = '#050816'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = 'rgba(139,92,246,.08)'; ctx.lineWidth = 1;
      for (let i = 1; i < 21; i++) {
        ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, cv.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(cv.width, i * cell); ctx.stroke();
      }
      ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 14;
      drawStar(ctx, s.food.x * cell + cell / 2, s.food.y * cell + cell / 2, cell * .38); ctx.fill(); ctx.shadowBlur = 0;
      s.snake.slice().reverse().forEach((p, ri) => {
        const i = s.snake.length - 1 - ri, prev = s.prev[i] ?? p;
        const px = prev.x + (p.x - prev.x) * t, py = prev.y + (p.y - prev.y) * t, cx = px * cell + cell / 2, cy = py * cell + cell / 2;
        const r = cell * (i === 0 ? .43 : .36);
        ctx.fillStyle = '#45d8b8'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.arc(cx - r * .25, cy - r * .25, r * .25, 0, TAU); ctx.fill();
        if (i === 0) {
          ctx.fillStyle = '#45d8b8'; ctx.beginPath(); ctx.arc(cx - 4 + s.dir.x * 2, cy - 3 + s.dir.y * 2, 2.8, 0, TAU); ctx.arc(cx + 4 + s.dir.x * 2, cy - 3 + s.dir.y * 2, 2.8, 0, TAU); ctx.fill();
          ctx.fillStyle = '#07101d'; ctx.beginPath(); ctx.arc(cx - 4 + s.dir.x * 2, cy - 3 + s.dir.y * 2, 1.25, 0, TAU); ctx.arc(cx + 4 + s.dir.x * 2, cy - 3 + s.dir.y * 2, 1.25, 0, TAU); ctx.fill();
        }
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { window.removeEventListener('keydown', key); cancelAnimationFrame(raf); };
  }, [onReward]);

  return (
    <GameShell title={t('Космическая змейка')} hint={t('WASD / стрелки / свайпы. Плавное движение и лицо того же цвета, что и тело.')} score={score} onExit={onExit}>
      <canvas ref={ref} width={420} height={420} className="mx-auto block w-full max-w-[420px] touch-none rounded-xl border border-theme-border"
        onTouchStart={e => touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }}
        onTouchEnd={e => { if (!touch.current) return; const dx = e.changedTouches[0].clientX - touch.current.x, dy = e.changedTouches[0].clientY - touch.current.y; if (Math.hypot(dx, dy) > 18) steer(Math.abs(dx) > Math.abs(dy) ? { x: dx > 0 ? 1 : -1, y: 0 } : { x: 0, y: dy > 0 ? 1 : -1 }); touch.current = null; }}
      />
      {over && <button onClick={reset} className="mx-auto mt-3 block rounded-full bg-theme-primary px-5 py-2 text-xs font-bold text-white hover:opacity-90 transition-opacity">{t('Заново')}</button>}
    </GameShell>
  );
}

// ===== Asteroid Blaster =====
type Rock = { x: number; y: number; r: number; vy: number; vx: number; rot: number; vr: number };
function ShooterGame({ onExit, onReward }: { onExit: () => void; onReward: Reward }) {
  const { t } = useLocale();
  const ref = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [lives, setLives] = useState(3);
  const rewarded = useRef(false);
  const st = useRef({ px: 210, bullets: [] as V[], rocks: [] as Rock[], score: 0, lives: 3, over: false, spawn: 0, fire: 0, t: 0 });

  const reset = () => {
    st.current = { px: 210, bullets: [], rocks: [], score: 0, lives: 3, over: false, spawn: 0, fire: 0, t: 0 };
    setScore(0); setLives(3); setOver(false); rewarded.current = false;
  };

  const keys = useRef(new Set<string>());

  useEffect(() => {
    reset();
    const kd = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) { e.preventDefault(); keys.current.add(e.key.toLowerCase()); }
    };
    const ku = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', kd, { passive: false });
    window.addEventListener('keyup', ku);
    let raf = 0;
    const loop = () => {
      const s = st.current, cv = ref.current, ctx = cv?.getContext('2d');
      if (cv && ctx) {
        s.t++;
        if (!s.over) {
          if (keys.current.has('arrowleft') || keys.current.has('a')) s.px = clamp(s.px - 5, 24, 396);
          if (keys.current.has('arrowright') || keys.current.has('d')) s.px = clamp(s.px + 5, 24, 396);
          s.spawn++; s.fire++;
          if (s.spawn > Math.max(18, 42 - Math.floor(s.score / 80))) {
            s.spawn = 0;
            const r = 13 + Math.random() * 12;
            s.rocks.push({ x: 25 + Math.random() * 370, y: -30, r, vy: 1.3 + Math.random() * 1.4 + s.score / 600, vx: (Math.random() - .5) * .7, rot: Math.random() * TAU, vr: (Math.random() - .5) * .04 });
          }
          if (s.fire > 10) { s.fire = 0; s.bullets.push({ x: s.px, y: 370 }); }
          s.bullets.forEach(b => b.y -= 10);
          s.bullets = s.bullets.filter(b => b.y > -20);
          s.rocks.forEach(a => { a.x += a.vx; a.y += a.vy; a.rot += a.vr; });
          s.rocks = s.rocks.filter(a => {
            const hit = s.bullets.findIndex(b => Math.hypot(b.x - a.x, b.y - a.y) < a.r + 5);
            if (hit >= 0) { s.bullets.splice(hit, 1); s.score += 10; setScore(s.score); return false; }
            if (Math.hypot(a.x - s.px, a.y - 382) < a.r + 15 || a.y > 435) {
              s.lives--; setLives(s.lives);
              if (s.lives <= 0) { s.over = true; setOver(true); if (!rewarded.current && s.score) { rewarded.current = true; onReward(Math.round(s.score / 2), Math.round(s.score / 4)); } }
              return false;
            }
            return true;
          });
        }
        ctx.fillStyle = '#040714'; ctx.fillRect(0, 0, 420, 420);
        for (let i = 0; i < 55; i++) { const y = (i * 73 + s.t * (1 + i % 3)) % 440 - 10; ctx.fillStyle = `rgba(238,241,255,${.12 + (i % 4) * .07})`; ctx.fillRect((i * 101) % 420, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1); }
        ctx.fillStyle = '#45d8b8'; ctx.shadowColor = '#45d8b8'; ctx.shadowBlur = 8;
        s.bullets.forEach(b => { ctx.fillRect(b.x - 1.5, b.y, 3, 14); });
        ctx.shadowBlur = 0;
        s.rocks.forEach(a => drawAsteroid(ctx, a.x, a.y, a.r, a.rot));
        drawShip(ctx, s.px, 382, .82, !s.over);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [onReward]);

  const move = (clientX: number, r: DOMRect) => { st.current.px = clamp(((clientX - r.left) / r.width) * 420, 24, 396); };

  return (
    <GameShell title="Asteroid Blaster" hint={t('Веди корабль мышью, пальцем или стрелками ← → / A D. Автоогонь, астероиды, столкновения и ускоряющиеся волны.')} score={score} meta={`❤ ${lives}`} onExit={onExit}>
      <canvas ref={ref} width={420} height={420} className="mx-auto block w-full max-w-[420px] touch-none rounded-xl border border-theme-border"
        onMouseMove={e => move(e.clientX, e.currentTarget.getBoundingClientRect())}
        onTouchStart={e => move(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
        onTouchMove={e => move(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
      />
      {over && <button onClick={reset} className="mx-auto mt-3 block rounded-full bg-theme-primary px-5 py-2 text-xs font-bold text-white hover:opacity-90 transition-opacity">{t('Заново')}</button>}
    </GameShell>
  );
}

// ===== Space Invaders =====
const INV_COLS = 8, INV_ROWS = 3;
function InvadersGame({ onExit, onReward }: { onExit: () => void; onReward: Reward }) {
  const { t } = useLocale();
  const tRef = useRef(t); tRef.current = t;
  const ref = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState(t('волна 1'));
  const keys = useRef(new Set<string>());
  const rewarded = useRef(false);
  const makeInv = () => Array.from({ length: INV_COLS * INV_ROWS }, (_, n) => ({ x: 42 + (n % INV_COLS) * 47, y: 48 + Math.floor(n / INV_COLS) * 40, alive: true }));
  const st = useRef({ px: 210, bullets: [] as V[], enemyBullets: [] as V[], inv: makeInv(), dir: 1, score: 0, lives: 3, over: false, cool: 0, tick: 0, wave: 1, dropTimer: 0 });

  const reset = () => {
    st.current = { px: 210, bullets: [], enemyBullets: [], inv: makeInv(), dir: 1, score: 0, lives: 3, over: false, cool: 0, tick: 0, wave: 1, dropTimer: 0 };
    setScore(0); setStatus(tRef.current('волна 1')); setOver(false); rewarded.current = false;
  };
  const fire = () => { const s = st.current; if (!s.over && s.cool <= 0) { s.bullets.push({ x: s.px, y: 370 }); s.cool = 13; } };

  useEffect(() => {
    reset();
    const kd = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', ' ', 'a', 'd'].includes(e.key)) { e.preventDefault(); keys.current.add(e.key.toLowerCase()); if (e.key === ' ') fire(); }
    };
    const ku = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', kd, { passive: false });
    window.addEventListener('keyup', ku);
    let raf = 0;
    const loop = () => {
      const s = st.current, cv = ref.current, ctx = cv?.getContext('2d');
      if (cv && ctx) {
        s.tick++;
        if (!s.over) {
          if (keys.current.has('arrowleft') || keys.current.has('a')) s.px = clamp(s.px - 5, 22, 398);
          if (keys.current.has('arrowright') || keys.current.has('d')) s.px = clamp(s.px + 5, 22, 398);
          s.cool--;
          s.bullets.forEach(b => b.y -= 9);
          s.enemyBullets.forEach(b => b.y += 4 + s.wave * .35);
          s.bullets = s.bullets.filter(b => b.y > -15);
          s.enemyBullets = s.enemyBullets.filter(b => b.y < 430);
          if (s.tick % 26 === 0) {
            const alive = s.inv.filter(i => i.alive);
            if (alive.length) {
              const min = Math.min(...alive.map(i => i.x)), max = Math.max(...alive.map(i => i.x));
              if ((s.dir > 0 && max > 380) || (s.dir < 0 && min < 40)) {
                s.dir *= -1;
              }
              s.inv.forEach(i => { if (i.alive) i.x += (4 + s.wave * 0.5) * s.dir; });
            }
          }
          s.dropTimer++;
          if (s.dropTimer >= 180) {
            s.dropTimer = 0;
            s.inv.forEach(i => { if (i.alive) i.y += 20; });
          }
          if (s.tick % 75 === 0) {
            const alive = s.inv.filter(i => i.alive);
            if (alive.length) { const a = alive[Math.floor(Math.random() * alive.length)]; s.enemyBullets.push({ x: a.x, y: a.y + 15 }); }
          }
          s.inv.forEach(i => {
            if (!i.alive) return;
            const bi = s.bullets.findIndex(b => Math.abs(b.x - i.x) < 16 && Math.abs(b.y - i.y) < 15);
            if (bi >= 0) { s.bullets.splice(bi, 1); i.alive = false; s.score += 20; setScore(s.score); }
          });
          const shipHit = s.enemyBullets.findIndex(b => Math.abs(b.x - s.px) < 15 && Math.abs(b.y - 383) < 15);
          const reached = s.inv.some(i => i.alive && i.y > 360);
          if (reached) {
            s.over = true; setOver(true); setStatus(tRef.current('поражение')); if (!rewarded.current && s.score) { rewarded.current = true; onReward(Math.round(s.score / 2), Math.round(s.score / 4)); } }
          else if (shipHit >= 0) {
            s.enemyBullets.splice(shipHit, 1);
            s.lives--;
            s.inv.forEach(i => { if (i.alive) i.y = Math.max(42, i.y - 22); });
            if (s.lives <= 0) { s.over = true; setOver(true); setStatus(tRef.current('поражение')); if (!rewarded.current && s.score) { rewarded.current = true; onReward(Math.round(s.score / 2), Math.round(s.score / 4)); } }
          }
          if (!s.inv.some(i => i.alive)) { s.wave++; s.inv = makeInv(); s.inv.forEach(i => i.y += Math.min(70, (s.wave - 1) * 10)); s.enemyBullets = []; setStatus(`${tRef.current('волна')} ${s.wave}`); s.score += 100; setScore(s.score); }
        }
        ctx.fillStyle = '#050816'; ctx.fillRect(0, 0, 420, 420);
        for (let i = 0; i < 38; i++) { ctx.fillStyle = 'rgba(238,241,255,.2)'; ctx.fillRect((i * 89) % 420, (i * 53 + s.tick * .15) % 420, 1.2, 1.2); }
        ctx.fillStyle = '#45d8b8'; s.bullets.forEach(b => ctx.fillRect(b.x - 1.5, b.y, 3, 12));
        ctx.fillStyle = '#ff6b9d'; s.enemyBullets.forEach(b => { ctx.beginPath(); ctx.arc(b.x, b.y, 3.4, 0, TAU); ctx.fill(); });
        s.inv.forEach((i, n) => { if (i.alive) drawUfo(ctx, i.x, i.y, .92, s.tick * .06 + n); });
        drawShip(ctx, s.px, 384, .72, !s.over);
        ctx.font = '700 10px ui-monospace'; ctx.fillStyle = '#eef1ff'; ctx.fillText(`LIVES ${Math.max(0, s.lives)}`, 12, 408);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [onReward]);

  const pointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    st.current.px = clamp(((e.clientX - r.left) / r.width) * 420, 22, 398);
    if (e.buttons) fire();
  };

  return (
    <GameShell title="Space Invaders: Neon Fleet" hint={t('← → / A D, пробел — огонь. На телефоне веди корабль пальцем и тапай для выстрела.')} score={score} meta={status} onExit={onExit}>
      <canvas ref={ref} width={420} height={420} className="mx-auto block w-full max-w-[420px] touch-none rounded-xl border border-theme-border"
        onPointerMove={pointer}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); pointer(e); fire(); }}
      />
      {over && <button onClick={reset} className="mx-auto mt-3 block rounded-full bg-theme-primary px-5 py-2 text-xs font-bold text-white hover:opacity-90 transition-opacity">{t('Заново')}</button>}
    </GameShell>
  );
}

// ===== Pac-Man =====
const MAZE = [
  '###############',
  '#......#......#',
  '#.##.#.#.#.##.#',
  '#.............#',
  '#.##.#.#.#.##.#',
  '#....#.#.#....#',
  '####.#...#.####',
  '#......P......#',
  '####.#...#.####',
  '#....#.#.#....#',
  '#.##.#.#.#.##.#',
  '#.............#',
  '###############',
];
const dirs: V[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
function PacmanGame({ onExit, onReward }: { onExit: () => void; onReward: Reward }) {
  const { t } = useLocale();
  const ref = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [lives, setLives] = useState(3);
  const touch = useRef<V | null>(null);
  const rewarded = useRef(false);
  const queued = useRef<V>({ x: 0, y: 0 });
  const restartCount = useRef(0);
  const colors = ['#ff4d8d', '#45d8b8', '#a78bfa', '#ffd166', '#60a5fa'];
  const st = useRef({
    px: 7, py: 7, prevx: 7, prevy: 7, dir: { x: 0, y: 0 } as V,
    dots: [] as V[], power: [] as V[],
    ghost: { x: 6, y: 6, prevx: 6, prevy: 6, color: colors[0], dir: { x: 1, y: 0 } as V },
    score: 0, lives: 3, over: false, tick: 0, last: 0, acc: 0,
  });

  const wall = (x: number, y: number) => (MAZE[y]?.[x] ?? '#') === '#';
  const makeDots = () => { const a: V[] = []; for (let y = 0; y < MAZE.length; y++) for (let x = 0; x < MAZE[y].length; x++) if (MAZE[y][x] === '.') a.push({ x, y }); return a; };
  const makePower = () => [{ x: 1, y: 1 }, { x: 13, y: 1 }, { x: 1, y: 11 }, { x: 13, y: 11 }];
  const reset = () => {
    restartCount.current++;
    const color = colors[(restartCount.current - 1) % colors.length];
    const s = {
      px: 7, py: 7, prevx: 7, prevy: 7, dir: { x: 0, y: 0 } as V,
      dots: makeDots(), power: makePower(),
      ghost: { x: 6, y: 6, prevx: 6, prevy: 6, color, dir: { x: 1, y: 0 } as V },
      score: 0, lives: 3, over: false, tick: 0, last: 0, acc: 0,
    };
    st.current = s; queued.current = { x: 0, y: 0 }; setScore(0); setLives(3); setOver(false); rewarded.current = false;
  };
  const steer = (d: V) => queued.current = d;

  useEffect(() => {
    reset();
    const key = (e: KeyboardEvent) => {
      const m: Record<string, V> = { arrowup: { x: 0, y: -1 }, w: { x: 0, y: -1 }, arrowdown: { x: 0, y: 1 }, s: { x: 0, y: 1 }, arrowleft: { x: -1, y: 0 }, a: { x: -1, y: 0 }, arrowright: { x: 1, y: 0 }, d: { x: 1, y: 0 } };
      const d = m[e.key.toLowerCase()]; if (d) { e.preventDefault(); steer(d); }
    };
    window.addEventListener('keydown', key, { passive: false });
    let raf = 0;
    const step = 155;
    const loop = (now: number) => {
      const s = st.current, cv = ref.current, ctx = cv?.getContext('2d');
      if (!cv || !ctx) { raf = requestAnimationFrame(loop); return; }
      if (!s.last) s.last = now; s.acc += Math.min(40, now - s.last); s.last = now;
      if (!s.over) while (s.acc >= step) {
        s.acc -= step; s.tick++; s.prevx = s.px; s.prevy = s.py; s.ghost.prevx = s.ghost.x; s.ghost.prevy = s.ghost.y;
        const q = queued.current; if (!wall(s.px + q.x, s.py + q.y)) s.dir = q;
        if (!wall(s.px + s.dir.x, s.py + s.dir.y)) { s.px += s.dir.x; s.py += s.dir.y; }
        const di = s.dots.findIndex(d => d.x === s.px && d.y === s.py); if (di >= 0) { s.dots.splice(di, 1); s.score += 10; setScore(s.score); }
        const pi = s.power.findIndex(d => d.x === s.px && d.y === s.py); if (pi >= 0) { s.power.splice(pi, 1); s.score += 50; setScore(s.score); }
        const g = s.ghost;
        if (s.tick % 2 === 0) {
          const scatter = s.tick % 80 < 24;
          const target = scatter ? { x: MAZE[0].length - 2, y: 1 } : { x: s.px + s.dir.x * 3, y: s.py + s.dir.y * 3 };
          const reverse = { x: -g.dir.x, y: -g.dir.y };
          const opts = dirs.filter(d => !wall(g.x + d.x, g.y + d.y) && !(d.x === reverse.x && d.y === reverse.y));
          const choices = opts.length ? opts : dirs.filter(d => !wall(g.x + d.x, g.y + d.y));
          if (choices.length) {
            choices.sort((aa, bb) => {
              const da = Math.abs(g.x + aa.x - target.x) + Math.abs(g.y + aa.y - target.y);
              const db = Math.abs(g.x + bb.x - target.x) + Math.abs(g.y + bb.y - target.y);
              return da - db;
            });
            const pick = choices.length > 1 && s.tick % 7 === 0 ? choices[1] : choices[0];
            g.dir = pick; g.x += pick.x; g.y += pick.y;
          }
        }
        const crossed = (g.x === s.prevx && g.y === s.prevy && s.px === g.prevx && s.py === g.prevy);
        if ((g.x === s.px && g.y === s.py) || crossed) {
          s.lives--; setLives(s.lives);
          if (s.lives <= 0) { s.over = true; setOver(true); if (!rewarded.current && s.score) { rewarded.current = true; onReward(Math.round(s.score / 2), Math.round(s.score / 4)); } }
          else { s.px = 7; s.py = 7; s.prevx = 7; s.prevy = 7; g.x = 6; g.y = 6; g.prevx = 6; g.prevy = 6; s.dir = { x: 0, y: 0 }; queued.current = { x: 0, y: 0 }; }
        }
        if (!s.dots.length && !s.power.length) { s.over = true; setOver(true); if (!rewarded.current) { rewarded.current = true; onReward(Math.round(s.score / 2) + 40, Math.round(s.score / 4) + 20); } }
      }
      const t = s.over ? 1 : clamp(s.acc / step, 0, 1), cw = cv.width / MAZE[0].length, ch = cv.height / MAZE.length;
      ctx.fillStyle = '#050816'; ctx.fillRect(0, 0, cv.width, cv.height);
      for (let y = 0; y < MAZE.length; y++) for (let x = 0; x < MAZE[y].length; x++) if (MAZE[y][x] === '#') {
        const px = x * cw + 2, py = y * ch + 2, w = cw - 4, h = ch - 4;
        ctx.fillStyle = '#172554'; ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.roundRect(px, py, w, h, 5); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = '#ffd9a0'; s.dots.forEach(d => { ctx.beginPath(); ctx.arc(d.x * cw + cw / 2, d.y * ch + ch / 2, 2.5, 0, TAU); ctx.fill(); });
      s.power.forEach((d, i) => { const pulse = 3.8 + Math.sin(s.tick * .22 + i) * 1.1; ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(d.x * cw + cw / 2, d.y * ch + ch / 2, pulse, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; });
      const cx = (s.prevx + (s.px - s.prevx) * t) * cw + cw / 2, cy = (s.prevy + (s.py - s.prevy) * t) * ch + ch / 2;
      const ang = s.dir.x === 1 ? 0 : s.dir.x === -1 ? Math.PI : s.dir.y === 1 ? Math.PI / 2 : -Math.PI / 2;
      const mouth = .18 * Math.PI + Math.abs(Math.sin(now * .012)) * .14;
      ctx.fillStyle = '#fbbf24'; ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, cw * .38, ang + mouth, ang + TAU - mouth); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
      const gx = (s.ghost.prevx + (s.ghost.x - s.ghost.prevx) * t) * cw + cw / 2, gy = (s.ghost.prevy + (s.ghost.y - s.ghost.prevy) * t) * ch + ch / 2;
      drawGhost(ctx, gx, gy, cw * .34, s.ghost.color, s.ghost.dir.x);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { window.removeEventListener('keydown', key); cancelAnimationFrame(raf); };
  }, [onReward]);

  return (
    <GameShell title="Pac-Man: Neon Maze" hint={t('Плавное управление в стиле классического Pac-Man: медленнее движение, один призрак с режимами погони и разбега, а при рестарте его цвет меняется.')} score={score} meta={`❤ ${lives}`} onExit={onExit}>
      <canvas ref={ref} width={450} height={390} className="mx-auto block w-full max-w-[450px] touch-none rounded-xl border border-theme-border"
        onTouchStart={e => touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }}
        onTouchEnd={e => { if (!touch.current) return; const dx = e.changedTouches[0].clientX - touch.current.x, dy = e.changedTouches[0].clientY - touch.current.y; if (Math.hypot(dx, dy) > 16) steer(Math.abs(dx) > Math.abs(dy) ? { x: dx > 0 ? 1 : -1, y: 0 } : { x: 0, y: dy > 0 ? 1 : -1 }); touch.current = null; }}
      />
      {over && <button onClick={reset} className="mx-auto mt-3 block rounded-full bg-theme-primary px-5 py-2 text-xs font-bold text-white hover:opacity-90 transition-opacity">{t('Заново')}</button>}
    </GameShell>
  );
}

// ===== Stellar Reactor (Clicker) =====
function ClickerGame({ onExit, onReward }: { onExit: () => void; onReward: Reward }) {
  const { t } = useLocale();
  const safe = (k: string, f: number) => { const n = Number(localStorage.getItem(k)); return Number.isFinite(n) && n >= 0 ? n : f; };
  const [stars, setStars] = useState(() => safe('ssp_clicker', 0));
  const [power, setPower] = useState(() => Math.max(1, safe('ssp_clicker_power', 1)));
  const [auto, setAuto] = useState(() => safe('ssp_clicker_auto', 0));
  const [bursts, setBursts] = useState<{ x: number; y: number; id: number }[]>([]);
  const rewarded = useRef(false);

  useEffect(() => {
    localStorage.setItem('ssp_clicker', String(stars));
    localStorage.setItem('ssp_clicker_power', String(power));
    localStorage.setItem('ssp_clicker_auto', String(auto));
    if (stars >= 100 && !rewarded.current) { rewarded.current = true; onReward(30, 15); }
  }, [stars, power, auto, onReward]);

  useEffect(() => { if (!auto) return; const iv = setInterval(() => setStars(s => s + auto), 1000); return () => clearInterval(iv); }, [auto]);

  const tap = (e: React.PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setBursts(b => [...b.slice(-10), { x: e.clientX - r.left, y: e.clientY - r.top, id: performance.now() + Math.random() }]);
    setStars(s => s + power);
  };

  return (
    <GameShell title="Stellar Reactor" hint={t('Тапай по настоящей звезде, прокачивай реактор и автоматические дроны-сборщики.')} score={stars} meta={`+${auto}/${t('с')}`} onExit={onExit}>
      <div className="panel p-6 text-center">
        <p className="text-3xl font-bold text-theme-warning">{stars.toLocaleString('ru-RU')} <span className="text-base text-theme-muted">{t('энергии')}</span></p>
        <button aria-label={t('Собрать звёздную энергию')} onPointerDown={tap} className="relative mx-auto mt-5 block h-48 w-48 touch-manipulation select-none transition active:scale-95">
          <span className="absolute inset-2 bg-theme-warning" style={{ clipPath: 'polygon(50% 0%,61% 34%,98% 36%,68% 57%,79% 94%,50% 72%,21% 94%,32% 57%,2% 36%,39% 34%)', filter: 'drop-shadow(0 0 24px rgba(232,169,79,.65))' }} />
          <span className="absolute inset-9 bg-white/35" style={{ clipPath: 'polygon(50% 0%,61% 34%,98% 36%,68% 57%,79% 94%,50% 72%,21% 94%,32% 57%,2% 36%,39% 34%)' }} />
          {bursts.map(b => <span key={b.id} className="pointer-events-none absolute text-lg font-bold text-theme-warning" style={{ left: b.x, top: b.y }}>+{power}</span>)}
        </button>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button onClick={() => { const cost = power * 50; if (stars >= cost) { setStars(s => s - cost); setPower(p => p + 1); } }} disabled={stars < power * 50} className="rounded-xl border border-theme-border bg-theme-surface2 p-3 text-left transition hover:border-theme-primary disabled:opacity-40">
            <p className="text-sm font-bold text-theme-text">{t('Реактор +1')}</p>
            <p className="mt-0.5 font-mono text-[10px] text-theme-muted">{t('цена')}: {power * 50} · {t('мощность')} ×{power}</p>
          </button>
          <button onClick={() => { const cost = (auto + 1) * 120; if (stars >= cost) { setStars(s => s - cost); setAuto(a => a + 1); } }} disabled={stars < (auto + 1) * 120} className="rounded-xl border border-theme-border bg-theme-surface2 p-3 text-left transition hover:border-theme-primary disabled:opacity-40">
            <p className="text-sm font-bold text-theme-text">{t('Дрон +1/сек')}</p>
            <p className="mt-0.5 font-mono text-[10px] text-theme-muted">{t('цена')}: {(auto + 1) * 120} · {t('сейчас')}: {auto}/{t('сек')}</p>
          </button>
        </div>
      </div>
    </GameShell>
  );
}

// ===== Beat Rush =====
const RUSH_BEATS = 16;
const RUSH_INTERVAL = 0.6;
const RUSH_LEAD = 1.2;
const RUSH_JUDGEMENTS = [
  { ms: 45, points: 100, label: 'Идеально' },
  { ms: 100, points: 60, label: 'Хорошо' },
  { ms: 170, points: 25, label: 'Нормально' },
];

function GarticSound({ onExit }: { onExit: () => void }) {
  const { t } = useLocale();
  return (
    <div className="space-y-4">
      <button onClick={onExit} className="flex items-center gap-2 text-sm text-theme-muted hover:text-theme-text transition-colors">
        <ArrowLeft className="w-4 h-4" /> {t('Назад')}
      </button>
      <GarticPhonePage />
    </div>
  );
}

function BeatRushGame({ onExit, onReward }: { onExit: () => void; onReward: Reward }) {
  const { t } = useLocale();
  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle');
  const [score, setScore] = useState(0);
  const [currentBeat, setCurrentBeat] = useState(-1);
  const [results, setResults] = useState<(string | null)[]>(() => Array(RUSH_BEATS).fill(null));
  const ctxRef = useRef<AudioContext | null>(null);
  const startRef = useRef(0);
  const judgedRef = useRef(new Set<number>());
  const scoreRef = useRef(0);
  const beatTimerRef = useRef<number | null>(null);
  const finishTimerRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (beatTimerRef.current) clearInterval(beatTimerRef.current);
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    beatTimerRef.current = null;
    finishTimerRef.current = null;
  };

  const closeAudio = () => {
    ctxRef.current?.close();
    ctxRef.current = null;
  };

  const scheduleClick = (ctx: AudioContext, when: number, accent: boolean) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = accent ? 1200 : 800;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, when + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.13);
  };

  const finish = () => {
    clearTimers();
    closeAudio();
    setCurrentBeat(-1);
    setPhase('done');
    const finalScore = scoreRef.current;
    if (finalScore > 0) onReward(Math.round(finalScore / 5), Math.round(finalScore / 10));
  };

  const start = async () => {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') await ctx.resume();
    ctxRef.current = ctx;
    startRef.current = ctx.currentTime + RUSH_LEAD;
    judgedRef.current = new Set();
    scoreRef.current = 0;
    setScore(0);
    setResults(Array(RUSH_BEATS).fill(null));
    setCurrentBeat(-1);
    setPhase('playing');

    for (let i = 0; i < RUSH_BEATS; i++) {
      scheduleClick(ctx, startRef.current + i * RUSH_INTERVAL, i % 4 === 0);
    }

    beatTimerRef.current = window.setInterval(() => {
      const beat = Math.round((ctx.currentTime - startRef.current) / RUSH_INTERVAL);
      setCurrentBeat(beat >= 0 && beat < RUSH_BEATS ? beat : -1);
    }, 50);
    finishTimerRef.current = window.setTimeout(finish, (RUSH_LEAD + RUSH_BEATS * RUSH_INTERVAL + 0.4) * 1000);
  };

  const tap = () => {
    const ctx = ctxRef.current;
    if (!ctx || phase !== 'playing') return;
    const rel = ctx.currentTime - startRef.current;
    const idx = Math.round(rel / RUSH_INTERVAL);
    if (idx < 0 || idx >= RUSH_BEATS || judgedRef.current.has(idx)) return;
    const deviationMs = Math.abs(rel - idx * RUSH_INTERVAL) * 1000;
    const judgement = RUSH_JUDGEMENTS.find((j) => deviationMs <= j.ms);
    if (!judgement) return;
    judgedRef.current.add(idx);
    scoreRef.current += judgement.points;
    setScore(scoreRef.current);
    setResults((prev) => prev.map((r, i) => (i === idx ? judgement.label : r)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        tap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => () => {
    clearTimers();
    closeAudio();
  }, []);

  return (
    <GameShell title="Beat Rush" hint={t('Жми в такт бита или пробел. Чем точнее попадёшь в удар — тем больше очков.')} score={score} meta={phase === 'playing' ? `${Math.max(currentBeat + 1, 0)}/${RUSH_BEATS}` : undefined} onExit={onExit}>
      <div className="panel p-6 text-center space-y-6">
        {phase === 'idle' && (
          <div className="space-y-4">
            <Music2 className="w-16 h-16 text-theme-primary mx-auto" />
            <p className="text-theme-muted text-sm">{t('16 ударов в темпе 100 BPM. Слушай метроном и нажимай в момент щелчка.')}</p>
            <button onClick={start} className="px-6 py-3 bg-theme-primary text-white rounded-xl font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-2">
              <Play className="w-5 h-5" /> {t('Начать')}
            </button>
          </div>
        )}
        {phase === 'playing' && (
          <div className="space-y-6">
            <div className="flex justify-center gap-2 flex-wrap">
              {results.map((r, i) => (
                <span
                  key={i}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold transition-colors ${i === currentBeat ? 'ring-2 ring-theme-primary' : ''} ${r ? 'bg-theme-success/30 text-theme-success' : 'bg-theme-surface2 text-theme-muted'}`}
                >
                  {i + 1}
                </span>
              ))}
            </div>
            <button
              onPointerDown={(e) => { e.preventDefault(); tap(); }}
              className="relative w-40 h-40 sm:w-48 sm:h-48 mx-auto rounded-full bg-theme-primary text-white font-bold text-lg shadow-lg active:scale-95 transition-transform select-none touch-none"
            >
              <span key={currentBeat} className="absolute inset-0 rounded-full border-4 border-white/60 animate-ping" />
              <span className="relative">{t('ТАП')}</span>
            </button>
            <p className="text-sm font-medium text-theme-text h-5">
              {results[currentBeat] ?? ''}
            </p>
          </div>
        )}
        {phase === 'done' && (
          <div className="space-y-4">
            <Trophy className="w-16 h-16 text-theme-warning mx-auto" />
            <p className="text-3xl font-bold text-theme-text">{score} {t('очков')}</p>
            <p className="text-sm text-theme-muted">{results.filter(Boolean).length}/{RUSH_BEATS} {t('попаданий')}</p>
            <button onClick={start} className="px-6 py-3 bg-theme-primary text-white rounded-xl font-medium hover:opacity-90 transition-opacity">
              {t('Заново')}
            </button>
          </div>
        )}
      </div>
    </GameShell>
  );
}

// ===== Freestyle Rap =====
const RAP_WORDS = [
  'огонь', 'ночь', 'город', 'душа', 'свет', 'сила', 'ветер', 'сердце',
  'бит', 'микрофон', 'толпа', 'сцена', 'огни', 'движение', 'риск', 'мечта',
  'правда', 'лёд', 'пламя', 'тайна', 'голос', 'улица', 'небо', 'звезда',
  'время', 'путь', 'шаг', 'ритм', 'поток', 'кровь', 'база', 'гром',
];

function FreestyleRapGame({ onExit, onReward }: { onExit: () => void; onReward: Reward }) {
  const { t } = useLocale();
  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle');
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const [words, setWords] = useState<string[]>([]);
  const [rhymeInput, setRhymeInput] = useState('');
  const [feedback, setFeedback] = useState('');
  const [timeLeft, setTimeLeft] = useState(300);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<number | null>(null);
  const scoreRef = useRef(0);
  const roundRef = useRef(0);
  const rewarded = useRef(false);
  const pausedRef = useRef(false);
  const TOTAL_ROUNDS = 5;
  const ROUND_TIME = 300;

  const pickWords = () => {
    const shuffled = [...RAP_WORDS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4);
  };

  const startRound = () => {
    const w = pickWords();
    setWords(w);
    setRhymeInput('');
    setFeedback(`${t('Придумай рифмы к словам')}: ${w.map(wd => t(wd)).join(', ')}`);
    setTimeLeft(ROUND_TIME);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      if (pausedRef.current) return;
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          submitRhyme();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  const start = () => {
    scoreRef.current = 0; setScore(0); roundRef.current = 0;
    rewarded.current = false;
    setPhase('playing');
    startRound();
  };

  const submitRhyme = () => {
    const text = rhymeInput.trim();
    if (timerRef.current) clearInterval(timerRef.current);
    if (!text) {
      setFeedback(t('Время вышло! Ход пропущен'));
    } else {
      const lines = text.split('\n').filter(l => l.trim());
      let points = 0;
      words.forEach((word) => {
        const matched = lines.some(l => {
          const end = l.trim().slice(-3).toLowerCase();
          const wordEnd = word.slice(-3).toLowerCase();
          return end === wordEnd || l.toLowerCase().includes(word);
        });
        if (matched) points += 20;
      });
      points += Math.min(40, lines.length * 10);
      scoreRef.current += points;
      setScore(scoreRef.current);
      setFeedback(points > 60 ? `${t('Огонь')}! +${points}` : points > 30 ? `${t('Неплохо')} +${points}` : `${t('Слабовато')} +${points}`);
    }
    roundRef.current++;
    setRound(roundRef.current);
    if (roundRef.current >= TOTAL_ROUNDS) {
      finish();
    } else {
      setTimeout(startRound, 2000);
    }
  };

  const finish = () => {
    setPhase('done');
    if (timerRef.current) clearInterval(timerRef.current);
    if (!rewarded.current && scoreRef.current) {
      rewarded.current = true;
      onReward(Math.round(scoreRef.current / 4), Math.round(scoreRef.current / 8));
    }
  };

  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };

  const reset = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    pausedRef.current = false; setPaused(false);
    setPhase('idle'); setScore(0); setRound(0); setRhymeInput(''); setFeedback(''); setTimeLeft(ROUND_TIME);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  return (
    <GameShell title="Freestyle Rap" hint={t('Тебе даются 4 случайных слова. Придумай рифмы за 5 минут. 5 раундов.')} score={score} meta={phase === 'playing' ? `${t('раунд')} ${round + 1}/${TOTAL_ROUNDS}` : undefined} onExit={onExit}>
      <div className="panel p-6 space-y-4">
        {phase === 'idle' && (
          <div className="text-center space-y-4">
            <Type className="w-16 h-16 text-theme-accent mx-auto animate-pulse" />
            <p className="text-theme-muted text-sm">{t('5 раундов. В каждом — 4 слова и 5 минут. Пиши рифмы и зарабатывай очки!')}</p>
            <button onClick={start} className="px-6 py-3 bg-theme-primary text-white rounded-xl font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-2">
              <Play className="w-5 h-5" /> {t('Начать')}
            </button>
          </div>
        )}
        {phase === 'playing' && (
          <div className="space-y-4">
            <p className="text-center text-sm text-theme-muted">{feedback}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {words.map((w, i) => (
                <span key={i} className="px-4 py-2 bg-theme-surface2 border border-theme-border rounded-xl text-theme-text font-bold text-sm">
                  {t(w)}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className={`font-mono text-sm font-bold ${timeLeft <= 10 ? 'text-theme-danger' : 'text-theme-muted'}`}>{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</span>
              <div className="flex-1 h-2 bg-theme-surface2 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-1000 ${timeLeft <= 10 ? 'bg-theme-danger' : 'bg-theme-primary'}`} style={{ width: `${(timeLeft / ROUND_TIME) * 100}%` }} />
              </div>
              <button onClick={togglePause} className="px-3 py-1.5 bg-theme-surface2 border border-theme-border rounded-lg text-theme-text text-xs font-medium hover:bg-theme-surface3 transition-colors">
                {paused ? t('Продолжить') : t('Пауза')}
              </button>
            </div>
            <textarea
              value={rhymeInput}
              onChange={(e) => setRhymeInput(e.target.value)}
              placeholder={t('Пиши свои рифмы сюда...')}
              rows={3}
              autoFocus
              className="w-full px-4 py-3 bg-theme-surface2 border border-theme-border rounded-xl text-theme-text text-sm focus:outline-none focus:border-theme-primary resize-none"
            />
            <button onClick={submitRhyme} className="w-full py-3 bg-theme-primary text-white rounded-xl font-medium hover:opacity-90 transition-opacity">
              {t('Готово')}
            </button>
          </div>
        )}
        {phase === 'done' && (
          <div className="text-center space-y-4">
            <Trophy className="w-16 h-16 text-theme-warning mx-auto" />
            <p className="text-3xl font-bold text-theme-text">{score} {t('очков')}</p>
            <button onClick={reset} className="px-6 py-3 bg-theme-primary text-white rounded-xl font-medium hover:opacity-90 transition-opacity">
              {t('Заново')}
            </button>
          </div>
        )}
      </div>
    </GameShell>
  );
}

// ===== Main Games Page =====
export default function GamesPage() {
  const { profile, addXp, addCoins, isGuest, checkAchievements } = useAuth();
  const { t } = useLocale();
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [highScores, setHighScores] = useState<Record<string, number>>({});

  const fetchScores = useCallback(async () => {
    if (isGuest) {
      const saved = localStorage.getItem('soundscape-guest-scores');
      if (saved) setHighScores(JSON.parse(saved));
      return;
    }
    if (!profile) return;
    const { data } = await supabase
      .from('game_scores')
      .select('game_name, score')
      .eq('user_id', profile.id)
      .order('score', { ascending: false });
    if (data) {
      const scores: Record<string, number> = {};
      data.forEach((s: { game_name: string; score: number }) => {
        if (!scores[s.game_name] || scores[s.game_name] < s.score) {
          scores[s.game_name] = s.score;
        }
      });
      setHighScores(scores);
    }
  }, [profile, isGuest]);

  useEffect(() => { fetchScores(); }, [fetchScores]);

  const reward = useCallback((xp: number, coins: number, gameType?: string) => {
    if (isGuest) return;
    addXp(xp);
    // Coin rewards go through the secure earn_coins_from_game RPC, which enforces
    // a per-day, per-game-type cap of 500 coins and records an audit row.
    if (coins > 0 && gameType) {
      supabase
        .rpc('earn_coins_from_game', { p_game_type: gameType, p_amount: Math.round(coins) })
        .then(({ error }) => {
          if (error) {
            // Daily limit / overflow — silently ignore; coins just aren't credited.
            console.warn('earn_coins_from_game rejected:', error.message);
          }
        });
    } else if (coins !== 0) {
      addCoins(coins);
    }
    checkAchievements();
    fetchScores();
  }, [addXp, addCoins, isGuest, fetchScores]);

  const recordScore = async (gameName: string, score: number) => {
    if (isGuest) {
      setHighScores((prev) => {
        const next = { ...prev, [gameName]: Math.max(prev[gameName] || 0, score) };
        localStorage.setItem('soundscape-guest-scores', JSON.stringify(next));
        return next;
      });
      return;
    }
    if (!profile) return;
    await supabase.from('game_scores').insert({ user_id: profile.id, game_name: gameName, score });
    fetchScores();
  };

  // Bind the game slug so the secure earn_coins_from_game RPC gets the right game_type.
  const rewardFor = (gameType: string): Reward => (xp, coins) => reward(xp, coins, gameType);

  if (activeGame === 'snake') return <SnakeGame onExit={() => setActiveGame(null)} onReward={rewardFor('snake')} />;
  if (activeGame === 'shooter') return <ShooterGame onExit={() => setActiveGame(null)} onReward={rewardFor('shooter')} />;
  if (activeGame === 'invaders') return <InvadersGame onExit={() => setActiveGame(null)} onReward={rewardFor('invaders')} />;
  if (activeGame === 'pacman') return <PacmanGame onExit={() => setActiveGame(null)} onReward={rewardFor('pacman')} />;
  if (activeGame === 'clicker') return <ClickerGame onExit={() => setActiveGame(null)} onReward={rewardFor('clicker')} />;
  if (activeGame === 'beatrush') return <BeatRushGame onExit={() => setActiveGame(null)} onReward={rewardFor('beatrush')} />;
  if (activeGame === 'freestyle') return <FreestyleRapGame onExit={() => setActiveGame(null)} onReward={rewardFor('freestyle')} />;
  if (activeGame === 'GarticSound') return <GarticSound onExit={() => setActiveGame(null)} />;

  const games = [
    { k: 'snake', t: 'Космическая змейка', d: 'Плавнее управление, звёзды и живой космический червь вместо квадратов.', c: '#45d8b8', icon: <Gamepad2 className="w-5 h-5" />, score: highScores['snake'] || 0 },
    { k: 'shooter', t: 'Asteroid Blaster', d: 'Корабль против настоящих астероидов: столкновения, жизни и ускорение волн.', c: '#ff6b9d', icon: <Rocket className="w-5 h-5" />, score: highScores['shooter'] || 0 },
    { k: 'invaders', t: 'Neon Invaders', d: 'Спрайты пришельцев, вражеские выстрелы, волны и управление пальцем.', c: '#a78bfa', icon: <Zap className="w-5 h-5" />, score: highScores['invaders'] || 0 },
    { k: 'pacman', t: 'Pac-Man: Neon Maze', d: 'Призраки, жизни, нормальные повороты и более живой лабиринт.', c: '#e8a94f', icon: <Ghost className="w-5 h-5" />, score: highScores['pacman'] || 0 },
    { k: 'clicker', t: 'Stellar Reactor', d: 'Звезда вместо бублика, энергия, реактор и дроны авто-сбора.', c: '#ffd9a0', icon: <Star className="w-5 h-5" />, score: highScores['clicker'] || 0 },
    { k: 'beatrush', t: 'Beat Rush', d: 'Жми в такт бита: 16 ударов в темпе 100 BPM. Чем точнее попадёшь — тем больше очков.', c: '#38bdf8', icon: <Music2 className="w-5 h-5" />, score: highScores['beatrush'] || 0 },
    { k: 'freestyle', t: 'Freestyle Rap', d: 'Рандомные слова — придумай рифмы за 5 минут. 5 раундов.', c: '#a78bfa', icon: <Type className="w-5 h-5" />, score: highScores['freestyle'] || 0 },
    { k: 'GarticSound', t: 'Gartic Sound', d: 'Придумывай биты - придумывай описание.', c: '#e675d3', icon: <HeadphonesIcon className="w-5 h-5" /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Gamepad2 className="w-6 h-6 text-theme-accent" />
          {t('Игровой отсек')}
        </h1>
        <p className="text-theme-muted text-sm mt-1">
          {t('Аркада · очки → XP и монеты')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {games.map(g => (
          <button
            key={g.k}
            onClick={() => setActiveGame(g.k)}
            className="group relative overflow-hidden panel p-5 text-left transition hover:-translate-y-1 hover:border-theme-primary"
          >
            <span className="pointer-events-none absolute -top-14 -right-14 h-40 w-40 rounded-full blur-3xl opacity-20 transition-opacity group-hover:opacity-40" style={{ background: g.c }} />
            <div className="relative flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: g.c }}>
                {g.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-theme-text group-hover:text-theme-primary">{t(g.t)}</p>
                <p className="mt-1 line-clamp-2 text-[11.5px] font-medium leading-snug text-theme-muted">{t(g.d)}</p>
              </div>
              <Trophy className="w-4 h-4 shrink-0 text-theme-muted" />
              <span className="text-xs text-theme-muted">{g.score}</span>
            </div>
          </button>
        ))}
      </div>

      <p className="text-center font-mono text-[10px] uppercase tracking-widest text-theme-muted">
        {t('награды зачисляются в профиль автоматически')}
      </p>
    </div>
  );
}
