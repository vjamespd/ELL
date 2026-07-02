import http from 'node:http';

const port = Number.parseInt(process.env.PORT || '8787', 10);
const host = process.env.HOST || '0.0.0.0';
const upstreamBaseUrl = process.env.NPPES_API_URL || 'https://npiregistry.cms.hhs.gov/api/';
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

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {}, origin);
    return;
  }

  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, { ok: true, service: 'ell-npi-verifier' }, origin);
    return;
  }

  if (request.method !== 'POST' || request.url !== '/verify') {
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
