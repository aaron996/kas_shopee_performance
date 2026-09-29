import { createSign } from 'node:crypto';
import { ChatError } from '../chat/errors.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_URL = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

/**
 * Parse the service-account JSON key (the file Google Cloud downloads). Env
 * editors often keep the private key's newlines escaped, so restore them.
 */
export function parseServiceAccount(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ChatError('COD_EXPORT_CONFIG_INVALID', 'GOOGLE_SERVICE_ACCOUNT_JSON không phải JSON hợp lệ.', 503);
  }
  const clientEmail = parsed?.client_email?.trim();
  const privateKey = parsed?.private_key?.replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new ChatError('COD_EXPORT_CONFIG_INVALID', 'GOOGLE_SERVICE_ACCOUNT_JSON thiếu client_email hoặc private_key.', 503);
  }
  return { clientEmail, privateKey };
}

async function readJson(response, code, message) {
  const body = await response.text();
  if (!response.ok) {
    throw new ChatError(code, `${message} (HTTP ${response.status}: ${body.slice(0, 300)})`, 502);
  }
  return body ? JSON.parse(body) : {};
}

export async function fetchAccessToken({ clientEmail, privateKey }, { fetchImpl = fetch, now = Date.now() } = {}) {
  const issuedAt = Math.floor(now / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${signer.sign(privateKey, 'base64url')}`;

  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const data = await readJson(response, 'COD_EXPORT_GOOGLE_AUTH_FAILED', 'Không lấy được token Google');
  if (!data.access_token) {
    throw new ChatError('COD_EXPORT_GOOGLE_AUTH_FAILED', 'Google không trả access token.', 502);
  }
  return data.access_token;
}

function quoteSheet(title) {
  return `'${title.replace(/'/g, "''")}'`;
}

/** Minimal Sheets v4 client covering what the COD export needs. */
export function createSheetsClient({ accessToken, spreadsheetId, fetchImpl = fetch }) {
  const base = `${SHEETS_URL}/${encodeURIComponent(spreadsheetId)}`;

  async function call(path, { method = 'GET', body } = {}) {
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return readJson(response, 'COD_EXPORT_SHEETS_FAILED', 'Google Sheets từ chối yêu cầu');
  }

  const valuesPath = range => `/values/${encodeURIComponent(range)}`;

  return {
    async getSheets() {
      const data = await call('?fields=sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))');
      return (data.sheets ?? []).map(sheet => sheet.properties);
    },

    async batchUpdate(requests) {
      return call(':batchUpdate', { method: 'POST', body: { requests } });
    },

    async getValues(title, a1) {
      const data = await call(valuesPath(`${quoteSheet(title)}!${a1}`));
      return data.values ?? [];
    },

    async updateValues(title, a1, values) {
      return call(`${valuesPath(`${quoteSheet(title)}!${a1}`)}?valueInputOption=RAW`, {
        method: 'PUT',
        body: { values }
      });
    },

    async clearValues(title, a1) {
      return call(`${valuesPath(`${quoteSheet(title)}!${a1}`)}:clear`, { method: 'POST', body: {} });
    },

    async appendValues(title, a1, values) {
      return call(
        `${valuesPath(`${quoteSheet(title)}!${a1}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: 'POST', body: { values } }
      );
    }
  };
}
