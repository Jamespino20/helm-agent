/**
 * HTTP client for calling HELM's agent-facing REST API.
 * HELM owns the Neon DB; the agent is a stateless AI orchestrator.
 */
const BASE = process.env.HELM_API_URL || "https://metahackathon-helm.vercel.app";
const SECRET = process.env.AGENT_API_SECRET;

async function helmFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      ...(opts?.headers || {}),
      Authorization: `Bearer ${SECRET}`,
    },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `HELM API ${res.status}`);
  }
  return res.json();
}

export const helmApi = {
  lookupReceipt: (receiptNumber: number) =>
    helmFetch(`/api/transactions/receipt/${receiptNumber}`),
  createRma: (body: any) => helmFetch("/api/rma", { method: "POST", body: JSON.stringify(body) }),
};
