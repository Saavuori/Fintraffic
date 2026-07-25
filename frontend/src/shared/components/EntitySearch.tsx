import React, { useEffect, useMemo, useRef, useState } from 'react';
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
   * What the box offers before anything is typed: the things nearest the middle
   * of the map. Opening search is nearly always "what is that one over there",
   * and the answer is a tap rather than a name you have to know how to spell.
   */
  suggestions?: SearchItem[];
  /** Heading over the suggestions. */
  suggestionsLabel?: string;
  /**
   * 'panel' → inline in a desktop rail, always open. 'floating' → the pill over
   * the map on a phone, which rests as just its icon and unfolds when tapped.
   * The field and results are identical either way.
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
  suggestions,
  suggestionsLabel = 'Nearest',
  variant = 'panel',
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* The floating pill is the only chrome over the map, so at rest it is just its
     icon and the map keeps the width. The panel variant sits in a rail that is
     already open and has nothing to reclaim. */
  const collapsible = variant === 'floating';
  const expanded = !collapsible || open;

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items.filter((item) => item.haystack.includes(q)).slice(0, MAX_RESULTS);
  }, [items, query]);

  const collapse = () => {
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const pick = (id: string) => {
    onPick(id);
    if (collapsible) collapse();
    else setQuery('');
  };

  // Nothing typed yet, and the box has been asked for: offer the nearest. The
  // pill unfolding is that ask on a phone; in a rail, which is always open, it
  // is the field taking focus.
  const offered = suggestions ?? [];
  const showSuggestions = !query && (collapsible ? open : focused) && offered.length > 0;

  return (
    <div
      className={
        collapsible ? `vessel-search-overlay${expanded ? '' : ' is-collapsed'}` : undefined
      }
    >
      <div className="vessel-search">
        {collapsible ? (
          <button
            type="button"
            className="vessel-search-toggle"
            onClick={() => (expanded ? collapse() : setOpen(true))}
            aria-label={expanded ? 'Close search' : ariaLabel}
            aria-expanded={expanded}
          >
            <Search size={16} aria-hidden="true" />
          </button>
        ) : (
          <Search size={14} className="vessel-search-icon" aria-hidden="true" />
        )}
        <input
          ref={inputRef}
          type="text"
          className="vessel-search-input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && collapsible) collapse();
          }}
          /* Fold back up when the field is left empty, but stay put while a query
             is standing — the results below it are still the point. */
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (collapsible && !query) setOpen(false);
          }}
          aria-label={ariaLabel}
          aria-hidden={!expanded}
          tabIndex={expanded ? undefined : -1}
        />
        {query && (
          <button
            className="vessel-search-clear"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <X size={13} />
          </button>
        )}
        {(query || showSuggestions) && (
          /* Keep the focus in the field while a row is tapped: losing it would
             unmount this list before the tap landed on anything. */
          <div
            className="vessel-search-results"
            role="listbox"
            onMouseDown={(e) => e.preventDefault()}
          >
            {showSuggestions && <div className="vessel-search-group">{suggestionsLabel}</div>}
            {query && results.length === 0 && <div className="panel-note">{emptyText}</div>}
            {(query ? results : offered).map((item) => (
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
