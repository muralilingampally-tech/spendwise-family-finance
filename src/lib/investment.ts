/**
 * Investment sub groups carry a direction: "Amount Invested" is money going
 * out (negative) and "Amount Realized" is money coming back (positive), so
 * every investment figure we report is the net of the two.
 */
export function investmentDirection(subGroupName: string | null | undefined): 1 | -1 {
  return /realis|realiz|redeem|matur|withdraw/i.test(subGroupName ?? "") ? 1 : -1;
}

/** Signed amount for an investment row: realized positive, invested negative. */
export function signedInvestment(subGroupName: string | null | undefined, amount: number): number {
  return investmentDirection(subGroupName) * Math.abs(Number(amount) || 0);
}
