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
 * A clean isometric/3D-perspective plane that animates through flight phases.
 * Uses CSS transforms for a pseudo-3D look — no WebGL needed.
 */
export function PlaneAnimation({ phase, phaseProgress, progress, isPaused }: PlaneAnimationProps) {
  // Compute plane position & rotation based on phase
  const planeStyle = useMemo(() => {
    const base = {
      translateX: 0,
      translateY: 0,
      rotate: 0,
      scale: 1,
      rotateX: 0, // 3D pitch
    };

    switch (phase) {
      case 'boarding':
        // Plane stationary, slight ground perspective
        base.translateY = 8;
        base.rotate = 0;
        base.rotateX = 5;
        base.scale = 0.9;
        break;
      case 'taxi':
        // Slowly moving forward on the ground
        base.translateX = -20 + phaseProgress * 40;
        base.translateY = 8;
        base.rotate = 0;
        base.rotateX = 5;
        base.scale = 0.92;
        break;
      case 'takeoff':
        // Pitch up and climb
        base.translateX = 20 + phaseProgress * 10;
        base.translateY = 8 - phaseProgress * 24;
        base.rotate = -15 * phaseProgress;
        base.rotateX = 5 + phaseProgress * 15;
        base.scale = 0.92 + phaseProgress * 0.08;
        break;
      case 'cruise':
        // Level flight, gentle floating
        base.translateX = 0;
        base.translateY = -16;
        base.rotate = 0;
        base.rotateX = 12;
        base.scale = 1;
        break;
      case 'descent':
        // Nose down slightly, descending
        base.translateX = -10 * phaseProgress;
        base.translateY = -16 + phaseProgress * 20;
        base.rotate = 8 * phaseProgress;
        base.rotateX = 12 - phaseProgress * 8;
        base.scale = 1 - phaseProgress * 0.05;
        break;
      case 'landed':
        // Touch down, decelerate
        base.translateX = -10 - phaseProgress * 10;
        base.translateY = 4;
        base.rotate = 0;
        base.rotateX = 4;
        base.scale = 0.92;
        break;
    }

    return base;
  }, [phase, phaseProgress]);

  // Floating animation offset for cruise phase
  const isFlying = phase === 'cruise' || phase === 'takeoff' || phase === 'descent';

  return (
    <div className="relative w-full max-w-xs h-32 mx-auto" style={{ perspective: '600px' }}>
      {/* Clouds / atmosphere effect (only while airborne) */}
      {isFlying && !isPaused && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-4 animate-cloud-1 opacity-[0.04]">
            <CloudShape size={60} />
          </div>
          <div className="absolute top-12 animate-cloud-2 opacity-[0.03]">
            <CloudShape size={80} />
          </div>
          <div className="absolute top-8 animate-cloud-3 opacity-[0.025]">
            <CloudShape size={50} />
          </div>
        </div>
      )}

      {/* Ground line (visible during boarding/taxi/landing) */}
      {(phase === 'boarding' || phase === 'taxi' || phase === 'landed') && (
        <div className="absolute bottom-8 left-4 right-4">
          <div className="h-[1px] bg-foreground/[0.06] rounded-full" />
          {/* Runway markings */}
          <div className="flex justify-between mt-1 px-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="w-3 h-[1px] bg-foreground/[0.04]" />
            ))}
          </div>
        </div>
      )}

      {/* The plane */}
      <div
        className={cn(
          'absolute left-1/2 top-1/2 transition-all',
          isPaused ? 'duration-500' : 'duration-1000 ease-out',
          isFlying && !isPaused && 'animate-float'
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
        <PlaneBody isPaused={isPaused} isFlying={isFlying} />
      </div>

      {/* Shadow on ground */}
      <div
        className={cn(
          'absolute left-1/2 bottom-6 transition-all duration-1000 ease-out',
          phase === 'cruise' && 'opacity-0'
        )}
        style={{
          transform: `translateX(calc(-50% + ${planeStyle.translateX}px))`,
          width: `${40 * planeStyle.scale}px`,
          height: '4px',
          background: 'radial-gradient(ellipse, var(--foreground) 0%, transparent 70%)',
          opacity: phase === 'cruise' ? 0 : 0.04 + (1 - Math.abs(planeStyle.translateY) / 20) * 0.04,
          borderRadius: '50%',
        }}
      />
    </div>
  );
}

// ─── SVG Plane Body ────────────────────────────────────────

function PlaneBody({ isPaused, isFlying }: { isPaused?: boolean; isFlying?: boolean }) {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      className={cn(
        'drop-shadow-sm transition-colors',
        isPaused ? 'text-amber-500' : 'text-sky-500'
      )}
    >
      {/* Fuselage */}
      <path
        d="M32 8L38 22L38 46L35 52L32 54L29 52L26 46L26 22L32 8Z"
        fill="currentColor"
        opacity={0.15}
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* Fuselage highlight */}
      <path
        d="M32 10L34 22L34 44L32 50L30 44L30 22L32 10Z"
        fill="currentColor"
        opacity={0.08}
      />

      {/* Wings */}
      <path
        d="M26 28L8 34L8 36L26 33Z"
        fill="currentColor"
        opacity={0.2}
        stroke="currentColor"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      <path
        d="M38 28L56 34L56 36L38 33Z"
        fill="currentColor"
        opacity={0.2}
        stroke="currentColor"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />

      {/* Wing highlights (top surface) */}
      <path d="M26 29L10 34.5L10 35L26 32Z" fill="currentColor" opacity={0.06} />
      <path d="M38 29L54 34.5L54 35L38 32Z" fill="currentColor" opacity={0.06} />

      {/* Tail fin */}
      <path
        d="M32 46L32 42L28 48L32 46Z"
        fill="currentColor"
        opacity={0.2}
        stroke="currentColor"
        strokeWidth="0.5"
      />
      <path
        d="M32 46L32 42L36 48L32 46Z"
        fill="currentColor"
        opacity={0.15}
        stroke="currentColor"
        strokeWidth="0.5"
      />
      {/* Vertical stabilizer */}
      <path
        d="M31 44L32 38L33 44Z"
        fill="currentColor"
        opacity={0.25}
        stroke="currentColor"
        strokeWidth="0.5"
      />

      {/* Engines */}
      <ellipse cx="22" cy="31" rx="1.5" ry="2.5" fill="currentColor" opacity={0.2} />
      <ellipse cx="42" cy="31" rx="1.5" ry="2.5" fill="currentColor" opacity={0.2} />

      {/* Engine glow when flying */}
      {isFlying && !isPaused && (
        <>
          <ellipse cx="22" cy="33" rx="1" ry="3" fill="currentColor" opacity={0.08} className="animate-pulse" />
          <ellipse cx="42" cy="33" rx="1" ry="3" fill="currentColor" opacity={0.08} className="animate-pulse" />
        </>
      )}

      {/* Nose dot */}
      <circle cx="32" cy="10" r="1" fill="currentColor" opacity={0.3} />

      {/* Window line */}
      <line x1="32" y1="16" x2="32" y2="28" stroke="currentColor" strokeWidth="0.5" opacity={0.1} />
    </svg>
  );
}

// ─── Cloud Shape ───────────────────────────────────────────

function CloudShape({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.5} viewBox="0 0 100 50" className="text-foreground">
      <ellipse cx="35" cy="30" rx="25" ry="15" fill="currentColor" />
      <ellipse cx="60" cy="28" rx="20" ry="12" fill="currentColor" />
      <ellipse cx="48" cy="22" rx="18" ry="13" fill="currentColor" />
    </svg>
  );
}
