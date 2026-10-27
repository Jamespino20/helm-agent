import { prisma } from "../../server";

/**
 * Apply stock changes based on transaction type.
 * Mirrors HELM's applyStockChanges logic but stripped to RMA types.
 */
export async function applyStockChanges(
  type: "Return" | "Damage" | "Adjustment",
  items: { productId: number; quantity: number }[]
) {
  for (const item of items) {
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: item.productId },
    });
    let newQty = product.quantity;

    switch (type) {
      case "Damage":
        newQty = product.quantity - item.quantity;
        if (newQty < 0) {
          throw new Error(
            `Insufficient stock for "${product.productName}" (have ${product.quantity}, need ${item.quantity})`
          );
        }
        break;
      case "Return":
        newQty = product.quantity + item.quantity;
        break;
      case "Adjustment":
        newQty = item.quantity; // absolute override
        break;
    }

    await prisma.product.update({
      where: { id: item.productId },
      data: { quantity: newQty, isAvailable: newQty > 0 },
    });
  }
}

/**
 * Adjust buyer credit balance.
 * Return decrements (refund), Damage/Adjustment don't affect totalSpent.
 */
export async function settleCredit(
  buyerId: number,
  type: "Return" | "Damage" | "Adjustment",
  grandTotal: number
) {
  const isReturn = type === "Return";
  await prisma.buyer.update({
    where: { id: buyerId },
    data: {
      creditBalance: isReturn ? { decrement: grandTotal } : { increment: 0 },
    },
  });
}

/**
 * Generate a credit memo (PDF-ready data) for the buyer.
 */
export async function generateCreditMemo(
  transaction: any,
  buyer: any,
  items: any[]
) {
  const memo = {
    memoNumber: `CM-${transaction.receiptNumber}`,
    originalReceipt: transaction.returnForReceiptNumber,
    date: new Date().toISOString(),
    buyer: {
      name: buyer.name,
      address: buyer.address,
      contact: buyer.phone,
    },
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
  return memo;
}
