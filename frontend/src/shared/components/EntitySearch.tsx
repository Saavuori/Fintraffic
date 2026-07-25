import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';

const MAX_RESULTS = 8;

/** One searchable thing on the map, whatever the mode calls it. */
export interface SearchItem {
  /** Stable key, and what `onPick` gets back. */
  id: string;
  /** What the row is called — vessel name, train number, station. */
  label: string;
  /** Right-aligned secondary: MMSI, route, road number. Mono-set. */
  meta?: string;
  /** Dot colour, taken from whatever the map paints the thing with. */
  accent?: string;
  /** Everything matched against, lowercased by the caller's adapter. */
  haystack: string;
}

interface EntitySearchProps {
  items: SearchItem[];
  onPick: (id: string) => void;
  /** Shown in the empty box; name what can be typed. */
  placeholder: string;
  /** Screen-reader label for the input. */
  ariaLabel: string;
  /** Shown when nothing matches — name the thing, not "no results". */
  emptyText: string;
  /**
   * 'panel' → inline in a desktop rail. 'floating' → the pill over the map on a
   * phone. Only picks the wrapper class; the field and results are identical.
   */
  variant?: 'panel' | 'floating';
}

/**
 * Search over whatever a mode puts on its map. Meri searches vessels, Raide
 * trains and stations, Tie stations, cameras and parking — one component so the
 * three can't drift, and so the phone gets the same box in every mode (before
 * this, finding a named train meant panning the map until you saw it).
 *
 * Matching is a plain substring over the adapter's `haystack`, which keeps the
 * mode's own idea of what is searchable (a vessel's MMSI, a train's commuter
 * line) where that knowledge belongs.
 */
export const EntitySearch: React.FC<EntitySearchProps> = ({
  items,
  onPick,
  placeholder,
  ariaLabel,
  emptyText,
  variant = 'panel',
}) => {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items.filter((item) => item.haystack.includes(q)).slice(0, MAX_RESULTS);
  }, [items, query]);

  const pick = (id: string) => {
    onPick(id);
    setQuery('');
  };

  return (
    <div className={variant === 'floating' ? 'vessel-search-overlay' : undefined}>
      <div className="vessel-search">
        <Search size={14} className="vessel-search-icon" aria-hidden="true" />
        <input
          type="text"
          className="vessel-search-input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={ariaLabel}
        />
        {query && (
          <button className="vessel-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
            <X size={13} />
          </button>
        )}
        {query && (
          <div className="vessel-search-results" role="listbox">
            {results.length === 0 && <div className="panel-note">{emptyText}</div>}
            {results.map((item) => (
              <button
                key={item.id}
                className="vessel-search-result"
                role="option"
                aria-selected="false"
                onClick={() => pick(item.id)}
              >
                <span className="vessel-search-dot" style={{ background: item.accent }} />
                <span className="vessel-search-name">{item.label}</span>
                {item.meta && <span className="vessel-search-mmsi">{item.meta}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
