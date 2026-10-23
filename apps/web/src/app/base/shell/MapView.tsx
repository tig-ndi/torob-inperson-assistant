import { createContext, useContext } from 'react';

type MapView = { revealMap: () => void; showList: () => void };
const MapViewContext = createContext<MapView | null>(null);
export const MapViewProvider = MapViewContext.Provider;

export function useMapView(): MapView {
  const controls = useContext(MapViewContext);
  if (!controls) throw new Error('MapViewProvider is required');
  return controls;
}
