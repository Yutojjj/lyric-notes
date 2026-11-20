const $=id=>document.getElementById(id);
let busy=false, audioURL, worker;
function setStatus(text){$('status').textContent=text;$('statusBox').hidden=!text}
function stored(storage,key,value){try{if(value!==undefined)storage.setItem(key,value);return storage.getItem(key)||''}catch{return ''}}
const serverReady=fetch('/config.json',{cache:'no-store'}).then(async response=>{
 if(!response.ok)throw Error('接続先の設定を読み込めませんでした。');
 const config=await response.json();
 const url=new URL(config.audioServerUrl);
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('接続先の設定が正しくありません。');
 return url.origin;
});
// Observe configuration errors immediately, even before the first submission.
serverReady.catch(()=>setStatus('サーバーに接続できません。'));
try{sessionStorage.removeItem('lyric-key')}catch{}
$('lyrics').value=stored(localStorage,'lyric-draft');
function buttons(){$('copy').disabled=busy||!$('lyrics').value.trim();$('save').disabled=$('copy').disabled}
buttons();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(path,options={}){
 const url=new URL(await serverReady);
 url.pathname=path;url.search='';url.hash='';
 const response=await fetch(url,{...options,signal:AbortSignal.timeout(120000)});
 if(!response.ok){let error;try{error=(await response.json()).error}catch{}throw Error(error||`サーバー応答: ${response.status}。無料サーバー起動中の場合は少し待って再試行してください。`)}
 return response;
}
function recognize(audio){
 return new Promise((resolve,reject)=>{
  worker?.terminate();worker=new Worker('/worker.js',{type:'module'});
  worker.onerror=e=>{worker.terminate();reject(Error(e.message||'認識処理を起動できませんでした。'))};
  worker.onmessage=({data})=>{
   if(data.type==='status')setStatus(data.text);
   if(data.type==='partial'||data.type==='done'){$('lyrics').value=data.text;stored(localStorage,'lyric-draft',data.text)}
   if(data.type==='done'){worker.terminate();resolve()}
   if(data.type==='error'){worker.terminate();reject(Error(data.text))}
  };
  worker.postMessage({audio,language:'ja'},[audio.buffer]);
 });
}
$('form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;
 busy=true;buttons();$('start').disabled=true;$('lyrics').readOnly=true;$('errorBox').hidden=true;$('progress').hidden=false;$('progress').removeAttribute('value');$('audioBox').hidden=true;
 try{
  setStatus('接続中…');
  const {id}=await(await api('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:$('url').value})})).json();
  while(true){
   const job=await(await api('/api/jobs/'+id)).json();setStatus(job.message);
   if(job.stage==='error')throw Error(job.message);
   if(job.stage==='done'){$('song').textContent=job.title;break}
   await sleep(2000);
  }
  const blob=await(await api('/api/jobs/'+id+'/audio')).blob();
  $('audio').pause();if(audioURL)URL.revokeObjectURL(audioURL);audioURL=URL.createObjectURL(blob);
  $('audio').src=audioURL;$('download').href=audioURL;$('download').download='audio.mp3';$('audioBox').hidden=false;
  setStatus('音声を解析しています…');
  const context=new AudioContext();let decoded;
  try{decoded=await context.decodeAudioData(await blob.arrayBuffer())}finally{await context.close()}
  const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000);
  const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
  const pcm=(await offline.startRendering()).getChannelData(0);
  await recognize(pcm);
  setStatus($('lyrics').value.trim()?'完了':'歌声を認識できませんでした。');
 }catch(err){setStatus('処理に失敗しました。');$('errorBox').hidden=false;$('error').textContent=err.message}
 finally{busy=false;buttons();$('start').disabled=false;$('lyrics').readOnly=false;$('progress').hidden=true}
});
$('lyrics').addEventListener('input',()=>{stored(localStorage,'lyric-draft',$('lyrics').value);buttons()});
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('lyrics').value);$('copyStatus').textContent='コピーしました。'}catch{$('lyrics').select();$('copyStatus').textContent='Ctrl+Cまたは端末のコピー操作でコピーしてください。'}};
$('save').onclick=()=>{const url=URL.createObjectURL(new Blob(['\ufeff'+$('lyrics').value],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='lyrics.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
let installPrompt;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('install').hidden=false});
$('install').onclick=async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('install').hidden=true};
window.addEventListener('appinstalled',()=>{$('install').hidden=true});
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{$('copyStatus').textContent='PWA登録に失敗しました。再読み込みしてください。'});
window.addEventListener('offline',()=>setStatus('オフライン'));
