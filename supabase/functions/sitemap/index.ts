import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SITE_URL = Deno.env.get("SITE_URL") || "https://japaspesca.com.br";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: products, error } = await supabase
      .from("products")
      .select("id, updated_at")
      .order("updated_at", { ascending: false })
      .limit(5000);

    if (error) throw error;

    const today = new Date().toISOString().split("T")[0];

    const staticUrls = [
      { loc: `${SITE_URL}/`, priority: "1.0", changefreq: "daily" },
      { loc: `${SITE_URL}/produtos`, priority: "0.9", changefreq: "daily" },
    ];

    const productUrls = (products || []).map((p) => ({
      loc: `${SITE_URL}/produto/${p.id}`,
      lastmod: (p.updated_at || today).split("T")[0],
      priority: "0.8",
      changefreq: "weekly",
    }));

    const urls = [
      ...staticUrls.map(
        (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
      ),
      ...productUrls.map(
        (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
      ),
    ].join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><error>${(err as Error).message}</error>`,
      { status: 500, headers: { "Content-Type": "application/xml" } }
    );
  }
});
