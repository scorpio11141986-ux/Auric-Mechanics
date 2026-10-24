import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CONCEPTS, expertise, PRESETS, normalizedPreferences, replacePrimaryInterest, type ReaderPreferencesV1 } from "../intelligence/reader-preferences";
import { theme } from "./theme";

export function ReaderButton({label,onPress,selected=false}:{label:string;onPress:()=>void;selected?:boolean}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected}} onPress={onPress} style={[s.button,selected&&s.selected]}><Text style={s.text}>{label}</Text></Pressable>;
}
export function ReaderPreferences({value,onSave}:{value:ReaderPreferencesV1;onSave:(value:ReaderPreferencesV1)=>Promise<void>}) {
  const [open,setOpen]=useState(value.onboarding==="pending"),[draft,setDraft]=useState(()=>normalizedPreferences(value)),[notice,setNotice]=useState("");
  const [advanced,setAdvanced]=useState(false);
  const choose=(key:keyof ReaderPreferencesV1,v:unknown)=>setDraft(p=>({...p,[key]:v}));
  async function commit(status:ReaderPreferencesV1["onboarding"]) {
    try {await onSave({...draft,onboarding:status});setOpen(false);setNotice(status==="skipped"?"Questionnaire skipped. You can edit preferences anytime.":"Reading preferences saved on this device.");}
    catch(e){setNotice((e as Error).message);}
  }
  function options(title:string,key:keyof ReaderPreferencesV1,rows:readonly (readonly [string,string])[]) {
    return <View style={s.field}><Text style={s.label}>{title}</Text><View style={s.wrap}>{rows.map(([id,label])=><ReaderButton key={id} label={label} selected={draft[key]===id} onPress={()=>choose(key,id)}/>)}</View></View>;
  }
  return <View testID="reader-preferences" style={s.root}>
    {!open?<View style={s.wrap}><Text style={s.text}>{expertise(value)} · {value.depth} · {value.style}</Text><ReaderButton label="Reading preferences" onPress={()=>{setDraft(normalizedPreferences(value));setOpen(true);}}/></View>:<>
      <Text style={s.heading}>Make this reading yours</Text>
      <Text style={s.muted}>Optional. Preferences change how we explain, never what the charts contain. No personal history is required.</Text>
      <View style={s.wrap}><ReaderButton label="Skip questionnaire" onPress={()=>{setDraft(value);void onSave({...value,onboarding:"skipped"}).then(()=>setOpen(false)).catch(e=>setNotice(e.message));}}/><ReaderButton label="Save simple preferences" onPress={()=>void commit("completed")}/></View>
      {options("Human Design familiarity","preset",PRESETS.map((id,i)=>[id,["Beginner","Some knowledge","Intermediate","Advanced","Practitioner"][i]]))}
      <Text style={s.muted}>Optional: mark the concepts you know. The preset never checks these for you.</Text>
      <View style={s.wrap}>{Object.entries(CONCEPTS).map(([key,label])=><View key={key} style={s.field}>
        <Pressable accessibilityRole="checkbox" accessibilityLabel={`I know ${label}`} aria-checked={draft.concepts?.[key as keyof typeof CONCEPTS]===true} accessibilityState={{checked:draft.concepts?.[key as keyof typeof CONCEPTS]===true}} onPress={()=>setDraft(p=>({...p,concepts:{...p.concepts,[key]:p.concepts?.[key as keyof typeof CONCEPTS]!==true}}))} style={s.button}><Text style={s.text}>{draft.concepts?.[key as keyof typeof CONCEPTS]===true?"[x]":"[ ]"} {label}</Text></Pressable>
        <Text style={s.muted}>{draft.concepts?.[key as keyof typeof CONCEPTS]===undefined?"Not specified":draft.concepts?.[key as keyof typeof CONCEPTS]?"Known":"Explain this concept"}</Text>
      </View>)}</View>
      {options("Reading depth","depth",[["quick","Quick"],["standard","Standard"],["deep","Deep"]])}
      <ReaderButton label={advanced?"Hide advanced preferences":"More reading preferences"} onPress={()=>setAdvanced(v=>!v)}/>
      {advanced&&<>
      {options("Astrology familiarity","astrology",[["none","No astrology knowledge"],["some","Some astrology"],["advanced","Advanced astrology"]])}
      <ReaderButton label={draft.astrologyBridge?"Astrology bridge on":"Astrology bridge off"} selected={draft.astrologyBridge} onPress={()=>choose("astrologyBridge",!draft.astrologyBridge)}/>
      {options("Approach","style",[["practical","Practical"],["spiritual","Spiritual"],["integrated","Integrated"],["technical","Technical"]])}
      {options("Terminology","terminology",[["modern","Modern terms"],["traditional","Traditional terms"],["both","Both vocabularies"]])}
      {options("Learning style","teaching",[["explanation","Explain the idea"],["example","Give an example"],["questions","Guide with questions"]])}
      <ReaderButton label={draft.researchMode?"Inline research details on":"Inline research details off"} selected={draft.researchMode===true} onPress={()=>choose("researchMode",draft.researchMode!==true)}/>
      <View style={s.field}><Text style={s.label}>Focus · other existing interests are retained</Text><View style={s.wrap}>{["self-understanding","friendship","romance","sexual / energetic exploration","cohabitation","teamwork","communication","long-term partnership","mutual care","conflict and repair","intellectual resonance","energetic pacing","ordinary coexistence"].map(interest=><ReaderButton key={interest} label={interest} selected={draft.interests[0]===interest} onPress={()=>choose("interests",replacePrimaryInterest(draft.interests,interest))}/>)}</View></View>
      </>}
      <Text style={s.label}>Explanation preview</Text>
      <Text testID="reader-preference-preview" style={s.text}>{expertise(draft)==="Beginner"?"Two matching Gates make a complete Channel. A colored Center is not proof that all defined areas connect.":"Natal completeness, pair classification and connected components are distinct predicates."}{draft.depth!=="quick"?" A sufficient bridge demonstrates a connection; it does not prove that the shown route is the only one.":""}{draft.depth==="deep"?" In the reading, exact endpoints and alternative witnesses let you inspect what each person adds without changing either natal Authority.":""}</Text>
      <View style={s.wrap}><ReaderButton label="Save reading preferences" onPress={()=>void commit("completed")}/>{value.onboarding!=="pending"&&<ReaderButton label="Cancel preferences" onPress={()=>{setDraft(value);setOpen(false);}}/>}</View>
      <ReaderButton label="Reset reading preferences" onPress={()=>{const next:ReaderPreferencesV1={...value,familiarity:"new",preset:"beginner",concepts:{},depth:"standard",style:"practical",terminology:"modern",teaching:"explanation",interests:[],astrology:"none",astrologyBridge:false,researchMode:false,onboarding:"skipped"};void onSave(next).then(()=>{setDraft(next);setOpen(false);setNotice("Reading choices reset. Saved charts and requests are unchanged.");}).catch(e=>setNotice(e.message));}}/>
    </>}
    {!!notice&&<Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text>}
  </View>;
}
const fontFamily=Platform.OS==="web"?"system-ui":undefined;
const s=StyleSheet.create({root:{gap:8,paddingVertical:12,borderBottomWidth:1,borderColor:theme.border},field:{gap:6},wrap:{flexDirection:"row",flexWrap:"wrap",gap:6,alignItems:"center"},heading:{fontFamily,fontSize:19,fontWeight:"700",color:theme.text},label:{fontFamily,fontSize:15,fontWeight:"600",color:theme.text},text:{fontFamily,fontSize:14,lineHeight:21,color:theme.text},muted:{fontFamily,fontSize:14,lineHeight:21,color:theme.muted},button:{padding:9,minHeight:44,justifyContent:"center",maxWidth:"100%",borderWidth:1,borderColor:theme.border,borderRadius:5},selected:{borderColor:theme.accent,backgroundColor:theme.surfaceRaised}});
