// Variable speed-limit signs (Digitraffic variable-sign API, SPEEDLIMIT type):
// motorway gantry signs whose displayed limit changes with traffic and weather.
// The backend serves only signs currently showing a numeric limit.

export interface VariableSpeedSign {
  id: string;
  longitude: number;
  latitude: number;
  /** Currently displayed limit, km/h. */
  speedLimit: number;
  /** INCREASING/DECREASING along the road's address numbering. */
  direction?: string;
  carriageway?: string;
  reliability?: string;
  /** When the currently shown value took effect. */
  effectDate?: string;
}

// A speed-limit sign is red-ringed white in the real world regardless of UI
// theme, so unlike the other layers there's no theme variant.
export const SPEED_SIGN_RING = '#d32f2f';

export function speedSignPopupHTML(props: {
  speedLimit: number;
  effectDate?: string;
}): string {
  const since = props.effectDate
    ? `<br/><span class="popup-desc">Since ${new Date(props.effectDate).toLocaleString('fi-FI')}</span>`
    : '';
  return `<strong>Variable speed limit: ${props.speedLimit} km/h</strong>${since}`;
}
