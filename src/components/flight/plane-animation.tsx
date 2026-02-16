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
 * Polished plane animation with smooth phase transitions,
 * parallax clouds, contrails, and ground details.
 */
export function PlaneAnimation({ phase, phaseProgress, progress, isPaused }: PlaneAnimationProps) {
  const planeStyle = useMemo(() => {
    const base = {
      translateX: 0,
      translateY: 0,
      rotate: 0,
      scale: 1,
      rotateX: 0,
    };

    // Smooth easing for phaseProgress
    const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const p = ease(phaseProgress);

    switch (phase) {
      case 'boarding':
        base.translateY = 12;
        base.rotateX = 3;
        base.scale = 0.85;
        break;
      case 'taxi':
        base.translateX = -30 + p * 60;
        base.translateY = 12;
        base.rotateX = 3;
        base.scale = 0.88;
        break;
      case 'takeoff':
        base.translateX = 30 - p * 30;
        base.translateY = 12 - p * 36;
        base.rotate = -20 * p;
        base.rotateX = 3 + p * 18;
        base.scale = 0.88 + p * 0.14;
        break;
      case 'cruise':
        base.translateX = 0;
        base.translateY = -24;
        base.rotate = 0;
        base.rotateX = 15;
        base.scale = 1.02;
        break;
      case 'descent':
        base.translateX = -8 * p;
        base.translateY = -24 + p * 32;
        base.rotate = 10 * p;
        base.rotateX = 15 - p * 12;
        base.scale = 1.02 - p * 0.12;
        break;
      case 'landed':
        base.translateX = -8 - p * 20;
        base.translateY = 8;
        base.rotate = 0;
        base.rotateX = 3;
        base.scale = 0.88;
        break;
    }

    return base;
  }, [phase, phaseProgress]);

  const isFlying = phase === 'cruise' || phase === 'takeoff' || phase === 'descent';
  const isOnGround = phase === 'boarding' || phase === 'taxi' || phase === 'landed';
  const showContrails = phase === 'cruise' && !isPaused;

  return (
    <div className="relative w-full max-w-sm h-40 mx-auto my-2" style={{ perspective: '800px' }}>

      {/* Sky gradient background (subtle, only while airborne) */}
      {isFlying && (
        <div
          className="absolute inset-0 rounded-2xl transition-opacity duration-1000"
          style={{
            background: isPaused
              ? 'radial-gradient(ellipse at 50% 80%, oklch(0.85 0.06 85 / 0.04), transparent 70%)'
              : 'radial-gradient(ellipse at 50% 80%, oklch(0.85 0.12 230 / 0.04), transparent 70%)',
          }}
        />
      )}

      {/* Stars / altitude dots (cruise only) */}
      {phase === 'cruise' && !isPaused && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[
            { x: '15%', y: '20%', delay: '0s', size: 1.5 },
            { x: '75%', y: '15%', delay: '1.5s', size: 1 },
            { x: '45%', y: '10%', delay: '3s', size: 1.2 },
            { x: '85%', y: '30%', delay: '0.8s', size: 0.8 },
            { x: '25%', y: '35%', delay: '2.2s', size: 1 },
          ].map((dot, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-foreground/[0.04] animate-pulse-glow"
              style={{
                left: dot.x,
                top: dot.y,
                width: dot.size * 2,
                height: dot.size * 2,
                animationDelay: dot.delay,
              }}
            />
          ))}
        </div>
      )}

      {/* Clouds (parallax layers while airborne) */}
      {isFlying && !isPaused && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
          <div className="absolute top-6 animate-cloud-1 opacity-[0.06]">
            <CloudShape size={70} />
          </div>
          <div className="absolute top-16 animate-cloud-2 opacity-[0.04]">
            <CloudShape size={100} />
          </div>
          <div className="absolute top-10 animate-cloud-3 opacity-[0.035]">
            <CloudShape size={55} />
          </div>
        </div>
      )}

      {/* Ground elements */}
      {isOnGround && (
        <div className="absolute bottom-8 left-6 right-6">
          {/* Runway surface */}
          <div className="h-[2px] bg-foreground/[0.06] rounded-full" />
          {/* Center line dashes */}
          <div className="flex justify-center gap-3 mt-1">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-[1px] rounded-full transition-opacity duration-500',
                  phase === 'taxi'
                    ? 'w-4 bg-foreground/[0.06]'
                    : 'w-3 bg-foreground/[0.04]'
                )}
              />
            ))}
          </div>
          {/* Runway edge lights */}
          <div className="flex justify-between mt-1.5 px-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'w-1 h-1 rounded-full transition-colors duration-300',
                  phase === 'taxi' || phase === 'landed'
                    ? 'bg-amber-500/20'
                    : 'bg-foreground/[0.03]'
                )}
              />
            ))}
          </div>
        </div>
      )}

      {/* Contrails (cruise only) */}
      {showContrails && (
        <div
          className="absolute transition-all duration-1000"
          style={{
            left: `calc(50% + ${planeStyle.translateX - 8}px)`,
            top: `calc(50% + ${planeStyle.translateY + 18}px)`,
          }}
        >
          <div className="relative">
            <div
              className="absolute w-[60px] h-[1px] rounded-full animate-contrail-fade"
              style={{
                background: 'linear-gradient(to left, transparent, var(--foreground))',
                opacity: 0.06,
                transform: 'rotate(2deg)',
                top: -4,
                right: 20,
              }}
            />
            <div
              className="absolute w-[50px] h-[1px] rounded-full animate-contrail-fade"
              style={{
                background: 'linear-gradient(to left, transparent, var(--foreground))',
                opacity: 0.04,
                transform: 'rotate(-2deg)',
                top: 4,
                right: 20,
                animationDelay: '0.3s',
              }}
            />
          </div>
        </div>
      )}

      {/* The plane */}
      <div
        className={cn(
          'absolute left-1/2 top-1/2 transition-all',
          isPaused ? 'duration-700 ease-in-out' : 'duration-[1.5s] ease-out',
          phase === 'cruise' && !isPaused && 'animate-float'
        )}
        style={{
          transform: `
            translate(-50%, -50%)
            translateX(${planeStyle.translateX}px)
            translateY(${planeStyle.translateY}px)
            rotateX(${planeStyle.rotateX}deg)
            rotate(${planeStyle.rotate}deg)
            scale(${planeStyle.scale})
          `,
          transformStyle: 'preserve-3d',
        }}
      >
        <PlaneBody isPaused={isPaused} isFlying={isFlying} phase={phase} />
      </div>

      {/* Ground shadow */}
      {isOnGround && (
        <div
          className="absolute left-1/2 bottom-7 transition-all duration-[1.5s] ease-out"
          style={{
            transform: `translateX(calc(-50% + ${planeStyle.translateX}px))`,
            width: `${48 * planeStyle.scale}px`,
            height: '6px',
            background: 'radial-gradient(ellipse, var(--foreground) 0%, transparent 70%)',
            opacity: 0.06,
            borderRadius: '50%',
          }}
        />
      )}

      {/* Altitude shadow (fades as plane climbs) */}
      {(phase === 'takeoff' || phase === 'descent') && (
        <div
          className="absolute left-1/2 bottom-7 transition-all duration-1000 ease-out"
          style={{
            transform: `translateX(calc(-50% + ${planeStyle.translateX * 0.8}px)) scaleX(${1 - Math.abs(planeStyle.translateY) / 50})`,
            width: '32px',
            height: '4px',
            background: 'radial-gradient(ellipse, var(--foreground) 0%, transparent 70%)',
            opacity: Math.max(0, 0.04 - Math.abs(planeStyle.translateY) / 600),
            borderRadius: '50%',
          }}
        />
      )}
    </div>
  );
}

// ─── SVG Plane Body (improved) ─────────────────────────────

function PlaneBody({ isPaused, isFlying, phase }: { isPaused?: boolean; isFlying?: boolean; phase?: FlightPhase }) {
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 72 72"
      fill="none"
      className={cn(
        'transition-colors duration-500',
        isPaused
          ? 'text-amber-500 drop-shadow-[0_0_8px_oklch(0.8_0.15_85/0.3)]'
          : 'text-sky-500 drop-shadow-[0_0_12px_oklch(0.7_0.15_230/0.25)]'
      )}
    >
      {/* Fuselage body */}
      <path
        d="M36 6L43 22L43 50L39 57L36 59L33 57L29 50L29 22L36 6Z"
        fill="currentColor"
        opacity={0.12}
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      {/* Fuselage center highlight */}
      <path
        d="M36 8L38.5 22L38.5 48L36 55L33.5 48L33.5 22L36 8Z"
        fill="currentColor"
        opacity={0.06}
      />
      {/* Fuselage top shine */}
      <path
        d="M34.5 10L36 7L37.5 10L37 20L35 20Z"
        fill="currentColor"
        opacity={0.15}
      />

      {/* Wings — swept back */}
      <path
        d="M29 30L6 38L6 40L29 35Z"
        fill="currentColor"
        opacity={0.18}
        stroke="currentColor"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <path
        d="M43 30L66 38L66 40L43 35Z"
        fill="currentColor"
        opacity={0.18}
        stroke="currentColor"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      {/* Wing top highlights */}
      <path d="M29 31L8 38.2L8 38.8L29 34Z" fill="currentColor" opacity={0.05} />
      <path d="M43 31L64 38.2L64 38.8L43 34Z" fill="currentColor" opacity={0.05} />
      {/* Winglets */}
      <path d="M6 38L4 37.5L5 39.5L6 40Z" fill="currentColor" opacity={0.12} />
      <path d="M66 38L68 37.5L67 39.5L66 40Z" fill="currentColor" opacity={0.12} />

      {/* Horizontal stabilizer (tail wings) */}
      <path
        d="M33 49L22 53L22 54.5L33 51Z"
        fill="currentColor"
        opacity={0.15}
        stroke="currentColor"
        strokeWidth="0.4"
      />
      <path
        d="M39 49L50 53L50 54.5L39 51Z"
        fill="currentColor"
        opacity={0.15}
        stroke="currentColor"
        strokeWidth="0.4"
      />

      {/* Vertical stabilizer */}
      <path
        d="M34.5 49L36 40L37.5 49Z"
        fill="currentColor"
        opacity={0.22}
        stroke="currentColor"
        strokeWidth="0.4"
      />

      {/* Engines (under wings) */}
      <rect x="20" y="33" width="3.5" height="5" rx="1.5" fill="currentColor" opacity={0.15} />
      <rect x="48.5" y="33" width="3.5" height="5" rx="1.5" fill="currentColor" opacity={0.15} />

      {/* Engine intake rings */}
      <ellipse cx="21.75" cy="33" rx="1.5" ry="0.8" fill="currentColor" opacity={0.1} />
      <ellipse cx="50.25" cy="33" rx="1.5" ry="0.8" fill="currentColor" opacity={0.1} />

      {/* Engine exhaust glow */}
      {isFlying && !isPaused && (
        <>
          <ellipse cx="21.75" cy="39" rx="1.2" ry="4" fill="currentColor" opacity={0.06} className="animate-pulse" />
          <ellipse cx="50.25" cy="39" rx="1.2" ry="4" fill="currentColor" opacity={0.06} className="animate-pulse" />
          {/* Hot core */}
          <ellipse cx="21.75" cy="39.5" rx="0.6" ry="2.5" fill="currentColor" opacity={0.1} className="animate-pulse" />
          <ellipse cx="50.25" cy="39.5" rx="0.6" ry="2.5" fill="currentColor" opacity={0.1} className="animate-pulse" />
        </>
      )}

      {/* Cockpit windows */}
      <path
        d="M35 12L36 9.5L37 12L37 15L35 15Z"
        fill="currentColor"
        opacity={0.2}
      />

      {/* Cabin windows */}
      {[18, 21, 24, 27, 30, 33, 36, 39, 42].map((y) => (
        <circle key={y} cx="36" cy={y} r="0.4" fill="currentColor" opacity={0.08} />
      ))}

      {/* Navigation lights */}
      {isFlying && (
        <>
          <circle cx="6" cy="39" r="0.8" fill="#ef4444" opacity={0.4} />
          <circle cx="66" cy="39" r="0.8" fill="#22c55e" opacity={0.4} />
          {/* Tail strobe */}
          <circle cx="36" cy="58" r="0.6" fill="white" opacity={0.2} className="animate-pulse" />
        </>
      )}
    </svg>
  );
}

// ─── Cloud Shape (improved) ────────────────────────────────

function CloudShape({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.45} viewBox="0 0 120 54" className="text-foreground">
      <ellipse cx="40" cy="34" rx="28" ry="16" fill="currentColor" />
      <ellipse cx="70" cy="30" rx="24" ry="14" fill="currentColor" />
      <ellipse cx="55" cy="22" rx="22" ry="16" fill="currentColor" />
      <ellipse cx="85" cy="36" rx="16" ry="10" fill="currentColor" />
      <ellipse cx="25" cy="38" rx="14" ry="9" fill="currentColor" />
    </svg>
  );
}
