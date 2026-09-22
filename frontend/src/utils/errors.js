/**
 * Turn an API/network error into a message in the customer's language.
 * Transport and server-side failures are translated here; validation
 * messages that the backend composes itself are shown as sent.
 */
export function friendlyError(err, t, fallbackKey = 'errGeneric') {
  const status = err?.status;
  if (status === 0) return t('errNetwork');
  if (status === 401) return t('errSession');
  if (status === 429) return t('errTooMany');
  if (typeof status === 'number' && status >= 500) return t('errServer');
  return err?.message || t(fallbackKey);
}
