import type { DesignPreviewCapability, EligibilityDecision, MeaningUnit, MeaningVariant, ReadingUse } from './contracts';
import { freezeReadingValue, validateMeaningUnit } from './compiler';
import { isCatalogueMeaningUnit, readingCatalogueHash } from './catalog';

const issued = new WeakSet<object>();
/** Author-internal capability for this explicitly authorized implementation demonstration.
 * Its object identity cannot be serialized into an approval or obtained from reader preferences.
 * This function is deliberately not connected to an ordinary user setting or provider endpoint.
 */
export function issueDesignPreviewScope(input: { cohort: readonly string[]; variantIds?: readonly MeaningVariant[]; catalogueHash?: string }): DesignPreviewCapability {
  if (!input || !Array.isArray(input.cohort) || !input.cohort.length || input.cohort.length > 2000 || input.cohort.some(id => typeof id !== 'string' || !id || id.length > 160)) throw Error('Invalid isolated design cohort.');
  const variantIds = input.variantIds || ['r4'];
  if (!variantIds.length || variantIds.some(v => !['gold','r4','phase-d-v2'].includes(v)) || (input.catalogueHash !== undefined && input.catalogueHash !== readingCatalogueHash)) throw Error('Invalid isolated design variant or catalogue pin.');
  const capability = freezeReadingValue({ kind: 'AuricInternalDesignPreview' as const, cohort: [...new Set(input.cohort)].sort(), variantIds: [...variantIds], catalogueHash: readingCatalogueHash });
  issued.add(capability); return capability;
}
export function isDesignPreviewScope(capability: unknown, recordId?: string): capability is DesignPreviewCapability {
  return !!capability && typeof capability === 'object' && issued.has(capability) && (recordId === undefined || (capability as DesignPreviewCapability).cohort.includes(recordId));
}
export function resolveMeaningEligibility(unit: MeaningUnit, options: { use: ReadingUse; capability?: DesignPreviewCapability; researchMode?: boolean; receipts?: unknown[] }): EligibilityDecision {
  validateMeaningUnit(unit);
  let result: EligibilityDecision['result'] = 'withheld', reasons: string[] = ['CONTENT_WITHHELD', 'SEMANTIC_OWNER_RIGHTS_AUTHENTICITY_DECISIONS_MISSING'];
  if (options.use === 'local-review') { result = 'local-review-only'; reasons = ['LOCAL_REVIEW_DOES_NOT_GRANT_OTHER_USES']; }
  if (options.use === 'isolated-design-preview' && isCatalogueMeaningUnit(unit) && isDesignPreviewScope(options.capability, unit.recordId) && options.capability.variantIds.includes(unit.variantId) && options.capability.catalogueHash === readingCatalogueHash) { result = 'design-only'; reasons = ['EXPLICIT_ISOLATED_DESIGN_COHORT', 'NOT_CONTENT_OR_INFERENCE_APPROVAL']; }
  if (options.use !== 'local-review' && unit.recordId === 'gate-39-line-3') { result = 'withheld'; reasons = ['CONTENT_WITHHELD', 'QUARANTINED_CONTENT']; }
  // No verified decision issuer exists in this milestone. Caller supplied receipt-shaped data,
  // private-app permission and preferences cannot supply a semantic/rights/model/export approval.
  return freezeReadingValue({ allowed: result !== 'withheld', result, use: options.use, reasonCodes: reasons, consumerEligible: false, publicationStatus: 'blocked' });
}
