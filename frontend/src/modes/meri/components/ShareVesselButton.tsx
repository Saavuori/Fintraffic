import React, { useEffect, useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { vesselLink } from '../lib/vesselLink';

interface ShareVesselButtonProps {
  mmsi: number;
  name?: string;
  size?: number;
  /** 'row' is the phone sheet's full-width row; the header stays clear there. */
  variant?: 'icon' | 'row';
}

/**
 * Shares a direct link to the vessel. Phones get the system share sheet (where
 * "copy" is one of the targets anyway); everywhere else the link goes straight
 * to the clipboard and the icon ticks over to confirm it.
 */
export const ShareVesselButton: React.FC<ShareVesselButtonProps> = ({
  mmsi,
  name,
  size = 15,
  variant = 'icon',
}) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const share = async (e: React.MouseEvent) => {
    // The phone's detail header folds the sheet on tap; this isn't that tap.
    e.stopPropagation();
    const url = vesselLink(mmsi);
    const title = name || `MMSI ${mmsi}`;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (coarse && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        // Dismissing the sheet is not a failure worth falling back from.
        if ((err as DOMException)?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard (insecure context, denied permission): the address bar
      // already carries the same link, so point there instead.
      window.prompt('Copy this link to the vessel:', url);
    }
  };

  const label = copied ? 'Link copied' : 'Share link to this vessel';
  const icon = copied ? <Check size={size} /> : <Link2 size={size} />;

  if (variant === 'row') {
    return (
      <button
        className={`track-history-row share-vessel-row${copied ? ' active' : ''}`}
        onClick={share}
      >
        {icon}
        {label}
      </button>
    );
  }

  return (
    <button
      className={`icon-btn share-vessel-btn${copied ? ' active' : ''}`}
      onClick={share}
      onKeyDown={(e) => e.stopPropagation()}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
};
