import {Platform} from 'react-native';
import {localReadingFlag} from '../reading/llm-presentation';
export {SavedReadingExperience as LocalReadingPreview} from './SavedReadingExperience';
export type {LocalReaderTarget} from './SavedReadingExperience';
export function localReadingEnabled(){return localReadingFlag({development:typeof __DEV__!=='undefined'&&__DEV__,flag:process.env.EXPO_PUBLIC_AURIC_LOCAL_READING,platform:Platform.OS,host:typeof window==='undefined'?'':window.location.hostname});}
