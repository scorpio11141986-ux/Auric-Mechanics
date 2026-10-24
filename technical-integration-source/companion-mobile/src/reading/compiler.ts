import { canonicalJson, contentHash, sha256 } from '../domain/composite-hash';
import type { EditorialIssue, JsonValue, MeaningGranularity, MeaningUnit, MeaningVariant, SelectedSpan, SourceField, SourceFieldRef } from './contracts';
import type { CenterId } from '../domain/contracts';

const digest = /^[0-9a-f]{64}$/;
const deeplyFrozen = new WeakSet<object>(), validatedUnits = new WeakSet<object>();
export class ReadingSourceError extends Error {
  constructor(public code: 'SOURCE_FIELD_MISMATCH' | 'SOURCE_SPAN_MISMATCH' | 'INVALID_SOURCE', message: string) { super(message); }
}
export function freezeReadingValue<T>(value: T): T {
  if (value && typeof value === 'object' && !deeplyFrozen.has(value)) {
    Object.values(value).forEach(freezeReadingValue); Object.freeze(value); deeplyFrozen.add(value);
  }
  return value;
}
export function resolveSourcePointer(artifact: unknown, pointer: string): unknown {
  if (typeof pointer !== 'string' || (pointer !== '' && !pointer.startsWith('/')) || /~(?![01])/u.test(pointer)) throw new ReadingSourceError('SOURCE_FIELD_MISMATCH', 'Invalid JSON source pointer.');
  let current = artifact;
  if (!pointer) return current;
  for (const encoded of pointer.slice(1).split('/')) {
    const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, key) || ['__proto__', 'prototype', 'constructor'].includes(key)) throw new ReadingSourceError('SOURCE_FIELD_MISMATCH', 'Source field does not resolve.');
    if (Array.isArray(current) && !/^(0|[1-9][0-9]*)$/.test(key)) throw new ReadingSourceError('SOURCE_FIELD_MISMATCH', 'Noncanonical array source index.');
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
export function selectSourceSpan(text: string, startCodePoint: number, endCodePoint: number, granularity: SelectedSpan['granularity']): SelectedSpan {
  const points = Array.from(text);
  if (!Number.isInteger(startCodePoint) || !Number.isInteger(endCodePoint) || startCodePoint < 0 || endCodePoint <= startCodePoint || endCodePoint > points.length) throw new ReadingSourceError('SOURCE_SPAN_MISMATCH', 'Invalid half-open Unicode source span.');
  return { startCodePoint, endCodePoint, selectedTextSha256: sha256(points.slice(startCodePoint, endCodePoint).join('')), granularity };
}
export function validateSourceFieldRef(ref: SourceFieldRef, value: unknown, originalArtifact?: { text: string; sha256: string }): void {
  if (!ref || !digest.test(ref.artifactSha256) || !digest.test(ref.valueSha256) || !['utf8-field-text', 'canonical-json-v1'].includes(ref.hashEncoding)) throw new ReadingSourceError('SOURCE_FIELD_MISMATCH', 'Source identity is malformed.');
  const hashed = ref.hashEncoding === 'utf8-field-text' && typeof value === 'string' ? sha256(value) : ref.hashEncoding === 'canonical-json-v1' ? contentHash(value) : '';
  if (hashed !== ref.valueSha256) throw new ReadingSourceError('SOURCE_FIELD_MISMATCH', 'Source field content differs from its exact identity.');
  // Resolve even without an original carrier to reject malformed pointer syntax.
  if ((ref.jsonPointer !== '' && !ref.jsonPointer.startsWith('/')) || /~(?![01])/u.test(ref.jsonPointer)) throw new ReadingSourceError('SOURCE_FIELD_MISMATCH', 'Source pointer is malformed.');
  if (originalArtifact) {
    if (sha256(originalArtifact.text) !== originalArtifact.sha256 || originalArtifact.sha256 !== ref.artifactSha256) throw new ReadingSourceError('SOURCE_FIELD_MISMATCH', 'Original source artifact does not match its pin.');
    if (canonicalJson(resolveSourcePointer(JSON.parse(originalArtifact.text), ref.jsonPointer)) !== canonicalJson(value)) throw new ReadingSourceError('SOURCE_FIELD_MISMATCH', 'Source pointer resolves to different content.');
  }
  if (ref.selectedSpans !== undefined) {
    if (typeof value !== 'string' || !Array.isArray(ref.selectedSpans) || !ref.selectedSpans.length) throw new ReadingSourceError('SOURCE_SPAN_MISMATCH', 'A source span requires exact text.');
    let end = 0;
    for (const span of ref.selectedSpans) {
      const expected = selectSourceSpan(value, span.startCodePoint, span.endCodePoint, span.granularity);
      if (span.startCodePoint < end || expected.selectedTextSha256 !== span.selectedTextSha256 || !['exact-line', 'gate', 'channel', 'line-framework'].includes(span.granularity)) throw new ReadingSourceError('SOURCE_SPAN_MISMATCH', 'Selected source text differs or spans overlap.');
      end = span.endCodePoint;
    }
  }
}
const escapePointer = (value: string) => value.replace(/~/g, '~0').replace(/\//g, '~1');
const privateKey = /^(provenance|source_provenance|canonical_source_provenance|evidence_locator|locator|source_file|original_filename|representative_pdf_filename|location|chart_date_dd_mm_yyyy|chart_time_24h|source_pdf|full_richness_blob_for_qa|line_specific_qa_blob)$/i;
export function projectMeaningRecord(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(projectMeaningRecord);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !privateKey.test(k)).map(([k,v]) => [k, projectMeaningRecord(v)]));
  return value;
}
export interface CompileRecordInput {
  artifactText: string; artifactSha256: string; pointer: string; recordId: string;
  variantId: MeaningVariant; kind: MeaningUnit['kind']; centers: CenterId[];
  gate?: number; line?: number; gates?: number[]; issues?: EditorialIssue[];
  sourceIds?: string[]; lineageFamily?: string;
}
export function compileMeaningRecord(input: CompileRecordInput): MeaningUnit {
  if (sha256(input.artifactText) !== input.artifactSha256) throw new ReadingSourceError('SOURCE_FIELD_MISMATCH', 'Original source artifact identity differs.');
  const artifact = JSON.parse(input.artifactText), original = resolveSourcePointer(artifact, input.pointer) as JsonValue;
  const rawRecord = projectMeaningRecord(original), fields: SourceField[] = [];
  const sourceIds = input.sourceIds || ['F1-MM-Rave', 'F2-HumDes', 'F3-Plateworks-gate', 'F4-HDHD-gate', 'F5-HDOS-gate', 'F6-authored'];
  function leaves(value: JsonValue, pointer: string, keys: string[]) {
    if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) if (!privateKey.test(key)) leaves(item, `${pointer}/${escapePointer(key)}`, [...keys, key]);
      return;
    }
    const fieldKey = keys.join('.'), shared = /harmonic_channel|gate_context|parent_gate|generic_line|line_archetype/i.test(fieldKey);
    const granularity: MeaningGranularity = input.kind === 'exact-line' && /deep_mechanics|source_comparison|unique_source|shared_five/i.test(fieldKey) ? 'mixed' : /generic_line|line_archetype/i.test(fieldKey) ? 'line-framework' : shared ? 'gate' : input.kind;
    const ref: SourceFieldRef = { artifactSha256: input.artifactSha256, jsonPointer: pointer, valueSha256: typeof value === 'string' ? sha256(value) : contentHash(value), hashEncoding: typeof value === 'string' ? 'utf8-field-text' : 'canonical-json-v1', granularity, sourceIds, lineageFamily: input.lineageFamily || 'related-traditional-and-authored-context', transformation: 'verbatim' };
    if (typeof value === 'string' && value.length && granularity !== 'mixed') ref.selectedSpans = [selectSourceSpan(value, 0, Array.from(value).length, granularity)];
    fields.push({ fieldKey, value, ref, shared, purpose: /(^|\.)(id|record_id|gate_number|line_number|gate_line|center|gates|centers|pair)$/.test(fieldKey) ? 'identity' : /sha256|hash|status|version|block_id|authority|classification|lineage/.test(fieldKey) ? 'metadata' : /source_|humdes_|polarity|absence|fixing/.test(fieldKey) ? 'source-context' : 'meaning' });
  }
  leaves(original, input.pointer, []);
  return freezeReadingValue({ schema: 'AuricMeaningUnitV1', recordId: input.recordId, variantId: input.variantId, kind: input.kind, canonicalObjectRef: input.recordId, centers: [...input.centers], ...(input.gate !== undefined ? { gate: input.gate } : {}), ...(input.line !== undefined ? { line: input.line } : {}), ...(input.gates ? { gates: [...input.gates] } : {}), fields, issueFlags: input.issues || [], rawRecord, rawRecordHash: contentHash(rawRecord), origin: { artifactSha256: input.artifactSha256, jsonPointer: input.pointer }, preservedOriginalRef: { artifactSha256: input.artifactSha256, jsonPointer: input.pointer, originalRecordHash: contentHash(original) }, sourceStatus: input.variantId === 'gold' ? 'frozen-not-cleared' : input.variantId === 'r4' ? 'runtime-not-cleared' : 'proposed-not-approved', consumerEligible: false, publicationStatus: 'blocked' } as MeaningUnit);
}
export function validateMeaningUnit(unit: MeaningUnit): void {
  if (validatedUnits.has(unit)) return;
  if (unit.schema !== 'AuricMeaningUnitV1' || unit.consumerEligible !== false || unit.publicationStatus !== 'blocked' || unit.rawRecordHash !== contentHash(unit.rawRecord) || !unit.fields.length) throw new ReadingSourceError('INVALID_SOURCE', 'Meaning unit integrity or inert state differs.');
  for (const field of unit.fields) validateSourceFieldRef(field.ref, field.value);
  if (deeplyFrozen.has(unit)) validatedUnits.add(unit);
}
// Safe rendering receives selected meaning fields and safe source IDs only. Raw source objects,
// editorial evidence, pointers, file paths and source locator metadata remain in local provenance.
export function safeMeaningUnit(unit: MeaningUnit) {
  validateMeaningUnit(unit);
  return { recordId: unit.recordId, variantId: unit.variantId, kind: unit.kind, centers: [...unit.centers], fields: unit.fields.filter(f => f.purpose === 'meaning').map(f => ({ fieldKey: f.fieldKey, value: f.value, granularity: f.ref.granularity, shared: f.shared })), status: 'design-only' as const };
}
