import http from 'node:http';

const port = Number.parseInt(process.env.PORT || '8787', 10);
const host = process.env.HOST || '0.0.0.0';
const upstreamBaseUrl = process.env.NPPES_API_URL || 'https://npiregistry.cms.hhs.gov/api/';
const shopifyShopDomain = String(process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_STORE_DOMAIN || '')
  .trim()
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '');
const shopifyAdminAccessToken = String(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '').trim();
const shopifyApiVersion = String(process.env.SHOPIFY_API_VERSION || '2025-10').trim();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const approvedTaxonomyRules = [
  { credential: 'MD/DO', codePrefixes: ['20'] },
  { credential: 'NP', codePrefixes: ['363L'] },
  { credential: 'PA', codePrefixes: ['363A'] },
  { credential: 'ND', codePrefixes: ['175F'] },
  { credential: 'DDS/DMD', codePrefixes: ['1223'] },
  { credential: 'DPM', codePrefixes: ['213E'] },
];
const approvedCredentialSummary = approvedTaxonomyRules.map((rule) => rule.credential).join(', ');
const providerCredentials = new Set([
  'MD',
  'DO',
  'MBBS / MBChB',
  'DDS',
  'DMD',
  'DPM',
  'DVM',
  'VMD',
  'NP',
  'APRN',
  'ARNP',
  'APN',
  'FNP / FNP-C / FNP-BC',
  'AGNP / AGPCNP / AGACNP',
  'ACNP / ACNPC-AG',
  'PNP / PNP-PC / PNP-AC',
  'PMHNP / PMHNP-BC',
  'WHNP / WHNP-BC',
  'NNP / NNP-BC',
  'ENP / ENP-C',
  'ONP',
  'CNS',
  'CNM',
  'CRNA / CRNA-APRN',
  'PA / PA-C',
]);

function normalizeOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function isLocalHostname(value) {
  return ['127.0.0.1', 'localhost', '0.0.0.0', '::1'].includes(String(value || '').toLowerCase());
}

function isLocalOrigin(value) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return isLocalHostname(url.hostname);
  } catch (error) {
    return false;
  }
}

function sendJson(response, statusCode, payload, origin = '*') {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });

  response.end(JSON.stringify(payload));
}

function getAllowedOrigin(requestOrigin) {
  const normalizedOrigin = normalizeOrigin(requestOrigin);
  const normalizedAllowedOrigins = allowedOrigins.map(normalizeOrigin);

  if (!normalizedOrigin || normalizedAllowedOrigins.includes('*')) return '*';
  if (isLocalOrigin(normalizedOrigin)) return normalizedOrigin;
  return normalizedAllowedOrigins.includes(normalizedOrigin) ? normalizedOrigin : normalizedAllowedOrigins[0] || '*';
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';

    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Request body too large.'));
        request.destroy();
      }
    });

    request.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON body.'));
      }
    });

    request.on('error', reject);
  });
}

function cleanText(value, maxLength = 500) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function cleanEmail(value) {
  return cleanText(value, 254).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

function getSubmittedProviderRegistration(body) {
  return {
    firstName: cleanText(body?.first_name, 80),
    lastName: cleanText(body?.last_name, 80),
    credentials: cleanText(body?.credentials, 80),
    email: cleanEmail(body?.email),
    phone: cleanText(body?.phone, 80),
    providerIdentifier: cleanText(body?.provider_license_or_identifier, 120),
    medicalSpecialty: cleanText(body?.medical_specialty, 160),
    clinicOrInstitution: cleanText(body?.clinic_or_institution, 180),
    website: cleanText(body?.website, 200),
    city: cleanText(body?.city, 120),
    stateOrProvince: cleanText(body?.state_or_province, 120),
    country: cleanText(body?.country, 120),
    orderingOrShippingStates: cleanText(body?.ordering_or_shipping_states, 240),
    primaryProductInterests: cleanText(body?.primary_product_interests, 240),
    expectedOrderingProfile: cleanText(body?.expected_ordering_profile, 240),
    additionalNotes: cleanText(body?.additional_notes, 1200),
    submittedAt: cleanText(body?.submitted_at, 80) || new Date().toISOString(),
  };
}

function validateProviderRegistration(payload) {
  const missing = [];

  if (!payload.firstName) missing.push('first name');
  if (!payload.lastName) missing.push('last name');
  if (!payload.credentials) missing.push('credentials');
  if (!payload.email || !isValidEmail(payload.email)) missing.push('valid email');
  if (!payload.phone) missing.push('phone');
  if (!payload.medicalSpecialty) missing.push('medical specialty');
  if (!payload.clinicOrInstitution) missing.push('clinic or institution');
  if (!payload.city) missing.push('city');
  if (!payload.stateOrProvince) missing.push('state or province');
  if (!payload.country) missing.push('country');

  if (payload.credentials && !providerCredentials.has(payload.credentials)) {
    return {
      valid: false,
      message: 'Please choose a supported provider credential from the registration form.',
    };
  }

  if (missing.length) {
    return {
      valid: false,
      message: `Please complete the required provider registration fields: ${missing.join(', ')}.`,
    };
  }

  return { valid: true };
}

function buildProviderReviewNote(payload) {
  const rows = [
    ['Review status', 'Provider account setup submitted for internal review'],
    ['Submitted at', payload.submittedAt],
    ['Provider', `${payload.firstName} ${payload.lastName}`.trim()],
    ['Credentials', payload.credentials],
    ['Email', payload.email],
    ['Phone', payload.phone],
    ['Provider license or identifier', payload.providerIdentifier || 'Not provided'],
    ['Medical specialty', payload.medicalSpecialty],
    ['Clinic or institution', payload.clinicOrInstitution],
    ['Website', payload.website || 'Not provided'],
    ['Location', [payload.city, payload.stateOrProvince, payload.country].filter(Boolean).join(', ')],
    ['Ordering or shipping states', payload.orderingOrShippingStates || 'Not provided'],
    ['Primary product interests', payload.primaryProductInterests || 'Not provided'],
    ['Expected ordering profile', payload.expectedOrderingProfile || 'Not provided'],
    ['Additional notes', payload.additionalNotes || 'None'],
  ];

  return rows.map(([label, value]) => `${label}: ${value}`).join('\n');
}

function getProviderTags(existingTags = '') {
  const tags = new Set(
    String(existingTags || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  );

  tags.add('provider-registration');
  if (!tags.has('provider-approved')) tags.add('provider-pending');

  return Array.from(tags).join(', ');
}

function assertShopifyRegistrationConfigured() {
  if (!shopifyShopDomain || !shopifyAdminAccessToken) {
    const missing = [
      shopifyShopDomain ? '' : 'SHOPIFY_SHOP_DOMAIN',
      shopifyAdminAccessToken ? '' : 'SHOPIFY_ADMIN_ACCESS_TOKEN',
    ].filter(Boolean);

    throw new Error(`Provider registration is not configured. Missing ${missing.join(' and ')}.`);
  }
}

async function shopifyAdminRequest(path, options = {}) {
  assertShopifyRegistrationConfigured();

  const url = new URL(`https://${shopifyShopDomain}/admin/api/${shopifyApiVersion}${path}`);
  if (options.searchParams) {
    Object.entries(options.searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  const adminResponse = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': shopifyAdminAccessToken,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await adminResponse.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      payload = { raw: text };
    }
  }

  if (!adminResponse.ok) {
    const details = payload?.errors ? JSON.stringify(payload.errors) : text || adminResponse.statusText;
    throw new Error(`Shopify Admin API request failed with status ${adminResponse.status}: ${details}`);
  }

  return payload || {};
}

async function findCustomerByEmail(email) {
  const payload = await shopifyAdminRequest('/customers/search.json', {
    searchParams: {
      query: `email:${email}`,
    },
  });

  const customers = Array.isArray(payload?.customers) ? payload.customers : [];
  return customers[0] || null;
}

async function upsertProviderCustomer(payload) {
  const existingCustomer = await findCustomerByEmail(payload.email);
  const reviewNote = buildProviderReviewNote(payload);

  if (existingCustomer?.id) {
    const existingNote = cleanText(existingCustomer.note, 2000);
    const nextNote = existingNote ? `${reviewNote}\n\n--- Previous customer note ---\n${existingNote}` : reviewNote;
    const updated = await shopifyAdminRequest(`/customers/${existingCustomer.id}.json`, {
      method: 'PUT',
      body: {
        customer: {
          id: existingCustomer.id,
          first_name: payload.firstName,
          last_name: payload.lastName,
          email: payload.email,
          note: nextNote,
          tags: getProviderTags(existingCustomer.tags),
        },
      },
    });

    return {
      customer: updated.customer,
      action: 'updated',
    };
  }

  const created = await shopifyAdminRequest('/customers.json', {
    method: 'POST',
    body: {
      customer: {
        first_name: payload.firstName,
        last_name: payload.lastName,
        email: payload.email,
        verified_email: false,
        note: reviewNote,
        tags: getProviderTags(),
      },
    },
  });

  return {
    customer: created.customer,
    action: 'created',
  };
}

function sanitizeNpi(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 10);
}

function getLuhnCheckDigit(baseNumber) {
  let sum = 0;
  let shouldDouble = true;

  for (let index = baseNumber.length - 1; index >= 0; index -= 1) {
    let digit = Number.parseInt(baseNumber[index], 10);
    if (Number.isNaN(digit)) return null;

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return (10 - (sum % 10)) % 10;
}

function hasValidNpiCheckDigit(npi) {
  const normalized = sanitizeNpi(npi);
  if (normalized.length !== 10) return false;

  const checkDigit = Number.parseInt(normalized[9], 10);
  const computed = getLuhnCheckDigit(`80840${normalized.slice(0, 9)}`);
  return computed !== null && computed === checkDigit;
}

function buildLookupUrl(npi) {
  const url = new URL(upstreamBaseUrl);
  url.searchParams.set('version', '2.1');
  url.searchParams.set('number', npi);
  return url;
}

function getRecordName(record) {
  const basic = record?.basic || {};
  return basic.organization_name
    || [basic.first_name, basic.last_name].filter(Boolean).join(' ')
    || [basic.authorized_official_first_name, basic.authorized_official_last_name].filter(Boolean).join(' ')
    || null;
}

function getPrimaryTaxonomy(record) {
  const taxonomies = Array.isArray(record?.taxonomies) ? record.taxonomies : [];
  const primary = taxonomies.find((entry) => entry?.primary) || taxonomies[0];
  return primary?.desc || primary?.taxonomy_desc || null;
}

function getNormalizedTaxonomies(record) {
  const taxonomies = Array.isArray(record?.taxonomies) ? record.taxonomies : [];
  return taxonomies
    .map((entry) => ({
      code: String(entry?.code || entry?.taxonomy_code || '').trim().toUpperCase(),
      desc: String(entry?.desc || entry?.taxonomy_desc || '').trim(),
      primary: entry?.primary === true,
      license: String(entry?.license || entry?.license_number || '').trim() || null,
    }))
    .filter((entry) => entry.code || entry.desc);
}

function findApprovedTaxonomy(record) {
  const taxonomies = getNormalizedTaxonomies(record);

  for (const taxonomy of taxonomies) {
    const match = approvedTaxonomyRules.find((rule) =>
      rule.codePrefixes.some((prefix) => taxonomy.code.startsWith(prefix)));

    if (match) {
      return {
        credential: match.credential,
        taxonomy,
      };
    }
  }

  return null;
}

function getDeactivationDate(record) {
  const basic = record?.basic || {};
  return basic.deactivation_date
    || basic.deactivationDate
    || basic['NPI Deactivation Date']
    || null;
}

async function lookupNpiAgainstNppes(npi) {
  const response = await fetch(buildLookupUrl(npi), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`NPPES lookup failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const results = Array.isArray(payload?.results) ? payload.results : [];

  if (!results.length) {
    return {
      valid: false,
      message: 'We could not find that NPI in the official NPPES registry.',
    };
  }

  const record = results[0];
  const deactivationDate = getDeactivationDate(record);
  if (deactivationDate) {
    return {
      valid: false,
      message: 'This NPI appears in NPPES but is marked as deactivated.',
    };
  }

  const approvedTaxonomy = findApprovedTaxonomy(record);
  if (!approvedTaxonomy) {
    return {
      valid: false,
      statusCode: 403,
      message: `This NPI is active in NPPES, but the provider type is not currently eligible for ELL ordering. Approved provider types include ${approvedCredentialSummary}.`,
      profile: {
        number: record?.number || npi,
        name: getRecordName(record),
        enumerationType: record?.enumeration_type || null,
        taxonomy: getPrimaryTaxonomy(record),
        source: 'NPPES NPI Registry',
      },
    };
  }

  return {
    valid: true,
    message: 'NPI verified against the official NPPES registry.',
    profile: {
      number: record?.number || npi,
      name: getRecordName(record),
      enumerationType: record?.enumeration_type || null,
      taxonomy: approvedTaxonomy.taxonomy.desc || getPrimaryTaxonomy(record),
      taxonomyCode: approvedTaxonomy.taxonomy.code || null,
      credential: approvedTaxonomy.credential,
      license: approvedTaxonomy.taxonomy.license,
      source: 'NPPES NPI Registry',
    },
  };
}

const server = http.createServer(async (request, response) => {
  const origin = getAllowedOrigin(request.headers.origin);
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname.replace(/\/+$/, '') || '/';

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {}, origin);
    return;
  }

  if (request.method === 'GET' && pathname === '/health') {
    sendJson(response, 200, {
      ok: true,
      service: 'ell-provider-access',
      providerRegistrationConfigured: Boolean(shopifyShopDomain && shopifyAdminAccessToken),
      shopDomain: shopifyShopDomain || null,
    }, origin);
    return;
  }

  if (request.method === 'POST' && pathname === '/provider-registration') {
    try {
      const body = await readJsonBody(request);
      const providerRegistration = getSubmittedProviderRegistration(body);
      const validation = validateProviderRegistration(providerRegistration);

      if (!validation.valid) {
        sendJson(response, 422, {
          ok: false,
          message: validation.message,
        }, origin);
        return;
      }

      const result = await upsertProviderCustomer(providerRegistration);

      sendJson(response, 200, {
        ok: true,
        status: 'pending_review',
        action: result.action,
        customer: {
          id: result.customer?.id || null,
          email: result.customer?.email || providerRegistration.email,
          tags: result.customer?.tags || getProviderTags(),
        },
        message: 'Provider registration received. A Shopify customer profile is queued for internal ELL review.',
      }, origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const isConfigurationError = message.includes('Provider registration is not configured');

      sendJson(response, isConfigurationError ? 503 : 502, {
        ok: false,
        message: isConfigurationError
          ? 'Provider registration is not configured yet. Please contact the ELL team.'
          : 'Provider registration could not be saved to Shopify Customers right now. Please try again shortly.',
        error: message,
      }, origin);
    }
    return;
  }

  if (request.method !== 'POST' || pathname !== '/verify') {
    sendJson(response, 404, { valid: false, message: 'Not found.' }, origin);
    return;
  }

  try {
    const body = await readJsonBody(request);
    const npi = sanitizeNpi(body?.npi);

    if (npi.length !== 10) {
      sendJson(response, 400, {
        valid: false,
        message: 'A valid 10-digit NPI is required.',
      }, origin);
      return;
    }

    if (!hasValidNpiCheckDigit(npi)) {
      sendJson(response, 422, {
        valid: false,
        message: 'That NPI does not pass the official check-digit format test.',
      }, origin);
      return;
    }

    const result = await lookupNpiAgainstNppes(npi);
    sendJson(response, result.valid ? 200 : (result.statusCode || 404), {
      valid: result.valid,
      message: result.message,
      profile: result.profile || null,
    }, origin);
  } catch (error) {
    sendJson(response, 502, {
      valid: false,
      message: 'Official NPI verification is temporarily unavailable.',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, origin);
  }
});

server.listen(port, host, () => {
  const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  console.log(`ELL NPI verifier listening on http://${displayHost}:${port}`);
});
