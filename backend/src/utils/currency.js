/**
 * Uganda Food Marketplace - Currency & Financial Arithmetic Helpers
 * All monetary amounts are handled strictly as integer values in Ugandan Shillings (UGX)
 */

function formatUGX(amount) {
  const integerVal = Math.round(Number(amount) || 0);
  return `UGX ${integerVal.toLocaleString('en-UG')}`;
}

function calculateSubtotal(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Math.round(Number(item.unitPriceUgx || item.priceUgx) || 0);
    return sum + Math.round(qty * price);
  }, 0);
}

function calculateCommitment(totalAmount, rule) {
  const total = Math.max(0, Math.round(Number(totalAmount) || 0));
  if (total === 0) return { commitmentAmount: 0, remainingBalance: 0 };

  let commitment = 0;
  const ruleType = rule?.ruleType || 'PERCENTAGE';
  const minCommitment = Math.round(Number(rule?.minCommitment) || 5000);

  if (ruleType === 'FLAT') {
    commitment = Math.round(Number(rule?.flatValueUgx) || 10000);
  } else {
    const percentage = Number(rule?.percentageValue) || 30.0;
    commitment = Math.round((total * percentage) / 100);
  }

  // Ensure commitment doesn't exceed total, but satisfies minCommitment if total allows
  if (total <= minCommitment) {
    commitment = total;
  } else {
    commitment = Math.max(minCommitment, commitment);
    commitment = Math.min(total, commitment);
  }

  const remainingBalance = Math.max(0, total - commitment);

  return {
    commitmentAmount: commitment,
    remainingBalance: remainingBalance,
  };
}

module.exports = {
  formatUGX,
  calculateSubtotal,
  calculateCommitment,
};
