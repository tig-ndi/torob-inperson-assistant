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
import { CrosshairIcon, StoreIcon } from '../../presentation/icons-motion/icons.tsx';
import { useMapView } from '../base/shell/MapView.tsx';

import { formatDistance } from '../../api.ts';

export type MapPin = {
  id: string;
  lat: number;
  lon: number;
  label: string;
  title?: string;
  address?: string | null;
  directDistanceMeters?: number | null;
  minPrice?: string | null;
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
function shortPrice(label: string) {
  return label.split(' · ')[0]!.replace(/^از\s+/, '').replace(/\s*تومان$/, '');
}

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
  const lastUserPosition = useRef<string | null>(null);
  const framed = useRef(false);
  const framedAtZero = useRef(false);
  const reduced = useRef(false);
  const [tileFailed, setTileFailed] = useState(false);
  const [locating, setLocating] = useState(false);
  const [previewPinId, setPreviewPinId] = useState<string | null>(null);
  const { state, dispatch } = useWorkspace();
  const { showList } = useMapView();
  const visit = ['stores', 'compare', 'contact', 'trip'].includes(state.screen);
  pinCallback.current = onPinSelect;
  pickCallback.current = onPositionPick;
  live.current = { pins, userPosition, selectedPinId, padding };

  const paddingOptions = (animate: boolean) => {
    const inset = live.current.padding;
    return {
      paddingTopLeft: L.point(inset.left, inset.top),
      paddingBottomRight: L.point(inset.right, inset.bottom),
      animate,
    };
  };
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
    selectedCluster.current?.getElement()?.removeAttribute('aria-label');
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
        const clusterIcon = parent.getElement();
        clusterIcon?.classList.add('is-selected');
        clusterIcon?.setAttribute('aria-label', 'خوشهٔ فروشگاه‌ها؛ شامل انتخاب فعلی');
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
        html: `<span>${clusterIcon.getChildCount().toLocaleString('fa-IR')}</span>`, iconSize: L.point(44, 44), iconAnchor: L.point(22, 22) }) });
    group.addTo(instance);
    cluster.current = group;
    overlay.current = L.layerGroup().addTo(instance);
    line.current = L.polyline([], { color: 'var(--um-route-color)', weight: 2, dashArray: '7 9', interactive: true }).addTo(instance);
    instance.on('click', event => {
      setPreviewPinId(null);
      pickCallback.current?.(event.latlng.lat, event.latlng.lng);
    });
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
      lastUserPosition.current = null;
    };
  }, []);

  const signature = pins.map(pin => `${pin.id}\u0000${pin.lat}\u0000${pin.lon}\u0000${pin.state}\u0000${pin.label}\u0000${pin.title ?? ''}\u0000${pin.offerIds.join(',')}`).join('\u0001');
  useEffect(() => {
    const instance = map.current, layer = tiles.current;
    if (!instance || !layer) return;
    const shouldLoad = pins.length > 0 || userPosition !== null;
    // Once loaded, keep the tile layer to avoid refetching on every filter change.
    if (shouldLoad && !instance.hasLayer(layer)) layer.addTo(instance);
  }, [pins.length, userPosition]);

  useEffect(() => {
    const group = cluster.current, instance = map.current;
    if (!group || !instance) return;
    group.clearLayers(); markers.current.clear();
    for (const pin of live.current.pins) {
      const title = pin.title;
      const hours = { declared_open: 'طبق برنامه باز', declared_closed: 'طبق برنامه بسته', unknown: 'ساعت نامشخص' }[pin.state];
      const display = `${title ? `${title} · ` : ''}${pin.label} · ${hours}`;
      const tag = document.createElement('span');
      tag.className = 'um-tag';
      tag.textContent = shortPrice(pin.label);
      const width = Math.min(208, Math.max(74, 32 + tag.textContent.length * 8));
      const marker = L.marker([pin.lat, pin.lon], { keyboard: true, title: display, alt: display, riseOnHover: true,
        icon: L.divIcon({ className: `um-pin um-pin--${pin.state}`, html: tag,
          iconSize: L.point(width, 44), iconAnchor: L.point(width / 2, 44) }) });
      marker.on('click', () => {
        setPreviewPinId(pin.id);
        pinCallback.current(pin.id);
      });
      const tooltip = document.createElement('span');
      tooltip.textContent = display;
      marker.bindTooltip(tooltip);
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
            setPreviewPinId(pin.id);
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
    const instance = map.current;
    if (!instance || !container.current?.clientWidth || !container.current.clientHeight || !framed.current) return;
    instance.invalidateSize({ pan: false });
    const selected = live.current.pins.find(pin => pin.id === live.current.selectedPinId);
    if (selected) instance.panInside(L.latLng(selected.lat, selected.lon), paddingOptions(false));
    else frameAll(false);
  }, [padding.top, padding.right, padding.bottom, padding.left]);

  useEffect(() => {
    applySelection();
    if (selectedPinId) setPreviewPinId(selectedPinId);
  }, [selectedPinId]);

  useEffect(() => {
    const layer = overlay.current;
    if (!layer) return;
    layer.clearLayers();
    const positionKey = validPosition(userPosition) ? `${userPosition.lat},${userPosition.lon}` : null;
    if (positionKey && positionKey !== lastUserPosition.current && map.current) {
      // A newly chosen position is a clear camera intent; later manual movement is preserved.
      map.current.setView(coordinates(userPosition!), Math.max(map.current.getZoom(), 13),
        { animate: !reduced.current });
    }
    lastUserPosition.current = positionKey;
    if (validPosition(userPosition)) {
      const marker = L.marker(coordinates(userPosition), { interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'um-user', html: '<span aria-hidden="true"></span>',
          iconSize: L.point(20, 20), iconAnchor: L.point(10, 10) }) });
      const positionTooltip = document.createElement('span');
      positionTooltip.textContent = `موقعیت انتخاب‌شده: ${userPosition.label}`;
      marker.bindTooltip(positionTooltip);
      marker.addTo(layer);
      if (radiusKm !== null && Number.isFinite(radiusKm) && radiusKm > 0) {
        L.circle(coordinates(userPosition), { radius: radiusKm * 1000, color: 'var(--um-route-color)', weight: 1,
          fillColor: 'var(--um-route-color)', fillOpacity: 0.05, dashArray: '5 9', interactive: false }).addTo(layer);
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
      if (destination) {
        const marker = markers.current.get(destination.id);
        const group = cluster.current;
        if (marker && group) {
          group.zoomToShowLayer(marker, () => {
            instance.panInside(L.latLng(destination.lat, destination.lon), paddingOptions(animate));
          });
        } else {
          instance.panInside(L.latLng(destination.lat, destination.lon), paddingOptions(animate));
        }
      }
    }
  }, [cameraIntent?.revision]);

  const retryTiles = () => { setTileFailed(false); const layer = tiles.current, instance = map.current;
    if (layer && instance && !instance.hasLayer(layer)) layer.addTo(instance); else layer?.redraw(); };
  const locate = () => {
    if (!navigator.geolocation) {
      dispatch({ type: 'notice', value: 'موقعیت‌یابی در این مرورگر در دسترس نیست؛ انتخاب دستی را امتحان کنید.' });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      setLocating(false);
      dispatch({ type: 'position', value: { lat: position.coords.latitude, lon: position.coords.longitude,
        source: 'gps', label: 'موقعیت مرورگر', accuracyMeters: position.coords.accuracy } });
      dispatch({ type: 'mapCamera', kind: 'user' });
    }, () => {
      setLocating(false);
      dispatch({ type: 'locationDenied' });
    }, { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 });
  };
  const legend = userPosition && pins.some(pin => pin.id === selectedPinId)
    ? 'خط‌چین سرخ: فاصلهٔ هوایی · دایرهٔ قرمز: شعاع انتخابی'
    : 'قیمت‌ها: فروشگاه‌های بارگذاری‌شده · دایرهٔ قرمز: شعاع انتخابی';

  const previewPin = previewPinId ? pins.find(p => p.id === previewPinId) : null;

  return <section className="um-map-shell" aria-label="نقشهٔ فروشندگان">
    <div ref={container} className="um-map" role="region" aria-label="نقشهٔ خیابان با کاشی‌های OpenStreetMap" />
    <div className="um-controls" role="group" aria-label="کنترل‌های نقشه">
      <button type="button" className="um-control" onClick={locate} disabled={locating} aria-label="موقعیت من" aria-busy={locating}>
        <CrosshairIcon size={20} />
      </button>
      <button type="button" className="um-control um-list-control" onClick={showList} aria-label="نمایش فهرست فروشندگان">
        <StoreIcon size={20} />
      </button>
    </div>

    {previewPin && (
      <div className="um-preview-card" role="dialog" aria-label={`پیش‌نمایش فروشگاه ${previewPin.title || previewPin.label}`}>
        <button type="button" className="um-preview-close" onClick={() => setPreviewPinId(null)} aria-label="بستن پیش‌نمایش">✕</button>
        <div className="um-preview-content">
          <div className="um-preview-header">
            <h4 className="um-preview-title">{previewPin.title || 'فروشگاه'}</h4>
            {previewPin.address && <p className="um-preview-address">{previewPin.address}</p>}
          </div>
          <div className="um-preview-badges">
            <span className="um-preview-price">{shortPrice(previewPin.label)} تومان</span>
            <span className={`um-status-pill um-status-pill--${previewPin.state}`}>
              {previewPin.state === 'declared_open' ? 'طبق برنامه باز' : previewPin.state === 'declared_closed' ? 'طبق برنامه بسته' : 'ساعت نامشخص'}
            </span>
            {previewPin.directDistanceMeters !== null && previewPin.directDistanceMeters !== undefined && (
              <span className="um-distance-pill">{formatDistance(previewPin.directDistanceMeters)} · هوایی</span>
            )}
            <span className="um-count-pill">{previewPin.offerIds.length.toLocaleString('fa-IR')} آفر</span>
          </div>
          <div className="um-preview-actions">
            <Button onClick={() => {
              onPinSelect(previewPin.id);
              const offer = state.loadedOffers?.page.items.find(o => o.shop_id === previewPin.id);
              if (offer) {
                dispatch({ type: 'selectOffer', value: offer });
                dispatch({ type: 'navigate', screen: 'contact' });
              }
              showList();
            }}>
              انتخاب این آفر و پیگیری
            </Button>
            <Button tone="secondary" onClick={() => {
              onPinSelect(previewPin.id);
              showList();
            }}>
              مشاهده در فهرست
            </Button>
            <a className="um-routing-link um-routing-link--neshan" href={`https://nshn.ir/?lat=${previewPin.lat}&lng=${previewPin.lon}`} target="_blank" rel="noopener noreferrer">
              نشان
            </a>
            <a className="um-routing-link um-routing-link--balad" href={`https://balad.ir/location?latitude=${previewPin.lat}&longitude=${previewPin.lon}`} target="_blank" rel="noopener noreferrer">
              بلد
            </a>
          </div>
        </div>
      </div>
    )}

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
