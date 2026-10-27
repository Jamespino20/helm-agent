/**
 * Agent orchestrator — the full RMA intake flow.
 * 1. Lookup original receipt
 * 2. Assess damage photo with SAM 3.1
 * 3. Reason about eligibility with Muse Spark
 * 4. Create transaction + adjust stock + settle credit
 * 5. Draft buyer message with Llama
 * 6. Generate credit memo PDF data
 */
import { prisma } from "../../server";
import { MetaModelClient } from "../models/meta-api";
import { SamClient } from "../models/sam";
import { RmaReasoner } from "../core/reasoning";
import { applyStockChanges, settleCredit, generateCreditMemo } from "../core/intake";

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
    damageImage, // base64 or Buffer
    buyerName,
    requestedItems, // [{ productId, quantity }]
    sellerId,
    sellerName = "Agent",
  }: {
    receiptNumber: number;
    damageImage?: string | Buffer;
    buyerName: string;
    requestedItems: Array<{ productId: number; quantity: number }>;
    sellerId?: number;
    sellerName?: string;
  }) {
    // Step 1: Lookup original receipt
    const original = await prisma.transaction.findFirst({
      where: { receiptNumber },
      include: { items: true },
    });
    if (!original) throw new Error(`Receipt #${receiptNumber} not found`);

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

    // Step 4: Build transaction data
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

    // Step 5: Create transaction via Prisma (agent writes directly to schema)
    const lastReceipt = await prisma.transaction.findFirst({
      orderBy: { receiptNumber: "desc" },
      select: { receiptNumber: true },
    });
    const newReceiptNumber = (lastReceipt?.receiptNumber ?? 1000) + 1;

    const transaction = await prisma.transaction.create({
      data: {
        receiptNumber: newReceiptNumber,
        buyerName,
        transactionType: eligibility.recommendedType,
        transactionStatus: "Completed",
        transactionDate: new Date(),
        grandTotal,
        sellerId,
        sellerName,
        returnForReceiptNumber: receiptNumber,
        isCredit: true, // RMA typically issues credit
        creditDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
      include: { items: true },
    });

    // Create transaction items
    await prisma.transactionItem.createMany({
      data: itemsWithPrices.map((i) => ({
        transactionId: transaction.id,
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalPrice: i.totalPrice,
      })),
    });

    // Apply stock changes
    await applyStockChanges(txType, requestedItems);

    // Settle credit
    let buyer = await prisma.buyer.findFirst({ where: { name: buyerName } });
    if (!buyer) {
      buyer = await prisma.buyer.create({
        data: { name: buyerName, totalOrders: 1, totalSpent: 0 },
      });
    }
    await settleCredit(buyer.id, txType, grandTotal);

    // Link buyer to transaction
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { buyerId: buyer.id },
    });

    // Step 6: Draft buyer message with Llama
    const memo = await generateCreditMemo(transaction, buyer, itemsWithPrices);
    let buyerMessage = "";
    try {
      buyerMessage = await this.meta.draftBuyerMessage({
        buyerName,
        type: txType,
        receiptNumber: newReceiptNumber,
        grandTotal,
        creditMemoNumber: memo.memoNumber,
      });
    } catch {
      buyerMessage = `Your ${txType.toLowerCase()} has been processed. Credit memo ${memo.memoNumber} issued for ${grandTotal}.`;
    }

    return {
      status: "completed",
      transaction,
      buyer,
      creditMemo: memo,
      buyerMessage,
      damageAssessment,
      eligibility,
    };
  }
}

export const rmaAgent = new RmaAgent();
