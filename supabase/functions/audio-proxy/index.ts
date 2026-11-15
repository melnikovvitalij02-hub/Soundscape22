const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, Range",
};

type TrackMeta = { title: string; artist: string };

const TRACKS: Record<string, TrackMeta> = {
  igotu: { title: "I GOT U", artist: "Toxis" },
  malo: { title: "Мало 2.0", artist: "Егор Крид" },
  tonu: { title: "Тону", artist: "HOLLYFLAME" },
  lada: { title: "Малиновая Лада", artist: "GAYAZOV BROTHERS" },
  baram: { title: "По барам", artist: "ANNA ASTI" },
  sleza: { title: "Слеза", artist: "Егор Крид" },
  baloo: { title: "BALOO", artist: "Бодя Мир642" },
  basta: { title: "Если я буду танцевать", artist: "Баста" },
  gaz: { title: "GAZ", artist: "Zivert" },
  charlie: { title: "We Don't Talk Anymore", artist: "Charlie Puth" },
  orly: { title: "Орлы или вороны", artist: "Григорий Лепс" },
  avemaria: { title: "Ave Maria", artist: "Димаш Кудайберген" },
  rozhdestvo: { title: "Так хочется жить", artist: "Рождество" },
  sansara: { title: "Сансара", artist: "Баста" },
  bilan: { title: "Как хотел я", artist: "Дима Билан" },
  milyy: { title: "Милый негодяй", artist: "Егор Крид" },
  cuefa: { title: "Я тебя могну", artist: "ЦУЕФА" },
  dora: { title: "Знак", artist: "Дора" },
  ogbuda: { title: "101 причина", artist: "OG Buda" },
  turov: { title: "Ненавидеть", artist: "Давид Туров" },
  nextime: { title: "Кис Ю", artist: "NEXTIME" },
  deya: { title: "Нарисуй", artist: "Дэя" },
  koldun_pochemu: { title: "Почему", artist: "Дмитрий Колдун" },
  koldun_pes: { title: "Пёс бродячий", artist: "Дмитрий Колдун" },
  mot: { title: "Оставив сердце в Москве", artist: "МОТ" },
  icegergert: { title: "Императрица", artist: "ICEGERGERT" },
};

const previewCache = new Map<string, string>();

function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]/g, "");
}

type PreviewCandidate = { title?: string; preview?: string };

function pickExactTitle(candidates: PreviewCandidate[], title: string): string | null {
  const wanted = normalize(title);
  const match = candidates.find((c) => c.preview && normalize(c.title || "") === wanted);
  return match?.preview || null;
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
      if (!response.ok) return null;
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

async function findPreviewUrl(meta: TrackMeta): Promise<string | null> {
  const term = encodeURIComponent(`${meta.artist} ${meta.title}`);
  const itunes = await fetchJson(`https://itunes.apple.com/search?media=music&entity=song&limit=25&term=${term}`) as
    | { results?: { trackName?: string; previewUrl?: string }[] }
    | null;
  const itunesMatch = pickExactTitle(
    (itunes?.results || []).map((r) => ({ title: r.trackName, preview: r.previewUrl })),
    meta.title,
  );
  if (itunesMatch) return itunesMatch;

  const deezer = await fetchJson(`https://api.deezer.com/search?q=${term}&limit=25`) as
    | { data?: { title?: string; preview?: string }[] }
    | null;
  return pickExactTitle(deezer?.data || [], meta.title);
}

async function fetchPreviewAudio(url: string, range: string | null): Promise<Response | null> {
  const headers: Record<string, string> = { Accept: "audio/*,*/*" };
  if (range) headers.Range = range;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      return response.ok || response.status === 206 ? response : null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const trackKey = new URL(request.url).searchParams.get("track");
    const meta = trackKey ? TRACKS[trackKey] : undefined;
    if (!trackKey || !meta) {
      return new Response("Track not found", { status: 404, headers: corsHeaders });
    }

    const previewUrl = previewCache.get(trackKey) ?? (await findPreviewUrl(meta));
    if (!previewUrl) {
      return new Response(
        JSON.stringify({ error: "Preview not available", track: trackKey }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    previewCache.set(trackKey, previewUrl);

    const upstream = await fetchPreviewAudio(previewUrl, request.headers.get("Range"));
    if (!upstream) {
      previewCache.delete(trackKey);
      return new Response(
        JSON.stringify({ error: "Preview stream unavailable", track: trackKey }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": upstream.headers.get("Content-Type") || "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    };
    const length = upstream.headers.get("Content-Length");
    const contentRange = upstream.headers.get("Content-Range");
    if (length) responseHeaders["Content-Length"] = length;
    if (contentRange) responseHeaders["Content-Range"] = contentRange;

    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    console.error("Audio proxy error:", error);
    return new Response(
      JSON.stringify({ error: "Audio service unavailable" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
