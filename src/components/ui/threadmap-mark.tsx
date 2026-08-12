import type { SVGProps } from 'react';

type ThreadmapMarkProps = SVGProps<SVGSVGElement> & {
  title?: string;
};

/** The selected Threadmap mark: a T-shaped thread with three dark nodes and one orange endpoint. */
export function ThreadmapMark({ title, ...props }: ThreadmapMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M12 18H52M32 18V50"
        stroke="currentColor"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="18" r="5.5" fill="currentColor" />
      <circle cx="32" cy="18" r="5.5" fill="currentColor" />
      <circle cx="32" cy="50" r="5.5" fill="currentColor" />
      <circle cx="52" cy="18" r="6" fill="#e36a3d" />
    </svg>
  );
}
