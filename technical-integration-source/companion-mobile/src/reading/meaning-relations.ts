import {contentHash} from '../domain/composite-hash';
import type {ReadingInsight} from './insights';

/** Meaning identity excludes record IDs, rule names, execution clocks and prose wrappers.
 * This is an auditable conditional-proposition contract, not free-text entailment. */
export type MeaningArgument = {kernel:string;condition:string;process:string;expressions?:{coherent:string|null;distorted:string|null};limitations?:string|null};
export type RelationalMeaning = {
  predicate:string;
  arguments:MeaningArgument[];
  consequence:unknown;
  perspective:string[];
};
export const normalizedMeaning=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/[’']/g,"'").replace(/[^\p{L}\p{N}']+/gu,' ').trim();
export function meaningArgumentKey(a:MeaningArgument){
  return contentHash({kernel:normalizedMeaning(a.kernel),condition:normalizedMeaning(a.condition),process:normalizedMeaning(a.process)});
}
export function conditionalResponsePair(a:MeaningArgument,b:MeaningArgument){
  // Negation and qualifications remain part of the proposition. Never collapse
  // "do not repair" into "repair", or convert a conditional to an assertion.
  if([a,b].some(x=>![x.kernel,x.condition,x.process].every(t=>t.trim())))return undefined;
  if(normalizedMeaning(a.condition)===normalizedMeaning(b.condition)||normalizedMeaning(a.process)===normalizedMeaning(b.process))return undefined;
  return {predicate:'condition-dependent-response' as const,branches:[a,b],qualification:'Each response applies only under its own complete condition.'};
}
export function relationIdentity(m:RelationalMeaning){
  const arguments_=m.arguments.map(meaningArgumentKey).sort();
  return {
    // The same interpreted pair is one topic even when offered by several operations.
    topic:'meaning-pair:'+contentHash(arguments_),
    conclusion:'meaning-relation:'+contentHash({predicate:m.predicate,arguments:arguments_,consequence:m.consequence,perspective:[...m.perspective].sort()}),
    meaningKeys:[...new Set(arguments_)],
  };
}

export type DiscoverySelectionDecision={insightId:string;phase:'standard'|'deep';disposition:'selected'|'repetition'|'no-additional-meaning'|'capacity';reason:string};
/** A rule family is neither a theme nor proof of novelty. Require a new supported
 * conclusion plus an additional meaning or a distinct factual consequence. */
export function selectRelationalThemes(candidates:ReadingInsight[],limit:number,prior:ReadingInsight[]=[]) {
  const selected:ReadingInsight[]=[],decisions:DiscoverySelectionDecision[]=[];
  const conclusions=new Set(prior.flatMap(i=>i.expressedRelations||[]));
  const delivered=new Set(prior.map(i=>i.discoveryMeaning?.conclusionKey).filter(Boolean));
  const topics=new Set(prior.map(i=>i.themeKey));
  const meanings=new Set(prior.flatMap(i=>i.discoveryMeaning?.meaningKeys||[]));
  const consequences=new Set(prior.map(i=>i.discoveryMeaning?.consequenceKey).filter(Boolean));
  const remaining=[...candidates];
  while(remaining.length){
    remaining.sort((a,b)=>{
      const score=(i:ReadingInsight)=>i.priority+Math.min(2,(i.discoveryMeaning?.meaningKeys||[]).filter(k=>!meanings.has(k)).length)*12;
      return score(b)-score(a)||(a.semanticKey||'').localeCompare(b.semanticKey||'');
    });
    const i=remaining.shift()!,phase=prior.length?'deep':'standard';
    const isNew=(i.expressedRelations||[]).some(k=>!conclusions.has(k));
    const newMeaning=(i.discoveryMeaning?.meaningKeys||[]).some(k=>!meanings.has(k));
    const newConsequence=!!i.discoveryMeaning?.substantiveConsequence&&!consequences.has(i.discoveryMeaning.consequenceKey);
    const repeat=!isNew||(topics.has(i.themeKey)&&!newConsequence)||!!i.discoveryMeaning?.conclusionKey&&delivered.has(i.discoveryMeaning.conclusionKey)&&!newConsequence;
    const disposition=repeat?'repetition':!newMeaning&&!newConsequence?'no-additional-meaning':selected.length>=limit?'capacity':'selected';
    decisions.push({insightId:i.insightId,phase,disposition,reason:repeat?'The conditional meaning relationship is already represented.':disposition==='no-additional-meaning'?'No additional source meaning or independently supported structural consequence.':disposition==='capacity'?'Eligible distinct proposal retained for inspection beyond the requested reading budget.':'New conditional meaning relationship with additional meaning or a distinct structural consequence; editorial acceptance remains open.'});
    if(disposition!=='selected')continue;
    selected.push(i);(i.expressedRelations||[]).forEach(k=>conclusions.add(k));topics.add(i.themeKey);
    if(i.discoveryMeaning?.conclusionKey)delivered.add(i.discoveryMeaning.conclusionKey);
    (i.discoveryMeaning?.meaningKeys||[]).forEach(k=>meanings.add(k));
    if(i.discoveryMeaning)consequences.add(i.discoveryMeaning.consequenceKey);
  }
  return {selected,decisions};
}
