import { useState, useEffect, useMemo, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useVesselData } from './hooks/useVesselData';
import { useVesselTrail } from './hooks/useVesselTrail';
import { useFleetReplay } from './hooks/useFleetReplay';
import { useSwipeGestures } from '../../shared/hooks/useSwipeGestures';
import { Map } from './components/Map';
import { FilterPanel } from './components/FilterPanel';
import { VesselPopup } from './components/VesselPopup';
import { VesselCard } from './components/VesselCard';
import { PortPopup } from './components/PortPopup';
import { WebcamPopup } from './components/WebcamPopup';
import { ReplayBar } from './components/ReplayBar';
import { fetchPorts, fetchSeaState, fetchAtonFaults } from './lib/api';
import { categorize, CATEGORY_COLORS, type ShipCategory } from './lib/shipTypes';
import { WEBCAMS } from './lib/webcams';
import type { Webcam } from './lib/webcams';
import type { Port, SeaStateFeature, AtonFaultFeature, Vessel } from './types';

const MOBILE_QUERY = '(max-width: 768px)';

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
  const [showBuoys, setShowBuoys] = useState<boolean>(() => localStorage.getItem('showBuoys') === 'true');
  const [showAton, setShowAton] = useState<boolean>(() => localStorage.getItem('showAton') === 'true');
  const [showWebcams, setShowWebcams] = useState<boolean>(() => localStorage.getItem('showWebcams') !== 'false');

  useEffect(() => {
    localStorage.setItem('showPorts', String(showPorts));
  }, [showPorts]);
  useEffect(() => {
    localStorage.setItem('showBuoys', String(showBuoys));
  }, [showBuoys]);
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
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
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

  // Panel collapse state
  const [isDetailCollapsed, setIsDetailCollapsed] = useState<boolean>(false);
  const [isFilterCollapsed, setIsFilterCollapsed] = useState<boolean>(
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false
  );

  useSwipeGestures({
    isFilterCollapsed,
    isDetailCollapsed,
    setFilterCollapsed: setIsFilterCollapsed,
    setDetailCollapsed: setIsDetailCollapsed,
  });

  const onSelectionMade = useCallback(() => {
    setIsDetailCollapsed(false);
    if (window.matchMedia(MOBILE_QUERY).matches) {
      setIsFilterCollapsed(true);
    }
  }, []);

  const handleSelectVessel = useCallback(
    (mmsi: number | null) => {
      setSelectedPort(null);
      setSelectedWebcam(null);
      setSelectedMmsi(mmsi);
      setIsFollowing(false);
      if (mmsi !== null) onSelectionMade();
    },
    [onSelectionMade]
  );

  const handleSelectPort = useCallback(
    (port: Port) => {
      setSelectedMmsi(null);
      setSelectedWebcam(null);
      setIsFollowing(false);
      setSelectedPort(port);
      onSelectionMade();
    },
    [onSelectionMade]
  );

  const handleSelectWebcam = useCallback(
    (webcam: Webcam) => {
      setSelectedMmsi(null);
      setSelectedPort(null);
      setIsFollowing(false);
      setSelectedWebcam(webcam);
      onSelectionMade();
    },
    [onSelectionMade]
  );

  const handleBackgroundClick = useCallback(() => {
    setSelectedMmsi(null);
    setSelectedPort(null);
    setSelectedWebcam(null);
    setIsFollowing(false);
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

  const displayedVessel = replay.active ? replayVessel : liveVessel;

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
    setIsFollowing(false);
    replayEnter(3 * 3600);
  }, [replayEnter]);

  const toggleTrail = useCallback(() => setShowTrail((v) => !v), []);
  const toggleFilterCollapsed = useCallback(() => setIsFilterCollapsed((v) => !v), []);
  const toggleDetailCollapsed = useCallback(() => setIsDetailCollapsed((v) => !v), []);
  const toggleFollowing = useCallback(() => setIsFollowing((v) => !v), []);
  const disableFollowing = useCallback(() => setIsFollowing(false), []);
  const handleCloseVessel = useCallback(() => {
    setSelectedMmsi(null);
    setIsFollowing(false);
  }, []);
  const handleClosePort = useCallback(() => setSelectedPort(null), []);
  const handleCloseWebcam = useCallback(() => setSelectedWebcam(null), []);

  return (
    <div className="dashboard-container">
      <Map
        vessels={displayedVessels}
        selectedMmsi={selectedMmsi}
        onSelectVessel={handleSelectVessel}
        trailPoints={trailPoints}
        trailColor={trailColor}
        ports={ports}
        showPorts={showPorts}
        selectedPortLocode={selectedPort?.locode ?? null}
        onSelectPort={handleSelectPort}
        buoys={buoys}
        showBuoys={showBuoys}
        atonFaults={atonFaults}
        showAton={showAton}
        webcams={WEBCAMS}
        showWebcams={showWebcams}
        onSelectWebcam={handleSelectWebcam}
        mapTheme={mapTheme}
        isFollowing={isFollowing}
        onDisableFollowing={disableFollowing}
        onBackgroundClick={handleBackgroundClick}
        replay={replay.control}
        replayMeta={replayMeta}
      />

      <FilterPanel
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
        mapTheme={mapTheme}
        setMapTheme={setMapTheme}
        showPorts={showPorts}
        setShowPorts={setShowPorts}
        showBuoys={showBuoys}
        setShowBuoys={setShowBuoys}
        showAton={showAton}
        setShowAton={setShowAton}
        atonFaults={atonFaults}
        showWebcams={showWebcams}
        setShowWebcams={setShowWebcams}
        replayActive={replay.active}
        onEnterReplay={handleEnterReplay}
      />

      {displayedVessel && (
        <VesselCard
          vessel={displayedVessel}
          onClose={handleCloseVessel}
          isFollowing={isFollowing}
          onToggleFollow={toggleFollowing}
          showTrail={showTrail}
          onToggleTrail={toggleTrail}
          trailWindowSec={trailWindowSec}
          onSetTrailWindow={setTrailWindowSec}
          replayActive={replay.active}
        />
      )}

      {displayedVessel && (
        <VesselPopup
          vessel={displayedVessel}
          onClose={handleCloseVessel}
          isCollapsed={isDetailCollapsed}
          onToggleCollapse={toggleDetailCollapsed}
          replayActive={replay.active}
        />
      )}

      {selectedPort && (
        <PortPopup
          port={selectedPort}
          onClose={handleClosePort}
          isCollapsed={isDetailCollapsed}
          onToggleCollapse={toggleDetailCollapsed}
          onSelectVessel={handleSelectVessel}
        />
      )}

      {selectedWebcam && (
        <WebcamPopup
          webcam={selectedWebcam}
          onClose={handleCloseWebcam}
          isCollapsed={isDetailCollapsed}
          onToggleCollapse={toggleDetailCollapsed}
        />
      )}

      {replay.visible && <ReplayBar replay={replay} />}
    </div>
  );
}

export default MeriApp;
