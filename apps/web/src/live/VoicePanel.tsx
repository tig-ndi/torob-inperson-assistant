import {useEffect,useState} from 'react';
import {transcribeAudio} from '../app/voice/voiceClient';
import {Mic,Square,Volume2} from 'lucide-react';
import {useVoiceRecorder} from '../app/voice/useVoiceRecorder';
import {useVoiceSpeaker} from '../app/voice/useVoiceSpeaker';
import {AudioVisualizer} from '../app/voice/AudioVisualizer';
import {Btn,Seg} from '../prototype/ui';
import {fa} from './data';
import {request} from './client';
import {ErrorBox,Note} from './screens';

export default function VoicePanel({onText,responseText='',initialTab='record'}:{onText:(s:string)=>void;responseText?:string;initialTab?:'record'|'listen'}){
  const [tab,setTab]=useState<'record'|'listen'>(initialTab),[transcript,setTranscript]=useState(''),[readText,setReadText]=useState(responseText.slice(0,2000));
  const [fileBusy,setFileBusy]=useState(false),[fileError,setFileError]=useState<string|null>(null);
  const [ready,setReady]=useState(false),[status,setStatus]=useState('در حال بررسی سرویس صوت…'),[retry,setRetry]=useState(0);
  const recorder=useVoiceRecorder(setTranscript),speaker=useVoiceSpeaker();
  useEffect(()=>{const c=new AbortController();request('/api/voice/status',c.signal).then(v=>{const enabled=typeof v==='object'&&v!==null&&'ready'in v&&v.ready===true;setReady(enabled);setStatus(enabled?'صدایت را ضبط کن، متن را مرور کن و بعد بفرست.':'الان صدا در دسترس نیست؛ با تایپ ادامه بده.');}).catch(()=>{if(!c.signal.aborted)setStatus('ارتباط با سرویس صوت دریافت نشد.');});return()=>c.abort();},[retry]);
  const recording=recorder.state==='recording',waiting=fileBusy||recorder.state==='transcribing'||recorder.state==='requesting';
  const upload=async(file:File|undefined)=>{if(!file)return;setFileError(null);if(file.size>20*1024*1024){setFileError('حجم فایل باید کمتر از ۲۰ مگابایت باشد.');return;}setFileBusy(true);try{setTranscript(await transcribeAudio(file));}catch(e){setFileError(e instanceof Error?e.message:'فایل صوتی خوانده نشد.');}finally{setFileBusy(false);}};
  const state=recording?'listening':waiting?'transcribing':speaker.isPlaying?'speaking':recorder.error||speaker.error?'error':'idle';
  const change=(v:'record'|'listen')=>{recorder.cancelRecording();speaker.stop();setTab(v);};
  if(!ready)return <div className="voice-unavailable space-y-4"><p role="status">الان صدا در دسترس نیست؛ با تایپ ادامه بده.</p><Btn full onClick={()=>onText('')}>ادامه با تایپ</Btn><Btn full kind="ghost" onClick={()=>setRetry(v=>v+1)}>بررسی دوبارهٔ سرویس صوت</Btn></div>;
  return <div className="space-y-4"><Seg value={tab} onChange={change} items={[["record","گفتن پیام"],["listen","شنیدن متن"]]}/><Note>{status}</Note>
    <div className="voice-visual"><AudioVisualizer session={recording?recorder.analyserSession:speaker.analyserSession} state={state} width={360} height={120}/><p role="status">{recording?`دارم گوش می‌دهم · ${fa(recorder.duration)} ثانیه`:waiting?'در حال تبدیل گفتار به متن…':speaker.isLoading?'در حال آماده‌کردن صدا…':speaker.isPlaying?'در حال خواندن متن…':tab==='record'?'حرف بزن، متن را مرور کن و بعد بفرست':'متنی که می‌خواهی بخوانم را بنویس'}</p></div>
    {fileError&&<ErrorBox message={fileError}/>} {recorder.error&&<ErrorBox message={recorder.error}/>} {speaker.error&&<ErrorBox message={speaker.error}/>}
    {tab==='record'?<><label className="live-label">متن گفتار برای بررسی<textarea className="live-input" rows={3} maxLength={1000} value={transcript} onChange={e=>setTranscript(e.target.value)} placeholder="متن گفتار اینجا قرار می‌گیرد؛ می‌توانی ویرایشش کنی."/></label><div className="inline-actions"><Btn disabled={!ready||!recorder.isSupported||waiting} onClick={()=>recording?void recorder.stopRecording():void recorder.startRecording()}>{recording?<Square size={16}/>:<Mic size={17}/>} {recording?'توقف و تبدیل به متن':'شروع ضبط'}</Btn>{(recording||waiting)&&<Btn kind="secondary" onClick={recorder.cancelRecording}>لغو ضبط</Btn>}</div>{!recorder.isSupported&&<Note>ضبط مستقیم نیاز به مرورگر دارای مجوز میکروفون و اتصال امن دارد. می‌توانی از گزینهٔ فایل صوتی، صدا ضبط یا انتخاب کنی.</Note>}<label className="voice-file-action">انتخاب یا ضبط فایل صوتی<input aria-label="انتخاب فایل صوتی" type="file" accept="audio/*" capture="user" disabled={!ready||waiting||recording} onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label><Btn full disabled={!transcript.trim()||recording||waiting} onClick={()=>onText(transcript.trim())}>قرار دادن متن در پیام</Btn><Note>صدا پس از توقف ضبط به سرویس صوتی ارسال می‌شود. پیام خرید فقط با زدن دکمهٔ ارسال در چت فرستاده می‌شود.</Note></>:<><label className="live-label">متن برای خواندن<textarea className="live-input" rows={4} maxLength={2000} value={readText} onChange={e=>setReadText(e.target.value)} placeholder="پاسخ دستیار یا متن دلخواهت را اینجا قرار بده."/></label><Btn full disabled={!ready||!readText.trim()} onClick={()=>speaker.playbackBlocked?void speaker.resumePlayback():speaker.isLoading||speaker.isPlaying?speaker.stop():void speaker.speak(readText)}><Volume2 size={18}/>{speaker.playbackBlocked?'پخش صدای آماده':speaker.isPlaying||speaker.isLoading?'توقف خواندن':'برام بخون'}</Btn><Note>خواندن متن با انتخاب خودت انجام می‌شود؛ پخش خودکار نداریم.</Note></>}
    {!ready&&<Btn kind="ghost" full onClick={()=>setRetry(v=>v+1)}>بررسی دوبارهٔ سرویس صوت</Btn>}
  </div>;
}
