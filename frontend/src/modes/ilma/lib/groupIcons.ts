import type React from 'react';
import { Plane, PlaneTakeoff, Helicopter, Shield } from 'lucide-react';
import type { AircraftGroup } from './aircraft';

// The glyph each group wears in the filter rail and on the phone's filter
// strip. The map draws its own top-down silhouettes (see mapIcons) — lucide's
// planes are drawn at an angle and can't be turned to a heading.
export const GROUP_ICONS: Record<AircraftGroup, React.ComponentType<{ size?: number }>> = {
  airline: Plane,
  general: PlaneTakeoff,
  rotorcraft: Helicopter,
  military: Shield,
};
