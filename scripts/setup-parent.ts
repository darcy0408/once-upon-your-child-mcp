/**
 * One-time setup for a demo parent account.
 *
 * 1. Mints an anonymous session (the same mechanism the Flutter app uses).
 * 2. Declares an adult age on it, so it is a parent account, not a child's.
 * 3. Creates one hero so the story tools have someone to write about.
 *
 * Prints the OUYC_TOKEN / OUYC_CLIENT_ID lines to paste into .env.
 *
 *   npx tsx scripts/setup-parent.ts
 */
import "dotenv/config";

const API = (process.env.OUYC_API_BASE ?? "https://story-weaver-app-production.up.railway.app").replace(/\/+$/, "");
const PARENT_AGE = Number(process.env.SETUP_PARENT_AGE ?? 38);

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(`${API}${path}`, {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(rest.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${body.error ?? body.message ?? JSON.stringify(body)}`);
  return body;
}

const auth = await call<{ token: string; refresh_token: string; user_id: string }>("/auth/anonymous", {
  method: "POST",
  body: JSON.stringify(process.env.OUYC_CLIENT_ID ? { client_id: process.env.OUYC_CLIENT_ID } : {}),
});
console.log(`account: ${auth.user_id}`);

const age = await call<{ declared_age: number; is_under_13: boolean }>(`/api/user/${auth.user_id}/age`, {
  method: "PATCH",
  token: auth.token,
  body: JSON.stringify({ age: PARENT_AGE }),
});
console.log(`declared age ${age.declared_age}, under 13: ${age.is_under_13}`);

const existing = await call<{ id: string; name: string }[]>("/get-characters", { token: auth.token });
if (existing.length === 0) {
  const hero = await call<{ id?: string; character?: { id: string } }>("/create-character", {
    method: "POST",
    token: auth.token,
    body: JSON.stringify({
      name: "Maya",
      age: 6,
      gender: "girl",
      role: "Brave Explorer",
      hair: "curly brown",
      eyes: "brown",
      outfit: "yellow raincoat",
      comfort_item: "a blue blanket named Bloo",
      strengths: ["kind", "curious"],
      fears: ["deep water"],
      goals: ["learn to swim"],
      // The story engine reads pet.species / pet.personality / pet.color.
      pets: [{ name: "Pip", species: "star dog", personality: "playful", color: "silver" }],
    }),
  });
  console.log(`hero created: ${JSON.stringify(hero).slice(0, 200)}`);
} else {
  console.log(`heroes already present: ${existing.map((h) => h.name).join(", ")}`);
}

console.log("\nPaste into .env (the client id is the one that matters; tokens expire):");
console.log(`OUYC_CLIENT_ID=${auth.user_id}`);
console.log(`OUYC_REFRESH_TOKEN=${auth.refresh_token}`);
console.log(`OUYC_TOKEN=${auth.token}`);
