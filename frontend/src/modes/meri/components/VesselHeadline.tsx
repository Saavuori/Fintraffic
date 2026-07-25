import React from 'react';
import { useValueTick } from '../../../shared/hooks/useValueTick';
import { CourseRose } from './CourseRose';
import { categorize, CATEGORY_COLORS, shipTypeText, isStationary } from '../lib/shipTypes';
import type { Vessel } from '../types';

interface VesselHeadlineProps {
  vessel: Vessel;
}

/**
 * The phone's one-line reading of a selected ship: its marker enlarged as a
 * bearing arrow, what it is, and the two numbers you keep it selected for.
 *
 * It is the same block whether the bar is folded on the map (VesselCard) or
 * open as the page's title row (VesselPopup) — unfolding adds what is below it
 * and moves nothing, so the thing you were reading stays where you were
 * reading it.
 */
export const VesselHeadline: React.FC<VesselHeadlineProps> = ({ vessel }) => {
  const cat = categorize(vessel.shipType);
  // A live number that changed gets one quiet pulse, so a still-looking readout
  // is visibly a still ship rather than a stalled feed.
  const speedTick = useValueTick(vessel.sog.toFixed(1));

  return (
    <>
      <CourseRose
        deg={vessel.hdg ?? vessel.cog}
        color={CATEGORY_COLORS[cat]}
        moving={!isStationary(vessel.sog, vessel.navStat)}
      />
      <div className="detail-title">
        <h3>{vessel.name || `MMSI ${vessel.mmsi}`}</h3>
        {/* The category's colour is on the rose beside it; repeating it in the
            type line only costs contrast. The call sign rides on the same line:
            it is how a ship is addressed, it is four characters wide, and this
            row has the room for it — the type gives way first. */}
        <span className="detail-subtitle">
          <span className="headline-type">{shipTypeText(vessel.shipType)}</span>
          {vessel.callSign && <b className="headline-callsign">{vessel.callSign}</b>}
        </span>
      </div>
      <div className="vessel-readout">
        <span className={`readout-value ${speedTick}`}>
          {vessel.sog.toFixed(1)}
          <small>kn</small>
        </span>
        <span className="readout-sub">{Math.round(vessel.cog)}°</span>
      </div>
    </>
  );
};
