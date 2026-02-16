'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { FlightPhase, FlightClass } from '@/lib/flight';

interface PlaneAnimationProps {
  phase: FlightPhase;
  phaseProgress: number;
  progress: number; // 0-1 overall flight progress
  isPaused?: boolean;
  flightClass?: FlightClass;
}

/**
 * Side-view plane animation with phase-based movement:
 * Boarding → Taxi → Takeoff → Cruise → Descent → Landing
 *
 * The plane moves horizontally and vertically through each phase.
 */
export function PlaneAnimation({ phase, phaseProgress, progress, isPaused, flightClass = 'commercial' }: PlaneAnimationProps) {
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
        <SideViewPlane isPaused={isPaused} isFlying={isFlying} phase={phase} flightClass={flightClass} />
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

function SideViewPlane({ isPaused, isFlying, phase, flightClass = 'commercial' }: {
  isPaused?: boolean;
  isFlying?: boolean;
  phase?: FlightPhase;
  flightClass?: FlightClass;
}) {
  const isPrivate = flightClass === 'private';
  const imageSrc = isPrivate ? '/lg60sidee.png' : '/a380.png';
  
  return (
    <div className="relative">
      {/* Aircraft Image */}
      <img
        src={imageSrc}
        alt={isPrivate ? 'Private Jet' : 'Aircraft'}
        className={cn(
          'object-contain transition-all duration-500',
          isPrivate ? 'w-14 h-14' : 'w-16 h-16',
          isPaused
            ? 'drop-shadow-[0_0_12px_oklch(0.8_0.15_85/0.4)] brightness-110 saturate-150'
            : isPrivate
              ? 'drop-shadow-[0_0_14px_oklch(0.7_0.15_280/0.3)]'
              : 'drop-shadow-[0_0_14px_oklch(0.7_0.15_230/0.25)]'
        )}
        style={{
          filter: isPaused 
            ? 'brightness(1.1) saturate(1.5) drop-shadow(0 0 12px rgba(245, 158, 11, 0.4))'
            : isPrivate
              ? 'drop-shadow(0 0 14px rgba(168, 85, 247, 0.3))'
              : 'drop-shadow(0 0 14px rgba(56, 189, 248, 0.25))'
        }}
      />
      
      {/* Navigation lights overlay */}
      {isFlying && (
        <>
          {/* Green right wingtip light */}
          <div 
            className="absolute w-2 h-2 rounded-full bg-green-500/60 blur-sm animate-pulse"
            style={{ top: '20%', left: '10%' }}
          />
          
          {/* Red left wingtip light */}
          <div 
            className="absolute w-2 h-2 rounded-full bg-red-500/60 blur-sm animate-pulse"
            style={{ top: '20%', right: '10%' }}
          />
          
          {/* White tail beacon */}
          <div 
            className="absolute w-1.5 h-1.5 rounded-full bg-white/50 blur-sm animate-pulse"
            style={{ top: '30%', right: '5%' }}
          />
        </>
      )}
    </div>
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
