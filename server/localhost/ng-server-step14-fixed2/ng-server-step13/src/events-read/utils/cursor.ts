export type EventsCursor = {
  occurredAt: string; // ISO date-time
  eventId: string; // UUID
};

export function encodeCursor(cursor: EventsCursor): string {
  const json = JSON.stringify(cursor);
  return Buffer.from(json, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function decodeCursor(value: string): EventsCursor {
  // Accept base64url or standard base64.
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);

  const json = Buffer.from(padded, 'base64').toString('utf8');
  const parsed = JSON.parse(json) as Partial<EventsCursor>;

  if (!parsed.occurredAt || !parsed.eventId) {
    throw new Error('Invalid cursor payload');
  }

  return { occurredAt: parsed.occurredAt, eventId: parsed.eventId };
}
