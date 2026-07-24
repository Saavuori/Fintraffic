import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { CATEGORY_COLORS, categorize } from '../lib/shipTypes';
import type { Vessel } from '../types';

const MAX_SEARCH_RESULTS = 8;

interface VesselSearchProps {
  vessels: Record<string, Vessel>;
  onSelectVessel: (mmsi: number) => void;
  /**
   * 'panel' → the inline search inside the desktop filter rail.
   * 'floating' → the standalone pill over the map on mobile (the bottom tab bar
   * frees the top of the screen for it). The variant only picks the wrapper
   * class; the input and results markup are identical.
   */
  variant?: 'panel' | 'floating';
}

/**
 * Vessel name / MMSI search over the full live fleet, independent of the active
 * category filter (so finding a specific ship never requires clearing filters
 * first). Owns its own query state; picking a result selects that vessel and
 * clears the box. Shared by the desktop filter panel and the mobile floating
 * overlay so the two can't drift.
 */
export const VesselSearch: React.FC<VesselSearchProps> = ({
  vessels,
  onSelectVessel,
  variant = 'panel',
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const searchResults = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [];
    return Object.values(vessels)
      .filter((v) => (v.name && v.name.toLowerCase().includes(q)) || String(v.mmsi).includes(q))
      .slice(0, MAX_SEARCH_RESULTS);
  }, [vessels, searchTerm]);

  const handlePickResult = (mmsi: number) => {
    onSelectVessel(mmsi);
    setSearchTerm('');
  };

  const wrapperClass = variant === 'floating' ? 'vessel-search-overlay' : undefined;

  return (
    <div className={wrapperClass}>
      <div className="vessel-search">
        <Search size={14} className="vessel-search-icon" aria-hidden="true" />
        <input
          type="text"
          className="vessel-search-input"
          placeholder="Search by name or MMSI"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          aria-label="Search vessels by name or MMSI"
        />
        {searchTerm && (
          <button
            className="vessel-search-clear"
            onClick={() => setSearchTerm('')}
            aria-label="Clear search"
          >
            <X size={13} />
          </button>
        )}
        {searchTerm && (
          <div className="vessel-search-results" role="listbox">
            {searchResults.length === 0 && <div className="panel-note">No vessels match.</div>}
            {searchResults.map((v) => {
              const cat = categorize(v.shipType);
              return (
                <button
                  key={v.mmsi}
                  className="vessel-search-result"
                  role="option"
                  aria-selected="false"
                  onClick={() => handlePickResult(v.mmsi)}
                >
                  <span className="vessel-search-dot" style={{ background: CATEGORY_COLORS[cat] }} />
                  <span className="vessel-search-name">{v.name || `MMSI ${v.mmsi}`}</span>
                  <span className="vessel-search-mmsi">{v.mmsi}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
