/**
 * What never reaches the logs (SECURITY_PRIVACY.md §3): credentials, cookies, query strings and
 * the values database errors carry. Bodies are never logged at all.
 */
export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  // Database errors carry query values and Postgres details (amounts, e-mails).
  'err.parameters',
  'err.detail',
  'err.driverError.parameters',
  'err.driverError.detail',
] as const;

/** Path only: query strings can carry search text or other personal data. */
export function serializeRequest(req: { id: unknown; method: unknown; url: unknown }) {
  return {
    id: req.id,
    method: req.method,
    url: typeof req.url === 'string' ? req.url.split('?')[0] : req.url,
  };
}

export function serializeResponse(res: { statusCode: unknown }) {
  return { statusCode: res.statusCode };
}
