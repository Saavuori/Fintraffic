import React, { type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useCollapsiblePanel } from '../hooks/useCollapsiblePanel';
import { useBottomSheet } from '../hooks/useBottomSheet';
import { useMediaQuery, SHORT_LANDSCAPE_QUERY } from '../hooks/useMediaQuery';
import './BottomSheet.css';

interface BottomSheetProps {
  /** 'filter' → left rail / lower sheet; 'detail' → right rail / upper sheet. */
  variant: 'filter' | 'detail';
  isMobile: boolean;
  /**
   * Whether the sheet is shown at all. Only the mobile sheet honours this: the
   * desktop rails coexist happily side by side, but two stacked sheets sharing
   * one bottom edge do not — so a mode passes `open={false}` for its filter
   * sheet while a detail sheet is up, rather than leaving an unreachable handle
   * buried behind it.
   */
  open: boolean;
  ariaLabel: string;
  /** Extra classes for the panel root (e.g. 'webcam-popup'). */
  className?: string;
  /** App-level collapsed flag. */
  collapsed: boolean;
  /** Toggles `collapsed` — reused for the desktop sliver and the header button. */
  onToggleCollapse: () => void;
  /**
   * How much of the sheet's box the middle stop shows, 0–1. A sheet should rest
   * at the height its body actually needs: a scrolling list wants the tall stop,
   * a fixed handful of rows wants far less, and the difference is map. Views
   * pass their own; omitted, BottomSheet.css's default applies.
   */
  restRatio?: number;
  /**
   * Panel header + body. Components gate their own body on
   * `!isMobile && isCollapsed` so it stays mounted on mobile (the sheet's
   * translateY hides it at peek); the header always renders.
   */
  children: ReactNode;
}

const DESKTOP_CLASS: Record<BottomSheetProps['variant'], string> = {
  filter: 'filter-panel',
  detail: 'detail-popup',
};

/**
 * Shared panel shell. On desktop it renders the existing `.glass-panel` rail with
 * the unchanged collapse-sliver semantics (`useCollapsiblePanel`). On mobile it
 * becomes a draggable bottom sheet with peek/half/full snap points driven by
 * `useBottomSheet`. The two panels (filter/detail) keep their current z-order.
 */
export const BottomSheet: React.FC<BottomSheetProps> = ({
  variant,
  isMobile,
  open,
  ariaLabel,
  className,
  collapsed,
  onToggleCollapse,
  restRatio,
  children,
}) => {
  // A phone held sideways has ~350px of height to spend. A bottom sheet there is
  // all sheet and no map, so those viewports fall back to the side rails — the
  // same layout (and the same collapse behaviour) the desktop already uses,
  // sized down by the phone stylesheet.
  const shortLandscape = useMediaQuery(SHORT_LANDSCAPE_QUERY);
  const asRail = !isMobile || shortLandscape;

  // Derive a boolean setter from the toggle (flip only when it would change).
  const setCollapsed = (target: boolean) => {
    if (target !== collapsed) onToggleCollapse();
  };

  const { snap, sheetRef, handleProps, isDragging } = useBottomSheet({
    isMobile: isMobile && !shortLandscape,
    open,
    collapsed,
    onCollapsedChange: setCollapsed,
    sheetId: variant,
  });

  // Desktop collapse props (spread onto the rail root; empty when expanded).
  const { className: collapsedClass, ...collapsibleProps } = useCollapsiblePanel(
    collapsed,
    onToggleCollapse,
    ariaLabel
  );

  if (asRail) {
    return (
      <div
        /* The same ref on both branches: React reuses the DOM node when a
           rotation flips a sheet into a rail, and the sheet's imperative
           transform would ride along on it. The hook clears those styles when it
           is not driving a sheet — but only if it can still see the node. */
        ref={sheetRef}
        className={`glass-panel ${DESKTOP_CLASS[variant]} ${className ?? ''} ${collapsedClass} ${
          shortLandscape ? 'rail--short' : ''
        }`.trim()}
        {...collapsibleProps}
      >
        {children}
      </div>
    );
  }

  if (!open) return null;

  const onHandleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggleCollapse();
    }
  };

  return (
    <div
      ref={sheetRef}
      className={`bottom-sheet bottom-sheet--${variant} ${className ?? ''} ${
        isDragging ? 'bottom-sheet--dragging' : ''
      }`.trim()}
      style={
        restRatio != null ? ({ '--sheet-half-ratio': String(restRatio) } as CSSProperties) : undefined
      }
      // `data-snap` lets the stylesheet react to the resting height — minimized,
      // the one visible row must not be scrollable out of view.
      data-snap={snap}
      role="dialog"
      aria-label={ariaLabel}
    >
      <div
        className="bottom-sheet__handle"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        aria-label={collapsed ? `Expand ${ariaLabel}` : `Collapse ${ariaLabel}`}
        onKeyDown={onHandleKey}
        {...handleProps}
      >
        <span className="bottom-sheet__grip" />
      </div>
      {children}
    </div>
  );
};
