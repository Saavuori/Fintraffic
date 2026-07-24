import React from 'react';
import { X, ChevronRight, Video } from 'lucide-react';
import { useCollapsiblePanel, stopPanelClick } from '../../../shared/hooks/useCollapsiblePanel';
import type { Webcam } from '../lib/webcams';

interface WebcamPopupProps {
  webcam: Webcam;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const WebcamPopup: React.FC<WebcamPopupProps> = ({
  webcam,
  onClose,
  isCollapsed,
  onToggleCollapse,
}) => {
  const { className: collapsedClass, ...collapsibleProps } = useCollapsiblePanel(
    isCollapsed,
    onToggleCollapse,
    'Open webcam'
  );

  return (
    <div className={`glass-panel detail-popup webcam-popup ${collapsedClass}`} {...collapsibleProps}>
      {!isCollapsed && (
        <div className="detail-content" onClick={stopPanelClick}>
          <div className="detail-header">
            <div className="vessel-badge port-badge">
              <Video size={18} />
            </div>
            <div className="detail-title">
              <h3>{webcam.name}</h3>
              <span className="detail-subtitle">Port of Helsinki webcam</span>
            </div>
            <button className="icon-btn" onClick={onToggleCollapse} aria-label="Collapse panel">
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
    </div>
  );
};
