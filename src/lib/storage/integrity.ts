import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { DataIntegrityRecord, IntegrityCheck } from '../../types/index.ts';

const MAX_STORE_ENTRIES = 2000; // hard cap — ~1 KB each ≈ 2 MB max
interface StoredRecord extends DataIntegrityRecord { storedAt: number; }

// #L fix: persist integrity records to disk so "file was amended" warnings survive
// server restarts. Without this, rememberIntegrity() can never fire on the second
// upload if the server was restarted between the first and second upload.
const INTEGRITY_FILE = path.join(process.cwd(), '.data', 'integrity-store.json');

function loadStoredRecords(): Map<string, StoredRecord> {
  try {
    if (!fs.existsSync(INTEGRITY_FILE)) return new Map();
    const raw = fs.readFileSync(INTEGRITY_FILE, 'utf8');
    const entries = JSON.parse(raw) as Array<[string, StoredRecord]>;
    return new Map(entries);
  } catch {
    return new Map();
  }
}

function persistStoreAsync(map: Map<string, StoredRecord>): void {
  // Non-blocking write — integrity persistence is best-effort
  setImmediate(() => {
    try {
      const dir = path.dirname(INTEGRITY_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(INTEGRITY_FILE, JSON.stringify(Array.from(map.entries())), 'utf8');
    } catch { /* non-fatal */ }
  });
}

const store = loadStoredRecords();

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function firstDataLine(content: string): string {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim() !== '');
  return lines.length >= 2 ? lines[1] : lines[0] ?? '';
}

function lastDataLine(content: string): string {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim() !== '');
  return lines.length >= 2 ? lines[lines.length - 1] : lines[lines.length - 1] ?? '';
}

export function createIntegrityRecord(filename: string, rawContent: string, rowCount: number): DataIntegrityRecord {
  return {
    filename,
    uploadedAt: new Date().toISOString(),
    rowCount,
    checksum: sha256(rawContent),
    firstRowHash: sha256(firstDataLine(rawContent)),
    lastRowHash: sha256(lastDataLine(rawContent)),
  };
}

export function verifyIntegrity(current: string, previous: DataIntegrityRecord): IntegrityCheck {
  const checksum = sha256(current);
  const changeDetected = checksum !== previous.checksum;
  return {
    matches: !changeDetected,
    previousChecksum: previous.checksum,
    currentChecksum: checksum,
    changeDetected,
    message: changeDetected
      ? 'Report content has changed since last upload. Amazon may have retroactively amended this settlement period. Re-run reconciliation with the new file.'
      : 'Checksum matches previous upload for this filename.',
  };
}

/** @internal Server-side: remember last upload per user+filename. Evicts oldest entries at cap. */
export function rememberIntegrity(userId: string, filename: string, record: DataIntegrityRecord): void {
  const key = `${userId}::${filename}`;
  if (store.size >= MAX_STORE_ENTRIES && !store.has(key)) {
    // Evict oldest entry by insertion order (Map preserves insertion order)
    const firstKey = store.keys().next().value;
    if (firstKey !== undefined) store.delete(firstKey);
  }
  store.set(key, { ...record, storedAt: Date.now() });
  persistStoreAsync(store); // #L fix: write through to disk
}

export function checkIntegrityAgainstStore(
  userId: string,
  filename: string,
  rawContent: string,
  rowCount: number,
): { record: DataIntegrityRecord; check: IntegrityCheck | null } {
  const key = `${userId}::${filename}`;
  const prev = store.get(key);
  const record = createIntegrityRecord(filename, rawContent, rowCount);
  if (!prev) {
    rememberIntegrity(userId, filename, record);
    return { record, check: null };
  }
  const check = verifyIntegrity(rawContent, prev);
  rememberIntegrity(userId, filename, record);
  return { record, check };
}
