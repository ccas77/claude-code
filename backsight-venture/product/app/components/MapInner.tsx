"use client";

/**
 * Leaflet map (client-only; loaded via next/dynamic in JobMap.tsx).
 *
 * Offline resilience: a CSS coordinate-grid backdrop always sits underneath
 * the tile pane. OSM tiles cover it when they load; when tiles fail (offline),
 * Leaflet keeps unloaded tiles at opacity 0, so the grid shows through and the
 * SVG markers still render — never a broken UI. A tileerror listener surfaces
 * a small "offline" notice.
 */
import "leaflet/dist/leaflet.css";
import { useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
} from "react-leaflet";

export interface MapPin {
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
  href?: string;
  kind?: "primary" | "hit" | "context";
}

const PIN_STYLE: Record<
  NonNullable<MapPin["kind"]>,
  { color: string; fillColor: string; radius: number }
> = {
  primary: { color: "#c2410c", fillColor: "#f97316", radius: 10 },
  hit: { color: "#0f766e", fillColor: "#14b8a6", radius: 8 },
  context: { color: "#475569", fillColor: "#94a3b8", radius: 6 },
};

export default function MapInner({
  center,
  zoom = 12,
  pins,
  className = "h-72",
}: {
  center: { lat: number; lng: number };
  zoom?: number;
  pins: MapPin[];
  className?: string;
}) {
  const [tilesFailed, setTilesFailed] = useState(false);

  return (
    <div className={`relative w-full overflow-hidden rounded-lg border border-slate-200 ${className}`}>
      {/* CSS coordinate-grid fallback backdrop (visible whenever tiles are not). */}
      <div
        aria-hidden
        className="absolute inset-0 z-0 bg-slate-100"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(100,116,139,0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,116,139,0.25) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        scrollWheelZoom={false}
        className="absolute inset-0 z-10"
        style={{ background: "transparent" }}
        attributionControl={!tilesFailed}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{ tileerror: () => setTilesFailed(true) }}
        />
        {pins.map((p, i) => {
          const s = PIN_STYLE[p.kind ?? "hit"];
          return (
            <CircleMarker
              key={i}
              center={[p.lat, p.lng]}
              radius={s.radius}
              pathOptions={{
                color: s.color,
                fillColor: s.fillColor,
                fillOpacity: 0.85,
                weight: 2,
              }}
            >
              <Popup>
                <div className="text-sm">
                  {p.href ? (
                    <a href={p.href} className="font-semibold text-orange-700 underline">
                      {p.label}
                    </a>
                  ) : (
                    <span className="font-semibold">{p.label}</span>
                  )}
                  {p.sublabel ? <div className="text-slate-600">{p.sublabel}</div> : null}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      {tilesFailed ? (
        <div className="pointer-events-none absolute bottom-2 left-2 z-20 rounded bg-slate-800/90 px-2 py-1 text-xs text-slate-100">
          Offline — map tiles unavailable. Showing coordinate grid ({center.lat.toFixed(4)},{" "}
          {center.lng.toFixed(4)}).
        </div>
      ) : null}
    </div>
  );
}
