/**
 * Tipos de red reconocidos. La distinción 5g/4g/3g depende de lo que el
 * navegador/WebView sea capaz de reportar — ver network.service.ts para las
 * limitaciones reales de esa detección.
 */
export type NetworkType = "wifi" | "5g" | "4g" | "3g" | "unknown";

const RANK: Record<NetworkType, number> = { wifi: 4, "5g": 3, "4g": 2, "3g": 1, unknown: 0 };

/** Elige la mejor red disponible: WiFi > 5G > 4G > 3G. */
export function pickBestNetwork(candidates: NetworkType[]): NetworkType | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, candidate) => (RANK[candidate] > RANK[best] ? candidate : best));
}
