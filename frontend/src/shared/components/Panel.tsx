import React, { useEffect, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useCollapsiblePanel } from '../hooks/useCollapsiblePanel';
import { useMediaQuery, SHORT_LANDSCAPE_QUERY } from '../hooks/useMediaQuery';
import './Panel.css';

interface PanelProps {
  /** 'filter' → left rail / launcher-opened page; 'detail' → right rail / selection page. */
  variant: 'filter' | 'detail';
  isMobile: boolean;
  /**
   * Whether the panel exists at all. A mode passes `open={false}` for its filter
   * panel while a detail page is up on a phone, so the filter launcher isn't
   * stranded underneath it; the way across is the detail header's own control.
   */
  open: boolean;
  ariaLabel: string;
  /** Extra classes for the panel root (e.g. 'webcam-popup'). */
  className?: string;
  /** App-level collapsed flag. */
  collapsed: boolean;
  /** Toggles `collapsed` — the desktop sliver, the mobile launcher and the header button. */
  onToggleCollapse: () => void;
  /**
   * Panel header + body. Components gate their own body on
   * `!isMobile && isCollapsed`, so on a phone the whole panel is always rendered
   * when the page is up.
   */
  children: ReactNode;
}

const DESKTOP_CLASS: Record<PanelProps['variant'], string> = {
  filter: 'filter-panel',
  detail: 'detail-popup',
};

/**
 * Shared panel shell.
 *
 * Desktop is the `.glass-panel` rail with its collapse-sliver semantics
 * (`useCollapsiblePanel`). On a phone held upright the panel is a full-screen
 * page above the tab bar: it is either up or it is not.
 *
 * That replaced a draggable bottom sheet with peek/half/full snap points. The
 * sheet permanently occupied the bottom of the screen — the map was whatever was
 * left over, every bottom-anchored control had to be pushed clear of a height
 * that changed under the finger, and the body had to be authored twice over: once
 * for the one row a peek shows and once for the rest. A page has the whole screen
 * while it is up and none of it when it is not, so the map is either fully itself
 * or not on screen at all, and nothing has to be published back to the layout.
 *
 * A filter panel is opened from the launcher button this component renders in
 * its collapsed state (there is no other way back to it). A detail panel is
 * opened by a map selection and closed from its own header, so it ignores
 * `collapsed`, which on a phone could only hide it irrecoverably.
 *
 * Held sideways there is no room for a page either — the panels stay rails, the
 * same layout the desktop uses, sized down by the phone stylesheet.
 */
export const Panel: React.FC<PanelProps> = ({
  variant,
  isMobile,
  open,
  ariaLabel,
  className,
  collapsed,
  onToggleCollapse,
  children,
}) => {
  const shortLandscape = useMediaQuery(SHORT_LANDSCAPE_QUERY);
  const asRail = !isMobile || shortLandscape;

  // Desktop collapse props (spread onto the rail root; empty when expanded).
  const { className: collapsedClass, ...collapsibleProps } = useCollapsiblePanel(
    collapsed,
    onToggleCollapse,
    ariaLabel
  );

  // A viewport under the mobile breakpoint is usually a phone, but it can also be
  // a narrow desktop window — where the page is a dialog and Escape should close
  // it. Only the filter variant has something to close to.
  const escapable = !asRail && open && variant === 'filter' && !collapsed;
  useEffect(() => {
    if (!escapable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggleCollapse();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [escapable, onToggleCollapse]);

  if (asRail) {
    return (
      <div
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

  if (variant === 'filter' && collapsed) {
    return (
      <button
        className="panel-launcher"
        onClick={onToggleCollapse}
        aria-expanded={false}
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        <SlidersHorizontal size={20} />
      </button>
    );
  }

  return (
    <div
      className={`mobile-panel mobile-panel--${variant} ${className ?? ''}`.trim()}
      role="dialog"
      /* Not aria-modal: the page stops above the tab bar, and switching mode
         while it is up is a real thing to do. */
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
};
