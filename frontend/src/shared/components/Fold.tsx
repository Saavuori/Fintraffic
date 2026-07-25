import React, { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface FoldProps {
  /** When false the children render plainly — the desktop rails fold nothing. */
  folded: boolean;
  /** Names what is inside, closed. "More details" when there is nothing better. */
  label?: string;
  children: ReactNode;
}

/**
 * Reference rows, out of the way until asked for.
 *
 * A phone sheet has room for what you are watching; identity and specification
 * rows — sensor lists, opening hours, payment methods — are what you look up
 * once. They stay one tap away rather than pushing the map off the screen.
 */
export const Fold: React.FC<FoldProps> = ({ folded, label = 'More details', children }) => {
  const [open, setOpen] = useState(false);

  if (!folded) return <>{children}</>;

  return (
    <>
      <button className="detail-more-btn" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        {open ? `Hide ${label.toLowerCase()}` : label}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && children}
    </>
  );
};
