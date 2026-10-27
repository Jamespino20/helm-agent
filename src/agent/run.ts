/**
 * Agent entry point — runs a demo intake flow.
 * Usage: npx tsx src/agent/run.ts
 */
import { rmaAgent } from "./core/orchestrator";
import { prisma } from "../server";

async function main() {
  console.log("🤖 HELM RMA Agent starting...");

  // Example: process a return for receipt #1001
  try {
    const result = await rmaAgent.intake({
      receiptNumber: 1001,
      buyerName: "Juan Dela Cruz",
      requestedItems: [
        { productId: 1, quantity: 2 },
      ],
      sellerId: 1,
      sellerName: "Maria Santos",
    });

    console.log("\n✅ Intake result:");
    console.log(JSON.stringify(result, null, 2));
  } catch (e: any) {
    console.error("❌ Intake failed:", e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
