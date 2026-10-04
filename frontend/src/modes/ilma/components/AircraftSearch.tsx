import React, { useMemo } from 'react';
import { EntitySearch, type SearchItem } from '../../../shared/components/EntitySearch';
import {
  type Aircraft,
  type Airport,
  AIRPORT_COLORS,
  aircraftTitle,
  altitudeShort,
  distanceKm,
  formatDistanceKm,
  groupColors,
} from '../lib/aircraft';
import type { Theme } from '../lib/theme';

/** How many of the nearest to offer before anything is typed. */
const NEAREST_COUNT = 5;

interface AircraftSearchProps {
  aircraft: Aircraft[];
  airports: Airport[];
  onSelectAircraft: (aircraft: Aircraft) => void;
  onSelectAirport: (airport: Airport) => void;
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
 * Ilma's adapter over the shared search: aircraft by flight, registration,
 * type, airline or ICAO address, and airports by name or code, in one box.
 * Independent of the layer filters, so finding a named flight never requires
 * switching its group back on.
 */
export const AircraftSearch: React.FC<AircraftSearchProps> = ({
  aircraft,
  airports,
  onSelectAircraft,
  onSelectAirport,
  mapCenter,
  theme,
  variant = 'panel',
}) => {
  const colors = groupColors(theme);

  const items = useMemo<SearchItem[]>(() => {
    const list: SearchItem[] = aircraft.map(a => ({
      id: `aircraft:${a.hex}`,
      label: aircraftTitle(a),
      meta: a.typeCode || a.registration || undefined,
      accent: colors[a.group],
      haystack: [a.callsign, a.registration, a.registration?.replace('-', ''), a.typeCode, a.typeName, a.airline, a.hex]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    }));
    for (const ap of airports) {
      list.push({
        id: `airport:${ap.icao}`,
        label: ap.name,
        meta: ap.iata || ap.icao,
        accent: AIRPORT_COLORS[theme],
        haystack: `${ap.name} ${ap.icao} ${ap.iata ?? ''}`.toLowerCase(),
      });
    }
    return list;
  }, [aircraft, airports, colors, theme]);

  // The aircraft nearest the middle of the map, offered the moment the box
  // opens: "what is that one overhead" is the question search is nearly always
  // being asked, and a flight number is not something you know before you tap.
  const nearest = useMemo<SearchItem[]>(() => {
    if (!mapCenter) return [];
    return aircraft
      .map(a => ({ a, km: distanceKm(mapCenter, { lat: a.latitude, lng: a.longitude }) }))
      .sort((x, y) => x.km - y.km)
      .slice(0, NEAREST_COUNT)
      .map(({ a, km }) => ({
        id: `aircraft:${a.hex}`,
        label: aircraftTitle(a),
        meta: [altitudeShort(a), formatDistanceKm(km)].filter(Boolean).join(' · '),
        accent: colors[a.group],
        haystack: '',
      }));
  }, [mapCenter, aircraft, colors]);

  const pick = (id: string) => {
    const sep = id.indexOf(':');
    const kind = id.slice(0, sep);
    const key = id.slice(sep + 1);
    if (kind === 'aircraft') {
      const a = aircraft.find(x => x.hex === key);
      if (a) onSelectAircraft(a);
      return;
    }
    const ap = airports.find(x => x.icao === key);
    if (ap) onSelectAirport(ap);
  };

  return (
    <EntitySearch
      items={items}
      suggestions={nearest}
      onPick={pick}
      placeholder="Search flights and airports"
      ariaLabel="Search aircraft by flight, registration or type, airports by name or code"
      emptyText="No aircraft or airports match."
      variant={variant}
    />
  );
};
