import React, { useMemo } from 'react';
import { EntitySearch, type SearchItem } from '../../../shared/components/EntitySearch';
import {
  type Train,
  type StationMeta,
  groupColors,
  trainGroup,
  trainLabel,
  trainTitle,
  STATION_COLORS,
} from '../lib/trains';
import type { Theme } from '../lib/theme';

/** How many of the nearest to offer before anything is typed. */
const NEAREST_COUNT = 5;
const DEG = Math.PI / 180;

/** Trains closest to `center`, each with an equirectangular distance in km. */
function nearestTrains(
  center: { lng: number; lat: number },
  trains: Train[],
  count: number
): Array<{ train: Train; km: number }> {
  return trains
    .filter((t) => Number.isFinite(t.latitude) && Number.isFinite(t.longitude))
    .map((train) => {
      const meanLat = ((center.lat + train.latitude) / 2) * DEG;
      const dx = (center.lng - train.longitude) * Math.cos(meanLat);
      const dy = center.lat - train.latitude;
      return { train, km: Math.sqrt(dx * dx + dy * dy) * DEG * 6371 };
    })
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}

function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

interface TrainSearchProps {
  trains: Train[];
  stations: StationMeta[];
  onSelectTrain: (train: Train) => void;
  onSelectStation: (station: StationMeta) => void;
  /** Where the map is looking, for the nearest offered on an empty field. */
  mapCenter: { lng: number; lat: number } | null;
  theme: Theme;
  /**
   * 'panel' → the inline search inside the desktop filter rail.
   * 'floating' → the standalone pill over the map on a phone.
   */
  variant?: 'panel' | 'floating';
}

/**
 * Raide's adapter over the shared search: trains by number, line or route and
 * stations by name or code, both kinds in one box. Independent of the layer
 * filters, so finding a named train never requires switching a group back on.
 */
export const TrainSearch: React.FC<TrainSearchProps> = ({
  trains,
  stations,
  onSelectTrain,
  onSelectStation,
  mapCenter,
  theme,
  variant = 'panel',
}) => {
  const colors = groupColors(theme);

  const items = useMemo<SearchItem[]>(() => {
    const list: SearchItem[] = trains.map((t) => ({
      id: `train:${t.trainNumber}/${t.departureDate}`,
      label: trainTitle(t),
      meta: t.dest || undefined,
      accent: colors[trainGroup(t.category)],
      haystack:
        `${trainLabel(t)} ${t.trainType} ${t.trainNumber} ${t.commuterLine} ${t.origin} ${t.dest}`.toLowerCase(),
    }));
    for (const s of stations) {
      list.push({
        id: `station:${s.code}`,
        label: s.name,
        meta: s.code,
        accent: STATION_COLORS[theme],
        haystack: `${s.name} ${s.code}`.toLowerCase(),
      });
    }
    return list;
  }, [trains, stations, colors, theme]);

  // The trains nearest the middle of the map, offered the moment the box opens:
  // "what is that one" is the question search is nearly always being asked, and
  // a train number is not something you know before you tap it.
  const nearest = useMemo<SearchItem[]>(() => {
    if (!mapCenter) return [];
    return nearestTrains(mapCenter, trains, NEAREST_COUNT).map(({ train, km }) => ({
      id: `train:${train.trainNumber}/${train.departureDate}`,
      label: trainLabel(train),
      meta: formatDistanceKm(km),
      accent: colors[trainGroup(train.category)],
      haystack: '',
    }));
  }, [mapCenter, trains, colors]);

  const pick = (id: string) => {
    const [kind, key] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
    if (kind === 'train') {
      const train = trains.find((t) => `${t.trainNumber}/${t.departureDate}` === key);
      if (train) onSelectTrain(train);
      return;
    }
    const station = stations.find((s) => s.code === key);
    if (station) onSelectStation(station);
  };

  return (
    <EntitySearch
      items={items}
      suggestions={nearest}
      onPick={pick}
      placeholder="Search trains and stations"
      ariaLabel="Search trains by number or route, stations by name"
      emptyText="No trains or stations match."
      variant={variant}
    />
  );
};
