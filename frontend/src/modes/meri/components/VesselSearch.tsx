import React, { useMemo } from 'react';
import { EntitySearch, type SearchItem } from '../../../shared/components/EntitySearch';
import { CATEGORY_COLORS, categorize } from '../lib/shipTypes';
import type { Vessel } from '../types';

interface VesselSearchProps {
  vessels: Record<string, Vessel>;
  onSelectVessel: (mmsi: number) => void;
  /**
   * 'panel' → the inline search inside the desktop filter rail.
   * 'floating' → the standalone pill over the map on mobile (the bottom tab bar
   * frees the top of the screen for it).
   */
  variant?: 'panel' | 'floating';
}

/**
 * Meri's adapter over the shared search: the full live fleet by name or MMSI,
 * independent of the active category filter, so finding a specific ship never
 * requires clearing filters first.
 */
export const VesselSearch: React.FC<VesselSearchProps> = ({
  vessels,
  onSelectVessel,
  variant = 'panel',
}) => {
  const items = useMemo<SearchItem[]>(
    () =>
      Object.values(vessels).map((v) => ({
        id: String(v.mmsi),
        label: v.name || `MMSI ${v.mmsi}`,
        meta: String(v.mmsi),
        accent: CATEGORY_COLORS[categorize(v.shipType)],
        haystack: `${v.name ?? ''} ${v.mmsi}`.toLowerCase(),
      })),
    [vessels]
  );

  return (
    <EntitySearch
      items={items}
      onPick={(id) => onSelectVessel(Number(id))}
      placeholder="Search by name or MMSI"
      ariaLabel="Search vessels by name or MMSI"
      emptyText="No vessels match."
      variant={variant}
    />
  );
};
