"use client";

/** SSR-safe wrapper: Leaflet touches `window`, so load the map client-only. */
import dynamic from "next/dynamic";
import type { MapPin } from "./MapInner";

const MapInner = dynamic(() => import("./MapInner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-72 w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-sm text-slate-500">
      Loading map…
    </div>
  ),
});

export type { MapPin };

export default function JobMap(props: {
  center: { lat: number; lng: number };
  zoom?: number;
  pins: MapPin[];
  className?: string;
}) {
  return <MapInner {...props} />;
}
