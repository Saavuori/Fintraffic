import React from 'react';
import { inkOn } from '../lib/ink';
import './CategorySwatch.css';

interface CategorySwatchProps {
  /** The colour this kind wears on the map. */
  color: string;
  /** Its pictogram. Without one the swatch is a plain colour key. */
  icon?: React.ComponentType<{ size?: number }>;
  /** A disc (the phone's filter pills) rather than a rounded square (the rail's rows). */
  round?: boolean;
}

/**
 * The key for one filterable kind — a ship category, a train type: its map
 * colour as a tile, with the kind's own glyph inside so two neighbouring hues
 * are still told apart by shape.
 *
 * The rail and the phone's filter pills both draw it, so the same kind looks the
 * same in either place.
 */
export const CategorySwatch: React.FC<CategorySwatchProps> = ({ color, icon: Icon, round }) => (
  <span
    className={`category-swatch${Icon ? ' category-swatch--icon' : ''}${
      round ? ' category-swatch--round' : ''
    }`}
    style={{ background: color, color: inkOn(color) }}
    aria-hidden="true"
  >
    {Icon && <Icon size={12} />}
  </span>
);
