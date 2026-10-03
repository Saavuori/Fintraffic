### Changed
- **One round map button, everywhere**: the phone's settings and filter buttons now match search and locate. They had been drawn dimmer and at a heavier glyph size, so the top-right pair looked like a different kind of control from the locate button below them. The theme pill, locate, settings launcher and filter toggle are now one shared `MapButton` (one size per layout, one 18px glyph, one colour, one lit state), and only each button's placement is set per caller. On a phone, locate now lines up in the same column as the two buttons above it.

### Added
- **Every vessel category has its own icon**: Passenger (ship), Cargo (container), Tanker (droplet), High-speed (bolt), Tug / Special (ship's wheel), Sailing / Pleasure (sailboat), Military (shield) and Other (question mark). Each icon sits inside the category's colour in the desktop category list and in the phone filter pills. The filters used to rely on colour alone, and some neighbouring hues (military olive and "other" slate) were hard to tell apart, more so with colour blindness. Hidden categories go hollow but keep their icon, so you can still see what you're turning back on.

### Fixed
- **Raide's train-type icons are visible**: the pictograms meant to match the map markers sat inside a 10px swatch on desktop, and the phone filter pills dropped them whenever a colour was present. Both places now use one shared swatch, large enough to read the glyph, with the glyph drawn dark or light to suit the fill.
