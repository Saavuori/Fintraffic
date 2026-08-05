import { useState, useEffect, useMemo, useCallback } from 'react';
import { History, Moon, Sun } from 'lucide-react';
import { useWebSocket } from './hooks/useWebSocket';
import { useVesselData } from './hooks/useVesselData';
import { useVesselTrail } from './hooks/useVesselTrail';
import { useTrackReplay } from './hooks/useTrackReplay';
import { useFleetReplay } from './hooks/useFleetReplay';
import {
  useIsMobile,
  useMediaQuery,
  MOBILE_QUERY,
  SHORT_LANDSCAPE_QUERY,
} from '../../shared/hooks/useMediaQuery';
import { useSheetView } from '../../shared/hooks/useSheetView';
import { Map } from './components/Map';
import { INITIAL_CENTER } from './lib/mapView';
import { FilterPanel } from './components/FilterPanel';
import { VesselSearch } from './components/VesselSearch';
import { FilterStrip, type FilterChip } from '../../shared/components/FilterStrip';
import { VesselPopup } from './components/VesselPopup';
import { VesselCard } from './components/VesselCard';
import { PortPopup } from './components/PortPopup';
import { WebcamPopup } from './components/WebcamPopup';
import { ReplayBar } from './components/ReplayBar';
import { TrackReplayPanel } from './components/TrackReplayPanel';
import { fetchPorts, fetchSeaState, fetchSeaConditions, fetchAtonFaults } from './lib/api';
import {
  ALL_CATEGORIES,
  categorize,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type ShipCategory,
} from './lib/shipTypes';
import { WEBCAMS } from './lib/webcams';
import type { Webcam } from './lib/webcams';
import type {
  Port,
  SeaStateFeature,
  SeaConditionsStation,
  AtonFaultFeature,
  Vessel,
} from './types';

interface MeriAppProps {
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

function MeriApp({ theme: mapTheme, setTheme: setMapTheme }: MeriAppProps) {
  const { vessels, handleMessage } = useVesselData();
  const { status: connectionStatus } = useWebSocket({ onMessage: handleMessage });

  // Static-ish overlay data
  const [ports, setPorts] = useState<Port[]>([]);
  const [buoys, setBuoys] = useState<SeaStateFeature[]>([]);
  const [seaConditions, setSeaConditions] = useState<SeaConditionsStation[]>([]);
  const [atonFaults, setAtonFaults] = useState<AtonFaultFeature[]>([]);

  useEffect(() => {
    fetchPorts()
      .then(setPorts)
      .catch((err) => console.error('Failed to fetch ports:', err));
  }, []);

  useEffect(() => {
    const load = () => {
      fetchSeaState()
        .then((data) => setBuoys(data.features ?? []))
        .catch((err) => console.error('Failed to fetch sea state:', err));
      fetchSeaConditions()
        .then((data) => setSeaConditions(data.stations ?? []))
        .catch((err) => console.error('Failed to fetch sea conditions:', err));
      fetchAtonFaults()
        .then((data) => setAtonFaults(data.features ?? []))
        .catch((err) => console.error('Failed to fetch AtoN faults:', err));
    };
    load();
    const interval = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Settings with localStorage persistence (theme is shell-owned)
  const [showPorts, setShowPorts] = useState<boolean>(() => localStorage.getItem('showPorts') !== 'false');
  // Renamed from showBuoys when the layer grew from Digitraffic's sea-state
  // buoys into the full FMI picture; the old key is still honoured so anyone
  // who had the layer on keeps it on.
  const [showSeaConditions, setShowSeaConditions] = useState<boolean>(() => {
    const stored = localStorage.getItem('showSeaConditions') ?? localStorage.getItem('showBuoys');
    return stored === 'true';
  });
  const [showAton, setShowAton] = useState<boolean>(() => localStorage.getItem('showAton') === 'true');
  const [showWebcams, setShowWebcams] = useState<boolean>(() => localStorage.getItem('showWebcams') !== 'false');

  useEffect(() => {
    localStorage.setItem('showPorts', String(showPorts));
  }, [showPorts]);
  useEffect(() => {
    localStorage.setItem('showSeaConditions', String(showSeaConditions));
  }, [showSeaConditions]);
  useEffect(() => {
    localStorage.setItem('showAton', String(showAton));
  }, [showAton]);
  useEffect(() => {
    localStorage.setItem('showWebcams', String(showWebcams));
  }, [showWebcams]);

  // Selection state
  const [selectedMmsi, setSelectedMmsi] = useState<number | null>(null);
  const [selectedPort, setSelectedPort] = useState<Port | null>(null);
  const [selectedWebcam, setSelectedWebcam] = useState<Webcam | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<ShipCategory[]>([]);

  // Trail (vessel track history) display, persisted across sessions.
  const [showTrail, setShowTrail] = useState<boolean>(() => localStorage.getItem('showTrail') === 'true');
  const [trailWindowSec, setTrailWindowSec] = useState<number>(() => {
    const v = Number(localStorage.getItem('trailWindowSec'));
    return v > 0 ? v : 24 * 3600;
  });
  useEffect(() => {
    localStorage.setItem('showTrail', String(showTrail));
  }, [showTrail]);
  useEffect(() => {
    localStorage.setItem('trailWindowSec', String(trailWindowSec));
  }, [trailWindowSec]);

  const trailPoints = useVesselTrail(selectedMmsi, showTrail, trailWindowSec);

  // Fleet-wide animated replay of recorded tracks.
  const replay = useFleetReplay();

  // Playback of the selected vessel's own track — the same points the trail
  // draws, rewound as movement. Only offered while the trail is on screen and
  // the fleet replay isn't (that one hides the live layers wholesale).
  const trackReplay = useTrackReplay(
    selectedMmsi,
    trailPoints,
    trailWindowSec,
    showTrail && !replay.active
  );

  const isMobile = useIsMobile();
  // Sideways, the panels are rails again (see Panel) and the floating
  // search pill would sit on top of them.
  const shortLandscape = useMediaQuery(SHORT_LANDSCAPE_QUERY);

  // Viewport centre, refreshed on map moveend, used to list the vessels nearest
  // to what the user is currently looking at — the mobile sheet's glanceable
  // peek and the desktop rail's "Nearest" section.
  // Seeded with the map's opening view: search offers the nearest ships the
  // first time it is tapped, not only after something has panned the map.
  const [mapCenter, setMapCenter] = useState<{ lng: number; lat: number } | null>({
    lng: INITIAL_CENTER[0],
    lat: INITIAL_CENTER[1],
  });
  const handleMoveEnd = useCallback((center: { lng: number; lat: number }) => {
    setMapCenter(center);
  }, []);

  // Panel collapse state
  const [isDetailCollapsed, setIsDetailCollapsed] = useState<boolean>(false);
  const [isFilterCollapsed, setIsFilterCollapsed] = useState<boolean>(
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false
  );

  /**
   * Phone only: whether the selected vessel's full page is up. Selecting a ship
   * puts its summary on the map (VesselCard) rather than a page over it — you
   * picked something on a map to see where it is — and the page is one tap
   * behind that card. Ports and webcams have no card and open theirs directly.
   */
  const [vesselPageOpen, setVesselPageOpen] = useState(false);

  const onSelectionMade = useCallback(() => {
    setIsDetailCollapsed(false);
    if (window.matchMedia(MOBILE_QUERY).matches) {
      setIsFilterCollapsed(true);
      setVesselPageOpen(false);
    }
  }, []);

  const handleSelectVessel = useCallback(
    (mmsi: number | null) => {
      setSelectedPort(null);
      setSelectedWebcam(null);
      setSelectedMmsi(mmsi);
      if (mmsi !== null) onSelectionMade();
    },
    [onSelectionMade]
  );

  const handleSelectPort = useCallback(
    (port: Port) => {
      setSelectedMmsi(null);
      setSelectedWebcam(null);
      setSelectedPort(port);
      onSelectionMade();
    },
    [onSelectionMade]
  );

  const handleSelectWebcam = useCallback(
    (webcam: Webcam) => {
      setSelectedMmsi(null);
      setSelectedPort(null);
      setSelectedWebcam(webcam);
      onSelectionMade();
    },
    [onSelectionMade]
  );

  const handleBackgroundClick = useCallback(() => {
    setSelectedMmsi(null);
    setSelectedPort(null);
    setSelectedWebcam(null);
  }, []);

  const handleToggleCategory = useCallback((cat: ShipCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }, []);

  const handleClearFilters = useCallback(() => {
    setSelectedCategories([]);
  }, []);

  // Category counts for the filter panel
  const categoryCounts = useMemo(() => {
    const counts = {} as Record<ShipCategory, number>;
    for (const v of Object.values(vessels)) {
      const cat = categorize(v.shipType);
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [vessels]);

  // Vessels shown on the map after category filtering. The selected vessel
  // stays visible even when its category is filtered out.
  const displayedVessels = useMemo(() => {
    if (selectedCategories.length === 0) return vessels;
    return Object.fromEntries(
      Object.entries(vessels).filter(
        ([, v]) => selectedCategories.includes(categorize(v.shipType)) || v.mmsi === selectedMmsi
      )
    );
  }, [vessels, selectedCategories, selectedMmsi]);

  const liveVessel = selectedMmsi !== null ? vessels[String(selectedMmsi)] ?? null : null;

  // mmsi → category icon + name for replay markers, from the *unfiltered* live
  // fleet so category filters don't strip colours off the playback overlay.
  const replayMeta = useMemo(() => {
    const meta: Record<string, { icon: string; name: string }> = {};
    for (const [id, v] of Object.entries(vessels)) {
      meta[id] = { icon: `vessel-${categorize(v.shipType)}`, name: v.name ?? '' };
    }
    return meta;
  }, [vessels]);

  // During replay, the detail panel must track the playhead-interpolated pose
  // (position/course/speed) rather than the live feed, which is frozen from
  // the panel's perspective — it only changes when a fresh AIS message for
  // that ship happens to arrive, unrelated to replay progress. Static fields
  // (name, ship type, destination, ...) still come from the live fleet /
  // replay metadata when available, since the replay track only records pose.
  const replayPose = replay.selectedPose;
  const replayVessel: Vessel | null = useMemo(() => {
    if (selectedMmsi === null || !replayPose || replayPose.mmsi !== selectedMmsi) return null;
    const known = vessels[String(selectedMmsi)];
    const meta = replayMeta[String(selectedMmsi)];
    return {
      ...known,
      mmsi: selectedMmsi,
      navStat: known?.navStat ?? 15,
      name: known?.name ?? meta?.name,
      lat: replayPose.lat,
      lng: replayPose.lng,
      cog: replayPose.cog,
      hdg: replayPose.cog,
      sog: replayPose.sog,
      ts: replayPose.ts,
    };
  }, [selectedMmsi, replayPose, vessels, replayMeta]);

  // The same substitution for the single-vessel track replay: while the ghost
  // retraces the path, the panel reports the pose *it* is at, so speed, course
  // and fix time read as the history being watched rather than the live feed
  // (which is still updating the ship's real marker on the map behind it).
  const trackPose = trackReplay.pose;
  const trackVessel: Vessel | null = useMemo(() => {
    if (selectedMmsi === null || !trackPose || trackPose.mmsi !== selectedMmsi) return null;
    const known = vessels[String(selectedMmsi)];
    if (!known) return null;
    return {
      ...known,
      lat: trackPose.lat,
      lng: trackPose.lng,
      cog: trackPose.cog,
      hdg: trackPose.cog,
      sog: trackPose.sog,
      ts: trackPose.ts,
    };
  }, [selectedMmsi, trackPose, vessels]);

  const displayedVessel = replay.active ? replayVessel : trackVessel ?? liveVessel;

  // Whether any detail sheet/panel is up (vessel, port or webcam).
  const detailOpen = displayedVessel !== null || selectedPort !== null || selectedWebcam !== null;

  // What the phone's one sheet is showing. The selection and the filters take
  // turns in the same slot instead of the filters standing down entirely.
  const selectionKey = displayedVessel
    ? `vessel:${displayedVessel.mmsi}`
    : selectedPort
      ? `port:${selectedPort.locode}`
      : selectedWebcam
        ? `webcam:${selectedWebcam.youtubeId}`
        : null;
  const selectionLabel = displayedVessel
    ? displayedVessel.name || `MMSI ${displayedVessel.mmsi}`
    : selectedPort?.name ?? selectedWebcam?.name ?? '';
  const sheet = useSheetView(isMobile, selectionKey);

  // A port or a webcam takes the whole screen on a phone; a vessel does not —
  // its details unfold from the bar at the top and stop well above the bottom,
  // so the docked transport and the map underneath both stay.
  const fullPageOpen =
    selectedPort !== null || selectedWebcam !== null || (displayedVessel !== null && !isMobile);
  const vesselExpanded = isMobile && displayedVessel !== null && vesselPageOpen && sheet.detailOpen;

  // The map's own chrome is only up while the map is: a page covers the screen
  // whole, and everything floating over the map goes with it.
  const pageUp = (fullPageOpen && sheet.detailOpen) || (sheet.browseOpen && !isFilterCollapsed);
  const onMap = isMobile && !shortLandscape && !pageUp;
  // The bar's own slot in the strip: the expanded details stand in it, between
  // the search button on one side and the settings and filter ones on the other,
  // so everything around it stays where it was.
  const barFree = onMap && !vesselExpanded;

  // The phone's filter rail: the same categories the desktop rail lists, on the
  // map where the effect of switching one off is visible.
  const categoryChips = useMemo<FilterChip[]>(
    () =>
      ALL_CATEGORIES.map((cat) => ({
        id: cat,
        label: CATEGORY_LABELS[cat],
        color: CATEGORY_COLORS[cat],
        count: categoryCounts[cat] ?? 0,
        // No selection at all means every category is drawn.
        active: selectedCategories.length === 0 || selectedCategories.includes(cat),
      })),
    [categoryCounts, selectedCategories]
  );

  // The trail is drawn in the selected vessel's category colour.
  const trailColor = displayedVessel
    ? CATEGORY_COLORS[categorize(displayedVessel.shipType)]
    : '#2dd4bf';

  // Entering replay clears the live selection so its card/popup don't linger
  // over the historical overlay.
  const replayEnter = replay.enter;
  const handleEnterReplay = useCallback(() => {
    setSelectedMmsi(null);
    setSelectedPort(null);
    replayEnter(3 * 3600);
  }, [replayEnter]);

  const toggleTheme = useCallback(
    () => setMapTheme(mapTheme === 'dark' ? 'light' : 'dark'),
    [mapTheme, setMapTheme]
  );

  const toggleTrail = useCallback(() => setShowTrail((v) => !v), []);
  const toggleFilterCollapsed = useCallback(() => setIsFilterCollapsed((v) => !v), []);
  const toggleDetailCollapsed = useCallback(() => setIsDetailCollapsed((v) => !v), []);
  const openVesselPage = useCallback(() => setVesselPageOpen(true), []);
  const closeVesselPage = useCallback(() => setVesselPageOpen(false), []);
  const handleCloseVessel = useCallback(() => {
    setSelectedMmsi(null);
    setVesselPageOpen(false);
  }, []);
  const handleClosePort = useCallback(() => setSelectedPort(null), []);
  const handleCloseWebcam = useCallback(() => setSelectedWebcam(null), []);

  return (
    <div className="dashboard-container mode-meri">
      <Map
        vessels={displayedVessels}
        selectedMmsi={selectedMmsi}
        onSelectVessel={handleSelectVessel}
        trailPoints={trailPoints}
        trailColor={trailColor}
        trackReplay={trackReplay.control}
        ports={ports}
        showPorts={showPorts}
        selectedPortLocode={selectedPort?.locode ?? null}
        onSelectPort={handleSelectPort}
        buoys={buoys}
        seaConditions={seaConditions}
        showSeaConditions={showSeaConditions}
        atonFaults={atonFaults}
        showAton={showAton}
        webcams={WEBCAMS}
        showWebcams={showWebcams}
        onSelectWebcam={handleSelectWebcam}
        mapTheme={mapTheme}
        onBackgroundClick={handleBackgroundClick}
        replay={replay.control}
        replayMeta={replayMeta}
        onMoveEnd={handleMoveEnd}
      />

      {/* On mobile, search is a floating pill over the map (the bottom tab bar
          freed the top of the screen). Desktop keeps it inside the filter rail. */}
      {onMap && !replay.active && (
        <VesselSearch
          vessels={vessels}
          onSelectVessel={handleSelectVessel}
          mapCenter={mapCenter}
          variant="floating"
        />
      )}

      {onMap && !replay.active && (
        <FilterStrip
          chips={categoryChips}
          onToggle={(id) => handleToggleCategory(id as ShipCategory)}
          onShowAll={selectedCategories.length > 0 ? handleClearFilters : undefined}
          ariaLabel="Vessel categories"
        />
      )}

      <FilterPanel
        /* The filters and the selection take turns in the phone's one slot — the
           detail page's filters button swaps to this, and the row at the top of
           it swaps back. `onMap` adds the case the sheet never had: a vessel
           selected but only its card up, where the map is still the view and its
           launcher belongs on it. Desktop shows both rails at once as before. */
        open={sheet.browseOpen || onMap}
        selectionLabel={detailOpen ? selectionLabel : null}
        onBackToSelection={sheet.showDetail}
        vessels={vessels}
        onSelectVessel={handleSelectVessel}
        categoryCounts={categoryCounts}
        totalVessels={Object.keys(vessels).length}
        selectedCategories={selectedCategories}
        onToggleCategory={handleToggleCategory}
        onClearFilters={handleClearFilters}
        connectionStatus={connectionStatus}
        isCollapsed={isFilterCollapsed}
        onToggleCollapse={toggleFilterCollapsed}
        isMobile={isMobile}
        asRail={!isMobile || shortLandscape}
        mapCenter={mapCenter}
        mapTheme={mapTheme}
        setMapTheme={setMapTheme}
        showPorts={showPorts}
        setShowPorts={setShowPorts}
        showSeaConditions={showSeaConditions}
        setShowSeaConditions={setShowSeaConditions}
        showAton={showAton}
        setShowAton={setShowAton}
        atonFaults={atonFaults}
        showWebcams={showWebcams}
        setShowWebcams={setShowWebcams}
        replayActive={replay.active}
        onEnterReplay={handleEnterReplay}
      />

      {/* Desktop only: the theme switch as a pill in the corner, the same one
          Tie has. On a phone it stays a row in the filter sheet — the corners
          there belong to the map and the mode switcher. */}
      {!isMobile && (
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${mapTheme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {mapTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      )}

      {/* The way into fleet replay, parked where the transport bar it opens
          into will be. It steps aside once that bar is up. */}
      {!isMobile && !replay.visible && (
        <div className="replay-launcher">
          <button
            className="replay-launcher-btn"
            onClick={handleEnterReplay}
            title="Replay recorded vessel movement"
          >
            <History size={14} />
            <span>Replay recorded movement</span>
          </button>
        </div>
      )}

      {displayedVessel && (!isMobile || barFree) && (
        <VesselCard
          vessel={displayedVessel}
          onClose={handleCloseVessel}
          showTrail={showTrail}
          onToggleTrail={toggleTrail}
          trailWindowSec={trailWindowSec}
          onSetTrailWindow={setTrailWindowSec}
          trackReplay={trackReplay}
          replayActive={replay.active}
          compact={isMobile}
          onOpenDetails={openVesselPage}
        />
      )}

      {/* The track transport, docked across the bottom of the phone's screen:
          the scrubber is the control you drag, so it gets the full width rather
          than the slot left over inside a card. Desktop unfolds it in the card
          itself, where there is room beside the ship's name. */}
      {onMap && displayedVessel && showTrail && !replay.active && (
        <div className="replay-bar replay-bar--track">
          <TrackReplayPanel
            replay={trackReplay}
            trailWindowSec={trailWindowSec}
            onSetTrailWindow={setTrailWindowSec}
          />
        </div>
      )}

      {displayedVessel && (
        <VesselPopup
          vessel={displayedVessel}
          onClose={handleCloseVessel}
          isCollapsed={isDetailCollapsed}
          /* On a phone this folds the details back into the bar they unfolded
             from; on desktop it is the rail's collapse sliver as before. */
          onToggleCollapse={isMobile ? closeVesselPage : toggleDetailCollapsed}
          isMobile={isMobile}
          showTrail={showTrail}
          onToggleTrail={toggleTrail}
          replayActive={replay.active}
          /* No filters button in here: the expanded bar sits beside the
             settings launcher, which is the way to them. */
          open={sheet.detailOpen && (!isMobile || vesselPageOpen)}
        />
      )}

      {selectedPort && (
        <PortPopup
          port={selectedPort}
          onClose={handleClosePort}
          isCollapsed={isDetailCollapsed}
          onToggleCollapse={toggleDetailCollapsed}
          isMobile={isMobile}
          onSelectVessel={handleSelectVessel}
          open={sheet.detailOpen}
          onShowBrowse={sheet.showBrowse}
        />
      )}

      {selectedWebcam && (
        <WebcamPopup
          webcam={selectedWebcam}
          onClose={handleCloseWebcam}
          isCollapsed={isDetailCollapsed}
          onToggleCollapse={toggleDetailCollapsed}
          isMobile={isMobile}
          open={sheet.detailOpen}
          onShowBrowse={sheet.showBrowse}
        />
      )}

      {replay.visible && <ReplayBar replay={replay} />}
    </div>
  );
}

export default MeriApp;
