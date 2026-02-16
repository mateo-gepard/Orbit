'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { FlightPhase } from '@/lib/flight';

interface PlaneAnimationProps {
  phase: FlightPhase;
  phaseProgress: number;
  progress: number; // 0-1 overall flight progress
  isPaused?: boolean;
}

/**
 * Side-view plane animation with phase-based movement:
 * Boarding → Taxi → Takeoff → Cruise → Descent → Landing
 *
 * The plane moves horizontally and vertically through each phase.
 */
export function PlaneAnimation({ phase, phaseProgress, progress, isPaused }: PlaneAnimationProps) {
  // Smooth easing
  const ease = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
  const p = ease(phaseProgress);

  const planeStyle = useMemo(() => {
    let x = 0;
    let y = 0;
    let rotate = 0;

    switch (phase) {
      case 'boarding':
        x = 8;
        y = 0;
        rotate = 0;
        break;
      case 'taxi':
        x = 8 + p * 22;
        y = 0;
        rotate = 0;
        break;
      case 'takeoff':
        x = 30 + p * 25;
        y = p * 90;
        rotate = -18 + p * 6;
        break;
      case 'cruise':
        x = 55 + p * 10;
        y = 90 + Math.sin(p * Math.PI * 4) * 2;
        rotate = 0;
        break;
      case 'descent':
        x = 65 + p * 18;
        y = 90 - p * 85;
        rotate = 10 - p * 4;
        break;
      case 'landed':
        x = 83 + p * 10;
        y = 0;
        rotate = 0;
        break;
    }

    return { x, y, rotate };
  }, [phase, phaseProgress, p]);

  const isFlying = phase === 'cruise' || phase === 'takeoff' || phase === 'descent';
  const isOnGround = phase === 'boarding' || phase === 'taxi' || phase === 'landed';
  const showContrails = phase === 'cruise' && !isPaused;

  const groundY = 82;
  const planeTop = groundY - (planeStyle.y / 100) * (groundY - 10);

  return (
    <div className="relative w-full h-36 lg:h-44 mx-auto my-2 overflow-hidden rounded-2xl">
      {/* Sky gradient */}
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          background: isFlying
            ? 'linear-gradient(to bottom, oklch(0.75 0.12 230 / 0.06) 0%, oklch(0.85 0.08 220 / 0.03) 60%, transparent 100%)'
            : 'linear-gradient(to bottom, oklch(0.8 0.04 220 / 0.03) 0%, transparent 60%)',
        }}
      />

      {/* Stars (cruise only) */}
      {phase === 'cruise' && !isPaused && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[
            { x: '12%', y: '12%', delay: '0s', size: 1.5 },
            { x: '35%', y: '8%', delay: '1.5s', size: 1 },
            { x: '58%', y: '14%', delay: '3s', size: 1.2 },
            { x: '78%', y: '6%', delay: '0.8s', size: 0.8 },
            { x: '92%', y: '18%', delay: '2.2s', size: 1 },
          ].map((dot, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-foreground/[0.06] animate-pulse"
              style={{
                left: dot.x,
                top: dot.y,
                width: dot.size * 2,
                height: dot.size * 2,
                animationDelay: dot.delay,
                animationDuration: '3s',
              }}
            />
          ))}
        </div>
      )}

      {/* Clouds */}
      {isFlying && !isPaused && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[
            { top: '30%', size: 60, delay: 0, dur: 12 },
            { top: '45%', size: 80, delay: 4, dur: 16 },
            { top: '20%', size: 50, delay: 8, dur: 14 },
          ].map((c, i) => (
            <div
              key={i}
              className="absolute opacity-[0.05]"
              style={{
                top: c.top,
                animation: `cloud-drift ${c.dur}s linear ${c.delay}s infinite`,
              }}
            >
              <CloudShape size={c.size} />
            </div>
          ))}
        </div>
      )}

      {/* Ground line + runway */}
      <div
        className="absolute left-0 right-0 transition-all duration-700"
        style={{ top: `${groundY}%` }}
      >
        <div className="h-[2px] bg-foreground/[0.08] mx-4" />
        <div className="flex justify-center gap-3 mt-1 mx-4">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-[1px] rounded-full',
                isOnGround ? 'w-4 bg-foreground/[0.06]' : 'w-3 bg-foreground/[0.03]'
              )}
            />
          ))}
        </div>
        {isOnGround && (
          <div className="flex justify-between mt-1.5 px-6 mx-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'w-1 h-1 rounded-full transition-colors duration-300',
                  phase === 'taxi' || phase === 'landed' ? 'bg-amber-500/25' : 'bg-foreground/[0.03]'
                )}
              />
            ))}
          </div>
        )}
        <div className="h-8 bg-gradient-to-b from-foreground/[0.02] to-transparent mt-1" />
      </div>

      {/* Departure marker */}
      {(phase === 'boarding' || phase === 'taxi') && (
        <div className="absolute transition-opacity duration-500" style={{ left: '4%', top: `${groundY - 8}%` }}>
          <div className="h-6 w-[2px] bg-foreground/[0.08] mx-auto" />
          <div className="h-1 w-1 rounded-full bg-amber-500/40 mx-auto -mt-0.5" />
        </div>
      )}

      {/* Arrival marker */}
      {(phase === 'descent' || phase === 'landed') && (
        <div className="absolute transition-opacity duration-500" style={{ right: '4%', top: `${groundY - 8}%` }}>
          <div className="h-6 w-[2px] bg-foreground/[0.08] mx-auto" />
          <div className="h-1 w-1 rounded-full bg-emerald-500/40 mx-auto -mt-0.5" />
        </div>
      )}

      {/* Contrails */}
      {showContrails && (
        <div
          className="absolute transition-all duration-500 pointer-events-none"
          style={{ left: `${planeStyle.x - 8}%`, top: `${planeTop + 1}%` }}
        >
          <div className="h-[1px] rounded-full" style={{ width: '60px', background: 'linear-gradient(to left, transparent, var(--foreground))', opacity: 0.06, transform: 'translateX(-100%)' }} />
          <div className="h-[1px] rounded-full mt-[3px]" style={{ width: '50px', background: 'linear-gradient(to left, transparent, var(--foreground))', opacity: 0.04, transform: 'translateX(-100%)' }} />
        </div>
      )}

      {/* The plane */}
      <div
        className={cn(
          'absolute transition-all pointer-events-none',
          isPaused ? 'duration-700 ease-in-out' : 'duration-[1.2s] ease-out',
          phase === 'cruise' && !isPaused && 'animate-[gentle-float_4s_ease-in-out_infinite]'
        )}
        style={{
          left: `${planeStyle.x}%`,
          top: `${planeTop}%`,
          transform: `translate(-50%, -50%) rotate(${planeStyle.rotate}deg)`,
        }}
      >
        <SideViewPlane isPaused={isPaused} isFlying={isFlying} phase={phase} />
      </div>

      {/* Ground shadow */}
      {isOnGround && (
        <div
          className="absolute transition-all duration-1000 ease-out"
          style={{
            left: `${planeStyle.x}%`,
            top: `${groundY + 0.5}%`,
            transform: 'translateX(-50%)',
            width: '40px',
            height: '4px',
            background: 'radial-gradient(ellipse, var(--foreground) 0%, transparent 70%)',
            opacity: 0.06,
            borderRadius: '50%',
          }}
        />
      )}

      {/* Altitude shadow */}
      {(phase === 'takeoff' || phase === 'descent') && (
        <div
          className="absolute transition-all duration-1000 ease-out"
          style={{
            left: `${planeStyle.x}%`,
            top: `${groundY + 0.5}%`,
            transform: `translateX(-50%) scaleX(${Math.max(0.2, 1 - planeStyle.y / 100)})`,
            width: '30px',
            height: '3px',
            background: 'radial-gradient(ellipse, var(--foreground) 0%, transparent 70%)',
            opacity: Math.max(0, 0.04 * (1 - planeStyle.y / 100)),
            borderRadius: '50%',
          }}
        />
      )}

      <style jsx>{`
        @keyframes cloud-drift {
          0% { transform: translateX(110%); }
          100% { transform: translateX(-120%); }
        }
        @keyframes gentle-float {
          0%, 100% { transform: translate(-50%, -50%) translateY(0px); }
          50% { transform: translate(-50%, -50%) translateY(-3px); }
        }
      `}</style>
    </div>
  );
}

// ─── Side-View Plane SVG ───────────────────────────────────

function SideViewPlane({ isPaused, isFlying, phase }: {
  isPaused?: boolean;
  isFlying?: boolean;
  phase?: FlightPhase;
}) {
  return (
    <svg
      width="56"
      height="28"
      viewBox="0 0 56 28"
      fill="none"
      className={cn(
        'transition-colors duration-500',
        isPaused
          ? 'text-amber-500 drop-shadow-[0_0_8px_oklch(0.8_0.15_85/0.3)]'
          : 'text-sky-500 drop-shadow-[0_0_10px_oklch(0.7_0.15_230/0.2)]'
      )}
    >
      {/* Fuselage */}
      <path
        d="M4 14C4 14 8 10 18 10L46 10C50 10 54 12 54 14C54 16 50 18 46 18L18 18C8 18 4 14 4 14Z"
        fill="currentColor"
        opacity={0.12}
        stroke="currentColor"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <path
        d="M10 12.5C14 11 20 10.5 40 10.5C46 10.5 50 11.5 52 12.5"
        stroke="currentColor"
        strokeWidth="0.4"
        opacity={0.08}
        fill="none"
      />

      {/* Nose */}
      <path d="M2 14C2 14 4 11.5 6 11L8 10.5" stroke="currentColor" strokeWidth="0.5" opacity={0.15} fill="none" />

      {/* Wing */}
      <path d="M22 10L18 2L32 2L28 10" fill="currentColor" opacity={0.15} stroke="currentColor" strokeWidth="0.5" strokeLinejoin="round" />
      <path d="M20 8L19 4L30 4L29 8" fill="currentColor" opacity={0.04} />

      {/* Tail fin */}
      <path d="M44 10L42 2L48 6L46 10" fill="currentColor" opacity={0.18} stroke="currentColor" strokeWidth="0.5" strokeLinejoin="round" />

      {/* Tail plane */}
      <path d="M42 13L40 9L48 9L46 13" fill="currentColor" opacity={0.1} stroke="currentColor" strokeWidth="0.4" />

      {/* Engine */}
      <rect x="23" y="17" width="6" height="3" rx="1.5" fill="currentColor" opacity={0.12} />
      <ellipse cx="23.5" cy="18.5" rx="1" ry="1.2" fill="currentColor" opacity={0.08} />

      {/* Engine exhaust */}
      {isFlying && !isPaused && (
        <>
          <ellipse cx="30" cy="18.5" rx="3" ry="0.8" fill="currentColor" opacity={0.05} className="animate-pulse" />
          <ellipse cx="31" cy="18.5" rx="2" ry="0.5" fill="currentColor" opacity={0.08} className="animate-pulse" />
        </>
      )}

      {/* Cockpit */}
      <path d="M6 12.5L10 11.5L10 13L6 13.5Z" fill="currentColor" opacity={0.2} />

      {/* Cabin windows */}
      {[14, 17, 20, 23, 26, 29, 32, 35, 38].map((x) => (
        <rect key={x} x={x} y={11.5} width="1.5" height="1" rx="0.4" fill="currentColor" opacity={0.07} />
      ))}

      {/* Nav lights */}
      {isFlying && (
        <>
          <circle cx="3" cy="14" r="0.6" fill="#22c55e" opacity={0.5} />
          <circle cx="48" cy="8" r="0.5" fill="white" opacity={0.3} className="animate-pulse" />
          <circle cx="18" cy="2.5" r="0.5" fill="#ef4444" opacity={0.4} />
        </>
      )}

      {/* Landing gear */}
      {(phase === 'boarding' || phase === 'taxi' || phase === 'landed') && (
        <>
          <line x1="16" y1="18" x2="16" y2="22" stroke="currentColor" strokeWidth="0.6" opacity={0.1} />
          <circle cx="16" cy="22" r="1" fill="currentColor" opacity={0.1} />
          <line x1="36" y1="18" x2="36" y2="22" stroke="currentColor" strokeWidth="0.6" opacity={0.1} />
          <circle cx="36" cy="22" r="1" fill="currentColor" opacity={0.1} />
        </>
      )}
    </svg>
  );
}

// ─── Cloud Shape ───────────────────────────────────────────

function CloudShape({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.4} viewBox="0 0 120 48" className="text-foreground">
      <ellipse cx="40" cy="30" rx="28" ry="14" fill="currentColor" />
      <ellipse cx="70" cy="26" rx="24" ry="12" fill="currentColor" />
      <ellipse cx="55" cy="20" rx="20" ry="14" fill="currentColor" />
      <ellipse cx="85" cy="32" rx="16" ry="10" fill="currentColor" />
      <ellipse cx="25" cy="34" rx="14" ry="8" fill="currentColor" />
    </svg>
  );
}
