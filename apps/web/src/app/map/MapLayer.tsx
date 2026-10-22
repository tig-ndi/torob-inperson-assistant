import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import './map.css';
import type { Position } from '../base/domain/contracts.ts';
import { useWorkspace } from '../base/state/Workspace.tsx';
import { Button } from '../base/ui/primitives.tsx';

export type MapPin = {
  id: string;
  lat: number;
  lon: number;
  label: string;
  offerIds: string[];
  state: 'declared_open' | 'declared_closed' | 'unknown';
};
export type MapLayerProps = {
  userPosition: Position | null;
  radiusKm: number | null;
  pins: MapPin[];
  selectedPinId: string | null;
  onPinSelect: (pinId: string) => void;
  onPositionPick?: (lat: number, lon: number) => void;
  cameraIntent: { revision: number; kind: 'all' | 'user' | 'selection' } | null;
  padding: { top: number; right: number; bottom: number; left: number };
};

const TEHRAN: L.LatLngTuple = [35.6892, 51.389];
// Tile service is replaceable per deployment; bulk prefetch is deliberately not used.
const TILE_URL = import.meta.env.VITE_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';

function validPosition(position: Position | null): position is Position {
  return position !== null && Number.isFinite(position.lat) && Number.isFinite(position.lon) &&
    Math.abs(position.lat) <= 90 && Math.abs(position.lon) <= 180;
}
function coordinates(value: Position) { return L.latLng(value.lat, value.lon); }

/** B's real map. The list stays the complete path when tiles or the map fail. */
export function MapLayer({ pins, userPosition, radiusKm, selectedPinId, onPinSelect, onPositionPick,
  cameraIntent, padding }: MapLayerProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const cluster = useRef<L.MarkerClusterGroup | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const selectedCluster = useRef<L.Marker | null>(null);
  const overlay = useRef<L.LayerGroup | null>(null);
  const line = useRef<L.Polyline | null>(null);
  const pinCallback = useRef(onPinSelect);
  const pickCallback = useRef(onPositionPick);
  const live = useRef({ pins, userPosition, selectedPinId, padding });
  const titles = useRef(new Map<string, string>());
  const framed = useRef(false);
  const framedAtZero = useRef(false);
  const reduced = useRef(false);
  const [tileFailed, setTileFailed] = useState(false);
  const { state } = useWorkspace();
  const visit = ['stores', 'compare', 'contact', 'trip'].includes(state.screen);
  titles.current = new Map((state.loadedOffers?.page.items ?? []).map(offer => [
    offer.shop_id,
    offer.shop.location_label || offer.shop.address || offer.shop.name || 'فروشگاه',
  ]));
  pinCallback.current = onPinSelect;
  pickCallback.current = onPositionPick;
  live.current = { pins, userPosition, selectedPinId, padding };

  const paddingOptions = (animate: boolean) => ({
    paddingTopLeft: L.point(padding.left, padding.top),
    paddingBottomRight: L.point(padding.right, padding.bottom),
    animate,
  });
  const frameAll = (animate: boolean) => {
    const current = map.current;
    if (!current) return;
    const points = live.current.pins.map(pin => L.latLng(pin.lat, pin.lon));
    if (validPosition(live.current.userPosition)) points.push(coordinates(live.current.userPosition));
    if (!points.length) return;
    const size = current.getSize();
    framedAtZero.current = size.x === 0 || size.y === 0;
    current.fitBounds(L.latLngBounds(points), { ...paddingOptions(animate), maxZoom: 14 });
  };
  const applySelection = () => {
    selectedCluster.current?.getElement()?.classList.remove('is-selected');
    selectedCluster.current = null;
    for (const [id, marker] of markers.current) {
      const icon = marker.getElement();
      if (!icon) continue;
      const selected = id === live.current.selectedPinId;
      icon.classList.toggle('is-selected', selected);
      if (selected) icon.setAttribute('aria-current', 'true'); else icon.removeAttribute('aria-current');
    }
    const group = cluster.current;
    const selected = live.current.selectedPinId ? markers.current.get(live.current.selectedPinId) : undefined;
    if (group && selected) {
      const parent = group.getVisibleParent(selected);
      if (parent && parent !== selected) {
        // The selected shop is inside a cluster; mark the cluster so the current choice stays visible.
        selectedCluster.current = parent;
        parent.getElement()?.classList.add('is-selected');
      }
    }
  };

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animate = !reduced.current;
    const instance = L.map(element, {
      center: TEHRAN, zoom: 11, minZoom: 8, maxZoom: 19, zoomControl: true, keyboard: true,
      scrollWheelZoom: false, zoomAnimation: animate, fadeAnimation: animate, markerZoomAnimation: animate,
    });
    map.current = instance;
    const tileLayer = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION, crossOrigin: true });
    tileLayer.on('tileerror', () => setTileFailed(true));
    tiles.current = tileLayer;
    const group = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 64,
      spiderfyOnMaxZoom: true, zoomToBoundsOnClick: true, spiderfyDistanceMultiplier: 1.8,
      animate, chunkedLoading: true, iconCreateFunction: clusterIcon => L.divIcon({ className: 'um-cluster',
        html: `<span>${clusterIcon.getChildCount().toLocaleString('fa-IR')}</span>`, iconSize: L.point(36, 36), iconAnchor: L.point(18, 18) }) });
    group.addTo(instance);
    cluster.current = group;
    overlay.current = L.layerGroup().addTo(instance);
    line.current = L.polyline([], { color: '#c72740', weight: 2, dashArray: '7 9', interactive: true }).addTo(instance);
    instance.on('click', event => { pickCallback.current?.(event.latlng.lat, event.latlng.lng); });
    const resize = new ResizeObserver(() => {
      instance.invalidateSize();
      if (framed.current && framedAtZero.current && element.clientWidth > 0 && element.clientHeight > 0) frameAll(false);
      applySelection();
      requestAnimationFrame(applySelection);
    });
    resize.observe(element);
    instance.on('zoomend', applySelection);
    return () => {
      resize.disconnect();
      instance.off('zoomend', applySelection);
      instance.remove();
      map.current = null; tiles.current = null; cluster.current = null; overlay.current = null;
      line.current = null; markers.current.clear(); selectedCluster.current = null; framed.current = false; framedAtZero.current = false;
    };
  }, []);

  const signature = pins.map(pin => `${pin.id}\u0000${pin.lat}\u0000${pin.lon}\u0000${pin.state}\u0000${pin.label}\u0000${pin.offerIds.join(',')}`).join('\u0001');
  useEffect(() => {
    const instance = map.current, layer = tiles.current;
    if (!instance || !layer) return;
    const shouldLoad = pins.length > 0 || userPosition !== null;
    if (shouldLoad && !instance.hasLayer(layer)) layer.addTo(instance);
    if (!shouldLoad && instance.hasLayer(layer)) instance.removeLayer(layer);
  }, [pins.length, userPosition]);

  useEffect(() => {
    const group = cluster.current, instance = map.current;
    if (!group || !instance) return;
    group.clearLayers(); markers.current.clear();
    for (const pin of live.current.pins) {
      const title = titles.current.get(pin.id);
      const display = title ? `${title} · ${pin.label}` : pin.label;
      const marker = L.marker([pin.lat, pin.lon], { keyboard: true, title: display, alt: display, riseOnHover: true,
        icon: L.divIcon({ className: `um-pin um-pin--${pin.state}`, html: '<span aria-hidden="true"></span>',
          iconSize: L.point(26, 26), iconAnchor: L.point(13, 13) }) });
      const tooltip = document.createElement('span');
      tooltip.textContent = display;
      marker.bindTooltip(tooltip);
      marker.on('click', () => pinCallback.current(pin.id));
      const decorate = () => {
        const icon = marker.getElement();
        if (!icon) return;
        icon.setAttribute('role', 'button');
        icon.setAttribute('aria-label', `${display}؛ ${pin.offerIds.length.toLocaleString('fa-IR')} آفر بارگذاری‌شده`);
        if (icon.dataset.mapKeyboard !== 'true') {
          icon.dataset.mapKeyboard = 'true';
          icon.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            pinCallback.current(pin.id);
          });
        }
      };
      marker.on('add', decorate);
      group.addLayer(marker);
      markers.current.set(pin.id, marker);
      decorate();
    }
    if (live.current.pins.length && !framed.current) {
      framed.current = true;
      requestAnimationFrame(() => frameAll(false));
    }
    // Selection styling must survive a marker rebuild without moving the camera.
    applySelection();
  }, [signature]);

  useEffect(() => {
    applySelection();
  }, [selectedPinId]);

  useEffect(() => {
    const layer = overlay.current;
    if (!layer) return;
    layer.clearLayers();
    if (validPosition(userPosition)) {
      const marker = L.marker(coordinates(userPosition), { interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'um-user', html: '<span aria-hidden="true"></span>',
          iconSize: L.point(20, 20), iconAnchor: L.point(10, 10) }) });
      const positionTooltip = document.createElement('span');
      positionTooltip.textContent = `موقعیت انتخاب‌شده: ${userPosition.label}`;
      marker.bindTooltip(positionTooltip);
      marker.addTo(layer);
      if (radiusKm !== null && Number.isFinite(radiusKm) && radiusKm > 0) {
        L.circle(coordinates(userPosition), { radius: radiusKm * 1000, color: '#235eae', weight: 1,
          fillColor: '#235eae', fillOpacity: 0.05, dashArray: '4 7', interactive: false }).addTo(layer);
      }
    }
    const destination = live.current.pins.find(pin => pin.id === selectedPinId);
    const lineLayer = line.current;
    if (lineLayer) {
      if (validPosition(userPosition) && destination) {
        lineLayer.setLatLngs([coordinates(userPosition), L.latLng(destination.lat, destination.lon)]);
        lineLayer.bindTooltip('خط مستقیم هوایی؛ مسیر خیابانی یا زمان پیمایش نیست.', { sticky: true });
      } else {
        lineLayer.setLatLngs([]);
        lineLayer.unbindTooltip();
      }
    }
  }, [userPosition?.lat, userPosition?.lon, userPosition?.label, radiusKm, selectedPinId, signature]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !cameraIntent) return;
    const animate = !reduced.current;
    if (cameraIntent.kind === 'all') {
      const points = live.current.pins.map(pin => L.latLng(pin.lat, pin.lon));
      if (validPosition(live.current.userPosition)) points.push(coordinates(live.current.userPosition));
      if (points.length) instance.fitBounds(L.latLngBounds(points), { ...paddingOptions(animate), maxZoom: 14 });
      else if (validPosition(live.current.userPosition)) instance.setView(coordinates(live.current.userPosition), 14, { animate });
    } else if (cameraIntent.kind === 'user' && validPosition(live.current.userPosition)) {
      instance.setView(coordinates(live.current.userPosition), 14, { animate });
    } else if (cameraIntent.kind === 'selection') {
      const destination = live.current.pins.find(pin => pin.id === live.current.selectedPinId);
      if (destination) instance.panInside(L.latLng(destination.lat, destination.lon), paddingOptions(animate));
    }
  }, [cameraIntent?.revision]);

  const retryTiles = () => { setTileFailed(false); const layer = tiles.current, instance = map.current;
    if (layer && instance && !instance.hasLayer(layer)) layer.addTo(instance); else layer?.redraw(); };
  const legend = userPosition && pins.some(pin => pin.id === selectedPinId)
    ? 'خط‌چین سرخ: فاصلهٔ هوایی · دایرهٔ آبی: شعاع انتخابی'
    : 'نقطه‌ها: فروشگاه‌های بارگذاری‌شده · دایرهٔ آبی: شعاع انتخابی';

  return <section className="um-map-shell" aria-label="نقشهٔ فروشندگان">
    <div ref={container} className="um-map" role="region" aria-label="نقشهٔ خیابان با کاشی‌های OpenStreetMap" />
    {tileFailed && <div className="um-tile-failure" role="alert">
      <p>کاشی‌های نقشه در دسترس نیستند. فهرست فروشندگان کامل و مستقل از نقشه قابل استفاده است.</p>
      <Button tone="secondary" onClick={retryTiles}>تلاش دوباره برای نقشه</Button>
    </div>}
    {!pins.length && !tileFailed && <p className="um-empty-note" role="status">
      {visit ? 'برای این شرایط، پینی بارگذاری نشده است؛ فهرست فروشندگان مرجع است.'
        : 'نقشه پس از انتخاب محصول و بارگذاری آفرهای فروشندگان نمایش داده می‌شود.'}
    </p>}
    {pins.length > 0 && <p className="um-legend" aria-hidden="true">{legend}</p>}
  </section>;
}
