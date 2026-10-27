// Cloudflare Worker: tells the app where it is (country, state, city, approx. coordinates).
// Cloudflare already knows this from the connection; nothing is stored or logged here.
// Answers e.g. { "country": "US", "region": "US-CA", "city": "Fresno", "lat": 36.74, "lon": -119.78 }
export default {
  async fetch(request) {
    const cf = request.cf || {};
    const country = cf.country || null;
    const region = country && cf.regionCode ? `${country}-${cf.regionCode}` : null;
    const num = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : null);
    return new Response(
      JSON.stringify({
        country,
        region,
        city: cf.city || null,
        postalCode: cf.postalCode || null,
        lat: num(cf.latitude),
        lon: num(cf.longitude),
      }),
      { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } },
    );
  },
};
