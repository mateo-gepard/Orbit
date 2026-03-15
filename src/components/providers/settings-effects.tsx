'use client';

import { useEffect } from 'react';
import { useSettingsStore } from '@/lib/settings-store';
import { useOrbitStore } from '@/lib/store';
import { updateItem } from '@/lib/firestore';

/**
 * Applies user settings as global CSS classes / variables on the document.
 * Mount once in the provider chain. No UI rendered.
 *
 * Handles: accentColor, compactMode, animationsEnabled,
 *          accessibility.reduceMotion, highContrast, fontSize,
 *          language (html lang attribute), autoArchive
 */
export function SettingsEffects() {
  const settings = useSettingsStore((s) => s.settings);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    // ── Language ────────────────────────────────────────────
    root.setAttribute('lang', settings.language === 'de' ? 'de' : 'en');

    // ── Accent color ───────────────────────────────────────
    // Set a CSS variable that components can reference
    if (settings.accentColor) {
      root.style.setProperty('--accent-color', settings.accentColor);
    }

    // ── Compact mode / density ─────────────────────────────
    body.setAttribute('data-density', settings.compactMode);

    // ── Animations ─────────────────────────────────────────
    if (!settings.animationsEnabled || settings.accessibility.reduceMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }

    // ── High contrast ──────────────────────────────────────
    if (settings.accessibility.highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    // ── Font size ──────────────────────────────────────────
    root.setAttribute('data-font-size', settings.accessibility.fontSize);

    return () => {
      root.style.removeProperty('--accent-color');
      body.removeAttribute('data-density');
      root.classList.remove('reduce-motion', 'high-contrast');
      root.removeAttribute('data-font-size');
    };
  }, [
    settings.accentColor,
    settings.compactMode,
    settings.animationsEnabled,
    settings.accessibility.reduceMotion,
    settings.accessibility.highContrast,
    settings.accessibility.fontSize,
    settings.language,
  ]);

  // ── Auto-archive completed items ─────────────────────────
  const items = useOrbitStore((s) => s.items);
  const autoArchiveDays = settings.autoArchiveDays;

  useEffect(() => {
    if (!autoArchiveDays || autoArchiveDays <= 0) return;

    const cutoff = Date.now() - autoArchiveDays * 24 * 60 * 60 * 1000;
    const toArchive = items.filter(
      (item) =>
        item.status === 'done' &&
        item.updatedAt &&
        item.updatedAt < cutoff
    );

    for (const item of toArchive) {
      updateItem(item.id, { status: 'archived' });
    }
  }, [items, autoArchiveDays]);

  return null;
}
