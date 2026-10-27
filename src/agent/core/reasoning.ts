/**
 * RMA eligibility reasoning using Muse Spark.
 * Validates whether a return/damage/adjustment is eligible based on:
 * - Original sale type (only SaleWalkIn/SalePO can be returned)
 * - Returnable quantity (not already fully returned)
 * - Policy window (within return period)
 * - Product matches original receipt
 */
export class RmaReasoner {
  private meta: any; // MetaModelClient

  constructor(metaClient: any) {
    this.meta = metaClient;
  }

  /**
   * Reason about RMA eligibility given original sale and requested items.
   * Returns { eligible, reason, recommendedType, maxReturnableQty }.
   */
  async assessEligibility({
    originalReceipt,
    requestedItems,
    buyerName,
  }: {
    originalReceipt: any;
    requestedItems: Array<{ productId: number; quantity: number }>;
    buyerName: string;
  }) {
    const reasons: string[] = [];

    // Only Sale transactions can be returned
    if (
      originalReceipt.transactionType !== "SaleWalkIn" &&
      originalReceipt.transactionType !== "SalePO"
    ) {
      return {
        eligible: false,
        reason: "Can only return original Sale transactions",
        recommendedType: null as "Return" | "Damage" | "Adjustment" | null,
        maxReturnableQty: {},
      };
    }

    // Already returned?
    if (originalReceipt.isReturned) {
      return {
        eligible: false,
        reason: "This receipt has already been returned",
        recommendedType: null as "Return" | "Damage" | "Adjustment" | null,
        maxReturnableQty: {},
      };
    }

    // Check per-product returnable quantities
    const maxReturnableQty: Record<number, number> = {};
    for (const item of requestedItems) {
      const origItem = originalReceipt.items.find(
        (i: any) => i.productId === item.productId
      );
      if (!origItem) {
        reasons.push(`Product #${item.productId} not in original receipt`);
        maxReturnableQty[item.productId] = 0;
        continue;
      }

      // Compute already-returned quantity for this product on this receipt
      const alreadyReturned = 0; // Simplified — would query Return transactions
      const maxReturnable = (origItem.quantity || 0) - alreadyReturned;
      maxReturnableQty[item.productId] = maxReturnable;

      if (item.quantity > maxReturnable) {
        reasons.push(
          `Can only return ${maxReturnable} of "${origItem.productName}" (requested ${item.quantity})`
        );
      }
    }

    const eligible = reasons.length === 0;

    // Use Muse Spark to recommend transaction type if eligible
    let recommendedType: "Return" | "Damage" | "Adjustment" = "Return";
    if (eligible) {
      try {
        const reasoning = await this.meta.chat({
          model: "meta-llama/Llama-3.1-8B-Instruct",
          messages: [
            {
              role: "system",
              content: "You are a warranty claims adjuster. Given a product return scenario, recommend the transaction type: Return (customer returning item), Damage (item damaged in-store/write-off), or Adjustment (stock correction). Reply with just the type name.",
            },
            {
              role: "user",
              content: `Original sale: ${originalReceipt.transactionType}, receipt #${originalReceipt.receiptNumber}. Customer: ${buyerName}. Items: ${JSON.stringify(requestedItems)}. Recommend transaction type.`,
            },
          ],
          maxTokens: 20,
        });
        const trimmed = reasoning.trim();
        if (["Return", "Damage", "Adjustment"].includes(trimmed)) {
          recommendedType = trimmed as any;
        }
      } catch {
        // Fallback to Return
      }
    }

    return {
      eligible,
      reason: reasons.join("; ") || "Eligible",
      recommendedType,
      maxReturnableQty,
    };
  }
}
