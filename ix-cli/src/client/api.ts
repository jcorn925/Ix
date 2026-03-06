import type {
  CommitResult,
  StructuredContext,
  GraphNode,
  HealthResponse,
  PatchSummary,
} from "./types.js";

export class IxClient {
  constructor(private endpoint: string = "http://localhost:8090") {}

  async query(
    question: string,
    opts?: { asOfRev?: number; depth?: string }
  ): Promise<StructuredContext> {
    console.log("CLI depth:", opts?.depth);
    return this.post("/v1/context", { query: question, ...opts });
  }

  async ingest(path: string, recursive?: boolean): Promise<CommitResult> {
    return this.post("/v1/ingest", { path, recursive });
  }

  async decide(
    title: string,
    rationale: string,
    opts?: { intentId?: string }
  ): Promise<{ status: string; nodeId: string; rev: number }> {
    return this.post("/v1/decide", { title, rationale, ...opts });
  }

  async search(term: string, limit?: number): Promise<GraphNode[]> {
    return this.post("/v1/search", { term, limit });
  }

  async entity(id: string): Promise<{
    node: GraphNode;
    claims: unknown[];
    edges: unknown[];
  }> {
    return this.get(`/v1/entity/${id}`);
  }

  async listTruth(): Promise<GraphNode[]> {
    return this.get("/v1/truth");
  }

  async createTruth(
    statement: string,
    parentIntent?: string
  ): Promise<{ status: string; nodeId: string; rev: number }> {
    return this.post("/v1/truth", { statement, parentIntent });
  }

  async listPatches(): Promise<PatchSummary[]> {
    return this.get("/v1/patches");
  }

  async getPatch(id: string): Promise<unknown> {
    return this.get(`/v1/patches/${id}`);
  }

  async diff(
    fromRev: number,
    toRev: number,
    entityId?: string
  ): Promise<unknown> {
    return this.post("/v1/diff", { fromRev, toRev, entityId });
  }

  async conflicts(): Promise<unknown[]> {
    return this.get("/v1/conflicts");
  }

  async provenance(entityId: string): Promise<unknown> {
    return this.post(`/v1/provenance/${entityId}`, {});
  }

  async health(): Promise<HealthResponse> {
    return this.get("/v1/health");
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const resp = await fetch(`${this.endpoint}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`${resp.status}: ${text}`);
    }
    return resp.json() as Promise<T>;
  }

  private async get<T>(path: string): Promise<T> {
    const resp = await fetch(`${this.endpoint}${path}`);
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`${resp.status}: ${text}`);
    }
    return resp.json() as Promise<T>;
  }
}
