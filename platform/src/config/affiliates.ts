// Afiliación de recursos (Marc, 28-09-2026): mostramos primero lo que tiene calidad validada y, entre eso, lo que
// podemos rentabilizar. Libros → Amazon.es con la etiqueta de Amazon Afiliados (variable AMAZON_ES_TAG del .env.local).
// Herramientas → enlace de afiliado por dominio: añade aquí cada programa al darte de alta (url con tu código).
// Vídeos y podcasts ajenos no tienen programa de afiliación; solo rentan si son de un canal propio.
export const TOOL_AFFILIATES: Record<string, { url: string; program: string }> = {
  // "hubspot.com": { url: "https://…?ref=TU_CODIGO", program: "HubSpot Affiliate Program" },
};

/** Cuánto sube en el orden un recurso rentabilizable que ya ha pasado el control de calidad. */
export const AFFILIATE_BOOST = 8;
