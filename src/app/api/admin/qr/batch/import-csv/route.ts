import { NextResponse, type NextRequest } from 'next/server';

import { requireAdmin } from '@/lib/auth/requireAdmin';
import { db } from '@/lib/db/client';
import {
  BatchValidationError,
  createQrBatch,
  DuplicateQrNamesError,
  InvalidTargetUrlError,
} from '@/lib/qr/batch';
import { CsvParseError, parseQrCsv } from '@/lib/qr/csv';

// Caps the raw upload size before we even try to parse it (bulk-import
// endpoints must be size-bounded — see docs/GUARDRAILS.md).
const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2MB

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const csvText = await request.text();
  if (csvText.length === 0) {
    return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
  }
  if (Buffer.byteLength(csvText, 'utf8') > MAX_CSV_BYTES) {
    return NextResponse.json({ error: 'CSV exceeds the 2MB upload limit' }, { status: 413 });
  }

  let entries;
  try {
    entries = parseQrCsv(csvText);
  } catch (error) {
    if (error instanceof CsvParseError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const batchName = `csv-import-${new Date().toISOString()}`;

  try {
    const result = await createQrBatch(db, entries, batchName);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateQrNamesError) {
      return NextResponse.json({ error: error.message, names: error.names }, { status: 409 });
    }
    if (error instanceof InvalidTargetUrlError) {
      return NextResponse.json({ error: error.message, urls: error.urls }, { status: 400 });
    }
    if (error instanceof BatchValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
