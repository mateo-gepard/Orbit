'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  adoptSignedOutData,
  discardSignedOutData,
  DEMO_USER_ID,
  listAdoptableSignedOutData,
} from '@/lib/account-storage';
import { useAuth } from '@/components/providers/auth-provider';
import { useTranslation } from '@/lib/i18n';

const DISMISSED_KEY = 'orbit-signed-out-adoption-dismissed';

/**
 * Offer to bring pre-sign-in work into the account it now belongs to.
 *
 * Filling in the Abitur tracker before creating an account left that data in
 * the browser under the `signed-out` scope, unreachable and unmentioned — the
 * tool simply looked empty afterwards. Adoption is offered rather than
 * automatic, because a shared computer's leftovers must not silently become
 * someone's account data.
 */
export function SignedOutDataAdoption() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const promptedFor = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.uid;
    if (!userId || userId === DEMO_USER_ID) return;
    if (promptedFor.current === userId) return;

    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(`${DISMISSED_KEY}:${userId}`) === '1';
    } catch { /* storage unavailable — offer anyway */ }
    if (dismissed) return;

    const adoptable = listAdoptableSignedOutData(userId);
    if (adoptable.length === 0) return;

    promptedFor.current = userId;

    const remember = () => {
      try {
        window.localStorage.setItem(`${DISMISSED_KEY}:${userId}`, '1');
      } catch { /* nothing to remember it with */ }
    };

    toast(t('adoption.title'), {
      description: t('adoption.description', { count: adoptable.length }),
      duration: Infinity,
      action: {
        label: t('adoption.adopt'),
        onClick: () => {
          const adopted = adoptSignedOutData(userId);
          remember();
          if (adopted.length === 0) {
            toast.error(t('adoption.failed'));
            return;
          }
          toast.success(t('adoption.adopted', { count: adopted.length }));
          // The stores read their scoped keys at hydration, so the adopted
          // values only take effect on the next load.
          window.location.reload();
        },
      },
      cancel: {
        label: t('adoption.discard'),
        onClick: () => {
          discardSignedOutData();
          remember();
          toast.success(t('adoption.discarded'));
        },
      },
    });
  }, [t, user?.uid]);

  return null;
}
