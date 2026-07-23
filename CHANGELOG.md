# Meriliikenne Changelog

All notable changes to this project will be documented in this file.

## [v0.0.2] - 2026-07-23

### Fixed
- **Map Not Rendering**: MapLibre sets its container element's own CSS `position` to `relative` on initialization, which broke the `position: absolute; inset: 0` sizing rule used to fill `.dashboard-container` — the map collapsed to zero height and nothing was visible. Switched `.map-container` to percentage `width`/`height`, which sizes correctly regardless of what MapLibre does to `position`.

---

## [v0.0.1] - 2026-07-23

### Added
- **Initial Release**: Live Finnish marine traffic map built on Digitraffic's open AIS data. Real-time vessel positions stream over MQTT/WSS from `wss://meri.digitraffic.fi:443/mqtt`, merged with vessel metadata and hydrated from the REST API on boot so the map is fully populated within seconds of starting.
- **Dead-Reckoning Vessel Animation**: Vessels are projected forward from their last fix using speed-over-ground and course-over-ground between AIS reports (which arrive far less often than tram GPS updates), giving smooth motion instead of jump-then-freeze.
- **Snapshot + Delta WebSocket Streaming**: Clients receive a full snapshot on connect, then only changed vessels each second (with a full resync every 60 ticks), keeping bandwidth low across ~1,000+ concurrently tracked vessels.
- **Ship-Type Categorization**: Vessels are colour-coded by AIS ship type — passenger, cargo, tanker, high-speed, tug/special, sailing/pleasure, military, and other — with a filterable legend and live per-category counts.
- **Ports & Port Calls**: Finnish ports render on the map; clicking one shows real-time arrivals and departures sourced from the Portnet port-call registry.
- **Sea State & Navigation Aid Faults**: Smart-buoy sea-state readings (wave height, trend, temperature) and aids-to-navigation fault reports render as map layers with an alerts feed in the sidebar.
- **Glassmorphic UI**: Dark/light themed glass-panel interface with collapsible sidebars, swipe gestures, vessel and port detail panels, and a follow (chase-cam) mode — following the same design system as the ratikka tram tracker.
