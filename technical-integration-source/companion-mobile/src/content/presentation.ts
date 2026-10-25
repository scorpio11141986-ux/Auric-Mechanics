import type {LineRecord} from './records';
export const INTERNAL_MEANING_MARKER=/exact sibling distinction frozen|frozen sibling|frozen exact-Line sources|frozen source|internal QA|editorial QA|source architecture|source QA/i;
const wording=(text:string)=>text
 .replace(/The frozen exact-Line sources explicitly provide no detriment\./g,'This traditional exact-Line interpretation has no detriment.')
 .replace(/the frozen source itself supplies no adverse planetary pole/g,'this traditional Line has no assigned adverse pole')
 .replace(/source architecture does not make the intuition universally infallible/g,'the absence of detriment does not make intuition infallible');
/** Safe existing meaning fields, never a mutation of the frozen record or its hashes. */
export function consumerLineDetail(line:LineRecord){
 if(!INTERNAL_MEANING_MARKER.test(line.deep_mechanics))return {text:line.deep_mechanics,fields:['deep_mechanics'],rawField:'deep_mechanics',presentation:'original-field'};
 const fields=(['mechanical_kernel','trigger_condition','transformational_process','likely_output'] as const).filter(k=>typeof line[k as keyof LineRecord]==='string'&&!INTERNAL_MEANING_MARKER.test(wording(String(line[k as keyof LineRecord]))));
 const values=[...new Set(fields.map(k=>wording(String(line[k as keyof LineRecord]))).filter(Boolean))];
 return {text:values.join('\n\n')||'Detailed interpretation is unavailable in this view. Exact chart facts and source evidence remain available.',fields,rawField:'deep_mechanics',presentation:'safe-existing-field-projection'};
}
