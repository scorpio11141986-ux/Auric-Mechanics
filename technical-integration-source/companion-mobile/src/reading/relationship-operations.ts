/** Reusable, review-only inference operations. No chart IDs or personal inputs.
 * Lexical anchors propose semantic roles, not psychological facts. Both complete
 * source meanings remain necessary premises; editorial entailment is a separate gate.
 */
export const MEANING_ROLES = {
  expression: /\b(voice|language|express(?:ion|ible)?|communicat\w*|persuas\w*|transmission|storytelling|message)\b/i,
  capacity: /\b(energy|fuel|power|resources|capacity|provision|nourishment)\b/i,
  direction: /\b(direction|orientation|purpose|goal|objective)\b/i,
  discernment: /\b(intuition|intuitive|instinctive|pattern recognition|discernment|judgment|judgement|discriminat\w*)\b/i,
  continuity: /\b(rhythm|continuity|persist\w*|stability|stabiliz\w*|stabilis\w*)\b/i,
  change: /\b(mutation|mutative|change|adjust\w*|adapt\w*|recalibrat\w*|innovation)\b/i,
  care: /\b(caring|care|nourish\w*|nurtur\w*)\b/i,
  reliance: /\b(support from|require(?:s)? (?:help|assistance|support)|need(?:s)? (?:help|support)|receiv(?:e|ing) help|interdependence)\b/i,
  agreement: /\b(bargain|contract|agreement|terms|reciprocal|reciprocity|negotiat\w*)\b/i,
  autonomy: /\b(solitude|self-care|self-reliance|withdrawal|autonomy|alone|outside influence)\b/i,
  belonging: /\b(belonging|community|alliance|co-operation|cooperation|union)\b/i,
  timing: /\b(timing|readiness|ready|patience|waiting)\b/i,
  testing: /\b(testing|tested|test|experimentation|experiment|verification|logic|logical|hypothesis|feedback)\b/i,
} as const;
export type MeaningRole=keyof typeof MEANING_ROLES;
export type RelationshipOperation={id:string;roles:[MeaningRole,MeaningRole];title:string;conclusion:string;condition:string;interaction:string;experiment:string;alternative:string};
export const RELATIONSHIP_OPERATIONS:readonly RelationshipOperation[]=[
 {id:'reliance-agreement',roles:['reliance','agreement'],title:'Accepting support need not mean surrendering the purpose',
 conclusion:'Needing help and accepting every condition attached to that help are different questions.',
 condition:'Consider this when something worth preserving cannot be carried alone and support has terms that need to be understood.',
 interaction:'The reliance meaning makes outside support relevant; the agreement meaning asks what giving and receiving would actually require. Together they suggest a third possibility between refusing needed help and accepting an undefined obligation: negotiate an exchange that can support the purpose without quietly replacing it.',
 experiment:'Name what help is needed, what you can offer in return, and which conditions would undermine the purpose of accepting it. Ask the other person to state their expectations before either side commits.',
 alternative:'A clear exchange can still be unsuitable. Refusing one set of terms is not proof that all help must be refused, and receiving help does not establish consent to additional obligations.'},
 {id:'expression-capacity',roles:['expression','capacity'],title:'An effective offer still needs a sustainable commitment',
 conclusion:'Getting an idea across and having the resources to carry it through are different achievements.',
 condition:'This distinction becomes useful when an attractive proposal is about to turn into a commitment.',
 interaction:'Read together, these meanings suggest a two-part check: clarify what the contribution would be, then let the capacity question set its size. When the expression itself needs privacy or further preparation, that clarification can remain private; it is not a reason to announce a promise early. A persuasive response cannot by itself establish that the promised work can be sustained.',
 experiment:'Before agreeing to a project, clarify the offer for yourself and separately name the time, effort or resources actually available. Share it only when its own conditions support disclosure. A smaller commitment may preserve what made the idea worthwhile.',
 alternative:'If the delivery problem is simply missing equipment or training, address that practical cause; the symbolic comparison does not explain it away.'},
 {id:'direction-discernment',roles:['direction','discernment'],title:'A direction can remain worthwhile while its method changes',
 conclusion:'Knowing what you are moving toward does not settle which route deserves your trust.',
 condition:'Use this comparison when a worthwhile aim encounters a warning, a questionable method or a conflict of values.',
 interaction:'The proposed cooperation is to let the directional meaning preserve the aim while the discernment meaning tests the means. Rejecting one method need not mean abandoning the purpose; conviction about a purpose does not validate every method.',
 experiment:'Name the aim and the objection separately. Try a different way of pursuing the same aim, then see whether the specific objection disappears. If it does not, reconsider the aim as well.',
 alternative:'A sensed objection can be mistaken. Check observable conditions and other explanations before treating it as a decisive signal.'},
 {id:'continuity-change',roles:['continuity','change'],title:'Continuity can protect a purpose without freezing its form',
 conclusion:'What deserves continuity may be the activity itself, rather than its present arrangement.',
 condition:'This question matters when an interruption or a change in circumstances makes a familiar pattern harder to maintain.',
 interaction:'Together, the two meanings distinguish maintaining something viable from preserving every detail of its form. Change can serve continuity when it removes the obstacle; constant reinvention can also destroy the very support that made change possible.',
 experiment:'Keep one useful commitment while changing one condition around it, such as its timing or scope. Observe whether the activity becomes more workable before changing the whole arrangement.',
 alternative:'A commitment that has ceased to be useful may need to end. Continuity is not a reason to preserve it indefinitely.'},
 {id:'care-agreement',roles:['care','agreement'],title:'Help becomes more dependable when its terms are explicit',
 conclusion:'Responding to a need and agreeing to a responsibility are not the same decision.',
 condition:'Explore this distinction when help is becoming a recurring expectation rather than a one-time offer.',
 interaction:'The care meaning identifies something worth supporting; the agreement meaning asks what each person has actually undertaken. Combining them suggests that clear limits can protect care from becoming a duty that nobody explicitly accepted.',
 experiment:'When offering help, specify what is included, when it ends and how the arrangement can be revisited. The recipient can then respond to a concrete offer instead of guessing at an unlimited promise.',
 alternative:'An agreement can be clear and still be unfair. Actual consent, capacity and consequences remain separate tests.'},
 {id:'autonomy-belonging',roles:['autonomy','belonging'],title:'Space and participation need not cancel each other',
 conclusion:'Taking space can change the terms of participation without ending the wish to participate.',
 condition:'This is a useful possibility when involvement and the need for independence appear to be pulling in different directions.',
 interaction:'Read together, these meanings invite a distinction between leaving a connection and changing the amount of access it asks for. A workable boundary may preserve participation; interpreting every withdrawal as rejection can obscure that option.',
 experiment:'Make a bounded request for time apart and say what contact or responsibility you still intend to maintain. Check the other person’s understanding rather than assuming the message was clear.',
 alternative:'Sometimes withdrawal does express an intention to leave. Ask about the actual intention; the chart cannot decide it.'},
 {id:'expression-timing',roles:['expression','timing'],title:'Readiness and a receptive moment are separate conditions',
 conclusion:'Having something to express does not mean that this is the moment in which it can be useful.',
 condition:'Consider this when an insight, message or contribution is available but its reception or execution remains unsettled.',
 interaction:'The combined question is not simply whether to speak or remain silent. It is which condition needs time: the contribution itself, the opportunity to offer it, or the listener’s availability. Treating those as one problem can turn preparation into avoidance or expression into pressure.',
 experiment:'Try a small, clearly unfinished version with someone who has agreed to hear it. Ask whether the difficulty lies in the material, the timing or the request being made; each answer calls for a different next step.',
 alternative:'Waiting cannot guarantee eventual success. A different method, audience or decision to stop may be more useful.'},
 {id:'discernment-testing',roles:['discernment','testing'],title:'A recognition becomes more useful when it can be challenged',
 conclusion:'A strong recognition and a well-tested explanation can contribute different things to the same decision.',
 condition:'Use the comparison when something seems clear before the reasons are fully available.',
 interaction:'The proposed sequence is to let recognition identify a question worth checking, then use the testing meaning to expose what would support or overturn the answer. Neither the force of a feeling nor the elegance of an explanation makes the result certain.',
 experiment:'State one concrete expectation that follows from the recognition. Look for a result that could prove it wrong as well as one that would support it, then revise the explanation accordingly.',
 alternative:'A failed test need not invalidate every part of the original observation; separate the useful observation from the explanation attached to it.'},
 {id:'capacity-care',roles:['capacity','care'],title:'The size of an offer can protect the quality of care',
 conclusion:'The importance of a need does not determine how much one person can sustainably provide.',
 condition:'This relationship matters when the wish to help is larger than the energy or resources available.',
 interaction:'Combining the capacity and care meanings shifts the question from “should I care?” to “what form of care can actually continue?” A smaller dependable contribution can be more useful than an expansive promise that exhausts its provider.',
 experiment:'Separate the need from your available contribution. Offer the part you can carry, identify what remains unmet, and leave room for other help instead of silently absorbing the whole responsibility.',
 alternative:'Limited capacity is not evidence of indifference, and substantial capacity does not create an obligation to provide it.'},
];

/** The preview must not manufacture an intimate reading from a friendship request.
 * This excludes whole meaning units from prose synthesis, not words from their text.
 * The full unmodified record remains inspectable in the underlying evidence layer.
 */
export function intimateMeaning(text:string){return /\b(sex(?:ual\w*)?|erotic\w*|romance|romantic(?!iz)\w*|attraction|chemistry|promiscuity|intimacy|intimate)\b/i.test(text);}
