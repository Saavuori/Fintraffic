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

/** Visible fraction of the sheet's box at the middle stop. */
const HALF_RATIO = 0.56;

/** A px-valued custom property off the sheet, with a fallback for first paint. */
function cssPx(el: HTMLElement, prop: string, fallback: number): number {
  const declared = parseFloat(getComputedStyle(el).getPropertyValue(prop));
  return Number.isFinite(declared) && declared > 0 ? declared : fallback;
}

/**
 * Visible height at the peek stop — the grab handle plus one summary row (the
 * live count on a filter sheet, the selected vessel/train on a detail sheet), so
 * a minimized sheet still says something. It differs per variant, and the row
 * has to be laid out to match, so BottomSheet.css owns both numbers and this
 * reads them back rather than keeping copies that can drift.
 */
const peekHeight = (el: HTMLElement) => cssPx(el, '--sheet-peek-height', 82);
/** The sheet's resting padding-bottom, which every snap adds its offset to. */
const basePad = (el: HTMLElement) => cssPx(el, '--sheet-pad-bottom', 8);
const FLING_V = 0.5; // px/ms — above this a release flings one snap step
const RUBBER = 0.3; // resistance when dragged above the full stop

/** Snap points ordered by translateY (0 = fully raised). */
const ORDER: SnapPoint[] = ['full', 'half', 'peek'];

/**
 * Drag/snap physics for one mobile bottom sheet. The sheet element is laid out
 * at a fixed tall height and pushed down with `translateY`; visible height =
 * elementHeight − translateY. Dragging is driven imperatively (transform written
 * inside rAF, transition suppressed via a `--dragging` class) so it tracks the
 * finger at 60fps; React state only changes at rest.
 *
 * Because the box is taller than the visible slot, the part below the fold would
 * otherwise be laid out behind the bottom tab bar and off-screen — content the
 * user can scroll to but never see. So every resting position also writes a
 * matching `padding-bottom` (translateY + the sheet's own padding), which shrinks
 * the flex content area to exactly the visible region. It carries the same
 * transition as the transform, so the two move in lockstep. During a drag the
 * padding is parked at its minimum (content at full height, the surplus simply
 * off-screen) — resizing the content on every frame would reflow the list under
 * the finger.
 *
 * At rest and throughout a drag the sheet's visible height is published to
 * `--sheet-height-<id>` on <html> so bottom-anchored map controls can clear it.
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
  // The last non-peek height the user settled on, so tapping the handle to
  // re-open returns there (half or full) instead of always jumping to half.
  const expandedSnapRef = useRef(expandedSnap);
  const onCollapsedChangeRef = useRef(onCollapsedChange);
  useEffect(() => {
    snapRef.current = snap;
    expandedSnapRef.current = expandedSnap;
    onCollapsedChangeRef.current = onCollapsedChange;
  });

  const cssVar = `--sheet-height-${sheetId}`;

  // translateY (px) for a given snap, measured against the live element height.
  const translateFor = useCallback((el: HTMLElement, s: SnapPoint): number => {
    const h = el.offsetHeight;
    if (s === 'full') return 0;
    if (s === 'half') return Math.max(0, Math.round(h * (1 - HALF_RATIO)));
    return Math.max(0, h - peekHeight(el)); // peek
  }, []);

  const publishHeight = useCallback(
    (px: number) => {
      document.documentElement.style.setProperty(cssVar, `${Math.round(Math.max(0, px))}px`);
    },
    [cssVar]
  );

  // Element height the current resting position was computed against, so the
  // observer below can tell a real box change from its own initial callback.
  const restHeightRef = useRef(0);

  /** Park the sheet at `t` px down: transform, content height and published height. */
  const applyRest = useCallback(
    (el: HTMLElement, t: number) => {
      el.style.transform = `translate3d(0, ${t}px, 0)`;
      el.style.paddingBottom = `${t + basePad(el)}px`;
      restHeightRef.current = el.offsetHeight;
      publishHeight(el.offsetHeight - t);
    },
    [publishHeight]
  );

  // A sheet that appears (a detail sheet on selection, the filter sheet coming
  // back when the detail closes) should slide up rather than pop into place.
  const enteredRef = useRef(false);

  // Keep the sheet resting at its snap position, and publish its height, whenever
  // snap/open/mobile changes (but never while a drag is mid-flight).
  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!isMobile || !open) {
      publishHeight(0);
      enteredRef.current = false;
      if (el) {
        el.style.transform = '';
        el.style.paddingBottom = '';
      }
      return;
    }
    if (!el || isDragging) return;
    const rest = translateFor(el, snap);
    if (!enteredRef.current) {
      enteredRef.current = true;
      // Let the browser paint the stylesheet's off-screen start once, then move
      // to the resting position on the next frame so the transition actually
      // runs — a transform set in the same frame the element is inserted has no
      // previous value to animate from, and would just pop into place. The
      // published height is final immediately, so the map controls that ease off
      // it travel with the sheet rather than after it.
      publishHeight(el.offsetHeight - rest);
      restHeightRef.current = el.offsetHeight; // the observer's first callback isn't a change
      const raf = requestAnimationFrame(() => applyRest(el, translateFor(el, snap)));
      return () => {
        cancelAnimationFrame(raf);
        // The entrance hasn't happened yet, so the next run still owes it —
        // including StrictMode's immediate mount/unmount/mount rehearsal.
        enteredRef.current = false;
      };
    }
    applyRest(el, rest);
  }, [snap, open, isMobile, isDragging, translateFor, applyRest, publishHeight]);

  // Reset the published height when the sheet unmounts.
  useEffect(() => () => publishHeight(0), [publishHeight]);

  // The resting transform is measured against the sheet's height, so it goes
  // stale whenever that height changes — rotation, but also the mobile URL bar
  // collapsing, which moves dvh without reliably firing a window resize. Watch
  // the element itself rather than the window, and skip the observer's own
  // initial callback (and any firing while the finger is down).
  useEffect(() => {
    const el = sheetRef.current;
    if (!isMobile || !open || !el) return;
    const ro = new ResizeObserver(() => {
      if (el.offsetHeight === restHeightRef.current) return;
      if (el.classList.contains('bottom-sheet--dragging')) return; // the finger owns it
      applyRest(el, translateFor(el, snapRef.current));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile, open, translateFor, applyRest]);

  // Bottom-anchored map controls ease to a settling sheet's height but must
  // track a dragged one frame-for-frame; index.css keys that off this class.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('sheet-dragging', isDragging);
    return () => root.classList.remove('sheet-dragging');
  }, [isDragging]);

  const settle = useCallback(
    (target: SnapPoint) => {
      const el = sheetRef.current;
      if (el) {
        el.classList.remove('bottom-sheet--dragging');
        applyRest(el, translateFor(el, target));
      }
      // Peek == collapsed; drive it through the App flag so `snap` re-derives.
      if (target === 'peek') {
        if (!collapsed) onCollapsedChangeRef.current(true);
      } else {
        setExpandedSnap(target);
        if (collapsed) onCollapsedChangeRef.current(false);
      }
    },
    [translateFor, applyRest, collapsed]
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
      // Content at full height for the whole gesture: whatever falls below the
      // fold is simply off-screen, and the visible area can grow without a
      // reflow on every frame.
      el.style.paddingBottom = `${basePad(el)}px`;
      setIsDragging(true);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort */
      }

      const apply = () => {
        raf = 0;
        el.style.transform = `translate3d(0, ${pending}px, 0)`;
        publishHeight(el.offsetHeight - pending);
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
          // A tap on the handle toggles the sheet: from peek it re-opens to the
          // last height the user chose (half or full); otherwise it collapses.
          settle(snapRef.current === 'peek' ? expandedSnapRef.current : 'peek');
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
    [isMobile, translateFor, publishHeight, settle]
  );

  return { snap, sheetRef, handleProps: { onPointerDown }, isDragging };
}
