// ═══════════════════════════════════════════════════════════
// ORBIT — Mobile Haptics & Utilities
// ═══════════════════════════════════════════════════════════

/** Trigger haptic feedback if available */
export function haptic(style: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'light') {
  if (typeof navigator === 'undefined') return;
  
  // Navigator.vibrate API
  if ('vibrate' in navigator) {
    switch (style) {
      case 'light': navigator.vibrate(10); break;
      case 'medium': navigator.vibrate(20); break;
      case 'heavy': navigator.vibrate(30); break;
      case 'success': navigator.vibrate([10, 50, 10]); break;
      case 'error': navigator.vibrate([30, 50, 30, 50, 30]); break;
    }
  }
}

/** Detect if running as installed PWA (standalone) */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone: boolean }).standalone === true
  );
}

/** Detect if on mobile device */
export function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(max-width: 1023px)').matches ||
    'ontouchstart' in window
  );
}

/** Detect iOS specifically */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/** Detect if device supports touch */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/** Lock body scroll (for modals on mobile) */
export function lockBodyScroll() {
  if (typeof document === 'undefined') return;
  const scrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
}

/** Unlock body scroll */
export function unlockBodyScroll() {
  if (typeof document === 'undefined') return;
  const scrollY = document.body.style.top;
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  window.scrollTo(0, parseInt(scrollY || '0') * -1);
}
