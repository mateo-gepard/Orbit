import type { SVGProps } from 'react';
import { cn } from '@/lib/utils';

interface AircraftSilhouetteProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  kind: 'commercial' | 'private';
}

/**
 * Original, intentionally generic aircraft silhouettes for the Flight tool.
 *
 * Keeping these as interface-colored vectors avoids third-party image-license
 * ambiguity, remains legible in both themes, and prevents a real manufacturer's
 * livery from implying an endorsement of Threadmap.
 */
export function AircraftSilhouette({ kind, className, ...props }: AircraftSilhouetteProps) {
  return (
    <svg
      viewBox="0 0 320 96"
      aria-hidden="true"
      focusable="false"
      className={cn('block text-foreground', className)}
      {...props}
    >
      {kind === 'commercial' ? <CommercialAircraft /> : <PrivateAircraft />}
    </svg>
  );
}

function CommercialAircraft() {
  return (
    <>
      <path
        d="M18 48 7 17h25l45 27 168-1c22 0 39 4 57 14 6 4 5 8-2 10-15 4-36 6-57 6H83c-25 0-46-3-65-9Z"
        fill="currentColor"
        opacity="0.92"
      />
      <path d="m121 69-40 21h55l64-19Z" fill="currentColor" opacity="0.76" />
      <path d="m55 48-30-12h34l27 10Z" fill="currentColor" opacity="0.72" />
      <path
        d="M74 56h164"
        fill="none"
        stroke="var(--primary)"
        strokeLinecap="round"
        strokeWidth="3"
        opacity="0.62"
      />
      <g fill="var(--background)" opacity="0.88">
        {Array.from({ length: 12 }, (_, index) => (
          <rect key={index} x={91 + index * 12} y="48" width="6" height="3" rx="1.5" />
        ))}
      </g>
      <path d="M275 51c10 2 19 5 27 10-9 1-18 2-27 2Z" fill="var(--background)" opacity="0.82" />
    </>
  );
}

function PrivateAircraft() {
  return (
    <>
      <path
        d="M21 51 9 12h22l43 37 171-1c25 0 43 5 59 14 5 3 4 7-3 9-17 5-36 7-59 7H79c-23 0-42-4-58-11Z"
        fill="currentColor"
        opacity="0.92"
      />
      <path d="m145 74-40 18h48l61-17Z" fill="currentColor" opacity="0.76" />
      <path d="m60 53-31-14h37l28 11Z" fill="currentColor" opacity="0.72" />
      <rect x="63" y="41" width="42" height="17" rx="8.5" fill="currentColor" opacity="0.72" />
      <path
        d="M82 62h154"
        fill="none"
        stroke="var(--primary)"
        strokeLinecap="round"
        strokeWidth="3"
        opacity="0.62"
      />
      <g fill="var(--background)" opacity="0.9">
        {Array.from({ length: 7 }, (_, index) => (
          <rect key={index} x={128 + index * 14} y="54" width="7" height="4" rx="2" />
        ))}
      </g>
      <path d="M278 55c10 2 19 5 27 10-9 2-18 3-27 3Z" fill="var(--background)" opacity="0.82" />
    </>
  );
}
