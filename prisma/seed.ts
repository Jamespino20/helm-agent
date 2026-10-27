/**
 * Mock data generator for fresh-demo testing.
 * Seeds the stripped schema with realistic hardware-store data so the agent
 * can be demonstrated end-to-end without touching the live HELM database.
 */
import { prisma } from "../server";

const PRODUCTS = [
  { productName: "Claw Hammer 16oz", category: "Tools", supplierName: "Ace Hardware Supply", brandName: "Stanley", sellingPrice: 349.00, unitPrice: 180.00, quantity: 45, minThreshold: 10 },
  { productName: "Philips Screwdriver Set", category: "Tools", supplierName: "Ace Hardware Supply", brandName: "Philips", sellingPrice: 249.00, unitPrice: 120.00, quantity: 30, minThreshold: 5 },
  { productName: "PVC Pipe 1/2in x 10ft", category: "Plumbing", supplierName: "Builders Depot", brandName: "Local", sellingPrice: 180.00, unitPrice: 95.00, quantity: 100, minThreshold: 20 },
  { productName: "Electrical Tape Roll", category: "Electrical", supplierName: "Ace Hardware Supply", brandName: "3M", sellingPrice: 85.00, unitPrice: 40.00, quantity: 120, minThreshold: 30 },
  { productName: "Paint Brush 2in", category: "Paint", supplierName: "Builders Depot", brandName: "Purdy", sellingPrice: 150.00, unitPrice: 75.00, quantity: 60, minThreshold: 15 },
  { productName: "Door Knob Brass", category: "Hardware", supplierName: "Ace Hardware Supply", brandName: "Kwikset", sellingPrice: 850.00, unitPrice: 420.00, quantity: 25, minThreshold: 5 },
  { productName: "Water Faucet Chrome", category: "Plumbing", supplierName: "Builders Depot", brandName: "American Standard", sellingPrice: 1200.00, unitPrice: 650.00, quantity: 18, minThreshold: 5 },
  { productName: "Circuit Breaker 20A", category: "Electrical", supplierName: "Ace Hardware Supply", brandName: "Square D", sellingPrice: 650.00, unitPrice: 320.00, quantity: 40, minThreshold: 10 },
];

const SUPPLIERS = [
  { supplierName: "Ace Hardware Supply", contactName: "Reyes Trading", contactNumber: "0917-123-4567", email: "sales@acehardware.ph", address: "Quezon City, Metro Manila", tin: "123-456-789-000" },
  { supplierName: "Builders Depot", contactName: "Santos Construction Supply", contactNumber: "0918-234-5678", email: "orders@buildersdepot.ph", address: "Cebu City, Cebu", tin: "234-567-890-000" },
];

const BUYERS = [
  { name: "Juan Dela Cruz", email: "juan.dcruz@gmail.com", phone: "0917-111-2222", address: "123 Mabini St, Manila", creditBalance: 0, totalOrders: 3, totalSpent: 5200.00 },
  { name: "Maria Santos", email: "maria.santos@yahoo.com", phone: "0918-333-4444", address: "456 Rizal Ave, Quezon City", creditBalance: 0, totalOrders: 5, totalSpent: 8900.00 },
];

// Original sale transactions (walk-in sales that can be returned)
const ORIGINAL_SALES = [
  {
    receiptNumber: 1001,
    buyerName: "Juan Dela Cruz",
    transactionType: "SaleWalkIn" as const,
    grandTotal: 698.00,
    items: [
      { productName: "Claw Hammer 16oz", quantity: 2, unitPrice: 349.00, totalPrice: 698.00 },
    ],
  },
  {
    receiptNumber: 1002,
    buyerName: "Maria Santos",
    transactionType: "SaleWalkIn" as const,
    grandTotal: 2050.00,
    items: [
      { productName: "Water Faucet Chrome", quantity: 1, unitPrice: 1200.00, totalPrice: 1200.00 },
      { productName: "PVC Pipe 1/2in x 10ft", quantity: 3, unitPrice: 180.00, totalPrice: 540.00 },
      { productName: "Electrical Tape Roll", quantity: 2, unitPrice: 85.00, totalPrice: 170.00 },
    ],
  },
  {
    receiptNumber: 1003,
    buyerName: "Juan Dela Cruz",
    transactionType: "SaleWalkIn" as const,
    grandTotal: 1000.00,
    items: [
      { productName: "Door Knob Brass", quantity: 1, unitPrice: 850.00, totalPrice: 850.00 },
      { productName: "Paint Brush 2in", quantity: 1, unitPrice: 150.00, totalPrice: 150.00 },
    ],
  },
];

async function main() {
  console.log("🌱 Seeding mock data for HELM agent demo...");

  // Create users
  const user = await prisma.user.create({
    data: { name: "Maria Santos", username: "msantos", role: "STAFF" },
  });
  console.log(`  ✓ User: ${user.name}`);

  // Create suppliers
  for (const s of SUPPLIERS) {
    await prisma.supplier.create({ data: s });
  }
  console.log(`  ✓ Suppliers: ${SUPPLIERS.length}`);

  // Create products (link to suppliers by name)
  const supplierMap = new Map(
    (await prisma.supplier.findMany()).map((s) => [s.supplierName, s.id])
  );
  for (const p of PRODUCTS) {
    await prisma.product.create({
      data: {
        ...p,
        supplierId: supplierMap.get(p.supplierName) || null,
      },
    });
  }
  console.log(`  ✓ Products: ${PRODUCTS.length}`);

  // Create buyers
  for (const b of BUYERS) {
    await prisma.buyer.create({ data: b });
  }
  console.log(`  ✓ Buyers: ${BUYERS.length}`);

  // Create original sale transactions (so returns have something to reference)
  // We set them as SaleWalkIn but the stripped schema only has Return/Damage/Adjustment.
  // For the demo, we create them as "Completed" with a pseudo-type note.
  // Since the stripped schema doesn't include SaleWalkIn, we create placeholder
  // transactions that the RMA flow references via returnForReceiptNumber.
  for (const sale of ORIGINAL_SALES) {
    const tx = await prisma.transaction.create({
      data: {
        receiptNumber: sale.receiptNumber,
        buyerName: sale.buyerName,
        sellerId: user.id,
        sellerName: user.name,
        transactionType: "Adjustment", // placeholder — original sale type
        transactionStatus: "Completed",
        transactionDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        grandTotal: sale.grandTotal,
        paymentMethod: "Cash",
        isCredit: false,
      },
      include: { items: true },
    });
    for (const item of sale.items) {
      await prisma.transactionItem.create({
        data: {
          transactionId: tx.id,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        },
      });
    }
  }
  console.log(`  ✓ Original sales: ${ORIGINAL_SALES.length}`);

  console.log("\n✅ Mock data seeded. You can now run the agent demo.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
