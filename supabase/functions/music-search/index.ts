import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const query = url.searchParams.get("q") || "";

    if (!query.trim()) {
      return new Response(
        JSON.stringify({ results: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=24`;
    const response = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "iTunes API unavailable", status: response.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const tracks = (data.results || [])
      .filter((r: Record<string, unknown>) => r.previewUrl)
      .map((r: Record<string, unknown>) => ({
        id: String(r.trackId || r.collectionId || Math.random()),
        title: String(r.trackName || "Без названия"),
        artist: String(r.artistName || "Неизвестен"),
        cover: r.artworkUrl100 ? String(r.artworkUrl100).replace("100x100", "300x300") : undefined,
        url: String(r.previewUrl),
        albumId: String(r.collectionId || r.collectionName || "single"),
        albumName: String(r.collectionName || "Синглы"),
        releaseDate: String(r.releaseDate || "1900-01-01"),
      }));

    return new Response(
      JSON.stringify({ results: tracks }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
