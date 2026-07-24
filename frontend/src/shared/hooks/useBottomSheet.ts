import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

export type SnapPoint = 'peek' | 'half' | 'full';

interface UseBottomSheetOptions {
  /** Only mobile viewports get the draggable-sheet behaviour. */
  isMobile: boolean;
  /** Whether the sheet content is mounted/visible at all. */
  open: boolean;
  /** App-level collapsed flag, kept in sync with `snap === 'peek'`. */
  collapsed: boolean;
  /** Called when the sheet settles into / leaves the peek (collapsed) state. */
  onCollapsedChange: (collapsed: boolean) => void;
  /** Distinguishes the CSS variable this sheet publishes its height to. */
  sheetId: 'filter' | 'detail';
}

interface UseBottomSheetReturn {
  snap: SnapPoint;
  sheetRef: RefObject<HTMLDivElement | null>;
  /** Spread onto the drag handle (and any other drag-initiating zone). */
  handleProps: { onPointerDown: (e: ReactPointerEvent) => void };
  isDragging: boolean;
}

const PEEK_PX = 72; // handle + first content row stays visible when collapsed
const FLING_V = 0.5; // px/ms — above this a release flings one snap step
const RUBBER = 0.3; // resistance when dragged above the full stop

/** Snap points ordered by translateY (0 = fully raised). */
const ORDER: SnapPoint[] = ['full', 'half', 'peek'];

/**
 * Drag/snap physics for one mobile bottom sheet. The sheet element is laid out
 * at a fixed tall height and pushed down with `translateY`; visible height =
 * elementHeight − translateY. Dragging is driven imperatively (transform written
 * inside rAF, transition suppressed via a `--dragging` class) so it tracks the
 * finger at 60fps; React state only changes at rest. On rest the sheet's visible
 * height is published to `--sheet-height-<id>` on <html> so bottom-anchored map
 * controls can clear the expanded sheet.
 */
export function useBottomSheet({
  isMobile,
  open,
  collapsed,
  onCollapsedChange,
  sheetId,
}: UseBottomSheetOptions): UseBottomSheetReturn {
  // `snap` is derived: collapsing (App-level) always means peek; otherwise the
  // sheet sits at the last non-peek height the user chose. This keeps `collapsed`
  // and the sheet position in sync without a state-mirroring effect.
  const [expandedSnap, setExpandedSnap] = useState<'half' | 'full'>('half');
  const [isDragging, setIsDragging] = useState(false);
  const snap: SnapPoint = collapsed ? 'peek' : expandedSnap;
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // Live values consulted by imperative pointer handlers (no re-render). Written
  // in effects, not during render (refs must not be mutated while rendering).
  const snapRef = useRef(snap);
  const onCollapsedChangeRef = useRef(onCollapsedChange);
  useEffect(() => {
    snapRef.current = snap;
    onCollapsedChangeRef.current = onCollapsedChange;
  });

  const cssVar = `--sheet-height-${sheetId}`;

  // translateY (px) for a given snap, measured against the live element height.
  const translateFor = useCallback((el: HTMLElement, s: SnapPoint): number => {
    const h = el.offsetHeight;
    if (s === 'full') return 0;
    if (s === 'half') return Math.max(0, h - Math.round(0.5 * window.innerHeight));
    return Math.max(0, h - PEEK_PX); // peek
  }, []);

  // Visible height (px) for a snap — what we publish so controls can clear it.
  const visibleHeightFor = useCallback((s: SnapPoint): number => {
    const el = sheetRef.current;
    if (!el) return 0;
    return el.offsetHeight - translateFor(el, s);
  }, [translateFor]);

  const publishHeight = useCallback(
    (px: number) => {
      document.documentElement.style.setProperty(cssVar, `${Math.round(px)}px`);
    },
    [cssVar]
  );

  // Keep the sheet resting at its snap position, and publish its height, whenever
  // snap/open/mobile changes (but never while a drag is mid-flight).
  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!isMobile || !open) {
      publishHeight(0);
      if (el) el.style.transform = '';
      return;
    }
    if (!el || isDragging) return;
    el.style.transform = `translate3d(0, ${translateFor(el, snap)}px, 0)`;
    publishHeight(visibleHeightFor(snap));
  }, [snap, open, isMobile, isDragging, translateFor, visibleHeightFor, publishHeight]);

  // Reset the published height when the sheet unmounts.
  useEffect(() => () => publishHeight(0), [publishHeight]);

  // Recompute resting position / published height on viewport resize (the half
  // target depends on innerHeight, and offsetHeight tracks dvh).
  useEffect(() => {
    if (!isMobile || !open) return;
    const onResize = () => {
      const el = sheetRef.current;
      if (!el || snapRef.current == null) return;
      el.style.transform = `translate3d(0, ${translateFor(el, snapRef.current)}px, 0)`;
      publishHeight(el.offsetHeight - translateFor(el, snapRef.current));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isMobile, open, translateFor, publishHeight]);

  const settle = useCallback(
    (target: SnapPoint) => {
      const el = sheetRef.current;
      if (el) {
        el.classList.remove('bottom-sheet--dragging');
        el.style.transform = `translate3d(0, ${translateFor(el, target)}px, 0)`;
        publishHeight(el.offsetHeight - translateFor(el, target));
      }
      // Peek == collapsed; drive it through the App flag so `snap` re-derives.
      if (target === 'peek') {
        if (!collapsed) onCollapsedChangeRef.current(true);
      } else {
        setExpandedSnap(target);
        if (collapsed) onCollapsedChangeRef.current(false);
      }
    },
    [translateFor, publishHeight, collapsed]
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!isMobile) return;
      const el = sheetRef.current;
      if (!el) return;

      const startY = e.clientY;
      const startTranslate = translateFor(el, snapRef.current);
      const peekT = translateFor(el, 'peek');
      let raf = 0;
      let pending = startTranslate;
      let lastY = startY;
      let lastT = e.timeStamp;
      let velocity = 0;
      let moved = false;

      el.classList.add('bottom-sheet--dragging');
      setIsDragging(true);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort */
      }

      const apply = () => {
        raf = 0;
        el.style.transform = `translate3d(0, ${pending}px, 0)`;
      };

      const onMove = (ev: PointerEvent) => {
        ev.preventDefault();
        if (Math.abs(ev.clientY - startY) > 6) moved = true;
        let next = startTranslate + (ev.clientY - startY);
        if (next < 0) next *= RUBBER; // resist dragging above the full stop
        else if (next > peekT) next = peekT; // can't collapse past peek
        pending = next;
        const dt = ev.timeStamp - lastT;
        if (dt > 0) velocity = (ev.clientY - lastY) / dt;
        lastY = ev.clientY;
        lastT = ev.timeStamp;
        if (!raf) raf = requestAnimationFrame(apply);
      };

      const finish = () => {
        if (raf) cancelAnimationFrame(raf);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        setIsDragging(false);
      };

      const onUp = () => {
        finish();
        if (!moved) {
          // A tap on the handle toggles between peek and half.
          settle(snapRef.current === 'peek' ? 'half' : 'peek');
          return;
        }
        const targets = ORDER.map((s) => ({ s, t: translateFor(el, s) }));
        let target: SnapPoint;
        if (Math.abs(velocity) > FLING_V) {
          // Fling: step one snap in the direction of travel from the nearest.
          const nearestIdx = targets.reduce(
            (best, cur, i) =>
              Math.abs(cur.t - pending) < Math.abs(targets[best].t - pending) ? i : best,
            0
          );
          const dir = velocity > 0 ? 1 : -1; // down = toward peek
          target = ORDER[Math.min(ORDER.length - 1, Math.max(0, nearestIdx + dir))];
        } else {
          // Rest: snap to the nearest target by distance.
          target = targets.reduce((best, cur) =>
            Math.abs(cur.t - pending) < Math.abs(best.t - pending) ? cur : best
          ).s;
        }
        settle(target);
      };

      el.addEventListener('pointermove', onMove, { passive: false });
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    },
    [isMobile, translateFor, settle]
  );

  return { snap, sheetRef, handleProps: { onPointerDown }, isDragging };
}
