'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { useSettingsStore } from '@/lib/settings-store';
import { useOrbitStore } from '@/lib/store';
import { updateItem } from '@/lib/firestore';
import { getAutoArchiveTaskIds } from '@/lib/auto-archive';
import { DEVICE_SCOPE, reportSyncRecovered, reportSyncWarning } from '@/lib/sync-warning';
import { useAuth } from './auth-provider';

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
  const { setTheme } = useTheme();
  const { user } = useAuth();
  const userId = user?.uid || null;
  const pendingArchiveIds = useRef(new Set<string>());

  // Account-scoped settings are authoritative across hydration and switches.
  useEffect(() => {
    setTheme(settings.theme);
  }, [setTheme, settings.theme]);

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
    const ids = getAutoArchiveTaskIds(items, autoArchiveDays)
      .filter((id) => !pendingArchiveIds.current.has(id));
    if (ids.length === 0) return;

    ids.forEach((id) => pendingArchiveIds.current.add(id));

    const archive = async () => {
      const results = await Promise.allSettled(
        ids.map((id) => updateItem(id, { status: 'archived' }))
      );
      const failed = results.filter((result) => result.status === 'rejected');

      ids.forEach((id) => pendingArchiveIds.current.delete(id));
      if (failed.length > 0) {
        reportSyncWarning({
          key: 'items:auto-archive',
          userId: userId ?? DEVICE_SCOPE,
          message: failed.length === 1
            ? 'A completed task could not be auto-archived. It is still safe in your task list.'
            : `${failed.length} completed tasks could not be auto-archived. They are still safe in your task list.`,
        });
      } else {
        reportSyncRecovered({ key: 'items:auto-archive', userId: userId ?? DEVICE_SCOPE });
      }
    };

    void archive();
  }, [items, autoArchiveDays, userId]);

  return null;
}
