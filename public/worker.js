let transcriber;
self.onmessage=async({data})=>{
 try{
  self.postMessage({type:'status',text:'音声認識モデルを読み込んでいます（初回はダウンロード）…'});
  const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
  env.allowLocalModels=false;
  env.backends.onnx.wasm.numThreads=1;
  transcriber??=await pipeline('automatic-speech-recognition','Xenova/whisper-tiny',{device:'wasm',dtype:'q8'});
  const result=[];
  // Bound inference memory and update the UI every 30 seconds of audio.
  const size=30*16000;
  for(let offset=0;offset<data.audio.length;offset+=size){
   self.postMessage({type:'status',text:`歌声を文字起こししています… ${Math.round(offset/data.audio.length*100)}%`});
   const options={task:'transcribe',return_timestamps:true};
   if(data.language)options.language=data.language==='ja'?'japanese':'english';
   const output=await transcriber(data.audio.slice(offset,offset+size),options);
   result.push(output.chunks?.map(c=>c.text.trim()).filter(Boolean).join('\n')||output.text.trim());
   self.postMessage({type:'partial',text:result.join('\n')});
  }
  self.postMessage({type:'done',text:result.join('\n')});
 }catch(error){self.postMessage({type:'error',text:error.message})}
};
