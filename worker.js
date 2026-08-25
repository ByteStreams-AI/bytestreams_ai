const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    return routeRequest(request, env, url);
  },

  // Cron: 08:00 UTC daily. Generation runs first so a bill created today is picked
  // up by the reminder pass in the same run.
  async scheduled(_event, env) {
    await generateRecurringBilling(env);
    await sendUpcomingBillReminders(env);
  }
};

async function routeRequest(request, env, url) {
  // Explicit handlers for known dynamic paths.
  if (url.pathname === '/robots.txt') {
    return handleRobots(url);
  }

  if (url.pathname === '/favicon.ico') {
    return handleFavicon(request, env);
  }

  if (url.pathname === '/.well-known/security.txt') {
    return handleSecurityTxt();
  }

  if (url.pathname === '/sitemap.xml') {
    return handleSitemap(url);
  }

  if (url.pathname === '/api/contact') {
    return handleContact(request, env);
  }

  // ── Portal (customer) ──────────────────────────────────────────────────────
  if (url.pathname === '/api/portal/config' && request.method === 'GET') {
    return handlePortalConfig(env);
  }
  if (url.pathname === '/api/portal/me' && request.method === 'GET') {
    return handlePortalMe(request, env);
  }
  if (url.pathname === '/api/portal/billing-history' && request.method === 'GET') {
    return handlePortalBillingHistory(request, env);
  }
  if (url.pathname === '/api/portal/pay' && request.method === 'POST') {
    return handlePortalPay(request, env);
  }
  if (url.pathname === '/api/portal/message' && request.method === 'POST') {
    return handlePortalMessage(request, env);
  }
  if (url.pathname === '/api/portal/restaurant' && request.method === 'POST') {
    return handlePortalRestaurant(request, env);
  }
  if (url.pathname.startsWith('/api/portal/invoice/') && request.method === 'GET') {
    return handlePortalInvoice(request, env, url);
  }

  // ── Admin ──────────────────────────────────────────────────────────────────
  if (url.pathname === '/api/admin/customers' && request.method === 'GET') {
    return handleAdminCustomers(request, env);
  }
  if (url.pathname === '/api/admin/invite' && request.method === 'POST') {
    return handleAdminInvite(request, env);
  }
  if (url.pathname === '/api/admin/resend-invite' && request.method === 'POST') {
    return handleAdminResendInvite(request, env);
  }
  if (url.pathname === '/api/admin/billing' && request.method === 'GET') {
    return handleAdminBilling(request, env);
  }
  if (url.pathname === '/api/admin/generate-billing' && request.method === 'POST') {
    return handleAdminGenerateBilling(request, env);
  }
  if (url.pathname === '/api/admin/message' && request.method === 'POST') {
    return handleAdminPostMessage(request, env);
  }

  // ── Stripe webhook ─────────────────────────────────────────────────────────
  if (url.pathname === '/api/stripe-webhook' && request.method === 'POST') {
    return handleStripeWebhook(request, env);
  }

  // For all paths not explicitly handled above, delegate to the assets binding
  // and normalize missing lookups to 404.
  return handleAssetRequest(request, env);
}

async function handleAssetRequest(request, env) {
  try {
    const response = await env.ASSETS.fetch(request);

    // Missing static assets can surface as 500 from the assets binding;
    // normalize those to 404 so crawlers and clients get the correct status.
    if (response.status === 500 && isLookupMethod(request.method)) {
      return notFoundResponse();
    }

    return response;
  } catch (error) {
    // If asset resolution throws on an unmatched path, return 404 rather
    // than exposing an internal failure.
    if (isLookupMethod(request.method)) {
      console.log('ASSETS fetch lookup error:', String(error));
      return notFoundResponse();
    }

    throw error;
  }
}

function isLookupMethod(method) {
  return method === 'GET' || method === 'HEAD';
}

function notFoundResponse() {
  return new Response('Not Found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8'
    }
  });
}

function handleRobots(url) {
  // Build the Sitemap URL from `url.origin` so the directive is correct
  // on any deployment (preview, staging, production) — matches the
  // pattern in `handleSitemap` for consistency.
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /admin.html',
    'Disallow: /portal.html',
    'Disallow: /api/',
    '',
    'User-agent: GPTBot',
    'Disallow: /',
    '',
    `Sitemap: ${url.origin}/sitemap.xml`,
    ''
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8'
    }
  });
}

async function handleFavicon(request, env) {
  // Browsers request `/favicon.ico` by default even when the HTML declares
  // a different favicon (ours is the SVG icon in `/assets/`). Rewrite to
  // the actual asset path so the tab icon still renders cleanly.
  const faviconUrl = new URL(request.url);
  faviconUrl.pathname = '/assets/bytestreams-icon-256.svg';
  const faviconRequest = new Request(faviconUrl.toString(), request);
  try {
    const response = await env.ASSETS.fetch(faviconRequest);
    if (response.status === 500 && isLookupMethod(request.method)) {
      return notFoundResponse();
    }
    return response;
  } catch (error) {
    if (isLookupMethod(request.method)) {
      console.log('ASSETS favicon lookup error:', String(error));
      return notFoundResponse();
    }
    throw error;
  }
}

function handleSecurityTxt() {
  const body = [
    'Contact: mailto:security@bytestreams.ai',
    'Expires: 2027-04-23T00:00:00.000Z',
    'Preferred-Languages: en',
    ''
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8'
    }
  });
}

function handleSitemap(url) {
  // Static pages: [path, lastmod, changefreq, priority]
  const staticPages = [
    ['/',               '2026-05-21', 'weekly',  '1.0'],
    ['/blog/',          '2026-05-21', 'weekly',  '0.9'],
    ['/privacy.html',   '2026-04-22', 'yearly',  '0.3'],
    ['/terms.html',     '2026-04-22', 'yearly',  '0.3'],
    ['/sms-terms.html', '2026-04-29', 'yearly',  '0.3'],
    ['/cookies.html',   '2026-04-22', 'yearly',  '0.3'],
  ];

  // Blog posts — add each new post here when publishing
  const blogPosts = [
    ['/blog/why-ai-workflow-implementations-fail/', '2026-05-21', 'monthly', '0.8'],
    ['/blog/aws-mcp-server-goes-ga/', '2026-07-07', 'monthly', '0.8'],
    ['/blog/claude-dynamic-workflows/', '2026-07-07', 'monthly', '0.8'],
  ];

  const allPages = [...staticPages, ...blogPosts];

  const urlElements = allPages.map(([path, lastmod, changefreq, priority]) => [
    '  <url>',
    `    <loc>${escapeXml(`${url.origin}${path}`)}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].join('\n'));

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urlElements,
    '</urlset>',
    ''
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8'
    }
  });
}

async function handleContact(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }

  const name = normalizeText(payload.name, 120);
  const email = normalizeText(payload.email, 254);
  const message = normalizeText(payload.message, 5000);
  const honeypot = normalizeText(payload.website || '', 200);

  if (honeypot) {
    return jsonResponse({ ok: true });
  }

  if (!name || !email || !message) {
    return jsonResponse({ error: 'Please fill out all fields.' }, 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: 'Please provide a valid email address.' }, 400);
  }

  const destinationEmail = env.CONTACT_EMAIL;
  if (!destinationEmail) {
    return jsonResponse({ error: 'Contact destination is not configured.' }, 503);
  }

  if (!env.RESEND_API_KEY) {
    // Surfaces in observability; client-side error keeps submitters in
    // the form rather than bouncing them to a mail app.
    console.log('Contact form unavailable: RESEND_API_KEY secret is not set.');
    return jsonResponse({
      error: 'Contact form is temporarily unavailable. Please try again shortly.'
    }, 503);
  }

  const result = await forwardToResend({
    destinationEmail,
    siteName: env.SITE_NAME,
    name,
    email,
    message,
    apiKey: env.RESEND_API_KEY
  });

  if (!result.ok) {
    // Log provider response for CF Workers observability — rate-limit
    // reasons, invalid-key errors, and domain-unverified states all
    // surface here. Details stay server-side.
    console.log('Resend failure:', JSON.stringify({
      httpStatus: result.httpStatus,
      errorName: result.errorName,
      errorMessage: result.errorMessage
    }));

    return jsonResponse({
      error: 'Message delivery failed. Please try again shortly.'
    }, 502);
  }

  return jsonResponse({ ok: true });
}

async function forwardToResend({ destinationEmail, siteName, name, email, message, apiKey }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      // Sender lives on the verified `send.bytestreams.ai` Resend domain
      // (shared with DialTone; verified 2026-04-24).
      from: `${siteName} <contact@send.bytestreams.ai>`,
      to: [destinationEmail],
      // Reply-To: the submitter's address so hitting Reply in Gmail goes
      // straight back to the person who filled out the form. Passed as a
      // single-element array to match Resend's documented canonical form;
      // the regex check in `handleContact` already rejects display-name /
      // bracketed-address syntax (whitespace and `<>` fail the anchored
      // `[^\s@]+@[^\s@]+\.[^\s@]+` pattern), so `email` is a bare address.
      reply_to: [email],
      subject: `${siteName} Contact: ${name}`,
      text: buildTextBody({ siteName, name, email, message }),
      html: buildHtmlBody({ siteName, name, email, message })
    })
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  // Resend success returns `{ id: "<resend_message_id>" }`; errors return
  // `{ statusCode, name, message }`. Treat presence of `id` as the ok signal.
  const ok = response.ok && payload !== null && typeof payload.id === 'string';

  return {
    ok,
    httpStatus: response.status,
    errorName: payload && payload.name ? String(payload.name) : '',
    errorMessage: payload && payload.message ? String(payload.message) : ''
  };
}

function buildTextBody({ siteName, name, email, message }) {
  return [
    `New ${siteName} contact form submission`,
    '',
    `From: ${name} <${email}>`,
    '',
    message,
    '',
    '---',
    `Submitted via the ${siteName} contact form.`,
    'Reply directly to this email to respond to the sender.'
  ].join('\n');
}

function buildHtmlBody({ siteName, name, email, message }) {
  const safeSite = escapeHtml(siteName);
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message);
  return [
    '<!doctype html>',
    '<html>',
    '<body style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0D1117;">',
    `<h2 style="margin: 0 0 16px 0;">New ${safeSite} contact form submission</h2>`,
    `<p style="margin: 0 0 8px 0;"><strong>From:</strong> ${safeName} &lt;<a href="mailto:${safeEmail}" style="color: #2563EB;">${safeEmail}</a>&gt;</p>`,
    '<hr style="border: none; border-top: 1px solid #d0d7de; margin: 16px 0;">',
    `<div style="white-space: pre-wrap; line-height: 1.5;">${safeMessage}</div>`,
    '<hr style="border: none; border-top: 1px solid #d0d7de; margin: 24px 0 16px 0;">',
    `<p style="margin: 0; font-size: 12px; color: #6b7280;">Submitted via the ${safeSite} contact form. Reply directly to this email to respond to the sender.</p>`,
    '</body>',
    '</html>'
  ].join('');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}

// ── Supabase helpers ───────────────────────────────────────────────────────────

async function sbQuery(path, params, env) {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/${path}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    }
  });
  if (!res.ok) throw new Error(`Supabase GET ${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function sbInsert(table, record, env) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      'prefer': 'return=representation',
    },
    body: JSON.stringify(record)
  });
  if (!res.ok) throw new Error(`Supabase INSERT ${table} failed (${res.status}): ${await res.text()}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function sbUpdate(table, id, patch, env) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      'prefer': 'return=minimal',
    },
    body: JSON.stringify(patch)
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${table} failed (${res.status}): ${await res.text()}`);
}

async function sbUpsert(table, record, onConflict, env) {
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set('on_conflict', onConflict);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      'prefer': 'return=representation,resolution=merge-duplicates',
    },
    body: JSON.stringify(record)
  });
  if (!res.ok) throw new Error(`Supabase UPSERT ${table} failed (${res.status}): ${await res.text()}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

/** Verify a Supabase JWT by asking the Auth API — no secret needed. */
async function getPortalUser(request, env) {
  const auth = request.headers.get('authorization') ?? '';
  const jwt  = auth.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'authorization': `Bearer ${jwt}`,
      'apikey': env.SUPABASE_ANON_KEY,
    }
  });
  if (!res.ok) return null;
  return res.json();
}

async function requireAdmin(request, env) {
  // Accept shared secret from intranet proxy (server-to-server, never exposed to browser)
  if (env.ADMIN_SECRET) {
    const auth = request.headers.get('Authorization') ?? '';
    if (auth === `Bearer ${env.ADMIN_SECRET}`) {
      return [null, { is_admin: true }];
    }
  }
  const user = await getPortalUser(request, env);
  if (!user) return [null, null];
  const accounts = await sbQuery('portal_accounts', { 'auth_user_id': `eq.${user.id}`, 'select': '*', 'limit': '1' }, env);
  const account  = accounts[0] ?? null;
  if (!account?.is_admin) return [null, null];
  return [user, account];
}

// ── Stripe helpers ─────────────────────────────────────────────────────────────

// `idempotencyKey` guards against duplicate charges when a request is retried
// (client retry, Cloudflare retry, or a user double-tapping Pay). Stripe replays
// the original response for 24h instead of creating a second object.
async function stripePost(path, params, secretKey, idempotencyKey) {
  const headers = {
    'authorization': `Bearer ${secretKey}`,
    'content-type': 'application/x-www-form-urlencoded',
  };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers,
    body: new URLSearchParams(params).toString()
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? `Stripe error ${res.status}`);
  return json;
}

async function stripeGet(path, secretKey) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { 'authorization': `Bearer ${secretKey}` }
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? `Stripe error ${res.status}`);
  return json;
}

async function verifyStripeSignature(payload, sigHeader, secret) {
  const parts = Object.fromEntries(
    sigHeader.split(',').map(p => { const [k, v] = p.split('='); return [k, v]; })
  );
  const ts = parts.t, sig = parts.v1;
  if (!ts || !sig) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const buf = await crypto.subtle.sign('HMAC', key, encoder.encode(`${ts}.${payload}`));
  const computed = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (computed.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

// ── Stripe Tax ─────────────────────────────────────────────────────────────────

// Mirrors getStripeTaxConfig() in bytestreams_info: an explicit env var wins,
// otherwise the shared app_settings flag decides. Both services read the same flag
// so Portal Admin cannot quote a tax-free bill that this path then re-quotes with
// tax, or vice versa.
async function getTaxConfig(env) {
  const override = env.ENABLE_TAX_ASSESSMENT?.trim().toLowerCase();
  let enabled;
  if (override === 'true' || override === 'false') {
    enabled = override === 'true';
  } else {
    const rows = await sbQuery('app_settings', {
      'key': 'eq.enable_tax_assessment', 'select': 'value', 'limit': '1'
    }, env).catch(() => []);
    enabled = rows[0]?.value === 'true';
  }
  return { enabled, taxCode: env.STRIPE_TAX_CODE?.trim() || 'txcd_10103001' };
}

// Restaurants carry their verified address on the linked location; other business
// types keep it on the business row itself. Returns null when neither is complete,
// since Stripe Tax rejects a partial address rather than guessing.
async function getBillingAddress(businessId, env) {
  const biz = (await sbQuery('businesses', {
    'id': `eq.${businessId}`,
    'select': 'dialtone_location_id,address,address_city,address_state,address_postal_code',
    'limit': '1'
  }, env))[0];
  if (!biz) return null;

  if (biz.dialtone_location_id) {
    const loc = (await sbQuery('locations', {
      'id': `eq.${biz.dialtone_location_id}`,
      'select': 'address_line1,city,state,postal_code,country', 'limit': '1'
    }, env).catch(() => []))[0];
    if (loc?.address_line1 && loc.city && loc.state && loc.postal_code) {
      return {
        line1: loc.address_line1, city: loc.city, state: loc.state,
        postalCode: loc.postal_code, country: loc.country || 'US'
      };
    }
  }

  if (biz.address && biz.address_city && biz.address_state && biz.address_postal_code) {
    return {
      line1: biz.address, city: biz.address_city, state: biz.address_state,
      postalCode: biz.address_postal_code, country: 'US'
    };
  }
  return null;
}

async function calculateTax({ amountCents, address, reference, taxCode, env }) {
  return stripePost('/tax/calculations', {
    currency:                                 'usd',
    'customer_details[address][line1]':       address.line1,
    'customer_details[address][city]':        address.city,
    'customer_details[address][state]':       address.state,
    'customer_details[address][postal_code]': address.postalCode,
    'customer_details[address][country]':     address.country,
    'customer_details[address_source]':       'billing',
    'line_items[0][amount]':                  String(amountCents),
    'line_items[0][reference]':               reference,
    'line_items[0][tax_behavior]':            'exclusive',
    'line_items[0][tax_code]':                taxCode,
    'expand[0]':                              'line_items.data.tax_breakdown',
  }, env.STRIPE_SECRET_KEY);
}

// ── Portal: config (public) ────────────────────────────────────────────────────

function handlePortalConfig(env) {
  return jsonResponse({
    supabase_url:         env.SUPABASE_URL ?? null,
    supabase_anon_key:    env.SUPABASE_ANON_KEY ?? null,
    stripe_publishable_key: env.STRIPE_PUBLISHABLE_KEY ?? null,
  });
}

// ── Portal: /api/portal/me ─────────────────────────────────────────────────────

async function handlePortalMe(request, env) {
  const user = await getPortalUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const accounts = await sbQuery('portal_accounts', {
    'auth_user_id': `eq.${user.id}`, 'select': '*', 'limit': '1'
  }, env);
  const account = accounts[0];
  if (!account) return jsonResponse({ error: 'Account not found' }, 404);

  // Activate on first successful login
  if (account.status === 'setup_pending') {
    await sbUpdate('portal_accounts', account.id, {
      status: 'active',
      activated_at: new Date().toISOString()
    }, env);
    account.status = 'active';

    // The setup fee is invoiced by Portal Admin when the customer is created, not
    // here. Creating it again on first login produced a second $100 bill under a
    // different `product` value, which the unique key could not collapse.
  }

  let business = null;
  if (account.business_id) {
    const biz = await sbQuery('businesses', { 'id': `eq.${account.business_id}`, 'select': '*', 'limit': '1' }, env);
    business = biz[0] ?? null;

    // Enrich with restaurant slug + logo if linked to a DialTone restaurant
    if (business?.dialtone_location_id) {
      const restaurants = await sbQuery('restaurants', {
        'id': `eq.${business.dialtone_location_id}`,
        'select': 'slug,logo_url,display_name',
        'limit': '1',
      }, env);
      if (restaurants[0]) {
        business.slug                    = restaurants[0].slug ?? null;
        business.logo_url                = restaurants[0].logo_url ?? business.logo_url;
        business.restaurant_display_name = restaurants[0].display_name ?? null;
      }
    }
  }

  // Oldest unpaid bill (setup fee takes priority over monthly)
  let currentBill = null;
  if (account.business_id) {
    const bills = await sbQuery('billing_schedule', {
      'business_id': `eq.${account.business_id}`,
      'status':       'neq.paid',
      'order':        'due_date.asc',
      'select':       '*',
      'limit':        '1'
    }, env);
    currentBill = bills[0] ?? null;
  }

  // Messages
  const generalMsgs = await sbQuery('portal_messages', {
    'business_id': 'is.null', 'is_active': 'eq.true',
    'order': 'created_at.desc', 'limit': '1', 'select': 'body'
  }, env);
  let customerMsg = null;
  if (account.business_id) {
    const custMsgs = await sbQuery('portal_messages', {
      'business_id': `eq.${account.business_id}`, 'is_active': 'eq.true',
      'order': 'created_at.desc', 'limit': '1', 'select': 'body'
    }, env);
    customerMsg = custMsgs[0]?.body ?? null;
  }

  return jsonResponse({
    account:                   { id: account.id, email: account.email, full_name: account.full_name, is_admin: account.is_admin, status: account.status },
    business:                  business ? {
      id:                    business.id,
      name:                  business.name,
      logo_url:              business.logo_url ?? null,
      slug:                  business.slug ?? null,
      business_type:         business.business_type,
      dialtone_location_id:  business.dialtone_location_id ?? null,
    } : null,
    restaurant_display_name:   business?.restaurant_display_name ?? null,
    general_message:           generalMsgs[0]?.body ?? null,
    customer_message:          customerMsg,
    current_bill:              currentBill,
  });
}

// ── Portal: /api/portal/billing-history ───────────────────────────────────────

async function handlePortalBillingHistory(request, env) {
  const user = await getPortalUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const accounts = await sbQuery('portal_accounts', {
    'auth_user_id': `eq.${user.id}`, 'select': 'business_id', 'limit': '1'
  }, env);
  const businessId = accounts[0]?.business_id;
  if (!businessId) return jsonResponse([]);

  const rows = await sbQuery('billing_schedule', {
    'business_id': `eq.${businessId}`,
    'order': 'billing_month.desc',
    'select': 'id,billing_month,amount_cents,due_date,status,paid_at',
    'limit': '24'
  }, env);

  return jsonResponse(rows);
}

// ── Portal: /api/portal/pay ────────────────────────────────────────────────────

async function handlePortalPay(request, env) {
  const user = await getPortalUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.STRIPE_SECRET_KEY) return jsonResponse({ error: 'Payment unavailable' }, 503);

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Invalid body' }, 400); }

  const billId = normalizeText(body.bill_id ?? '', 100);
  if (!billId) return jsonResponse({ error: 'bill_id is required' }, 400);

  const accounts = await sbQuery('portal_accounts', {
    'auth_user_id': `eq.${user.id}`, 'select': '*', 'limit': '1'
  }, env);
  const account = accounts[0];
  if (!account) return jsonResponse({ error: 'Account not found' }, 404);

  const bills = await sbQuery('billing_schedule', {
    'id': `eq.${billId}`, 'business_id': `eq.${account.business_id}`, 'select': '*', 'limit': '1'
  }, env);
  const bill = bills[0];
  if (!bill) return jsonResponse({ error: 'Bill not found' }, 404);
  // Allowlist rather than blocklist — a refunded or disputed bill is not
  // collectable, and neither is any status added later without review.
  if (!['pending', 'overdue'].includes(bill.status)) {
    return jsonResponse({ error: `Bill is not payable (status: ${bill.status})` }, 400);
  }

  // Re-assess tax at payment time rather than trusting the figure quoted when the
  // bill was generated. A calculation's rates are frozen at creation, but the
  // transaction posts as effective on the day it is committed — so a bill quoted
  // weeks ago would file stale rates against the current period, and would miss any
  // registration added in between. Recalculating here keeps the amount charged and
  // the amount filed in agreement. Runs before the intent-reuse check below so a
  // changed total is picked up by the existing amount comparison.
  const taxConfig = await getTaxConfig(env);
  if (taxConfig.enabled) {
    const address = await getBillingAddress(account.business_id, env);
    if (!address) {
      return jsonResponse({ error: 'A verified business address is required before payment' }, 409);
    }
    try {
      const calc = await calculateTax({
        amountCents: bill.subtotal_cents,
        address,
        reference:   `bill-${bill.id}`,
        taxCode:     taxConfig.taxCode,
        env,
      });
      if (calc.id !== bill.stripe_tax_calculation_id) {
        await sbUpdate('billing_schedule', bill.id, {
          tax_cents:                 calc.tax_amount_exclusive,
          amount_cents:              calc.amount_total,
          stripe_tax_calculation_id: calc.id,
          stripe_tax_breakdown:      calc.tax_breakdown ?? [],
          tax_assessed_at:           new Date().toISOString(),
        }, env);
        bill.tax_cents                 = calc.tax_amount_exclusive;
        bill.amount_cents              = calc.amount_total;
        bill.stripe_tax_calculation_id = calc.id;
      }
    } catch (err) {
      // Never charge an amount whose tax could not be verified.
      console.error(`[pay] tax calculation failed for bill ${bill.id}:`, err.message);
      return jsonResponse({ error: 'Unable to calculate tax right now. Please try again shortly.' }, 502);
    }
  }

  // Reuse the existing payment intent for this bill, but only if it still matches
  // the bill. An admin can edit the amount (or the re-assessment above can move it)
  // after the intent was created, and reusing it blindly would charge the stale amount.
  if (bill.stripe_payment_intent_id) {
    const intent = await stripeGet(
      `/payment_intents/${bill.stripe_payment_intent_id}`,
      env.STRIPE_SECRET_KEY
    ).catch(() => null);

    // Terminal states can never be reused; a mid-confirmation intent must not be
    // mutated underneath the customer.
    const reusable = intent && ['requires_payment_method', 'requires_confirmation'].includes(intent.status);

    const metadataCurrent =
      (intent?.metadata?.tax_calculation_id ?? '') === (bill.stripe_tax_calculation_id ?? '');

    if (reusable && intent.amount === bill.amount_cents && metadataCurrent) {
      return jsonResponse({ client_secret: intent.client_secret, amount: intent.amount });
    }
    if (reusable) {
      // Amount or calculation drifted — correct the intent in place so the client
      // keeps its secret. The calculation id must travel with it, or the webhook
      // could commit a superseded calculation.
      const updated = await stripePost(
        `/payment_intents/${intent.id}`,
        {
          amount: String(bill.amount_cents),
          'metadata[tax_calculation_id]': bill.stripe_tax_calculation_id ?? '',
        },
        env.STRIPE_SECRET_KEY
      ).catch(() => null);
      if (updated?.client_secret) {
        return jsonResponse({ client_secret: updated.client_secret, amount: updated.amount });
      }
    }
    // Otherwise fall through and create a fresh intent.
  }

  const biz = await sbQuery('businesses', { 'id': `eq.${account.business_id}`, 'select': 'name', 'limit': '1' }, env);
  const bizName = biz[0]?.name ?? '';

  const month = new Date(bill.billing_month + 'T12:00:00')
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const intent = await stripePost('/payment_intents', {
    amount:                         String(bill.amount_cents),
    currency:                       'usd',
    'automatic_payment_methods[enabled]': 'true',
    'metadata[bill_id]':            bill.id,
    'metadata[business_id]':        account.business_id,
    'metadata[customer_email]':     account.email,
    'metadata[business_name]':      bizName,
    'metadata[billing_month]':      bill.billing_month,
    // Carried so the webhook can record the Stripe Tax transaction on success.
    'metadata[tax_calculation_id]': bill.stripe_tax_calculation_id ?? '',
    // Other customers contract with ByteStreams LLC, not DialTone.Menu — the charge
    // description is what lands on their receipt, so it has to name the right entity.
    description:                    account.product === 'other'
      ? `ByteStreams LLC — ${bizName}`
      : `DialTone — ${month} — ${bizName}`,
    receipt_email:                  account.email,
    // Keyed on the amount as well as the bill so a legitimate re-quote after an
    // amount change still creates a new intent, while retries of the same quote
    // collapse onto one.
  }, env.STRIPE_SECRET_KEY, `bill-${bill.id}-${bill.amount_cents}`);

  await sbUpdate('billing_schedule', bill.id, { stripe_payment_intent_id: intent.id }, env);

  return jsonResponse({ client_secret: intent.client_secret, amount: intent.amount });
}

// ── Portal: /api/portal/message ────────────────────────────────────────────────

async function handlePortalMessage(request, env) {
  const user = await getPortalUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.RESEND_API_KEY) return jsonResponse({ error: 'Email unavailable' }, 503);

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Invalid body' }, 400); }

  const replyEmail = normalizeText(body.reply_email ?? '', 254);
  const message    = normalizeText(body.message ?? '', 2000);

  if (!message) return jsonResponse({ error: 'Message is required' }, 400);
  if (replyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyEmail)) {
    return jsonResponse({ error: 'Invalid reply email' }, 400);
  }

  const accounts = await sbQuery('portal_accounts', {
    'auth_user_id': `eq.${user.id}`, 'select': 'email,full_name,business_id', 'limit': '1'
  }, env);
  const account = accounts[0];

  let bizName = '';
  if (account?.business_id) {
    const biz = await sbQuery('businesses', { 'id': `eq.${account.business_id}`, 'select': 'name', 'limit': '1' }, env);
    bizName = biz[0]?.name ?? '';
  }

  const from    = account?.email ?? user.email ?? replyEmail;
  const subject = `Portal Message: ${bizName || from}`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'authorization': `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from:     'DialTone Portal <contact@send.bytestreams.ai>',
      to:       ['admin@bytestreams.ai'],
      reply_to: [replyEmail || from],
      subject,
      text: `From: ${bizName || 'Unknown'} <${from}>\n\n${message}`,
      html: buildHtmlBody({ siteName: 'DialTone Portal', name: bizName || from, email: from, message }),
    })
  });

  return jsonResponse({ ok: true });
}

// ── Portal: /api/portal/restaurant ────────────────────────────────────────────

async function handlePortalRestaurant(request, env) {
  const user = await getPortalUser(request, env);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Invalid body' }, 400); }

  const displayName = normalizeText(body.display_name ?? '', 200);
  const logoUrl     = normalizeText(body.logo_url ?? '', 500);

  const accounts = await sbQuery('portal_accounts', {
    'auth_user_id': `eq.${user.id}`, 'select': 'business_id', 'limit': '1'
  }, env);
  const businessId = accounts[0]?.business_id;
  if (!businessId) return jsonResponse({ error: 'No business linked' }, 404);

  const biz = await sbQuery('businesses', {
    'id': `eq.${businessId}`, 'select': 'dialtone_location_id', 'limit': '1'
  }, env);
  const restaurantId = biz[0]?.dialtone_location_id;
  if (!restaurantId) return jsonResponse({ error: 'No restaurant linked' }, 404);

  const update = {};
  if (displayName) update.display_name = displayName;
  if (logoUrl)     update.logo_url     = logoUrl;
  if (!Object.keys(update).length) return jsonResponse({ error: 'Nothing to update' }, 400);

  await sbUpdate('restaurants', restaurantId, update, env);
  return jsonResponse({ ok: true });
}

// ── Invoice links ─────────────────────────────────────────────────────────────
// The invoice page normally authenticates with the viewer's Supabase access token,
// which only exists inside a live portal session and so cannot be put in an email.
// A signed link carries its own proof instead: an expiry and an HMAC over the bill
// id, scoped to that one invoice. Requires the INVOICE_LINK_SECRET secret; without
// it no link is generated and the receipt email simply omits it.

const INVOICE_LINK_TTL_SECONDS = 90 * 24 * 60 * 60;

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Length-independent, constant-time-ish compare so a signature cannot be recovered
// byte by byte from response timing.
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function buildSignedInvoiceUrl(billId, env) {
  if (!env.INVOICE_LINK_SECRET) {
    console.warn('[invoice-link] INVOICE_LINK_SECRET not set — omitting invoice link from email');
    return null;
  }
  const exp = Math.floor(Date.now() / 1000) + INVOICE_LINK_TTL_SECONDS;
  const sig = await hmacHex(env.INVOICE_LINK_SECRET, `${billId}.${exp}`);
  return `${env.SITE_URL ?? 'https://bytestreams.ai'}/api/portal/invoice/${billId}?exp=${exp}&sig=${sig}`;
}

async function verifyInvoiceSignature(billId, exp, sig, env) {
  if (!env.INVOICE_LINK_SECRET || !exp || !sig) return false;
  const expSeconds = Number(exp);
  if (!Number.isFinite(expSeconds) || expSeconds * 1000 < Date.now()) return false;
  return safeEqual(await hmacHex(env.INVOICE_LINK_SECRET, `${billId}.${exp}`), sig);
}

// ── Portal: /api/portal/invoice/:bill_id ──────────────────────────────────────

async function handlePortalInvoice(request, env, url) {
  const billId = url.pathname.split('/').pop();
  const token  = url.searchParams.get('token');
  const sig    = url.searchParams.get('sig');
  const exp    = url.searchParams.get('exp');

  let account;
  if (sig && await verifyInvoiceSignature(billId, exp, sig, env)) {
    // A valid signature authorizes this one bill. Resolve the customer from the
    // bill itself so the Bill To block still renders.
    const signedBills = await sbQuery('billing_schedule', {
      'id': `eq.${billId}`, 'select': 'business_id', 'limit': '1'
    }, env);
    const businessId = signedBills[0]?.business_id;
    if (!businessId) return new Response('Not found', { status: 404 });
    const signedAccounts = await sbQuery('portal_accounts', {
      'business_id': `eq.${businessId}`, 'is_admin': 'eq.false', 'select': 'business_id,email', 'limit': '1'
    }, env);
    account = signedAccounts[0] ?? { business_id: businessId, email: '' };
  } else if (token) {
    // Validate JWT via Supabase
    const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
    });
    if (!authRes.ok) return new Response('Unauthorized', { status: 401 });
    const authUser = await authRes.json();

    // Verify bill belongs to this user's business
    const accounts = await sbQuery('portal_accounts', {
      'auth_user_id': `eq.${authUser.id}`, 'select': 'business_id,email', 'limit': '1'
    }, env);
    account = accounts[0];
  } else {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!account) return new Response('Not found', { status: 404 });

  const bills = await sbQuery('billing_schedule', {
    'id': `eq.${billId}`, 'business_id': `eq.${account.business_id}`,
    'select': '*', 'limit': '1'
  }, env);
  const bill = bills[0];
  if (!bill) return new Response('Not found', { status: 404 });

  const biz = await sbQuery('businesses', {
    'id': `eq.${account.business_id}`, 'select': 'name,logo_url,dialtone_location_id', 'limit': '1'
  }, env);
  const business = biz[0] ?? {};

  // Pull restaurant display name + logo if linked
  let restaurantName = business.name ?? '';
  let restaurantLogo = business.logo_url ?? '';
  if (business.dialtone_location_id) {
    const rests = await sbQuery('restaurants', {
      'id': `eq.${business.dialtone_location_id}`, 'select': 'display_name,logo_url,slug', 'limit': '1'
    }, env);
    if (rests[0]) {
      restaurantName = rests[0].display_name || rests[0].slug || restaurantName;
      restaurantLogo = rests[0].logo_url || restaurantLogo;
    }
  }

  const invoiceNum  = `INV-${bill.id.slice(0, 8).toUpperCase()}`;
  const period      = new Date(bill.billing_month + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const dueDate     = new Date(bill.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const paidDate    = bill.paid_at ? new Date(bill.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  const amountFmt   = (bill.amount_cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const isPaid      = bill.status === 'paid';

  const siteUrl = env.SITE_URL ?? 'https://bytestreams.ai';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${invoiceNum} | ByteStreams</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Inter,-apple-system,sans-serif;color:#1a1a2e;background:#fff;padding:40px;max-width:720px;margin:0 auto}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding-bottom:24px;border-bottom:2px solid #e5e7eb}
  .brand{display:flex;align-items:center;gap:12px}
  .brand img{height:36px}
  .brand-name{font-size:1.25rem;font-weight:700;color:#111}
  .invoice-meta{text-align:right}
  .invoice-num{font-size:1.5rem;font-weight:800;color:#2563eb}
  .invoice-date{font-size:0.875rem;color:#6b7280;margin-top:4px}
  .addresses{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:36px}
  .address-label{font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:8px}
  .address-name{font-size:1rem;font-weight:600;color:#111;margin-bottom:4px}
  .address-detail{font-size:0.875rem;color:#6b7280}
  .biz-logo{width:40px;height:40px;object-fit:contain;border-radius:6px;margin-bottom:8px;display:block}
  table{width:100%;border-collapse:collapse;margin-bottom:24px}
  thead th{background:#f9fafb;padding:10px 16px;text-align:left;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;border-bottom:1px solid #e5e7eb}
  tbody td{padding:14px 16px;border-bottom:1px solid #f3f4f6;font-size:0.9rem;color:#374151}
  .amount-col{text-align:right}
  .total-row{background:#f9fafb;font-weight:700}
  .total-row td{padding:14px 16px;font-size:1rem;color:#111}
  .status-badge{display:inline-block;padding:4px 12px;border-radius:99px;font-size:0.8rem;font-weight:600}
  .status-paid{background:#d1fae5;color:#065f46}
  .status-pending{background:#fef3c7;color:#92400e}
  .footer{margin-top:40px;padding-top:24px;border-top:1px solid #e5e7eb;font-size:0.8rem;color:#9ca3af;text-align:center}
  @media print{
    body{padding:20px}
    .no-print{display:none}
    @page{margin:1cm}
  }
</style>
</head>
<body>
<div class="header">
  <div class="brand">
    <img src="${siteUrl}/assets/blue-side-slim-logo.png" alt="ByteStreams">
    <div>
      <div class="brand-name">ByteStreams</div>
      <div style="font-size:0.8rem;color:#6b7280">AI Workflow Solutions</div>
    </div>
  </div>
  <div class="invoice-meta">
    <div class="invoice-num">${invoiceNum}</div>
    <div class="invoice-date">Due ${dueDate}</div>
    ${isPaid ? `<div style="margin-top:6px"><span class="status-badge status-paid">✓ Paid ${paidDate}</span></div>` : `<div style="margin-top:6px"><span class="status-badge status-pending">Outstanding</span></div>`}
  </div>
</div>

<div class="addresses">
  <div>
    <div class="address-label">From</div>
    <div class="address-name">ByteStreams LLC</div>
    <div class="address-detail">Nashville, TN</div>
    <div class="address-detail">hello@bytestreams.ai</div>
  </div>
  <div>
    <div class="address-label">Bill To</div>
    ${restaurantLogo ? `<img class="biz-logo" src="${restaurantLogo}" alt="${restaurantName}">` : ''}
    <div class="address-name">${restaurantName}</div>
    <div class="address-detail">${account.email}</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Description</th>
      <th>Period</th>
      <th class="amount-col">Amount</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>${escapeHtml(bill.description || (bill.bill_type === 'setup' ? 'One-Time Setup Fee' : bill.bill_type === 'addon' ? 'Add-On Fee' : 'DialTone.Menu — Monthly Service Fee'))}</td>
      <td>${period}</td>
      <td class="amount-col">${amountFmt}</td>
    </tr>
    <tr class="total-row">
      <td colspan="2">Total</td>
      <td class="amount-col">${amountFmt}</td>
    </tr>
  </tbody>
</table>

${bill.bill_type === 'setup' && !isPaid ? `<p style="font-size:0.875rem;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:24px;">Onboarding begins upon receipt of payment. We'll be in touch shortly after your setup fee is cleared.</p>` : ''}
${bill.stripe_payment_intent_id ? `<p style="font-size:0.8rem;color:#9ca3af;margin-bottom:32px">Payment ref: ${bill.stripe_payment_intent_id}</p>` : ''}

<div class="no-print" style="margin-bottom:32px">
  <button onclick="window.print()" style="background:#2563eb;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer">
    Save as PDF / Print
  </button>
</div>

<div class="footer">
  ByteStreams LLC · Nashville, TN · hello@bytestreams.ai · bytestreams.ai
</div>
</body>
</html>`;

  return new Response(html, { headers: { 'content-type': 'text/html;charset=UTF-8' } });
}

// ── Admin: /api/admin/customers ────────────────────────────────────────────────

async function handleAdminCustomers(request, env) {
  const [, account] = await requireAdmin(request, env);
  if (!account) return jsonResponse({ error: 'Unauthorized' }, 401);

  // Pull all portal accounts and normalize legacy rows where is_admin is NULL.
  const rawAccounts = await sbQuery('portal_accounts', {
    'select': 'id,email,full_name,business_id,product,role,status,is_admin,invited_at,activated_at',
    'order': 'created_at.desc',
  }, env);

  const legacyAccounts = rawAccounts.filter((a) => a.is_admin == null && a.id);
  if (legacyAccounts.length) {
    await Promise.all(
      legacyAccounts.map((a) =>
        sbUpdate('portal_accounts', a.id, { is_admin: false }, env).catch((err) => {
          console.error(`Failed to normalize portal_accounts.is_admin for ${a.id}:`, err.message);
        })
      )
    );
  }

  const accounts = rawAccounts
    .map((a) => (a.is_admin == null ? { ...a, is_admin: false } : a))
    .filter((a) => a.is_admin === false);

  // Enrich with business details
  const bizIds = [...new Set(accounts.map(a => a.business_id).filter(Boolean))];
  let bizMap = {};
  if (bizIds.length) {
    const bizRows = await sbQuery('businesses', {
      'id': `in.(${bizIds.join(',')})`,
      'select': 'id,name,logo_url,business_type,monthly_amount_cents,ein,ein_verified',
    }, env);
    bizRows.forEach(b => { bizMap[b.id] = b; });
  }

  const result = accounts.map(a => {
    const biz = bizMap[a.business_id] ?? {};
    return {
      id:                   a.id,
      email:                a.email,
      full_name:            a.full_name,
      business_id:          a.business_id,
      business_name:        biz.name ?? null,
      business_type:        biz.business_type ?? null,
      product:              a.product,
      status:               a.status,
      ein:                  biz.ein ?? null,
      ein_verified:         biz.ein_verified ?? false,
      monthly_amount_cents: biz.monthly_amount_cents ?? null,
      invited_at:           a.invited_at,
      activated_at:         a.activated_at,
    };
  });

  return jsonResponse(result);
}

// ── Admin: /api/admin/invite ───────────────────────────────────────────────────

async function handleAdminInvite(request, env) {
  const [, admin] = await requireAdmin(request, env);
  if (!admin) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.RESEND_API_KEY) return jsonResponse({ error: 'Email unavailable' }, 503);

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Invalid body' }, 400); }

  console.log('[invite] body:', JSON.stringify({ ein: body.ein, product: body.product, business_name: body.business_name }));

  const bizName      = normalizeText(body.business_name ?? '', 200);
  const bizType      = normalizeText(body.business_type ?? 'restaurant', 110);
  const dialtoneSlug = normalizeText(body.dialtone_slug ?? '', 200);
  const product      = normalizeText(body.product ?? 'dialtone_menu', 50);
  const ein          = normalizeText((body.ein ?? '').replace(/\D/g, ''), 9);
  const email        = normalizeText(body.email ?? '', 254);
  const fullName     = normalizeText(body.full_name ?? '', 200);
  const amtCents     = Number.isInteger(body.monthly_amount_cents) ? body.monthly_amount_cents : 9900;

  if (!bizName || !email) return jsonResponse({ error: 'business_name and email are required' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResponse({ error: 'Invalid email' }, 400);

  // EIN verification via Cobalt Intelligence (non-fatal if unavailable)
  let einVerified = false;
  let einVerifiedAt = null;
  if (ein && env.COBALT_API_KEY) {
    try {
      const cobaltUrl = new URL('https://apigateway.cobaltintelligence.com/tinVerification');
      cobaltUrl.searchParams.set('businessName', bizName);
      cobaltUrl.searchParams.set('tin', ein);
      console.log(`[cobalt] EIN check → ${cobaltUrl.toString()}`);
      const cobaltRes = await fetch(cobaltUrl.toString(), {
        headers: { 'x-api-key': env.COBALT_API_KEY, 'Accept': 'application/json' }
      });
      const cobaltData = await cobaltRes.json();
      console.log(`[cobalt] status=${cobaltRes.status} irsCode=${cobaltData.irsCode} irsReason=${cobaltData.irsReason}`);
      if (cobaltRes.ok) {
        // irsCode 0 = exact match, 7 = EIN name match — both are verified
        einVerified   = cobaltData.irsCode === 0 || cobaltData.irsCode === 7;
        einVerifiedAt = einVerified ? new Date().toISOString() : null;
      }
    } catch (err) {
      console.error('[cobalt] EIN verification failed:', err);
    }
  }

  // Look up existing DialTone restaurant by slug; create new one if verified DialTone.Menu
  let dialtoneLocationId = null;
  let logoUrl = null;
  let needsStaff = false;
  if (dialtoneSlug) {
    const existing = await sbQuery('restaurants', {
      'slug': `eq.${dialtoneSlug}`, 'select': 'id,logo_url', 'limit': '1',
    }, env);
    if (existing[0]) {
      dialtoneLocationId = existing[0].id;
      logoUrl            = existing[0].logo_url ?? null;
    } else if (product === 'dialtone_menu' && einVerified) {
      const newRest = await sbInsert('restaurants', { name: bizName, slug: dialtoneSlug }, env);
      dialtoneLocationId = newRest.id;
      needsStaff = true;
    }
  }

  // Pre-create the Supabase auth user so magic-link sign-in works
  // even when public sign-ups are disabled on the project.
  const authUserRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, email_confirm: true })
  });
  const authUserBody = await authUserRes.json();
  if (!authUserRes.ok && authUserBody.msg !== 'A user with this email address has already been registered') {
    return jsonResponse({ error: `Auth user creation failed: ${authUserBody.msg ?? authUserRes.status}` }, 502);
  }
  let authUserId = authUserBody.id ?? authUserBody.user?.id ?? null;

  // If user already existed, Supabase returns no ID — look it up
  if (!authUserId) {
    const listRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}&per_page=1`, {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      }
    });
    if (listRes.ok) {
      const listBody = await listRes.json();
      authUserId = listBody.users?.[0]?.id ?? null;
    }
  }

  // Create business
  const business = await sbInsert('businesses', {
    name:                 bizName,
    business_type:        bizType,
    logo_url:             logoUrl,
    dialtone_location_id: dialtoneLocationId,
    monthly_amount_cents: amtCents,
    ein:                  ein || null,
    ein_verified:         einVerified,
    ein_verified_at:      einVerifiedAt,
  }, env);

  // Create portal_account linked to the auth user
  const account = await sbInsert('portal_accounts', {
    email,
    full_name:    fullName || null,
    auth_user_id: authUserId,
    business_id:  business.id,
    product,
    role:         'owner',
    status:       'setup_pending',
    is_admin:     false,
    invited_at:   new Date().toISOString(),
  }, env);

  // Provision staff row for new DialTone.Menu restaurants with verified EIN
  if (needsStaff && authUserId) {
    const username = email.split('@')[0];
    const nameParts = (fullName || '').split(' ');
    await sbInsert('staff', {
      restaurant_id: dialtoneLocationId,
      user_id:       authUserId,
      display_name:  fullName || bizName,
      first_name:    nameParts[0] || null,
      last_name:     nameParts.slice(1).join(' ') || null,
      username,
    }, env).catch(() => {});
  }

  // Send invite email via Resend
  const portalUrl = `${env.SITE_URL ?? 'https://bytestreams.ai'}/portal.html`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'authorization': `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from:    'ByteStreams <contact@send.bytestreams.ai>',
      to:      [email],
      subject: `You're invited to the DialTone Customer Portal`,
      text: [
        `Hi ${fullName || 'there'},`,
        '',
        `Your DialTone customer account for ${bizName} has been set up.`,
        '',
        `Sign in to your portal here: ${portalUrl}`,
        '',
        'Use this email address to sign in. You\'ll receive a magic link — no password required.',
        '',
        '— ByteStreams Team'
      ].join('\n'),
      html: buildInviteHtml({ fullName, bizName, portalUrl }),
    })
  });

  return jsonResponse({ ok: true, account_id: account.id, business_id: business.id, ein_verified: einVerified });
}

// ── Admin: /api/admin/resend-invite ───────────────────────────────────────────

async function handleAdminResendInvite(request, env) {
  const [, admin] = await requireAdmin(request, env);
  if (!admin) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.RESEND_API_KEY) return jsonResponse({ error: 'Email unavailable' }, 503);

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Invalid body' }, 400); }

  const email = normalizeText(body.email ?? '', 254);
  if (!email) return jsonResponse({ error: 'email is required' }, 400);

  const portalUrl = `${env.SITE_URL ?? 'https://bytestreams.ai'}/portal.html`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'authorization': `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from:    'ByteStreams <contact@send.bytestreams.ai>',
      to:      [email],
      subject: 'Your DialTone Portal invite',
      text:    `Sign in to your DialTone customer portal: ${portalUrl}\n\nUse this email address — no password required.`,
    })
  });

  // Update invited_at timestamp
  if (body.account_id) {
    await sbUpdate('portal_accounts', body.account_id, { invited_at: new Date().toISOString() }, env)
      .catch(() => {});
  }

  return jsonResponse({ ok: true });
}

// ── Admin: /api/admin/billing ──────────────────────────────────────────────────

async function handleAdminBilling(request, env) {
  const [, admin] = await requireAdmin(request, env);
  if (!admin) return jsonResponse({ error: 'Unauthorized' }, 401);

  const billingMonth = new Date().toISOString().slice(0, 7) + '-01';
  const rows = await sbQuery('billing_schedule', {
    'billing_month': `eq.${billingMonth}`,
    'order': 'created_at.desc',
    'select': 'id,business_id,billing_month,amount_cents,due_date,status,paid_at',
  }, env);

  // Enrich with business names
  const bizIds = [...new Set(rows.map(r => r.business_id).filter(Boolean))];
  let bizMap = {};
  if (bizIds.length) {
    const bizRows = await sbQuery('businesses', {
      'id': `in.(${bizIds.join(',')})`,
      'select': 'id,name',
    }, env);
    bizRows.forEach(b => { bizMap[b.id] = b; });
  }

  return jsonResponse(rows.map(r => ({ ...r, business_name: bizMap[r.business_id]?.name ?? null })));
}

// ── Admin: /api/admin/generate-billing ────────────────────────────────────────

async function handleAdminGenerateBilling(request, env) {
  const [, admin] = await requireAdmin(request, env);
  if (!admin) return jsonResponse({ error: 'Unauthorized' }, 401);

  const created = await generateRecurringBilling(env);
  return jsonResponse({ ok: true, created });
}

// ── Recurring billing schedule ────────────────────────────────────────────────
// Mirrors bytestreams_info/src/lib/server/billing-cycle.ts, which carries the unit
// tests for this arithmetic. Change both together.
//
// A recurring charge falls on the same day of the month as the day the customer's
// setup fee cleared (businesses.billing_cycle_start), starting the following
// calendar month. Months too short for the anchor day clamp to the last day, then
// the cycle returns to the anchor day — so a 31st anchor bills Feb 28, Mar 31,
// Apr 30. Repeated 30-day addition, which this replaces, drifted backwards instead.

const RECURRING_LEAD_DAYS = 5;

function parseYMD(date) {
  const [year, month, day] = String(date).slice(0, 10).split('-').map(Number);
  return { year, month: month - 1, day };
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function billingDayIn(anchorDay, year, month) {
  return Math.min(anchorDay, daysInMonth(year, month));
}

function isRecurringBillingDay(anchor, today) {
  const a = parseYMD(anchor);
  const t = parseYMD(today);
  // Never during the anchor's own month — that month's money is the setup fee.
  if ((t.year - a.year) * 12 + (t.month - a.month) < 1) return false;
  return t.day === billingDayIn(a.day, t.year, t.month);
}

function upcomingBillingDate(anchor, today, windowDays) {
  const t = parseYMD(today);
  for (let offset = 0; offset <= windowDays; offset++) {
    const iso = new Date(Date.UTC(t.year, t.month, t.day + offset)).toISOString().slice(0, 10);
    if (isRecurringBillingDay(anchor, iso)) return iso;
  }
  return null;
}

function billingMonthFor(dueDate) {
  return `${dueDate.slice(0, 7)}-01`;
}

/**
 * Generates recurring DialTone.Menu charges falling within the lead window. The
 * charge still lands on the customer's anchor day; generating it early is what
 * gives sendUpcomingBillReminders a row to notify on in this same cron run.
 *
 * Upserts on (business_id, billing_month, product), so re-running — or Portal
 * Admin's Generate button writing the same key — updates one row, never adds one.
 */
async function generateRecurringBilling(env) {
  const today = new Date().toISOString().slice(0, 10);

  const businesses = await sbQuery('businesses', {
    'billing_cycle_start': 'not.is.null',
    'business_type':       'eq.restaurant',
    'onboarded':           'eq.true',
    'select':              'id,monthly_amount_cents,billing_cycle_start',
  }, env);

  let created = 0;
  for (const biz of businesses) {
    const dueDate = upcomingBillingDate(biz.billing_cycle_start, today, RECURRING_LEAD_DAYS);
    if (!dueDate) continue;

    const amount = Number.isInteger(biz.monthly_amount_cents) ? biz.monthly_amount_cents : 0;
    if (amount <= 0) continue;

    try {
      // Tax is left at zero here and re-assessed in handlePortalPay before the
      // charge, so these are pre-tax figures until the customer actually pays.
      await sbUpsert('billing_schedule', {
        business_id:    biz.id,
        billing_month:  billingMonthFor(dueDate),
        due_date:       dueDate,
        subtotal_cents: amount,
        tax_cents:      0,
        amount_cents:   amount,
        status:         'pending',
        product:        'dialtone_menu_recurring',
        bill_type:      'monthly',
        description:    'DialTone.Menu — Monthly Service Fee',
      }, 'business_id,billing_month,product', env);
      created++;
    } catch (err) {
      console.error(`Recurring billing generation failed for business ${biz.id}:`, err.message);
    }
  }
  return created;
}

async function sendUpcomingBillReminders(env) {
  if (!env.RESEND_API_KEY) return;
  const reminderDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dueBills = await sbQuery('billing_schedule', {
    'due_date': `eq.${reminderDate}`,
    'status':   'neq.paid',
    'select':   'id,business_id,amount_cents,due_date,bill_type,description',
  }, env);

  for (const bill of dueBills) {
    try {
      const accts   = await sbQuery('portal_accounts', { 'business_id': `eq.${bill.business_id}`, 'is_admin': 'eq.false', 'select': 'email,full_name', 'limit': '1' }, env);
      const bizRows = await sbQuery('businesses', { 'id': `eq.${bill.business_id}`, 'select': 'name', 'limit': '1' }, env);
      const custEmail = accts[0]?.email;
      if (!custEmail) continue;
      const custName  = accts[0]?.full_name || custEmail;
      const bizName   = bizRows[0]?.name ?? '';
      const amtFmt    = `$${(bill.amount_cents / 100).toFixed(2)}`;
      const lineItem  = bill.description || (bill.bill_type === 'setup' ? 'Setup Fee' : bill.bill_type === 'addon' ? 'Add-On Fee' : 'Monthly Service');
      const dueFmt    = new Date(bill.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const portalUrl = `${env.SITE_URL ?? 'https://bytestreams.ai'}/portal.html`;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'authorization': `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from:    'ByteStreams <contact@send.bytestreams.ai>',
          to:      [custEmail],
          subject: `Payment Reminder — ${lineItem} due ${dueFmt}`,
          text:    `Hi ${custName},\n\nA reminder that your ${lineItem} of ${amtFmt} for ${bizName} is due on ${dueFmt}.\n\nPay securely: ${portalUrl}\n\n— ByteStreams Team`,
          html:    `<p>Hi ${escapeHtml(custName)},</p><p>A reminder that your <strong>${escapeHtml(lineItem)}</strong> of <strong>${escapeHtml(amtFmt)}</strong> is due on <strong>${escapeHtml(dueFmt)}</strong>.</p><p><a href="${escapeHtml(portalUrl)}">Pay securely in your portal</a></p><p>— ByteStreams Team</p>`,
        })
      }).catch(() => {});
    } catch (err) {
      console.error(`Reminder email failed for bill ${bill.id}:`, err.message);
    }
  }
}

// ── Admin: /api/admin/message ──────────────────────────────────────────────────

async function handleAdminPostMessage(request, env) {
  const [, admin] = await requireAdmin(request, env);
  if (!admin) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Invalid body' }, 400); }

  const msgBody    = normalizeText(body.body ?? '', 1000);
  const businessId = normalizeText(body.business_id ?? '', 100) || null;
  const isActive   = body.is_active !== false;

  if (!msgBody) return jsonResponse({ error: 'body is required' }, 400);

  await sbInsert('portal_messages', {
    business_id: businessId,
    body:        msgBody,
    is_active:   isActive,
  }, env);

  return jsonResponse({ ok: true });
}

// ── Stripe webhook ─────────────────────────────────────────────────────────────

async function handleStripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return new Response('Not configured', { status: 503 });

  const sigHeader = request.headers.get('stripe-signature') ?? '';
  const payload   = await request.text();

  const valid = await verifyStripeSignature(payload, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return new Response('Invalid signature', { status: 400 });

  const event = JSON.parse(payload);

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const billId = intent.metadata?.bill_id;
    if (billId) {
      try {
        await sbUpdate('billing_schedule', billId, {
          status:  'paid',
          paid_at: new Date().toISOString(),
          stripe_payment_intent_id: intent.id,
        }, env);

        // Record notification + send confirmation emails
        const bills = await sbQuery('billing_schedule', { 'id': `eq.${billId}`, 'select': 'business_id,amount_cents,billing_month,bill_type,description,stripe_tax_calculation_id,stripe_tax_transaction_id', 'limit': '1' }, env);
        const paidBill = bills[0];

        // Stripe Tax only counts tax toward your filing obligations once the
        // calculation is committed as a transaction. Without this the tax is
        // collected but never appears in Stripe Tax reporting.
        await recordTaxTransaction({
          billId,
          // The bill row wins: tax is re-assessed at payment time, so the stored id
          // is always at least as fresh as whatever the intent was created with.
          calculationId: paidBill?.stripe_tax_calculation_id || intent.metadata?.tax_calculation_id,
          alreadyRecorded: paidBill?.stripe_tax_transaction_id,
          env,
        });

        if (paidBill?.business_id) {
          await sbInsert('billing_notifications', {
            business_id: paidBill.business_id,
            billing_id:  billId,
            type:        'payment_received',
            channel:     'portal',
            recipient:   intent.metadata?.customer_email ?? null,
          }, env).catch(() => {});

          if (env.RESEND_API_KEY) {
            try {
              const accts   = await sbQuery('portal_accounts', { 'business_id': `eq.${paidBill.business_id}`, 'is_admin': 'eq.false', 'select': 'email,full_name,activated_at,invited_at', 'limit': '1' }, env);
              const bizRows = await sbQuery('businesses', { 'id': `eq.${paidBill.business_id}`, 'select': 'name,dialtone_location_id', 'limit': '1' }, env);
              const custEmail  = accts[0]?.email ?? '';
              const custName   = accts[0]?.full_name || custEmail || 'Customer';
              const memberSince = accts[0]?.activated_at || accts[0]?.invited_at;
              const memberSinceFmt = memberSince ? new Date(memberSince).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A';
              const bizName    = bizRows[0]?.name ?? '';
              const amtFmt     = `$${(paidBill.amount_cents / 100).toFixed(2)}`;
              const lineItem   = paidBill.description || (paidBill.bill_type === 'setup' ? 'Setup Fee' : paidBill.bill_type === 'addon' ? 'Add-On Fee' : 'Monthly Service');
              const isSetup    = paidBill.bill_type === 'setup';
              const period     = new Date(paidBill.billing_month + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

              // Pull restaurant display name if linked
              let restaurantDisplay = '';
              if (bizRows[0]?.dialtone_location_id) {
                const rests = await sbQuery('restaurants', { 'id': `eq.${bizRows[0].dialtone_location_id}`, 'select': 'display_name,slug', 'limit': '1' }, env);
                restaurantDisplay = rests[0]?.display_name || rests[0]?.slug || '';
              }

              if (isSetup) {
                await sbUpdate('businesses', paidBill.business_id, {
                  billing_cycle_start: new Date().toISOString().slice(0, 10)
                }, env).catch(() => {});
              }

              const subject    = `Payment Received — ${lineItem} (${amtFmt})`;
              const bodyLine   = isSetup
                ? `Your setup fee of ${amtFmt} has been received. Your onboarding process is now underway — we'll be in touch shortly.`
                : `Your payment of ${amtFmt} for ${period} has been received. Thank you!`;

              // The bill is already marked paid above, so this link renders the
              // invoice with its Paid stamp — the customer's receipt of record.
              const invoiceUrl = await buildSignedInvoiceUrl(billId, env);

              if (custEmail) {
                await fetch('https://api.resend.com/emails', {
                  method: 'POST',
                  headers: { 'authorization': `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
                  body: JSON.stringify({
                    from: 'ByteStreams <contact@send.bytestreams.ai>',
                    to:   [custEmail],
                    subject,
                    text: [
                      `Hi ${custName},`,
                      '',
                      bodyLine,
                      ...(invoiceUrl ? ['', `View your paid invoice: ${invoiceUrl}`] : []),
                      '',
                      '— ByteStreams Team'
                    ].join('\n'),
                    html: [
                      `<p>Hi ${escapeHtml(custName)},</p>`,
                      `<p>${escapeHtml(bodyLine)}</p>`,
                      invoiceUrl ? `<p><a href="${escapeHtml(invoiceUrl)}">View your paid invoice</a></p>` : '',
                      `<p>— ByteStreams Team</p>`
                    ].join(''),
                  })
                }).catch(() => {});
              }

              const adminHtml = [
                `<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;width:100%;max-width:480px;">`,
                `<tr><td style="padding:8px 12px;color:#6b7280;width:140px;">Business</td><td style="padding:8px 12px;font-weight:600;">${escapeHtml(bizName)}</td></tr>`,
                restaurantDisplay ? `<tr><td style="padding:8px 12px;color:#6b7280;">Restaurant</td><td style="padding:8px 12px;">${escapeHtml(restaurantDisplay)}</td></tr>` : '',
                `<tr><td style="padding:8px 12px;color:#6b7280;">Customer</td><td style="padding:8px 12px;">${escapeHtml(custName)} &lt;${escapeHtml(custEmail)}&gt;</td></tr>`,
                `<tr><td style="padding:8px 12px;color:#6b7280;">Member Since</td><td style="padding:8px 12px;">${escapeHtml(memberSinceFmt)}</td></tr>`,
                `<tr><td style="padding:8px 12px;color:#6b7280;">Payment</td><td style="padding:8px 12px;font-weight:700;color:#065f46;">${escapeHtml(amtFmt)}</td></tr>`,
                `<tr><td style="padding:8px 12px;color:#6b7280;">Type</td><td style="padding:8px 12px;">${escapeHtml(lineItem)}</td></tr>`,
                `<tr><td style="padding:8px 12px;color:#6b7280;">Period</td><td style="padding:8px 12px;">${escapeHtml(period)}</td></tr>`,
                `</table>`,
              ].join('');

              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'authorization': `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
                body: JSON.stringify({
                  from:    'ByteStreams <contact@send.bytestreams.ai>',
                  to:      ['admin@bytestreams.ai'],
                  subject: `[Payment Received] ${bizName}${restaurantDisplay ? ` / ${restaurantDisplay}` : ''} — ${amtFmt}`,
                  text:    `Business: ${bizName}\nRestaurant: ${restaurantDisplay}\nCustomer: ${custName} <${custEmail}>\nMember Since: ${memberSinceFmt}\nAmount: ${amtFmt}\nType: ${lineItem}\nPeriod: ${period}`,
                  html:    adminHtml,
                })
              }).catch(() => {});
            } catch (emailErr) {
              console.error('[webhook] payment email failed:', emailErr.message);
            }
          }
        }
      } catch (err) {
        console.error('Webhook billing update failed:', err.message);
      }
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object;
    const billId = intent.metadata?.bill_id;
    if (billId) {
      try {
        // Leave the bill payable — the customer can retry from the portal. The
        // failure is recorded so admins can see attempts that did not clear.
        await sbUpdate('billing_schedule', billId, {
          last_payment_error: intent.last_payment_error?.message ?? 'Payment failed',
          last_payment_failed_at: new Date().toISOString(),
        }, env);
        await sbInsert('billing_notifications', {
          business_id: intent.metadata?.business_id ?? null,
          billing_id:  billId,
          type:        'payment_failed',
          channel:     'portal',
          recipient:   intent.metadata?.customer_email ?? null,
        }, env).catch(() => {});
      } catch (err) {
        console.error('Webhook payment_failed update failed:', err.message);
      }
    }
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    const billId = await resolveBillId(charge.metadata?.bill_id, charge.payment_intent, env);
    if (billId) {
      try {
        const bills = await sbQuery('billing_schedule', { 'id': `eq.${billId}`, 'select': 'amount_cents,refunded_cents,stripe_tax_transaction_id', 'limit': '1' }, env);
        const bill  = bills[0];
        // Stripe reports cumulative refunds on the charge, so a partial refund
        // leaves the bill paid and only a full refund reopens it.
        const fullyRefunded = bill && charge.amount_refunded >= bill.amount_cents;
        // Only the amount refunded since the last event is new — reversing the
        // cumulative total again would double-reverse earlier partial refunds.
        const newlyRefunded = charge.amount_refunded - (bill?.refunded_cents ?? 0);

        await sbUpdate('billing_schedule', billId, {
          refunded_cents: charge.amount_refunded,
          refunded_at:    new Date().toISOString(),
          ...(fullyRefunded ? { status: 'refunded', paid_at: null } : {}),
        }, env);

        // Tax reversals are full-only by policy. Bills are single-line-item, and
        // Stripe recommends full reversals for that shape — partial reversals make
        // tax reporting unreliable once the reversed tax stops being proportional
        // to the subtotal, and they interact badly with a later full reversal
        // (which does not supersede them, so the two double-count).
        //
        // A partial refund therefore reverses nothing and is flagged for manual
        // handling instead of being silently mis-filed.
        if (bill?.stripe_tax_transaction_id && env.STRIPE_SECRET_KEY && newlyRefunded > 0) {
          if (!fullyRefunded) {
            console.error(
              `[webhook] partial refund on bill ${billId} (${charge.amount_refunded} of ` +
              `${bill.amount_cents}) — tax NOT reversed. Partial reversals are blocked; ` +
              `fully reverse and re-record if this refund is intended to stand.`
            );
            await sbUpdate('billing_schedule', billId, {
              last_payment_error: `Partial refund of ${charge.amount_refunded} recorded; tax reversal requires manual handling`,
            }, env).catch(() => {});
          } else {
            await stripePost('/tax/transactions/create_reversal', {
              mode:                 'full',
              original_transaction: bill.stripe_tax_transaction_id,
              reference:            `refund-${billId}`,
            }, env.STRIPE_SECRET_KEY, `taxrev-${billId}`)
              .catch((err) => console.error('[webhook] tax reversal failed:', err.message));
          }
        }
      } catch (err) {
        console.error('Webhook refund update failed:', err.message);
      }
    }
  }

  if (event.type === 'charge.dispute.created') {
    const dispute = event.data.object;
    const billId  = await resolveBillId(dispute.metadata?.bill_id, dispute.payment_intent, env);
    if (billId) {
      try {
        await sbUpdate('billing_schedule', billId, {
          status:        'disputed',
          disputed_at:   new Date().toISOString(),
          dispute_reason: dispute.reason ?? null,
        }, env);
      } catch (err) {
        console.error('Webhook dispute update failed:', err.message);
      }
    }
  }

  return jsonResponse({ received: true });
}

// Charge and Dispute objects do not reliably carry the metadata we set on the
// PaymentIntent, so fall back to matching the stored intent id.
async function resolveBillId(metadataBillId, paymentIntentId, env) {
  if (metadataBillId) return metadataBillId;
  if (!paymentIntentId) return null;
  const rows = await sbQuery('billing_schedule', {
    'stripe_payment_intent_id': `eq.${paymentIntentId}`, 'select': 'id', 'limit': '1'
  }, env).catch(() => []);
  return rows[0]?.id ?? null;
}

// Commits a Stripe Tax calculation as a transaction once payment clears. Safe to
// call more than once — Stripe replays on the idempotency key, and an already
// recorded transaction short-circuits. Failures are logged, never thrown: the
// payment itself has succeeded and must not be rolled back over a tax write.
async function recordTaxTransaction({ billId, calculationId, alreadyRecorded, env }) {
  if (alreadyRecorded || !calculationId || !env.STRIPE_SECRET_KEY) return;
  try {
    const txn = await stripePost('/tax/transactions/create_from_calculation', {
      calculation: calculationId,
      reference:   billId,
    }, env.STRIPE_SECRET_KEY, `taxtxn-${billId}`);
    await sbUpdate('billing_schedule', billId, { stripe_tax_transaction_id: txn.id }, env);
  } catch (err) {
    // Most common cause: the calculation expired. Stripe Tax calculations carry an
    // `expires_at` 90 days after creation and cannot be committed past it.
    // Surfaced in logs so the sale can be reported manually.
    console.error(`[webhook] tax transaction failed for bill ${billId}:`, err.message);
  }
}

// ── Email template helpers ─────────────────────────────────────────────────────

function buildInviteHtml({ fullName, bizName, portalUrl }) {
  const name = escapeHtml(fullName || 'there');
  const biz  = escapeHtml(bizName);
  const url  = escapeHtml(portalUrl);
  return [
    '<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;max-width:540px;margin:0 auto;padding:32px 24px;color:#0D1117;background:#fff;">',
    `<img src="https://bytestreams.ai/assets/blue-side-slim-logo.png" alt="ByteStreams" style="height:36px;margin-bottom:28px;">`,
    `<h2 style="font-size:20px;font-weight:700;margin:0 0 12px;">Welcome to your DialTone portal, ${name}!</h2>`,
    `<p style="margin:0 0 16px;color:#444;">Your account for <strong>${biz}</strong> is ready.</p>`,
    `<a href="${url}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin-bottom:24px;">Sign in to your portal</a>`,
    `<p style="font-size:13px;color:#666;">Use this email address — a magic link will be sent. No password required.</p>`,
    `<hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0 16px;">`,
    `<p style="font-size:12px;color:#999;">ByteStreams · <a href="https://bytestreams.ai" style="color:#2563EB;">bytestreams.ai</a></p>`,
    '</body></html>'
  ].join('');
}

function buildSetupFeeEmailHtml({ fullName, dueDate, portalUrl }) {
  const name = escapeHtml(fullName || 'there');
  const url  = escapeHtml(portalUrl);
  return [
    '<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;max-width:540px;margin:0 auto;padding:32px 24px;color:#0D1117;background:#fff;">',
    `<img src="https://bytestreams.ai/assets/blue-side-slim-logo.png" alt="ByteStreams" style="height:36px;margin-bottom:28px;">`,
    `<h2 style="font-size:20px;font-weight:700;margin:0 0 12px;">Welcome to ByteStreams, ${name}!</h2>`,
    `<p style="margin:0 0 16px;color:#444;">A one-time setup fee of <strong>$100.00</strong> has been applied to your account.</p>`,
    `<table style="width:100%;border-collapse:collapse;margin-bottom:20px;"><tr style="background:#f9fafb;"><th style="text-align:left;padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Description</th><th style="text-align:right;padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Amount</th></tr><tr><td style="padding:12px 14px;font-size:14px;">One-Time Setup Fee</td><td style="padding:12px 14px;font-size:14px;text-align:right;">$100.00</td></tr></table>`,
    // Tax is assessed when the customer pays, not when this email is sent, so the
    // figure above is pre-tax. Saying so keeps the email from contradicting the
    // total shown at checkout.
    `<p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Applicable sales tax is calculated at checkout and shown before you confirm payment.</p>`,
    `<p style="margin:0 0 8px;font-size:14px;color:#444;"><strong>Due:</strong> ${escapeHtml(dueDate)}</p>`,
    `<p style="margin:0 0 24px;padding:12px 16px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;font-size:14px;color:#92400e;">Your onboarding process will begin once payment is received.</p>`,
    `<a href="${url}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin-bottom:24px;">Pay in your portal</a>`,
    `<hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0 16px;">`,
    `<p style="font-size:12px;color:#999;">ByteStreams · <a href="https://bytestreams.ai" style="color:#2563EB;">bytestreams.ai</a></p>`,
    '</body></html>'
  ].join('');
}
