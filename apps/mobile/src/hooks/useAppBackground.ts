import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

// On native: AppState gives background/foreground events.
// On web (Expo web): AppState doesn't fire reliably. We use visibilitychange instead.
// Grace period: 5 seconds. If app is backgrounded > 5s during a session → abandon.

export function useAppBackground(
  isSessionActive: boolean,
  onAbandon: (reason: 'abandoned_app_switch') => void,
  gracePeriodMs = 5000,
) {
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSessionActiveRef = useRef(isSessionActive);
  isSessionActiveRef.current = isSessionActive;

  const startGrace = () => {
    if (!isSessionActiveRef.current) return;
    graceTimerRef.current = setTimeout(() => {
      if (isSessionActiveRef.current) {
        onAbandon('abandoned_app_switch');
      }
    }, gracePeriodMs);
  };

  const cancelGrace = () => {
    if (graceTimerRef.current) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Web: use Page Visibility API
      const handleVisibility = () => {
        if (document.hidden) {
          startGrace();
        } else {
          cancelGrace();
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        cancelGrace();
      };
    } else {
      // Native: use AppState
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'background' || state === 'inactive') {
          startGrace();
        } else if (state === 'active') {
          cancelGrace();
        }
      });
      return () => {
        sub.remove();
        cancelGrace();
      };
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}