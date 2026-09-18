/**
 * Uganda Food Marketplace - Currency & Financial Arithmetic Helpers
 * All monetary amounts are handled strictly as integer values in Ugandan Shillings (UGX).
 */

export function formatUGX(amount) {
  const integerVal = Math.round(Number(amount) || 0);
  return `UGX ${integerVal.toLocaleString('en-UG')}`;
}

export default formatUGX;
