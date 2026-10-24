import type { MeaningCatalogue, MeaningUnit, MeaningVariant, SourceField } from './contracts';
import { freezeReadingValue, validateMeaningUnit } from './compiler';
import packedJson from '../../assets/reading-catalogue.preview.json';
import receiptJson from '../../assets/reading-catalogue.receipt.json';
import { canonicalJson, sha256 } from '../domain/composite-hash';

// This asset contains only inert design material. Original source carriers and private
// locators remain in the repository's preserved provenance, outside normal rendering.
let packed: any = packedJson;
const receipt = receiptJson;
if (packed.schema !== 'AuricMeaningCataloguePackedV1' || packed.catalogueHash !== receipt.catalogueHash || packed.units.length !== receipt.previewUnits || sha256(canonicalJson(packed)+'\n') !== receipt.previewOutputSha256) throw Error('SOURCE_FIELD_MISMATCH: Invalid reading sidecar identity.');
export const readingCatalogueHash: string = receipt.catalogueHash;
const raw = new Map<string, any>(packed.units.map((u: any) => [`${u.variantId}:${u.recordId}`, u]));
const decoded = new Map<string, MeaningUnit>();
/** Optional author-local full corpus review. No ordinary application path imports the
 * complete sidecar, and loading it grants no content, model or export permission. */
export function loadLocalReviewCatalogue(artifactText: string): MeaningCatalogue {
  if (sha256(artifactText) !== receipt.outputSha256) throw Error('SOURCE_FIELD_MISMATCH: Full local review artifact differs from its build pin.');
  const full = JSON.parse(artifactText);
  if (full.schema !== 'AuricMeaningCataloguePackedV1' || full.catalogueHash !== readingCatalogueHash || full.units.length !== receipt.units) throw Error('SOURCE_FIELD_MISMATCH: Invalid complete local review artifact.');
  // The full artifact contains identical already-issued cohort entries. Keep their object
  // identities stable so an existing render cannot switch source units during local review.
  packed = full;
  for (const unit of full.units) raw.set(`${unit.variantId}:${unit.recordId}`,unit);
  catalogue = undefined;
  return readingCatalog();
}
export function getMeaningUnit(recordId: string, variantId: MeaningVariant = 'r4'): MeaningUnit | undefined {
  const key = `${variantId}:${recordId}`;
  const existing = decoded.get(key); if (existing) return existing;
  const item = raw.get(key); if (!item) return undefined;
  let unit: MeaningUnit;
  if (item.inherits === 'r4') {
    const parent = getMeaningUnit(recordId, 'r4');
    if (!parent) throw Error('SOURCE_FIELD_MISMATCH: Missing inherited record.');
    unit = { ...parent, variantId: 'phase-d-v2', sourceStatus: 'proposed-not-approved' };
  } else {
    const fields: SourceField[] = item.fields.map((f: any[]) => ({
      fieldKey: f[0], value: f[1], shared: f[6], purpose: f[7],
      ref: { artifactSha256: packed.artifactPins[f[2]].sha256, jsonPointer: f[3], valueSha256: f[4], hashEncoding: typeof f[1] === 'string' ? 'utf8-field-text' : 'canonical-json-v1', granularity: f[5], ...(f[8] ? { selectedSpans: f[8] } : {}), sourceIds: f[9], lineageFamily: 'related-traditional-and-authored-context', transformation: 'verbatim' },
    }));
    unit = { ...item, fields };
  }
  validateMeaningUnit(unit); freezeReadingValue(unit); decoded.set(key, unit); return unit;
}
let catalogue: MeaningCatalogue | undefined;
export function readingCatalog(): MeaningCatalogue {
  if (!catalogue) catalogue = freezeReadingValue({ schema: 'AuricMeaningCatalogueV1', units: packed.units.map((u: any) => getMeaningUnit(u.recordId, u.variantId)!), artifactPins: packed.artifactPins, catalogueHash: readingCatalogueHash, privacy: 'source-locators-excluded-originals-preserved' });
  return catalogue;
}
export function meaningUnitKey(unit: MeaningUnit): string { return `${unit.variantId}:${unit.recordId}`; }
export function isCatalogueMeaningUnit(unit: unknown): unit is MeaningUnit {
  if (!unit || typeof unit !== 'object') return false;
  const value = unit as MeaningUnit;
  return decoded.get(`${value.variantId}:${value.recordId}`) === unit;
}
