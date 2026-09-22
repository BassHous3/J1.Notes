'use client';
import { useEffect, useState } from 'react';

/**
 * Returns true when the viewport is narrower than `breakpointPx` (default
 * matches Tailwind's `sm` breakpoint, 640px). Used to switch condensed /
 * dropdown-style UI on only where there isn't enough room for the full
 * layout, rather than condensing unconditionally.
 *
 * Defaults to `false` on first render (server + initial client render) to
 * avoid a hydration mismatch, then updates once mounted in the browser.
 */
export function useIsSmallScreen(breakpointPx: number = 640): boolean {
  const [isSmall, setIsSmall] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const update = () => setIsSmall(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [breakpointPx]);

  return isSmall;
}
