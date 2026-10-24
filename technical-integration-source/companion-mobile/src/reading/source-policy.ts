import type { MeaningUnit } from './contracts';

// Withhold these disputed source premises. Frozen source records and P1's
// independent publication/use decisions are unchanged.
const EXCLUDED_R4_UNITS=new Set(['gate-16-line-1','gate-10-line-5']);
export function excludedReadingField(unit:MeaningUnit,key:string):boolean {
  const value=unit.fields.find(f=>f.fieldKey===key)?.value;
  return typeof value==='string'&&/\bHumDes\b|\b(?:second published pole|published labels?|editorial QA|internal QA|QA-only|original_authentication|reviewedAppRecord)\b/i.test(value)||
    unit.variantId==='r4'&&(EXCLUDED_R4_UNITS.has(unit.recordId)||
    unit.recordId==='gate-01-line-5'&&/^(trigger_condition|recognition_signals\.0)$/.test(key)||
    unit.recordId==='gate-38-line-2'&&/distorted_expression|recognition_signals\.2|humdes_fixing_labels/.test(key)||
    unit.recordId==='gate-50-line-5'&&/distorted_expression|recognition_signals\.2/.test(key)||
    // The preserved exact 48.3 carrier describes a transient phase and anxiety;
    // it does not promise that hidden development eventually becomes communicable.
    unit.recordId==='gate-48-line-3'&&key==='likely_output');
}
