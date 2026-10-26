// Cloudflare Worker: tells the app which country and state/province it is in.
// Cloudflare already knows this from the connection; nothing is stored or logged here.
// Answers e.g. { "country": "US", "region": "US-CA" }
export default {
  async fetch(request) {
    const cf = request.cf || {};
    const country = cf.country || null;
    const region = country && cf.regionCode ? `${country}-${cf.regionCode}` : null;
    return new Response(JSON.stringify({ country, region }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  },
};
