import { useEffect, useRef, useState } from 'react';

/**
 * A class name for a value that just changed, cleared 140ms later.
 *
 * Live readouts otherwise change silently — a speed that ticks from 22.2 to 22.4
 * while you are looking somewhere else leaves no trace that the feed is alive.
 * One quiet pulse is the app's only ambient motion, and it disappears entirely
 * under `prefers-reduced-motion` (see tokens.css).
 */
export function useValueTick(value: string | number): string {
  const [ticking, setTicking] = useState(false);
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    setTicking(true);
    const id = setTimeout(() => setTicking(false), 140);
    return () => clearTimeout(id);
  }, [value]);

  return ticking ? 'value-tick' : '';
}
