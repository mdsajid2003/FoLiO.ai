import { ReconciliationReport, ExtractedCsvData } from '../../types/index.ts';
import { geminiExtract, buildCsvSample } from './gemini-extract.ts';
import { logEvent } from '../logger.ts';

const CLAUDE_ANALYSIS_PROMPT = `You are a financial data analyst for Indian e-commerce sellers.
You receive a structured JSON summary of a CSV file (already extracted by another system).
Analyze it for financial insights and return ONLY valid JSON.

Return this exact JSON shape:
{
  "totalRevenue": 0,
  "totalExpenses": 0,
  "netProfit": 0,
  "recoverableLeakage": 0,
  "leakageBreakdown": [{"type": "string", "amount": 0, "count": 0, "confidence": "high|medium|low", "description": "string"}],
  "taxInsights": {"gstObserved": 0, "tcsObserved": 0, "tdsObserved": 0, "notes": "string"},
  "narrative": "3-4 sentence plain-English summary of findings",
  "confidence": "high|medium|low",
  "warnings": ["array of strings about data limitations"]
}

Rules:
- Use ONLY the numbers from the provided data summary. Do NOT invent figures.
- If a financial metric cannot be determined, set it to 0 and add a warning.
- Set confidence to "low" if the data is ambiguous or has few financial columns.
- End the narrative with: "This AI-assisted analysis is approximate. Verify with your actual records."`;

function parseModelJson<T>(text: string, label: string): T {
  const trimmed = text.trim();
  const jsonBlock = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/s, '')
    : trimmed;
  try {
    return JSON.parse(jsonBlock) as T;
  } catch {
    logEvent('warn', 'model_json_parse_failed', { label, preview: trimmed.slice(0, 240) });
    throw new Error(`AI returned invalid JSON (${label}). Try again or upload a supported settlement CSV.`);
  }
}

interface ClaudeAnalysisResult {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  recoverableLeakage: number;
  leakageBreakdown: { type: string; amount: number; count: number; confidence: string; description: string }[];
  taxInsights: { gstObserved: number; tcsObserved: number; tdsObserved: number; notes: string };
  narrative: string;
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
}

async function analyzeWithClaude(extractedData: ExtractedCsvData, filename: string): Promise<ClaudeAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_anthropic_api_key_here' || apiKey.length < 10) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const dataPayload = JSON.stringify(extractedData);
  const userMessage = `Analyze this extracted CSV data from "${filename}":\n\n${dataPayload}\n\nReturn JSON analysis only.`;

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: CLAUDE_ANALYSIS_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => ('text' in block ? String(block.text) : ''))
    .join('');

  logEvent('info', 'claude_analysis_success', { filename, responseLength: text.length });
  return parseModelJson<ClaudeAnalysisResult>(text, 'claude_tier2');
}

async function analyzeWithClaudeDirect(rawCsv: string, filename: string): Promise<ClaudeAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_anthropic_api_key_here' || apiKey.length < 10) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const { sample, totalRows, headers } = buildCsvSample(rawCsv);

  const userMessage = `FILE: ${filename}
TOTAL ROWS: ${totalRows}
COLUMNS: ${headers.join(', ')}

SAMPLE DATA (first 20 rows):
${sample}

Analyze this raw CSV data and return JSON analysis only.`;

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: CLAUDE_ANALYSIS_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => ('text' in block ? String(block.text) : ''))
    .join('');

  logEvent('info', 'claude_direct_analysis_success', { filename, responseLength: text.length });
  return parseModelJson<ClaudeAnalysisResult>(text, 'claude_direct');
}

function buildReportFromAnalysis(analysis: ClaudeAnalysisResult, filename: string, rowCount: number, platform?: string): ReconciliationReport {
  const resolvedPlatform = (platform?.toLowerCase().includes('flipkart') ? 'flipkart' : 'amazon') as 'amazon' | 'flipkart';

  return {
    filename,
    platform: resolvedPlatform,
    totalRevenue: analysis.totalRevenue ?? 0,
    totalExpenses: analysis.totalExpenses ?? 0,
    netProfit: analysis.netProfit ?? 0,
    recoverableLeakage: analysis.recoverableLeakage ?? 0,
    tcsCollected: analysis.taxInsights?.tcsObserved ?? 0,
    tcsClaimable: analysis.taxInsights?.tcsObserved ?? 0,
    gstMismatchCount: 0,
    confidence: analysis.confidence ?? 'low',
    narrative: analysis.narrative ?? 'AI-assisted analysis completed. Results are approximate.',

    leakageBreakdown: (analysis.leakageBreakdown ?? []).map(b => ({
      type: b.type,
      amount: b.amount,
      count: b.count,
      confidence: (['high', 'medium', 'low'].includes(b.confidence) ? b.confidence : 'low') as 'high' | 'medium' | 'low',
      description: b.description,
    })),
    leakageItems: [],
    gstMismatches: [],
    skuProfitability: [],
    monthlyTrends: [],
    orderRecon: [],
    waterfall: [
      { label: 'Revenue (estimated)', value: analysis.totalRevenue ?? 0, isPositive: true },
      { label: 'Expenses (estimated)', value: -(analysis.totalExpenses ?? 0), isPositive: false },
      { label: 'Net (estimated)', value: analysis.netProfit ?? 0, isPositive: (analysis.netProfit ?? 0) >= 0 },
    ],

    analysisSource: 'ai_assisted',

    dataQuality: {
      invalidRowCount: 0,
      excludedRowCount: 0,
      missingRequiredColumns: [],
      assumptionsUsed: ['All values are AI-estimated from a 20-row sample', ...(analysis.warnings ?? [])],
      warnings: analysis.warnings ?? [],
      financeGradeReady: false,
      issueSample: [],
    },

    createdAt: new Date().toISOString(),
    rowCount,
  };
}

export async function analyzeWithAI(rawCsv: string, filename: string): Promise<ReconciliationReport> {
  const lines = rawCsv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  const totalRows = lines.length - 1;

  // Tier 1: try Gemini Flash (free) for structured extraction
  let extractedData: ExtractedCsvData | null = null;
  try {
    extractedData = await geminiExtract(rawCsv, filename);
    logEvent('info', 'ai_tier1_gemini_success', { filename });
  } catch (err) {
    logEvent('warn', 'ai_tier1_gemini_failed_falling_back', { filename, error: err instanceof Error ? err.message : String(err) });
  }

  // Tier 2: send structured data to Claude for analysis
  if (extractedData) {
    try {
      const analysis = await analyzeWithClaude(extractedData, filename);
      logEvent('info', 'ai_tier2_claude_success', { filename, mode: 'two_tier' });
      return buildReportFromAnalysis(analysis, filename, extractedData.rowCount ?? totalRows, extractedData.platform);
    } catch (err) {
      logEvent('warn', 'ai_tier2_claude_failed', { filename, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Fallback: send raw sample directly to Claude (more tokens but still works)
  try {
    const analysis = await analyzeWithClaudeDirect(rawCsv, filename);
    logEvent('info', 'ai_fallback_claude_direct_success', { filename });
    return buildReportFromAnalysis(analysis, filename, totalRows);
  } catch (err) {
    logEvent('error', 'ai_all_tiers_failed', { filename, error: err instanceof Error ? err.message : String(err) });
    throw new Error(
      'AI analysis failed: neither Gemini nor Claude could process this file. ' +
      'Please ensure your API keys are configured, or upload an Amazon/Flipkart settlement report for deterministic analysis.'
    );
  }
}
