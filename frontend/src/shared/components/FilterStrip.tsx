import React, { useEffect, useState } from 'react';
import { ListFilter } from 'lucide-react';
import './FilterStrip.css';

export interface FilterChip {
  /** Passed back to `onToggle`. */
  id: string;
  label: string;
  /** The colour this kind wears on the map, drawn as a dot. */
  color?: string;
  /** Marker pictogram, used where the map keys its kinds by shape and not colour. */
  icon?: React.ComponentType<{ size?: number }>;
  /** How many of this kind are on the map right now. */
  count?: number;
  /** Whether the map is drawing this kind. */
  active: boolean;
}

interface FilterStripProps {
  chips: FilterChip[];
  onToggle: (id: string) => void;
  /** Restores everything. Offered only while something is hidden. */
  onShowAll?: () => void;
  /** What the pills are, as a noun phrase: "Vessel categories", "Map layers". */
  ariaLabel: string;
}

/**
 * The phone's filter rail: a button under the settings launcher that unfolds the
 * mode's kinds — ship categories, train types, road layers — down the right edge
 * of the map, each a tap to show or hide.
 *
 * Filtering used to mean opening the settings page, scrolling to the list,
 * tapping, and closing the page again — with the map gone for the whole of it,
 * which is the one thing you need to see to know whether the filter did what you
 * wanted. Here the map stays up and the change is immediate under the strip.
 *
 * The rail is the same state as the desktop rail's list, not a second filter:
 * modes pass their own toggle straight through.
 */
export const FilterStrip: React.FC<FilterStripProps> = ({
  chips,
  onToggle,
  onShowAll,
  ariaLabel,
}) => {
  const [open, setOpen] = useState(false);
  const anyHidden = chips.some((c) => !c.active);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {/* One control that shows and hides the pills, not a dialog that opens and
          closes: the icon stays the icon, and it is lit while they are up. */}
      <button
        className={`filter-strip-btn${open ? ' filter-strip-btn--on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-pressed={open}
        aria-label={`${open ? 'Hide' : 'Show'} ${ariaLabel.toLowerCase()}`}
        title={`${open ? 'Hide' : 'Show'} ${ariaLabel.toLowerCase()}`}
      >
        <ListFilter size={20} />
        {/* Something is hidden and the map doesn't say so on its own — the dot is
            the only sign that what you are looking at is a subset. */}
        {anyHidden && <span className="filter-strip-btn__dot" />}
      </button>

      {open && (
        <div className="filter-strip" role="group" aria-label={ariaLabel}>
          {chips.map((chip) => {
            const Icon = chip.icon;
            return (
              <button
                key={chip.id}
                className={`filter-chip${chip.active ? '' : ' filter-chip--off'}`}
                onClick={() => onToggle(chip.id)}
                aria-pressed={chip.active}
              >
                {/* Colour first: where the map keys by colour, the dot is the
                    whole key and a pictogram inside it would only shrink it. */}
                {chip.color ? (
                  <span className="filter-chip__dot" style={{ background: chip.color }} />
                ) : (
                  Icon && (
                    <span className="filter-chip__icon">
                      <Icon size={13} />
                    </span>
                  )
                )}
                <span className="filter-chip__label">{chip.label}</span>
                {chip.count != null && <span className="filter-chip__count">{chip.count}</span>}
              </button>
            );
          })}

          {onShowAll && anyHidden && (
            <button className="filter-chip filter-chip--all" onClick={onShowAll}>
              Show all
            </button>
          )}
        </div>
      )}
    </>
  );
};
