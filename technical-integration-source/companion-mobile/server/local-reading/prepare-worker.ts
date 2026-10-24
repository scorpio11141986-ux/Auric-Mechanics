import {prepareSavedReading} from './selection';
process.once('message',(request:unknown)=>{
 try{const packet=prepareSavedReading(request);process.send?.({packet},()=>process.exit(0));}
 catch(e){const code=e instanceof Error&&/^[A-Z_]{3,100}$/.test(e.message)?e.message:'SAVED_CHART_PREPARATION_FAILED';process.send?.({error:code},()=>process.exit(1));}
});
