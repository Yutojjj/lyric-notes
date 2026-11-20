import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import re
from flask import Flask, request, jsonify, send_file
import yt_dlp

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 8192
jobs = {}
lock = threading.Lock()
pool = ThreadPoolExecutor(max_workers=1)
ROOT = Path(tempfile.gettempdir()) / 'lyric-notes'
ROOT.mkdir(exist_ok=True)


def canonical(value):
    if not isinstance(value, str) or len(value) > 2048: raise ValueError('動画URLを入力してください。')
    u = urlparse(value.strip())
    if u.scheme != 'https' or u.username or u.password or u.port not in (None, 443): raise ValueError('httpsの動画URLを指定してください。')
    host = u.hostname
    parts = u.path.strip('/').split('/')
    v = None
    if host in ('youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'):
        v = parse_qs(u.query).get('v',[None])[0] if u.path == '/watch' else (parts[1] if len(parts)==2 and parts[0] in ('shorts','live') else None)
    elif host == 'youtu.be': v = u.path.strip('/')
    if v and re.fullmatch(r'[\w-]{11}',v,flags=re.ASCII): return 'https://www.youtube.com/watch?v='+v
    if host in ('nicovideo.jp','www.nicovideo.jp','nico.ms'):
        v = u.path.removeprefix('/watch/').strip('/')
        if re.fullmatch(r'(?:sm|nm|so)\d+',v): return 'https://www.nicovideo.jp/watch/'+v
    raise ValueError('YouTubeまたはニコニコ動画のURLを指定してください。')


@app.before_request
def preflight():
    if request.method == 'OPTIONS': return '',204


@app.after_request
def headers(response):
    origin = request.headers.get('Origin')
    if origin and origin == os.environ.get('FRONTEND_ORIGIN'):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Vary'] = 'Origin'
    response.headers['Cache-Control'] = 'no-store'
    return response


@app.get('/health')
def health(): return jsonify(ok=True)


def update(jid, **fields):
    with lock: jobs[jid].update(fields)


def process(jid,url):
    directory = ROOT/jid
    try:
        directory.mkdir()
        update(jid,stage='download',message='音声を取得しています…')
        def check(info, *, incomplete=False):
            if info.get('is_live'): return 'ライブ配信には対応していません。'
            if not incomplete and (not info.get('duration') or info['duration']>600): return '10分以内の動画を指定してください。'
        with yt_dlp.YoutubeDL({'format':'bestaudio/best','outtmpl':str(directory/'source.%(ext)s'),'noplaylist':True,'quiet':True,'no_warnings':True,'max_filesize':100*1024*1024,'socket_timeout':25,'retries':1,'match_filter':check,'js_runtimes':{'node':{}}}) as ydl:
            info = ydl.extract_info(url,download=True)
            if not info: raise ValueError('動画を取得できませんでした。')
            source = Path(ydl.prepare_filename(info))
        update(jid,stage='convert',message='MP3に変換しています…')
        subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-i',str(source),'-vn','-t','600','-ac','1','-b:a','128k',str(directory/'audio.mp3')],check=True,capture_output=True,timeout=300)
        source.unlink(missing_ok=True)
        update(jid,stage='done',title=info.get('title','音声'),message='MP3を取得しました。')
    except Exception as exc:
        app.logger.exception('Download failed')
        update(jid,stage='error',message=str(exc)[:800])
        shutil.rmtree(directory,ignore_errors=True)


@app.post('/api/jobs')
def create():
    payload = request.get_json(silent=True)
    try: url = canonical(payload.get('url')) if isinstance(payload,dict) else canonical(None)
    except ValueError as exc: return jsonify(error=str(exc)),400
    with lock:
        if any(j['stage'] not in ('done','error') for j in jobs.values()): return jsonify(error='別の音声を処理中です。完了後に再実行してください。'),429
        # Retain at most three files, and expire completed jobs after an hour.
        completed = sorted(jobs,key=lambda k: jobs[k]['created'])
        for old in completed:
            if len(jobs)>=3 or time.time()-jobs[old]['created']>3600:
                shutil.rmtree(ROOT/old,ignore_errors=True)
                del jobs[old]
        jid = uuid.uuid4().hex
        jobs[jid] = dict(stage='queued',message='処理を開始します…',created=time.time())
    pool.submit(process,jid,url)
    return jsonify(id=jid),202


@app.get('/api/jobs/<jid>')
def status(jid):
    with lock:
        j = jobs.get(jid)
        return jsonify(dict(j)) if j else (jsonify(error='処理が失効しました。もう一度開始してください。'),404)


@app.get('/api/jobs/<jid>/audio')
def audio(jid):
    with lock: ready = jobs.get(jid,{}).get('stage') == 'done'
    if not ready: return jsonify(error='MP3が見つかりません。'),404
    return send_file(ROOT/jid/'audio.mp3',mimetype='audio/mpeg',download_name='audio.mp3')
