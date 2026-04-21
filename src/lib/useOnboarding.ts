import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'bte440-onboarding-seen-v1';
const FIRST_OPEN_DELAY_MS = 500;

export interface UseOnboardingReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export function useOnboarding(): UseOnboardingReturn {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // localStorage unavailable (private mode, SSR, etc.) — fall through as seen=false
    }
    if (seen) return;
    const id = window.setTimeout(() => setIsOpen(true), FIRST_OPEN_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  const open = useCallback(() => setIsOpen(true), []);

  const close = useCallback(() => {
    setIsOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
  }, []);

  return { isOpen, open, close };
}
