import { AttributionControl } from 'maplibre-gl';

// MapLibre's compact attribution opens expanded — the full "© OpenStreetMap …"
// text — and only folds down to the ⓘ after the first map drag. We want the ⓘ
// from the start, with the credit one tap away. MapLibre switches to compact in
// `_updateCompact` (on add, once the basemap's attribution arrives, and on
// resize); wrapping it lets us fold the control the moment it goes compact,
// using MapLibre's own minimise so its toggle keeps working as usual.
export class CollapsedAttributionControl extends AttributionControl {
  constructor() {
    super({ compact: true });
    const updateCompact = this._updateCompact;
    this._updateCompact = () => {
      const wasCompact = this._container.classList.contains('maplibregl-compact');
      updateCompact();
      if (!wasCompact) this._updateCompactMinimize();
    };
  }
}
