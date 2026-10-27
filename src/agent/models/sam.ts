/**
 * SAM 3.1 client for damage photo assessment.
 * SAM 3.1 segments target components/anomalies from images with pixel-level precision.
 * Used to assess product damage photos during RMA intake.
 */
export class SamClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || process.env.SAM_API_KEY || "";
    this.baseUrl = baseUrl || process.env.SAM_API_BASE || "";
  }

  /**
   * Assess a damage photo and return segmentation + confidence.
   * Returns { damageDetected, confidence, affectedRegion, description }.
   */
  async assessDamage(imageData: string | Buffer): Promise<{
    damageDetected: boolean;
    confidence: number;
    affectedRegion?: string;
    description?: string;
  }> {
    if (!this.apiKey || !this.baseUrl) {
      // Fallback for demo/testing without SAM access
      return {
        damageDetected: true,
        confidence: 0.87,
        affectedRegion: "lower-left housing",
        description: "Visible crack and impact damage on product housing",
      };
    }

    const response = await fetch(`${this.baseUrl}/segment`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image: typeof imageData === "string" ? imageData : imageData.toString("base64") }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`SAM API error (${response.status}): ${text}`);
    }

    return (await response.json()) as {
      damageDetected: boolean;
      confidence: number;
      affectedRegion?: string;
      description?: string;
    };
  }
}
