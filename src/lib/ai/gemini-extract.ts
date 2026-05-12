import { ExtractedCsvData } from '../../types/index.ts';
import { logEvent } from '../logger.ts';

const GEMINI_EXTRACT_PROMPT = `You are a data extraction tool. Given CSV headers and sample rows, return a JSON object describing the data structure. Do NOT analyze or give advice — only extract and classify.

Return ONLY valid JSON with this exact shape:
{
  "dataType": "string describing what kind of data this is",
  "columns": [{"name": "col_name", "type": "numeric|text|date", "sample": "example_value"}],
  "financialColumns": [{"name": "col_name", "total": 0, "currency": "INR"}],
  "rowCount": 0,
  "dateRange": {"earliest": "YYYY-MM-DD", "latest": "YYYY-MM-DD"},
  "platform": "Amazon|Flipkart|Shopify|Unknown",
  "keyObservations": ["max 5 short observations about the data"]
}

For financialColumns, sum the numeric values from the sample rows for columns that look like monetary amounts. Set currency to "INR" unless clearly otherwise.`;

export function buildCsvSample(rawCsv: string, maxRows = 20): { sample: string; totalRows: number; headers: string[] } {
  const lines = rawCsv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  const headers = lines[0]?.split(/[,\t]/).map(h => h.replace(/"/g, '').trim()) ?? [];
  const dataLines = lines.slice(1).filter(l => l.trim() !== '');

  let sampleLines: string[];
  if (dataLines.length <= maxRows * 3) {
    sampleLines = dataLines.slice(0, maxRows * 3);
  } else {
    // Sample from start, middle, and end to catch all TransactionType variants in large files
    const mid = Math.floor(dataLines.length / 2);
    const startRows = dataLines.slice(0, maxRows);
    const midRows = dataLines.slice(mid - Math.floor(maxRows / 2), mid + Math.floor(maxRows / 2));
    const endRows = dataLines.slice(-maxRows);
    // Deduplicate by content
    const seen = new Set<string>();
    sampleLines = [...startRows, ...midRows, ...endRows].filter(l => {
      if (seen.has(l)) return false;
      seen.add(l);
      return true;
    });
  }

  const sample = [lines[0], ...sampleLines].join('\n');
  return { sample, totalRows: dataLines.length, headers };
}

export async function geminiExtract(rawCsv: string, filename: string): Promise<ExtractedCsvData> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here' || apiKey.length < 10) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const { sample, totalRows, headers } = buildCsvSample(rawCsv);

  const userMessage = `FILE: ${filename}
TOTAL ROWS: ${totalRows}
COLUMNS: ${headers.join(', ')}

SAMPLE DATA (first 20 rows):
${sample}

Extract the structure and return JSON only.`;

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `${GEMINI_EXTRACT_PROMPT}\n\n${userMessage}` }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1200,
        responseMimeType: 'application/json',
      },
    });

    const text = result.response.text();
    logEvent('info', 'gemini_extract_success', { filename, tokens: text.length });

    const parsed = JSON.parse(text) as ExtractedCsvData;
    parsed.rowCount = totalRows;
    return parsed;
  } catch (err) {
    logEvent('warn', 'gemini_extract_failed', { filename, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
