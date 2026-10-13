// Cloudflare Worker that stores thumbs up/down votes in Workers KV.
// Needs: a KV namespace bound as VOTES, and a secret VOTE_KEY (your voting PIN).
// Optional: a variable ALLOWED_ORIGIN, e.g. https://yourname.github.io
//
//   GET  /check  -> {ok:true} if the PIN is right
//   GET  /votes  -> {"bc:123": {"vote": 1, "at": "..."}, ...}
//   POST /vote   {"key": "bc:123", "vote": 1 | -1 | 0}   (0 clears the vote)
//   GET  /saved  -> {"bc:somelabel": {"name": "...", "url": "...", "kind": "label", "at": "..."}, ...}
//   POST /save   {"key": "bc:somelabel", "name": "...", "url": "https://...", "kind": "label" | "artist",
//                 "save": true | false}

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    };
    const reply = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!env.VOTE_KEY || request.headers.get("Authorization") !== `Bearer ${env.VOTE_KEY}`) {
      return reply({ error: "unauthorised" }, 401);
    }

    const path = new URL(request.url).pathname;

    if (path === "/check" && request.method === "GET") return reply({ ok: true });

    const listAll = async (prefix) => {
      const out = {};
      let cursor;
      do {
        const page = await env.VOTES.list({ prefix, cursor });
        for (const k of page.keys) if (k.metadata) out[k.name.slice(prefix.length)] = k.metadata;
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return out;
    };

    if (path === "/votes" && request.method === "GET") return reply(await listAll("v:"));
    if (path === "/saved" && request.method === "GET") return reply(await listAll("s:"));

    if (path === "/save" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return reply({ error: "bad json" }, 400); }
      const { key, name, url, kind, save } = body || {};
      if (typeof key !== "string" || !/^(bc|dg):[a-z0-9.-]{1,100}$/.test(key) || typeof save !== "boolean") {
        return reply({ error: "bad save" }, 400);
      }
      if (!save) {
        await env.VOTES.delete("s:" + key);
        return reply({ ok: true });
      }
      if (typeof url !== "string" || !/^https:\/\/[^\s"<>]{1,300}$/.test(url) || !["label", "artist"].includes(kind)) {
        return reply({ error: "bad save" }, 400);
      }
      const meta = { name: String(name || key).slice(0, 200), url, kind, at: new Date().toISOString() };
      await env.VOTES.put("s:" + key, "", { metadata: meta });
      return reply({ ok: true });
    }

    if (path === "/vote" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return reply({ error: "bad json" }, 400); }
      const { key, vote } = body || {};
      if (typeof key !== "string" || !/^(bc|dg):\d{1,20}$/.test(key) || ![1, -1, 0].includes(vote)) {
        return reply({ error: "bad vote" }, 400);
      }
      if (vote === 0) await env.VOTES.delete("v:" + key);
      else {
        const meta = { vote, at: new Date().toISOString() };
        await env.VOTES.put("v:" + key, "", { metadata: meta });
      }
      return reply({ ok: true });
    }

    return reply({ error: "not found" }, 404);
  },
};
