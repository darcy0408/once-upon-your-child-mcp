/**
 * Thin HTTP client for the Once Upon YOUR Child backend.
 *
 * Every call goes through the same auth + consent gates the Flutter app uses:
 * the backend decides what a given account may generate. This client never
 * bypasses them; it only carries a bearer token.
 */

export interface OuycConfig {
  apiBase: string;
  token?: string;
  clientId?: string;
  defaultVoiceId?: string;
  log?: (msg: string) => void;
}

export interface Hero {
  id: string;
  name: string;
  age?: number | null;
  role?: string | null;
  character_type?: string | null;
  pets?: unknown[];
  comfort_item?: string | null;
  fears?: string[];
  strengths?: string[];
  goals?: string[];
  [key: string]: unknown;
}

export interface Choice {
  id: string;
  choice_number?: number;
  text: string;
}

export interface Segment {
  id: string;
  segment_number: number;
  title?: string | null;
  stage_label?: string | null;
  content: string;
  choices: Choice[];
}

export interface AdventureResult {
  story_id: string;
  title?: string;
  segment: Segment;
  is_completed?: boolean;
  [key: string]: unknown;
}

export interface BedtimeStory {
  title?: string;
  pages?: { text: string }[];
  content?: string;
  story_text?: string;
  text?: string;
  wisdom_gem?: string;
  [key: string]: unknown;
}

export class OuycError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: unknown,
  ) {
    super(message);
  }
}

export class OuycClient {
  private token?: string;
  private refreshToken?: string;
  private readonly log: (msg: string) => void;

  constructor(private readonly cfg: OuycConfig) {
    this.token = cfg.token;
    this.log = cfg.log ?? (() => {});
  }

  get defaultVoiceId(): string | undefined {
    return this.cfg.defaultVoiceId;
  }

  // ── auth ──────────────────────────────────────────────────────────────

  private async ensureToken(): Promise<string> {
    if (this.token) return this.token;
    const body: Record<string, string> = {};
    if (this.cfg.clientId) body.client_id = this.cfg.clientId;
    const res = await fetch(`${this.cfg.apiBase}/auth/anonymous`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || typeof data.token !== "string") {
      throw new OuycError(`anonymous auth failed (${res.status})`, res.status, data);
    }
    this.token = data.token;
    if (typeof data.refresh_token === "string") this.refreshToken = data.refresh_token;
    const issuedId = data.client_id ?? data.user_id ?? data.id;
    if (issuedId && !this.cfg.clientId) {
      this.log(
        `anonymous session created. Set OUYC_CLIENT_ID=${String(issuedId)} to keep the same heroes across restarts.`,
      );
    }
    return this.token;
  }

  private async tryRefresh(): Promise<boolean> {
    if (this.cfg.token) return false; // static token: nothing to refresh
    if (this.refreshToken) {
      const res = await fetch(`${this.cfg.apiBase}/auth/refresh`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.refreshToken}`,
        },
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok && typeof data.token === "string") {
        this.token = data.token;
        if (typeof data.refresh_token === "string") this.refreshToken = data.refresh_token;
        return true;
      }
    }
    this.token = undefined;
    this.refreshToken = undefined;
    await this.ensureToken();
    return true;
  }

  // ── transport ─────────────────────────────────────────────────────────

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    opts: { retry?: boolean; auth?: boolean } = {},
  ): Promise<T> {
    const { retry = true, auth = true } = opts;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (auth) headers.authorization = `Bearer ${await this.ensureToken()}`;
    const res = await fetch(`${this.cfg.apiBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (auth && res.status === 401 && retry && (await this.tryRefresh())) {
      return this.request<T>(method, path, body, { retry: false, auth });
    }
    const data = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      const d = data as Record<string, unknown>;
      const msg =
        (typeof d?.message === "string" && d.message) ||
        (typeof d?.error === "string" && d.error) ||
        `${method} ${path} failed (${res.status})`;
      throw new OuycError(msg, res.status, data);
    }
    return data as T;
  }

  // ── heroes ────────────────────────────────────────────────────────────

  /** GET /get-characters returns a bare JSON array of character dicts. */
  async listHeroes(): Promise<Hero[]> {
    const data = await this.request<unknown>("GET", "/get-characters");
    if (Array.isArray(data)) return data as Hero[];
    const d = data as Record<string, unknown>;
    for (const key of ["characters", "data", "items"]) {
      if (Array.isArray(d[key])) return d[key] as Hero[];
    }
    return [];
  }

  /** Resolve a hero by id or (case-insensitive) name. */
  async findHero(idOrName: string): Promise<Hero | undefined> {
    const heroes = await this.listHeroes();
    const needle = idOrName.trim().toLowerCase();
    return (
      heroes.find((h) => h.id === idOrName) ??
      heroes.find((h) => (h.name ?? "").toLowerCase() === needle) ??
      heroes.find((h) => (h.name ?? "").toLowerCase().startsWith(needle))
    );
  }

  // ── Pick-a-Path adventures ────────────────────────────────────────────

  async startAdventure(params: {
    character_id: string;
    age?: number | null;
    theme?: string;
    tone?: string;
    length?: "short" | "medium" | "long";
    life_challenge?: string;
    big_feelings_context?: Record<string, unknown>;
  }): Promise<AdventureResult> {
    const { age, ...rest } = params;
    return this.request<AdventureResult>("POST", "/generate-interactive-story", {
      ...rest,
      ...(typeof age === "number" ? { age } : {}),
      // Voice-only client: never generate illustrations nobody will see.
      include_images: false,
    });
  }

  async continueAdventure(params: {
    story_id: string;
    choice_id: string;
    custom_text?: string;
  }): Promise<AdventureResult> {
    return this.request<AdventureResult>("POST", "/continue-interactive-story", {
      ...params,
      include_images: false,
    });
  }

  /** Full story with every segment; the last segment holds the open choices. */
  async getAdventure(
    story_id: string,
  ): Promise<{ segments?: Segment[]; is_completed?: boolean; [key: string]: unknown }> {
    return this.request("GET", `/interactive-story/${encodeURIComponent(story_id)}`);
  }

  // ── linear bedtime stories ────────────────────────────────────────────

  async bedtimeStory(params: {
    character_id: string;
    age?: number | null;
    theme?: string;
    feelings_prompt?: string;
    bedtime_duration_minutes?: number;
    bedtime_mood?: string;
    story_length?: string;
  }): Promise<BedtimeStory> {
    const { age, ...rest } = params;
    const first = await this.request<{
      status?: string;
      story?: BedtimeStory;
      task_id?: string;
      poll_url?: string;
    }>("POST", "/generate-story", {
      ...rest,
      ...(typeof age === "number" ? { age } : {}),
      bedtime_mode: true,
      include_illustrations: false,
      async_illustrations: false,
    });
    if (first.story && Object.keys(first.story).length > 0) return first.story;
    if (!first.task_id || first.task_id === "sync_task") {
      throw new OuycError("generate-story returned no story and no task id", undefined, first);
    }
    return this.pollStory(first.task_id);
  }

  private async pollStory(taskId: string, timeoutMs = 150_000): Promise<BedtimeStory> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2500));
      const s = await this.request<{
        status?: string;
        result?: { story?: BedtimeStory } & BedtimeStory;
        error?: string;
      }>("GET", `/task-status/${encodeURIComponent(taskId)}`);
      if (s.status === "complete") {
        const r = s.result ?? {};
        return (r.story ?? r) as BedtimeStory;
      }
      if (s.status === "failed") {
        throw new OuycError(s.error ?? "story generation failed", undefined, s);
      }
    }
    throw new OuycError(`story generation timed out after ${timeoutMs / 1000}s`);
  }

  // ── narration ─────────────────────────────────────────────────────────

  async synthesize(params: {
    text: string;
    voice_id?: string;
    speed?: number;
  }): Promise<{ audio_base64: string; voice_id?: string; provider?: string }> {
    return this.request("POST", "/tts/synthesize", {
      text: params.text,
      voice_id: params.voice_id ?? this.cfg.defaultVoiceId,
      speed: params.speed,
    });
  }

  /** Public endpoint: no token needed, so this never creates an account. */
  async listVoices(): Promise<{ voices: { id: string; name: string }[]; default_voice_id: string }> {
    return this.request("GET", "/tts/voices", undefined, { auth: false });
  }
}
