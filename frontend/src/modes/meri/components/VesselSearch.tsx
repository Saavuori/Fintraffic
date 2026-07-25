import React, { useMemo } from 'react';
import { EntitySearch, type SearchItem } from '../../../shared/components/EntitySearch';
import { CATEGORY_COLORS, categorize } from '../lib/shipTypes';
import { nearestTo, formatDistanceKm } from '../lib/geo';
import type { Vessel } from '../types';

/** How many of the nearest to offer before anything is typed. */
const NEAREST_COUNT = 5;

interface VesselSearchProps {
  vessels: Record<string, Vessel>;
  onSelectVessel: (mmsi: number) => void;
  /** Where the map is looking, for the nearest offered on an empty field. */
  mapCenter: { lng: number; lat: number } | null;
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
  mapCenter,
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

  // The ships nearest the middle of the map, offered the moment the box opens:
  // "what is that one" is the question search is nearly always being asked, and
  // it doesn't have a name you could type.
  const nearest = useMemo<SearchItem[]>(() => {
    if (!mapCenter) return [];
    const located = Object.values(vessels).filter(
      (v) => Number.isFinite(v.lat) && Number.isFinite(v.lng)
    );
    return nearestTo(mapCenter, located, NEAREST_COUNT).map(({ item: v, km }) => ({
      id: String(v.mmsi),
      label: v.name || `MMSI ${v.mmsi}`,
      meta: formatDistanceKm(km),
      accent: CATEGORY_COLORS[categorize(v.shipType)],
      haystack: '',
    }));
  }, [mapCenter, vessels]);

  return (
    <EntitySearch
      items={items}
      suggestions={nearest}
      onPick={(id) => onSelectVessel(Number(id))}
      placeholder="Search by name or MMSI"
      ariaLabel="Search vessels by name or MMSI"
      emptyText="No vessels match."
      variant={variant}
    />
  );
};
