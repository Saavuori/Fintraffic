import React from 'react';
import type { LucideIcon } from 'lucide-react';
import './MapButton.css';

/** Glyph size for every round button on the map, so none reads heavier than another. */
export const MAP_BUTTON_ICON_SIZE = 18;

interface MapButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  /** Extra class on the glyph (e.g. the locate spinner). */
  iconClassName?: string;
  /** Lit in the accent colour — a toggle whose state is on. */
  on?: boolean;
  /** Something hidden that the map doesn't show on its own — a small accent dot. */
  badge?: boolean;
}

/**
 * The round glass button the map carries at its edges: locate, the theme pill,
 * the phone's settings launcher and filter toggle.
 *
 * They used to be four copies of the same rules at three sizes, two icon sizes
 * and two icon colours, so the settings and filter buttons on a phone sat
 * visibly dimmer and heavier than locate beneath them. Placement stays with
 * each caller's own class; everything about how the button looks lives here.
 */
export const MapButton: React.FC<MapButtonProps> = ({
  icon: Icon,
  iconClassName,
  on = false,
  badge = false,
  className,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    className={`map-btn${on ? ' map-btn--on' : ''}${className ? ` ${className}` : ''}`}
    {...rest}
  >
    <Icon size={MAP_BUTTON_ICON_SIZE} className={iconClassName} aria-hidden="true" />
    {badge && <span className="map-btn__badge" />}
  </button>
);
