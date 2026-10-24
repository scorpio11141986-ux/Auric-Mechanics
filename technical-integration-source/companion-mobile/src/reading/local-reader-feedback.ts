/** Reader messages keep machine validation codes in diagnostic receipts. */
export function localReaderError(code:string){
 if(/CONSENT/.test(code))return 'Choose whether to allow ChatGPT to use the selected chart facts before generating a reading.';
 if(/TEACHING_|WITHHELD|EXACT_LINE|SOURCE|UNCERTAIN/.test(code))return 'Part of this reading could not be checked against the available interpretation evidence. Restricted meanings remain withheld. You can still explore the chart or use the deterministic reading.';
 if(/SCOPE|PERSON_LABEL|ACTIVATION|FACT_BINDING/.test(code))return 'Part of this reading could not be matched safely to the selected people and chart facts. You can still explore the chart or use the deterministic reading.';
 if(/STALE|REVOKED|REVISION|SAVED_|SELECTION/.test(code))return 'This reading no longer matches the selected saved chart. Reopen the reading and confirm the current people and revisions.';
 if(/CACHE_ONLY/.test(code))return 'A checked saved response is not available for this selection in the local verification session. The deterministic reading is still available.';
 if(/AUTH|TOKEN|CONNECTION|SIGN|SECURE_STORAGE/.test(code))return 'The ChatGPT connection needs attention. Open Connection and model to check it, or use the deterministic reading.';
 return 'The reading could not be completed safely. Your chart remains available, and you can use the deterministic reading or try again after checking the connection.';
}
