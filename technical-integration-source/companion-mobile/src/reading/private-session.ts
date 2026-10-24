import type { BirthRecordV1 } from '../domain/contracts';
import { calculateChart } from '../domain/calculator';
import { prepareBirthRecord } from '../domain/birth';
import { calculateComposite, createParticipantSnapshot } from '../domain/composite';
import { runtime } from '../content/records';
import { issueDesignPreviewScope } from './eligibility';

/** Explicit, in-memory local design import. No persistence, remote transport or approval. */
export function createPrivateReadingSession(births: readonly BirthRecordV1[]) {
  if (!Array.isArray(births) || births.length !== 2 || births[0].id === births[1].id) throw Error('Choose two distinct local birth records.');
  const participants = births.map(raw => {
    const birth = prepareBirthRecord(raw);
    return createParticipantSnapshot({ origin: 'application-calculated', personId: birth.id,
      chartVersionId: `${birth.id}:${birth.updatedAt}`, birth, facts: calculateChart(birth) });
  });
  const [primary, secondary] = participants;
  const acts = participants.flatMap(p => p.facts.activations);
  const gates = new Set(acts.map(a => a.gate));
  const cohort = new Set(acts.flatMap(a => [`gate-${String(a.gate).padStart(2, '0')}`, `gate-${String(a.gate).padStart(2, '0')}-line-${a.line}`]));
  for (const channel of runtime.channels) if (channel.gates.some(g => gates.has(g))) {
    cohort.add(channel.id);
    for (const g of channel.gates) cohort.add(`gate-${String(g).padStart(2, '0')}`);
  }
  return { primary, secondary, pair: calculateComposite(primary, secondary),
    names: Object.fromEntries(participants.map(p => [p.personId, p.birth.name])),
    inputAssurance: 'recorded-exact-minute-not-independently-verified' as const,
    capability: issueDesignPreviewScope({ cohort: [...cohort], variantIds: ['r4'] }) };
}
export type PrivateReadingSession = ReturnType<typeof createPrivateReadingSession>;

export function parsePrivateReadingInput(text: string): BirthRecordV1[] {
  if (text.length > 30000) throw Error('The local input is too large.');
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value) || value.length !== 2) throw Error('Provide a JSON array containing two birth records.');
  // Native preparation and issuance validate the complete input before returning a session.
  createPrivateReadingSession(value);
  return value;
}
