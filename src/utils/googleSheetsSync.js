import Papa from 'papaparse';

const SPREADSHEET_ID = '1eZCDlKCrZVZAac6j-kBbKPgEmIQcRlTabAFzsl1zwGA';

const TAB_GIDS = {
  pick: '1312031199',
  deli: '940798880',
  ca1: '1405399014'
};

export function getGoogleSheetCsvUrl(gid, sheetId = SPREADSHEET_ID) {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

export async function fetchSheetTabCsv(gid, sheetId = SPREADSHEET_ID) {
  const url = getGoogleSheetCsvUrl(gid, sheetId);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('FILE_PRIVATE');
      }
      throw new Error(`HTTP_${res.status}`);
    }

    const text = await res.text();
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => {
          if (results.data && results.data.length > 0) {
            resolve(results.data);
          } else {
            reject(new Error('EMPTY_DATA'));
          }
        },
        error: (err) => reject(err)
      });
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('REQUEST_TIMEOUT:GOOGLE_SHEET');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function syncAllGoogleSheetTabs(sheetId = SPREADSHEET_ID) {
  try {
    const [pickData, deliData, ca1Data] = await Promise.all([
      fetchSheetTabCsv(TAB_GIDS.pick, sheetId),
      fetchSheetTabCsv(TAB_GIDS.deli, sheetId),
      fetchSheetTabCsv(TAB_GIDS.ca1, sheetId)
    ]);

    return {
      success: true,
      pickData,
      deliData,
      ca1Data: ca1Data || null
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}
