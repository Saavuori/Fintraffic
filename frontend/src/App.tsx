import { useState, useEffect, useMemo, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useVesselData } from './hooks/useVesselData';
import { useSwipeGestures } from './hooks/useSwipeGestures';
import { Map } from './components/Map';
import { FilterPanel } from './components/FilterPanel';
import { VesselPopup } from './components/VesselPopup';
import { VesselCard } from './components/VesselCard';
import { PortPopup } from './components/PortPopup';
import { VersionBadge } from './components/VersionBadge';
import { fetchPorts, fetchSeaState, fetchAtonFaults } from './lib/api';
import { categorize, type ShipCategory } from './lib/shipTypes';
import type { Port, SeaStateFeature, AtonFaultFeature } from './types';

function App() {
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

  // Settings with localStorage persistence
  const [mapTheme, setMapTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('mapTheme') as 'light' | 'dark') || 'dark';
  });
  const [showPorts, setShowPorts] = useState<boolean>(() => localStorage.getItem('showPorts') !== 'false');
  const [showBuoys, setShowBuoys] = useState<boolean>(() => localStorage.getItem('showBuoys') === 'true');
  const [showAton, setShowAton] = useState<boolean>(() => localStorage.getItem('showAton') === 'true');

  useEffect(() => {
    localStorage.setItem('mapTheme', mapTheme);
    document.documentElement.setAttribute('data-theme', mapTheme);
  }, [mapTheme]);
  useEffect(() => {
    localStorage.setItem('showPorts', String(showPorts));
  }, [showPorts]);
  useEffect(() => {
    localStorage.setItem('showBuoys', String(showBuoys));
  }, [showBuoys]);
  useEffect(() => {
    localStorage.setItem('showAton', String(showAton));
  }, [showAton]);

  // Selection state
  const [selectedMmsi, setSelectedMmsi] = useState<number | null>(null);
  const [selectedPort, setSelectedPort] = useState<Port | null>(null);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [selectedCategories, setSelectedCategories] = useState<ShipCategory[]>([]);

  // Panel collapse state
  const [isDetailCollapsed, setIsDetailCollapsed] = useState<boolean>(false);
  const [isFilterCollapsed, setIsFilterCollapsed] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  );

  useSwipeGestures({
    isFilterCollapsed,
    isDetailCollapsed,
    setFilterCollapsed: setIsFilterCollapsed,
    setDetailCollapsed: setIsDetailCollapsed,
  });

  const onSelectionMade = useCallback(() => {
    setIsDetailCollapsed(false);
    if (window.innerWidth <= 768) {
      setIsFilterCollapsed(true);
    }
  }, []);

  const handleSelectVessel = useCallback(
    (mmsi: number | null) => {
      setSelectedPort(null);
      setSelectedMmsi(mmsi);
      setIsFollowing(false);
      if (mmsi !== null) onSelectionMade();
    },
    [onSelectionMade]
  );

  const handleSelectPort = useCallback(
    (port: Port) => {
      setSelectedMmsi(null);
      setIsFollowing(false);
      setSelectedPort(port);
      onSelectionMade();
    },
    [onSelectionMade]
  );

  const handleBackgroundClick = useCallback(() => {
    setSelectedMmsi(null);
    setSelectedPort(null);
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

  const toggleFilterCollapsed = useCallback(() => setIsFilterCollapsed((v) => !v), []);
  const toggleDetailCollapsed = useCallback(() => setIsDetailCollapsed((v) => !v), []);
  const toggleFollowing = useCallback(() => setIsFollowing((v) => !v), []);
  const disableFollowing = useCallback(() => setIsFollowing(false), []);
  const handleCloseVessel = useCallback(() => {
    setSelectedMmsi(null);
    setIsFollowing(false);
  }, []);
  const handleClosePort = useCallback(() => setSelectedPort(null), []);

  return (
    <div className="dashboard-container">
      <Map
        vessels={displayedVessels}
        selectedMmsi={selectedMmsi}
        onSelectVessel={handleSelectVessel}
        ports={ports}
        showPorts={showPorts}
        selectedPortLocode={selectedPort?.locode ?? null}
        onSelectPort={handleSelectPort}
        buoys={buoys}
        showBuoys={showBuoys}
        atonFaults={atonFaults}
        showAton={showAton}
        mapTheme={mapTheme}
        isFollowing={isFollowing}
        onDisableFollowing={disableFollowing}
        onBackgroundClick={handleBackgroundClick}
      />

      <FilterPanel
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
      />

      {liveVessel && (
        <VesselCard
          vessel={liveVessel}
          onClose={handleCloseVessel}
          isFollowing={isFollowing}
          onToggleFollow={toggleFollowing}
        />
      )}

      {liveVessel && (
        <VesselPopup
          vessel={liveVessel}
          onClose={handleCloseVessel}
          isCollapsed={isDetailCollapsed}
          onToggleCollapse={toggleDetailCollapsed}
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

      <VersionBadge />
    </div>
  );
}

export default App;
