import { useCallback, useState } from 'react';

export type SheetView = 'detail' | 'browse';

interface SheetViewState {
  /** Which body the phone's single sheet is showing. */
  view: SheetView;
  /** Whether the browse (filters/layers) sheet should be mounted. */
  browseOpen: boolean;
  /** Whether the detail sheet should be mounted. */
  detailOpen: boolean;
  showBrowse: () => void;
  showDetail: () => void;
}

/**
 * One sheet, two bodies.
 *
 * A phone has room for exactly one bottom sheet, which used to mean the filter
 * sheet was unmounted for as long as anything was selected — changing a map
 * layer meant closing what you were reading first. Instead the two share the
 * slot: selecting something shows it, and a control in its header swaps to the
 * filters and back without touching the selection.
 *
 * Desktop keeps both rails, so everything here is open on wide screens.
 *
 * @param selectionKey identifies what is selected; a new one always shows the
 * detail, so tapping a second marker while browsing does what it looks like.
 */
export function useSheetView(isMobile: boolean, selectionKey: string | null): SheetViewState {
  const [view, setView] = useState<SheetView>('detail');
  const [lastKey, setLastKey] = useState(selectionKey);

  // Adjust during render rather than in an effect (React docs' "adjusting state
  // when props change"): the swap must be in the same paint as the selection.
  if (selectionKey !== lastKey) {
    setLastKey(selectionKey);
    if (selectionKey !== null) setView('detail');
  }

  const showBrowse = useCallback(() => setView('browse'), []);
  const showDetail = useCallback(() => setView('detail'), []);

  const hasSelection = selectionKey !== null;
  return {
    view,
    browseOpen: !isMobile || !hasSelection || view === 'browse',
    detailOpen: !isMobile || view === 'detail',
    showBrowse,
    showDetail,
  };
}
