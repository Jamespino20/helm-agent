/**
 * Meta Model API client.
 * Accepted participants get $150 credits. Requires a credit card on file for pre-auth.
 */
export class MetaModelClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || process.env.META_MODEL_API_KEY || "";
    this.baseUrl = baseUrl || process.env.META_MODEL_API_BASE || "https://api.meta.com/llama/v1";
  }

  async chat({
    model = "meta-llama/Llama-3.1-8B-Instruct",
    messages,
    temperature = 0.3,
    maxTokens = 500,
  }: {
    model?: string;
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }) {
    if (!this.apiKey) {
      throw new Error("META_MODEL_API_KEY not configured");
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Meta Model API error (${response.status}): ${text}`);
    }

    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || "";
  }

  /**
   * Draft a buyer message for a credit memo / return notification.
   */
  async draftBuyerMessage({
    buyerName,
    type,
    receiptNumber,
    grandTotal,
    creditMemoNumber,
  }: {
    buyerName: string;
    type: "Return" | "Damage" | "Adjustment";
    receiptNumber: number;
    grandTotal: number;
    creditMemoNumber: string;
  }) {
    return this.chat({
      model: "meta-llama/Llama-3.1-8B-Instruct",
      messages: [
        {
          role: "system",
          content: "You are a professional customer service agent for a hardware store. Write a concise, friendly credit memo / return notification message to a buyer.",
        },
        {
          role: "user",
          content: `Draft a message to customer ${buyerName} regarding a ${type.toLowerCase()} transaction (receipt #${receiptNumber}, credit memo ${creditMemoNumber}, amount ${grandTotal}). Keep it under 100 words.`,
        },
      ],
    });
  }
}
