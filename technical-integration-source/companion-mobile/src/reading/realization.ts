import { contentHash } from "../domain/composite-hash";
import { readingFail, unique, type ReadingClaim, type ReadingInsight } from "./insights";

export const READING_NOTICE_TEXT:Readonly<Record<string,string>>={
  DESIGN_ONLY:"Isolated design preview. These symbolic interpretations have not been approved for consumer use.",
  CONTENT_WITHHELD:"The requested use is unavailable because its independent content and inference permissions are incomplete.",
  EXACT_LINE_WITHHELD:"Exact-Line interpretation is withheld where the supplied time or activation boundary cannot support it.",
  INSUFFICIENT_SUPPORTED_DEPTH:"The available evidence does not support two additional substantive Deep insights. The supported reading is shown.",
  COVERAGE_INCOMPLETE:"Some requested areas lack eligible teaching or inference support. Their individual status remains available in coverage.",
  MODIFIER_SOURCE_MISSING:"Planet and Personality/Design identities are retained; their psychological modifiers are unavailable without a separate supported corpus.",
  SOURCE_DISAGREEMENT:"Unresolved source differences remain separate. This preview does not select an editorial winner.",
  SOURCE_FIELD_WITHHELD:"Known source-specific interpretation conflicts are withheld. The exact calculated positions remain inspectable.",
  PROVISIONAL_POINT:"This approximate point is a representative calculation. Personal symbolic synthesis is withheld because a coherent birth-time window has not been established.",
  BIRTH_TIME_NOT_INDEPENDENTLY_VERIFIED:"The recorded birth minute is used as a point input. It has not been independently verified, and this reading does not establish stability across a time interval.",
  NO_SUPPORTED_MEANING:"No eligible meaning can be bound to the selected mechanics. No personal interpretation has been substituted.",
};
export type ReadingParagraph={paragraphId:string;chapterId:string;title:string;text:string;claimIds:string[];rootClaimIds:string[];insightIds:string[];sectionIds:string[];semanticValidation:{status:"design-only";reasons:string[]}};
export type ReadingChapter={chapterId:string;title:string;thesisInsightId:string;supportingInsightIds:string[];requiredClaimIds:string[];sectionIds:string[]};
/** Presentation-only removal of documented authoring markers. Source carriers stay unchanged. */
export function sanitizeReadingProse(text:string):string{
  return text.replace(/\bThe exact sibling distinction frozen in\s+[A-Za-z0-9_-]+\s+is:\s*/gi,"")
    .replace(/\bThe following frozen Gate-context comparison is historical[^.]*\.\s*/gi,"")
    .replace(/\bThis proposed synthesis has not been approved\.\s*/gi,"")
    .replace(/\bC7 freezes\s+/gi,"The recorded nomenclature uses ")
    .replace(/\bfrozen exact-Line sources\b/gi,"traditional exact-Line sources")
    .replace(/\bthe frozen source itself supplies no adverse planetary pole\b/gi,"this traditional Line has no detriment")
    .replace(/\bsource architecture does not make the intuition universally infallible\b/gi,"the absence of detriment does not make intuition infallible")
    .replace(/\bfrozen in\s+[A-Za-z0-9_-]+\s*:?\s*/gi,"")
    .replace(/\b(?:internal QA|QA-only|editorial QA)\b/gi,"")
    .replace(/\s{2,}/g," ").trim();
}
export function normalizeReadingPunctuation(text:string):string{
  return text.replace(/[“”]/g,"").replace(/\.\s*;/g,";").replace(/\.\s*,/g,",").replace(/\.{2,}/g,".").replace(/\s+([,.;:!?])/g,"$1").replace(/\s{2,}/g," ").trim();
}
const SEMANTIC_TITLES:Record<ReadingInsight["relationKind"],string>={baseline:"Calculated natal foundations","contextual-meaning":"The selected planetary occurrences","completed-endpoint-interaction":"How the endpoint meanings work together","repeated-line-contrast":"One Gate, different exact Lines","parallel-network-contrast":"Distinct processes and their connections","reciprocal-island-join":"How the existing networks connect","combined-topology-context":"What changes in the combination","unfinished-path-consequence":"What a missing endpoint would change","directional-contribution":"What each person contributes","separation-persistence":"What the shared route adds","coherent-distorted-alternative":"Constructive and difficult possibilities","optional-observation":"An optional observation"};
const TITLES=[...Object.values(SEMANTIC_TITLES)];
export function chapterTitle(index:number):string{return TITLES[Math.min(index,TITLES.length-1)];}
export function insightChapterTitle(insight:ReadingInsight):string{return insight.themeTitle||SEMANTIC_TITLES[insight.relationKind];}
export function realizeReading(chapters:readonly ReadingChapter[],insights:readonly ReadingInsight[],claims:readonly ReadingClaim[]):ReadingParagraph[]{
  const cMap=new Map(claims.map(c=>[c.claimId,c])),iMap=new Map(insights.map(i=>[i.insightId,i]));
  const used=new Set<string>(),paragraphs:ReadingParagraph[]=[];
  for(const chapter of chapters){
    if(chapter.title!==insightChapterTitle(iMap.get(chapter.thesisInsightId)!))readingFail("UNSUPPORTED_VISIBLE_CLAIM","The reading contains an unvalidated visible heading.");
    const chapterInsights=unique([chapter.thesisInsightId,...chapter.supportingInsightIds]).map(id=>iMap.get(id));
    if(chapterInsights.some(x=>!x))readingFail("RULE_PREMISE_MISSING","The reading chapter references a missing finding.");
    const rootIds=unique([...chapterInsights.flatMap(i=>i!.claimIds),...chapter.requiredClaimIds]).filter(id=>!used.has(id));
    const roots=rootIds.map(id=>cMap.get(id));if(roots.some(c=>!c))readingFail("UNSUPPORTED_VISIBLE_CLAIM","A visible paragraph has no supported assertion.");
    if(!roots.length)continue;
    for(const id of rootIds)used.add(id);
    const supportIds=new Set(rootIds);
    function closure(id:string,depth:number){if(depth>64)readingFail("RULE_PREMISE_MISSING","A reading dependency exceeds the evaluation limit.");for(const p of cMap.get(id)?.requiredPremiseIds||[]){if(supportIds.has(p))continue;supportIds.add(p);closure(p,depth+1);}}
    for(const id of rootIds)closure(id,0);
    const text=roots.map((c,i)=>`${i?(c!.argument?.breakBefore||roots[i-1]!.argument?.recipe==='thesis'&&c!.argument?.recipe!=='thesis'?'\n\n':' '):''}${c!.text}`).join('');
    paragraphs.push({paragraphId:`paragraph:${contentHash({chapter:chapter.chapterId,rootIds,text})}`,chapterId:chapter.chapterId,title:chapter.title,text,claimIds:[...supportIds],rootClaimIds:rootIds,insightIds:chapterInsights.map(i=>i!.insightId),sectionIds:chapter.sectionIds,semanticValidation:{status:"design-only",reasons:["REQUIRES_INDEPENDENT_SEMANTIC_REVIEW"]}});
  }
  return paragraphs;
}
/** Every substantive visible byte is reproduced from a supported root assertion. */
export function validateRealizedParagraphs(paragraphs:readonly ReadingParagraph[],chapters:readonly ReadingChapter[],insights:readonly ReadingInsight[],claims:readonly ReadingClaim[]):void{
  const expected=realizeReading(chapters,insights,claims);
  if(contentHash(paragraphs)!==contentHash(expected))readingFail("UNSUPPORTED_VISIBLE_CLAIM","The displayed reading changed after its support was validated.");
  const texts=paragraphs.map(p=>p.text);
  if(new Set(texts).size!==texts.length)readingFail("UNSUPPORTED_VISIBLE_CLAIM","Duplicated narrative is unsupported.");
}
