export type BillingMode = "Percent" | "Rupees";

export type BillingLineInput = {
  taxableAmount: number;
  lineTotal: number;
};

export type BillingAdjustmentInput = {
  mode: BillingMode;
  value: number;
};

export type BillingCalculationInput = {
  lines: BillingLineInput[];
  gstRate: number;
  discount: BillingAdjustmentInput;
  tds: BillingAdjustmentInput;
  paidAmount: number;
};

export type BillingCalculationResult = {
  grossAmount: number;
  discountAmount: number;
  discountPercent: number;
  netAmount: number;
  gstAmount: number;
  invoiceAmount: number;
  tdsAmount: number;
  tdsPercent: number;
  finalPayableAmount: number;
  dueAmount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  subtotal: number;
  roundOff: number;
};

function round2(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function safeAmount(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return round2(value);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function calculateAdjustmentAmount(baseAmount: number, mode: BillingMode, value: number) {
  const safeBase = safeAmount(baseAmount);
  const safeValue = safeAmount(value);
  if (!safeBase) {
    return { amount: 0, percent: 0 };
  }
  if (mode === "Rupees") {
    const amount = clamp(safeValue, 0, safeBase);
    const percent = (amount / safeBase) * 100;
    return { amount: round2(amount), percent: round2(percent) };
  }
  const amount = clamp((safeBase * safeValue) / 100, 0, safeBase);
  return { amount: round2(amount), percent: round2(safeValue) };
}

export function calculateBillingSummary(
  input: BillingCalculationInput,
  defaultGstRate = 18
): BillingCalculationResult {
  const gstRate = Number.isFinite(input.gstRate) ? input.gstRate : defaultGstRate;
  const taxableAmount = round2(input.lines.reduce((sum, line) => sum + safeAmount(line.taxableAmount), 0));
  const itemGrossTotal = round2(input.lines.reduce((sum, line) => sum + safeAmount(line.lineTotal), 0));

  // Gross amount is the value before discount, as defined by the billing flow.
  const grossAmount = taxableAmount || itemGrossTotal;

  // Discount is applied before GST so the taxable base shrinks first.
  const discount = calculateAdjustmentAmount(grossAmount, input.discount.mode, input.discount.value);
  const netAmount = round2(Math.max(grossAmount - discount.amount, 0));

  // GST is calculated on the amount remaining after discount.
  const gstAmount = round2(Math.max(netAmount * (gstRate / 100), 0));
  const cgstAmount = round2(gstAmount / 2);
  const sgstAmount = round2(gstAmount / 2);

  // Invoice amount is the amount after GST but before TDS.
  const invoiceAmount = round2(Math.max(netAmount + gstAmount, 0));
  const subtotal = invoiceAmount;

  // TDS is applied on the invoice amount, not on the gross amount.
  const tds = calculateAdjustmentAmount(invoiceAmount, input.tds.mode, input.tds.value);
  const finalPayableAmount = round2(Math.max(invoiceAmount - tds.amount, 0));
  const paidAmount = safeAmount(input.paidAmount);
  const dueAmount = round2(Math.max(finalPayableAmount - paidAmount, 0));
  const roundOff = round2(Math.round(finalPayableAmount) - finalPayableAmount);

  return {
    grossAmount,
    discountAmount: discount.amount,
    discountPercent: discount.percent,
    netAmount,
    gstAmount,
    invoiceAmount,
    tdsAmount: tds.amount,
    tdsPercent: tds.percent,
    finalPayableAmount,
    dueAmount,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    subtotal,
    roundOff,
  };
}
