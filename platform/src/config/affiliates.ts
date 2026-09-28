// Afiliación de recursos (Marc, 28-09-2026): mostramos primero lo que tiene calidad validada y, entre eso, lo que
// podemos rentabilizar. Libros → Amazon.es con la etiqueta de Amazon Afiliados (variable AMAZON_ES_TAG del .env.local).
// Herramientas → enlace de afiliado por dominio: añade aquí cada programa al darte de alta (url con tu código).
// Vídeos y podcasts ajenos no tienen programa de afiliación; solo rentan si son de un canal propio.
export const TOOL_AFFILIATES: Record<string, { url: string; program: string }> = {
  // "hubspot.com": { url: "https://…?ref=TU_CODIGO", program: "HubSpot Affiliate Program" },
};

/** Cuánto sube en el orden un recurso rentabilizable que ya ha pasado el control de calidad. */
export const AFFILIATE_BOOST = 8;

// Herramientas que compiten con el producto del cliente (hoy, el primer cliente es un fabricante de ERP: Odoo) y que por
// tanto nunca se recomiendan. ponytail: lista global mientras haya un solo cliente; pasar a ajustes por empresa al llegar
// el segundo con otro sector.
export const EXCLUDED_TOOL_DOMAINS = new Set([
  "lemlist.com", "apollo.io", "clay.com", "notion.so", "notion.com", "hubspot.com", "salesforce.com", "pipedrive.com",
  "zoho.com", "monday.com", "clickup.com", "asana.com", "mailchimp.com", "brevo.com", "activecampaign.com", "zendesk.com",
  "freshworks.com", "shopify.com", "wix.com", "squarespace.com", "holded.com", "quipu.com", "sage.com", "netsuite.com",
  "sap.com", "dynamics.microsoft.com", "bitrix24.com", "trello.com", "airtable.com", "calendly.com", "typeform.com",
  // Plataformas de formación: recomendarlas es ofrecer a nuestra competencia (Marc, 28-09-2026).
  "coursera.org", "edx.org", "domestika.org", "skillshare.com", "udemy.com", "masterclass.com", "linkedin.com/learning",
  "blinkist.com", "babbel.com", "busuu.com", "platzi.com", "crehana.com", "openwebinars.net", "tokioschool.com",
  "thinkific.com", "teachable.com", "kajabi.com", "hotmart.com", "360learning.com", "docebo.com", "moodle.org",
]);
