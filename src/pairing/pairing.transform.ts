/** Parámetros opcionales de conexión al servicio de señalización. */
export interface SignalingParams {
  code?: string;
  token?: string;
}

/**
 * Construye la URL de conexión: sin parámetros crea una sala, con `code`
 * se une a una existente, con `code` y `token` reconecta.
 */
export function buildSignalingUrl(base: string, params: SignalingParams): string {
  const query = new URLSearchParams();
  if (params.code) query.set("code", params.code);
  if (params.token) query.set("token", params.token);

  const queryString = query.toString();
  return queryString ? `${base}?${queryString}` : base;
}
