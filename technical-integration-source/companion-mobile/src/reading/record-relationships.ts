import type {RelationshipOperation} from './relationship-operations';

/** These arguments consume the complete eligible kernel and condition. Lexical
 * role matches are not a prerequisite. Topology licenses the comparison, not an
 * assertion that symbolic processes cause behavior or flow along a graph edge. */
export function recordRelationship(kind:'shared-function'|'separate-networks'|'connected-processes'|'endpoint-conditions'|'line-conditions',context:{center?:string;route?:string}):RelationshipOperation{
  const base={roles:['direction','expression'] as RelationshipOperation['roles']};
  if(kind==='shared-function')return {...base,id:kind,title:`One ${context.center} Center, two different requirements`,
    conclusion:'Success with one process can conceal a different condition that still needs attention.',
    interaction:`These two completed Channels meet at the ${context.center} Center but join it to different functions. That makes their relationship more specific than two unrelated strengths: they share part of the chart while retaining different requirements for coherent expression. When both are relevant to one situation, meeting the first requirement cannot substitute for meeting the second. A useful combination preserves both conditions instead of treating whichever process feels strongest as the answer to both.`,
    condition:'The joint interpretation applies when the same situation engages both of the following conditions.',
    experiment:'Choose one current situation that fits both descriptions. Ask what would count as a workable response under each condition. If the answers differ, try a step that satisfies both; if that is impossible, name the trade-off rather than assuming success on one side settles the other.',
    alternative:'The shared Center establishes a structural intersection. Whether the two processes actually interact in a particular situation remains something to observe.'};
  if(kind==='separate-networks')return {...base,id:kind,title:'What one part of the chart establishes, another must test separately',
    conclusion:'A convincing result in one area need not settle a different kind of question elsewhere.',
    interaction:'These completed Channels belong to separate definition networks. Their source meanings therefore describe two independently available processes without a fixed natal Channel path joining them. If both concern the same choice, preserve a separate test for each: the first can offer something useful without certifying that the second has met its own conditions. Coordination is a practical possibility to explore, not a missing ability or a need for another person to complete you.',
    condition:'Compare the processes only when both source conditions describe the situation.',
    experiment:'Take a decision that involves both processes. Write down what each can establish and what remains unanswered. Compare that with a decision that engages only one; if the second adds nothing relevant, do not force the comparison.',
    alternative:'Separate definition networks do not prove psychological division, delay, conflict or dependence.'};
  if(kind==='connected-processes')return {...base,id:kind,title:'A connected route still contains different tests',
    conclusion:'Access to a connected process does not make its separate requirements interchangeable.',
    interaction:'These Channels occupy one connected definition network, but they do not share a Center directly. Their connection passes through additional completed Channels. This distinguishes a supported route from an immediate equivalence: a conclusion suggested by one source meaning still has to meet the other process’s conditions before it can be used there. A structural connection cannot certify successful communication, agreement or action.',
    condition:'This becomes relevant when one situation appears to call on both processes.',
    experiment:'Identify what the first process contributes, then test whether the second process’s conditions are actually present. If the second test fails, keep the first contribution without treating it as a complete answer.',
    alternative:'The intervening route is mechanical evidence, not proof of a psychological sequence or measured flow of energy.'};
  if(kind==='endpoint-conditions')return {...base,id:kind,title:'A complete route can still require two different responses',
    conclusion:'A complete Channel describes availability; its exact endpoint Lines distinguish the conditions under which that availability might be useful.',
    interaction:`Both endpoint contributions are present in ${context.route}. Their exact-Line meanings introduce different conditions into that same completed route. Read together, they suggest a conditional division of work: respond to the condition actually present at each endpoint, rather than asking one response to do both jobs. The Channel can remain mechanically complete even when a proposed coherent response at one endpoint is inappropriate to the situation.`,
    condition:'Use the combined interpretation only where both exact-Line conditions are relevant; otherwise retain the applicable Line on its own.',
    experiment:'For a situation involving this route, distinguish the two triggers below. What response fits the first but would miss the second? Try adjusting the response at that boundary rather than labelling the whole Channel a strength or a problem.',
    alternative:'This does not select a planetary pole, infer a person’s habitual response or turn a complete Channel into a guarantee of skill.'};
  return {...base,id:'conditional-line-difference',title:'A repeated Gate does not mean repeating the same response',
    conclusion:'The same recurring theme can call for different responses because its exact Lines have different conditions.',
    interaction:'These are two exact interpretations of the same Gate, with different triggers and processes. Their coexistence makes condition selection consequential: applying the response described by one Line when the other condition is present can miss the distinction the sources make. Repetition increases the number of relevant contexts to inspect; it does not make either interpretation universally true or erase the other.',
    condition:'Distinguish the two conditions below before deciding whether either interpretation fits.',
    experiment:'Compare two situations involving this theme. Ask which stated condition fits each one and whether that changes the useful response. If the same response works for reasons unrelated to either condition, keep that simpler explanation.',
    alternative:'Planet and Personality/Design labels identify the exact occurrences. They do not independently explain psychological differences without eligible modifier content.'};
}
