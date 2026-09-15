import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json"
};

function client(req: Request) {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const auth = req.headers.get("Authorization") || "";
  return createClient(url, key, {
    global: { headers: auth ? { Authorization: auth } : {} },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const sb = client(req);
    const { data: userData, error: userError } = await sb.auth.getUser();
    const user = userData?.user || null;
    if (userError || !user) {
      return new Response(JSON.stringify({ ok: false, error: "authentication_required" }), {
        status: 401, headers: cors
      });
    }

    if (req.method === "GET") {
      const { data, error } = await sb
        .from("tgg_game_idea_inbox")
        .select("id,idea_title,idea_text,status,duplicate_count,retry_count,max_retries,last_error,plan,build_summary,release_id,created_at,updated_at,completed_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const row of data || []) counts[row.status] = (counts[row.status] || 0) + 1;

      return new Response(JSON.stringify({
        ok: true,
        pipeline: counts,
        ideas: data || [],
        boundaries: {
          production_auto_publish: false,
          high_risk_auto_execute: false,
          production_promotion_requires_explicit_approval: true
        }
      }), { status: 200, headers: cors });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const idea = String(body?.idea || "").trim();
      const title = body?.title == null ? null : String(body.title).trim();
      if (idea.length < 3) {
        return new Response(JSON.stringify({ ok: false, error: "idea_required" }), {
          status: 400, headers: cors
        });
      }

      const { data, error } = await sb.rpc("tgg_game_idea_submit", {
        p_idea: idea,
        p_title: title || null,
        p_source: "game-builder-api",
        p_project_id: "7f3f5a4f-e73d-4526-9978-6772e0e81544"
      });
      if (error) throw error;

      return new Response(JSON.stringify({ ok: true, result: data }), {
        status: 200, headers: cors
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405, headers: cors
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }), { status: 400, headers: cors });
  }
});
