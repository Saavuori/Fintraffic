### Fixed
- **Map credit starts as the small ⓘ, not a line of text**: the OpenStreetMap/CARTO
  attribution was meant to sit folded behind an ⓘ button, but MapLibre's compact
  control opens expanded and only folds after the first drag, so every map greeted
  you with "© CARTO, © OpenStreetMap contributors" across the corner. It now starts
  folded on Meri, Raide and Tie; one tap on the ⓘ still shows the full credit.
