import React from 'react';
import { X, ChevronRight, Video } from 'lucide-react';
import { stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import { Panel } from '../../../shared/components/Panel';
import { BrowseButton } from '../../../shared/components/SheetViewSwitch';
import type { Webcam } from '../lib/webcams';

interface WebcamPopupProps {
  webcam: Webcam;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobile: boolean;
  /** False while the phone's one sheet is showing the filters instead. */
  open?: boolean;
  /** Switches the phone's sheet to the filters without dropping the selection. */
  onShowBrowse?: () => void;
}

export const WebcamPopup: React.FC<WebcamPopupProps> = ({
  webcam,
  onClose,
  isCollapsed,
  onToggleCollapse,
  isMobile,
  open = true,
  onShowBrowse,
}) => {
  const bodyCollapsed = !isMobile && isCollapsed;

  return (
    <Panel
      variant="detail"
      className="webcam-popup"
      isMobile={isMobile}
      open={open}
      ariaLabel="Open webcam"
      collapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    >
      {!bodyCollapsed && (
        <div className="detail-content" onClick={stopPanelClick}>
          <div className="detail-header">
            <div className="vessel-badge port-badge">
              <Video size={18} />
            </div>
            <div className="detail-title">
              <h3>{webcam.name}</h3>
              <span className="detail-subtitle">Port of Helsinki webcam</span>
            </div>
            {isMobile && onShowBrowse && <BrowseButton onClick={onShowBrowse} />}
            <button className="icon-btn panel-collapse-btn" onClick={onToggleCollapse} aria-label="Collapse panel">
              <ChevronRight size={16} />
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Close panel">
              <X size={16} />
            </button>
          </div>

          <div className="webcam-embed">
            <iframe
              src={`https://www.youtube.com/embed/${webcam.youtubeId}?autoplay=1&mute=1`}
              title={webcam.name}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </Panel>
  );
};
