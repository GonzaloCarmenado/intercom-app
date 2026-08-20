import type { NetworkType } from "./network.transform";

/**
 * Subconjunto del Network Information API que usamos. No es estándar en
 * todos los navegadores, pero sí en el WebView de Android que usa Tauri.
 * Importante: esta API NO distingue 5G de 4G — `effectiveType` es una
 * estimación por rendimiento medido, no por generación de red real, y su
 * valor máximo es literalmente `"4g"` (cubre 4G y 5G indistintamente).
 * Distinguirlos de verdad exigiría un puente nativo a `TelephonyManager`
 * (Android), fuera de alcance de este cambio — ver ADR-003.
 */
export interface NetworkInformation {
  type?: string;
  effectiveType?: string;
}

/** Lo mínimo de `Navigator` que necesitamos, para poder inyectarlo en tests. */
export interface NavigatorLike {
  onLine: boolean;
  connection?: NetworkInformation;
}

function currentNavigator(): NavigatorLike {
  return navigator;
}

/** Hay alguna conexión de datos activa (no dice nada de su calidad). */
export function hasConnectivity(nav: NavigatorLike = currentNavigator()): boolean {
  return nav.onLine;
}

/** Mejor estimación disponible del tipo de red activa. */
export function getNetworkType(nav: NavigatorLike = currentNavigator()): NetworkType {
  if (!nav.onLine) return "unknown";
  const connection = nav.connection;
  if (!connection) return "unknown";
  if (connection.type === "wifi") return "wifi";
  if (connection.effectiveType === "4g") return "4g";
  if (connection.effectiveType === "3g") return "3g";
  return "unknown";
}
