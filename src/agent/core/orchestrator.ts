/**
 * Agent orchestrator — the full RMA intake flow.
 * HELM owns the Neon DB; this agent is a stateless AI orchestrator that calls HELM's API.
 *
 * Flow:
 * 1. Lookup original receipt via HELM API
 * 2. Assess damage photo with SAM 3.1
 * 3. Reason about eligibility with Muse Spark
 * 4. Create RMA transaction via HELM API (HELM handles stock + credit)
 * 5. Draft buyer message with Llama + generate credit memo
 */
import { MetaModelClient } from "../models/meta-api";
import { SamClient } from "../models/sam";
import { RmaReasoner } from "../core/reasoning";
import { helmApi } from "../core/http-client";

export class RmaAgent {
  private meta: MetaModelClient;
  private sam: SamClient;
  private reasoner: RmaReasoner;

  constructor() {
    this.meta = new MetaModelClient();
    this.sam = new SamClient();
    this.reasoner = new RmaReasoner(this.meta);
  }

  /**
   * Full intake flow triggered by the agent.
   */
  async intake({
    receiptNumber,
    damageImage, // base64 string
    buyerName,
    requestedItems, // [{ productId, quantity }]
    sellerId,
    sellerName = "Agent",
  }: {
    receiptNumber: number;
    damageImage?: string;
    buyerName: string;
    requestedItems: Array<{ productId: number; quantity: number }>;
    sellerId?: number;
    sellerName?: string;
  }) {
    // Step 1: Lookup original receipt via HELM API
    let original: any;
    try {
      original = await helmApi.lookupReceipt(receiptNumber);
    } catch {
      throw new Error(`Receipt #${receiptNumber} not found`);
    }

    // Step 2: Assess damage photo with SAM 3.1 (if provided)
    let damageAssessment: any = null;
    if (damageImage) {
      damageAssessment = await this.sam.assessDamage(damageImage);
    }

    // Step 3: Reason about eligibility
    const eligibility = await this.reasoner.assessEligibility({
      originalReceipt: original,
      requestedItems,
      buyerName,
    });

    if (!eligibility.eligible || !eligibility.recommendedType) {
      return {
        status: "rejected",
        reason: eligibility.reason,
        originalReceipt: original,
        damageAssessment,
      };
    }

    const txType = eligibility.recommendedType;

    // Step 4: Build items with prices from original receipt
    const itemsWithPrices = requestedItems.map((item) => {
      const origItem = original.items.find(
        (i: any) => i.productId === item.productId
      );
      const unitPrice = Number(origItem?.unitPrice || 0);
      return {
        productId: item.productId,
        productName: origItem?.productName || `Product #${item.productId}`,
        quantity: item.quantity,
        unitPrice,
        totalPrice: unitPrice * item.quantity,
        costPrice: undefined,
      };
    });

    const grandTotal = itemsWithPrices.reduce(
      (sum, i) => sum + Number(i.totalPrice || 0),
      0
    );

    // Step 5: Create RMA transaction via HELM API (HELM handles stock + credit)
    let created: any;
    try {
      created = await helmApi.createRma({
        buyerName,
        transactionType: txType,
        grandTotal,
        returnForReceiptNumber: receiptNumber,
        isCredit: true,
        sellerId,
        sellerName,
        items: itemsWithPrices,
      });
    } catch (e: any) {
      throw new Error(`RMA creation failed: ${e.message}`);
    }

    // Step 6: Generate credit memo + draft buyer message with Llama
    const memo = this.generateCreditMemo(created, buyerName, itemsWithPrices);
    let buyerMessage = "";
    try {
      buyerMessage = await this.meta.draftBuyerMessage({
        buyerName,
        type: txType,
        receiptNumber: created.receiptNumber,
        grandTotal,
        creditMemoNumber: memo.memoNumber,
      });
    } catch {
      buyerMessage = `Your ${txType.toLowerCase()} has been processed. Credit memo ${memo.memoNumber} issued for ${grandTotal}.`;
    }

    return {
      status: "completed",
      transaction: created,
      buyer: { name: buyerName },
      creditMemo: memo,
      buyerMessage,
      damageAssessment,
      eligibility,
    };
  }

  /**
   * Generate a credit memo (PDF-ready data) for the buyer. Pure function — no DB needed.
   */
  private generateCreditMemo(
    transaction: any,
    buyerName: string,
    items: any[]
  ) {
    return {
      memoNumber: `CM-${transaction.receiptNumber}`,
      originalReceipt: transaction.returnForReceiptNumber,
      date: new Date().toISOString(),
      buyer: { name: buyerName },
      seller: transaction.sellerName,
      type: transaction.transactionType,
      items: items.map((i) => ({
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice || 0),
        totalPrice: Number(i.totalPrice || 0),
      })),
      grandTotal: Number(transaction.grandTotal || 0),
      isCredit: transaction.isCredit,
      creditDueDate: transaction.creditDueDate,
    };
  }
}

export const rmaAgent = new RmaAgent();
