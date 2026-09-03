'use client';

import { useEffect } from 'react';
import { useShell } from './app-shell';

/**
 * Kesintiye kapalı, tek görevli akışlar için (depo toplama ekranı, sayım ekranı vb.) kenar
 * çubuğunu + üst bar'ı kaldırır. Bileşen mount olunca açar, unmount olunca (rotadan ayrılınca)
 * kapatır — çağıran ekstra bir şey yapmaz, tek satır: `useFocusMode()`.
 */
export function useFocusMode(): void {
  const { setFocusMode } = useShell();
  useEffect(() => {
    setFocusMode(true);
    return () => setFocusMode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
