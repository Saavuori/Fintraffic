import React from 'react';
import { SlidersHorizontal, ChevronLeft } from 'lucide-react';

/**
 * The two halves of the phone's single-sheet swap (see `useSheetView`): a
 * control in the detail header that reaches the filters, and a row at the top of
 * the filters that goes back to what is selected. Shared so the three modes
 * label and place them the same way.
 */

export const BrowseButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    className="icon-btn sheet-view-btn"
    onClick={onClick}
    aria-label="Show filters and layers"
    title="Filters and layers"
  >
    <SlidersHorizontal size={16} />
  </button>
);

export const BackToSelection: React.FC<{ label: string; onClick: () => void }> = ({
  label,
  onClick,
}) => (
  <button className="sheet-back-btn" onClick={onClick}>
    <ChevronLeft size={15} aria-hidden="true" />
    <span>{label}</span>
  </button>
);
