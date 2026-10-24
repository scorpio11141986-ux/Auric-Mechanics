/** Local review contract only. No production content approval is represented. */
export const LOCAL_LLM_SCHEMA = 'AuricLocalReadingBundleV1' as const;
export const LOCAL_LLM_PROMPT_VERSION = 'local-reading-p3a-2.0.0';
export type LLMDepth='quick'|'standard'|'deep';
export type LLMClaim={id:string;text:string;kind:'computed-fact'|'source-interpretation'|'proposed-synthesis'|'lived-hypothesis';personIds:string[];activationIds:string[];factIds:string[];factBindings:{factId:string;predicate:string;path:string;value:unknown}[];evidenceIds:string[];requiredClaimIds:string[];conditions:string[];alternatives:string[];limitations:string[]};
export type LLMChapter={id:string;title:string;titleClaimIds:string[];paragraphs:string[][];discoveryId:string};
export type LLMDiscovery={id:string;conclusion:string;mechanism:string;relationKey:string;claimIds:string[];evidenceIds:string[];personIds:string[];noveltyBeyondStandard:string};
export type LLMTeaching={concept:string;byFamiliarity:Record<string,string>;factIds:string[];evidenceIds:string[]};
export type LocalLLMBundle={schema:typeof LOCAL_LLM_SCHEMA;requestDigest:string;packetDigest:string;title:string;
 quick:{title:string;claimIds:string[]};standard:{title:string;thesisClaimIds:string[];chapters:LLMChapter[]};
 deep:{additionalChapters:LLMChapter[];gaps:string[]};claims:LLMClaim[];discoveries:LLMDiscovery[];teaching:LLMTeaching[];limitations:string[]};
export type LLMPresentation={depth:LLMDepth;familiarity:string;concepts:Record<string,boolean>;expansion:'compact'|'expanded'|'full'};
export type LocalReadingCase={id:string;title:string;context:'individual'|'composite';relationshipContext:string[];people:{id:string;name:string}[]};
export type LocalReadingResult={case:LocalReadingCase;bundle:LocalLLMBundle;requestDigest:string;packetDigest:string;model:string;effort:string;generatedAt:string;validation:{status:'references-validated';semanticReview:'pending';depthStatus:'supported-candidate'|'insufficient-supported-depth';issues:string[]};trace:unknown;facts:any;deterministic:Record<LLMDepth,{paragraphs:{title:string;text:string}[];depthStatus:string}>;cacheHit?:boolean};
