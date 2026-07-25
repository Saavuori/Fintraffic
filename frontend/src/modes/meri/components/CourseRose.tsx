import React from 'react';

interface CourseRoseProps {
  /** Heading if the ship reports one, otherwise course over ground. */
  deg: number;
  /** The category colour the map paints this ship with. */
  color: string;
  /** Under way, as opposed to anchored / moored / drifting. */
  moving: boolean;
}

/**
 * The selected ship's heading, drawn the way the map draws it.
 *
 * This is the phone sheet's badge: where the desktop rail shows a generic
 * navigation glyph, the sheet shows the actual bearing — the same arrow, at the
 * same angle, in the same category colour as the marker that was just tapped. A
 * ship that isn't moving has no meaningful heading, so it gets the ring alone
 * with a still centre rather than an arrow pointing at nothing.
 */
export const CourseRose: React.FC<CourseRoseProps> = ({ deg, color, moving }) => (
  <svg
    className="course-rose"
    viewBox="0 0 32 32"
    style={{ color }}
    role="img"
    aria-label={moving ? `Heading ${Math.round(deg)} degrees` : 'Stationary'}
  >
    <circle cx="16" cy="16" r="14.5" fill="none" stroke="currentColor" strokeOpacity="0.3" />
    {/* North tick, so the arrow reads as a bearing rather than a direction. */}
    <line x1="16" y1="1.5" x2="16" y2="5" stroke="currentColor" strokeOpacity="0.5" />
    {moving ? (
      <path
        d="M16 4.5 L21 24 L16 20.5 L11 24 Z"
        fill="currentColor"
        transform={`rotate(${deg} 16 16)`}
      />
    ) : (
      <circle cx="16" cy="16" r="4" fill="currentColor" fillOpacity="0.85" />
    )}
  </svg>
);
