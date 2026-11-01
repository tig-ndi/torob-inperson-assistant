import {useCallback,useEffect,useRef,useState} from 'react';
import {synthesizeSpeech,VoiceError} from './voiceClient.ts';
import {createAudioElementAnalyser,type VoiceAnalyserSession} from './audioAnalyser.ts';

export function useVoiceSpeaker(){
  const [isPlaying,setIsPlaying]=useState(false),[isLoading,setIsLoading]=useState(false),[error,setError]=useState<string|null>(null),[playbackBlocked,setPlaybackBlocked]=useState(false);
  const [analyserSession,setAnalyserSession]=useState<VoiceAnalyserSession|null>(null);
  const audioRef=useRef<HTMLAudioElement|null>(null),audioUrlRef=useRef<string|null>(null),analyserRef=useRef<VoiceAnalyserSession|null>(null),abortCtrl=useRef<AbortController|null>(null);
  const stop=useCallback(()=>{
    abortCtrl.current?.abort();
    if(audioRef.current){audioRef.current.pause();audioRef.current.currentTime=0;audioRef.current=null;}
    analyserRef.current?.close();analyserRef.current=null;setAnalyserSession(null);
    if(audioUrlRef.current){URL.revokeObjectURL(audioUrlRef.current);audioUrlRef.current=null;}
    setIsPlaying(false);setIsLoading(false);setPlaybackBlocked(false);
  },[]);
  useEffect(()=>()=>stop(),[stop]);
  const resumePlayback=useCallback(async()=>{
    const audio=audioRef.current;if(!audio)return;
    setError(null);
    try{
      const resumed=analyserRef.current?.audioContext.resume();
      // Call play in the button's user gesture; reuse the downloaded audio.
      const playing=audio.play();await Promise.all([resumed,playing]);
      if(audioRef.current!==audio)return;
      setPlaybackBlocked(false);setIsPlaying(true);
    }catch{if(audioRef.current!==audio)return;setPlaybackBlocked(true);setError('مرورگر اجازهٔ پخش نداد؛ مجوز پخش صدا را بررسی کن و دوباره «پخش صدای آماده» را بزن.');}
  },[]);
  const speak=useCallback(async(text:string)=>{
    const clean=text.trim();if(!clean)return;if(isPlaying){stop();return;}
    stop();setIsLoading(true);setError(null);
    const controller=new AbortController();abortCtrl.current=controller;
    // Start the audio context while the initiating click is still active.
    const audio=new Audio();audio.crossOrigin='anonymous';audioRef.current=audio;
    const analyser=createAudioElementAnalyser(audio);if(analyser){analyserRef.current=analyser;setAnalyserSession(analyser);}
    audio.onended=()=>{if(audioRef.current===audio)stop();};
    audio.onerror=()=>{if(audioRef.current===audio){setError('فایل صوتی دریافت شد اما مرورگر نتوانست آن را پخش کند.');stop();}};
    try{
      const url=await synthesizeSpeech(clean,controller.signal);
      if(controller.signal.aborted){URL.revokeObjectURL(url);return;}
      audioUrlRef.current=url;audio.src=url;
      await audio.play();if(controller.signal.aborted)return;
      setIsLoading(false);setIsPlaying(true);
    }catch(err:unknown){
      if(controller.signal.aborted||(err instanceof Error&&err.name==='AbortError'))return;
      if(err instanceof Error&&err.name==='NotAllowedError'&&audioUrlRef.current){setIsLoading(false);setPlaybackBlocked(true);setError('صدا آماده است؛ برای اجازهٔ پخش در مرورگر، «پخش صدای آماده» را بزن.');return;}
      setError(err instanceof VoiceError?err.message:'تولید یا پخش صدا انجام نشد؛ دوباره می‌توانی تلاش کنی.');stop();
    }
  },[isPlaying,stop]);
  return {isPlaying,isLoading,error,playbackBlocked,analyserSession,speak,resumePlayback,stop,clearError:()=>setError(null)};
}
