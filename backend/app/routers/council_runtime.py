"""Authenticated runtime for the local Council call: media, board and evidence."""
import asyncio
import io
import json
import logging
import re
import uuid
from datetime import timedelta
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, update, delete
from app.council_access import get_council_user
from app.db import get_db, SessionLocal
from app.models import User
from app.council_models import CouncilMeeting, CouncilSignal, CouncilMessage
from app.config import settings
from app.routers import council as core
from app.council_reservations import reserve_end

router = APIRouter(prefix='/council-runtime', tags=['council-call'])
analysis_lock = asyncio.Lock()
running = set()

async def locked(db, meeting):
    await db.execute(update(CouncilMeeting).where(CouncilMeeting.id == meeting.id).values(agreement_version=meeting.agreement_version))
    await db.refresh(meeting)

def store(meeting, cfg):
    meeting.configuration = json.dumps(cfg, ensure_ascii=False)

def call_opens_at(meeting):
    return meeting.scheduled_at - timedelta(minutes=15)

def can_join_call(meeting, cfg, now):
    if now >= reserve_end(meeting):
        return False
    if meeting.status in {'preparation', 'active'}:
        return True
    return bool(cfg.get('business_meeting_id') and meeting.status == 'roles' and now >= call_opens_at(meeting))

async def rows(db, meeting_id, kind):
    return list((await db.scalars(select(CouncilSignal).where(CouncilSignal.meeting_id == meeting_id, CouncilSignal.kind == kind).order_by(CouncilSignal.id))).all())

async def view(db, meeting, members, user):
    cfg=core.config(meeting)
    from app.company_council import preparation_recording_allowed
    recording_allowed=await preparation_recording_allowed(db,meeting,user.id)
    try: ice_servers=json.loads(settings.room_ice_servers_json)
    except (TypeError,ValueError): ice_servers=[]
    users={u.id:u for u in (await db.scalars(select(User).where(User.id.in_([m.user_id for m in members])))).all()}
    mine=next((m for m in members if m.user_id==user.id),None)
    manager=await core.can_manage(db,meeting,user)
    if not manager and (not mine or mine.status!='confirmed'):
        raise HTTPException(403,'Звонок доступен участнику или ведущему встречи')
    presence={r.author_id:json.loads(r.payload) for r in await rows(db,meeting.id,'presence') if r.created_at>core.now_utc()-timedelta(seconds=15)}
    board=[json.loads(r.payload) for r in await rows(db,meeting.id,'board')]
    recordings=[json.loads(r.payload) for r in await rows(db,meeting.id,'recording')]
    company_ids=sorted({m.company_id for m in members if m.company_id})
    phase=cfg.get('call_phase', {'open':'lobby','locked':'prepare','roles':'prepare','preparation':'team','active':'talk','finished':'analysis' if cfg.get('audio_required') and cfg.get('audio_analysis',{}).get('status')!='complete' else 'report','cancelled':'report'}.get(meeting.status,'prepare'))
    if meeting.status=='finished':phase='analysis' if cfg.get('audio_required') and cfg.get('audio_analysis',{}).get('status')!='complete' else 'report'
    now=core.now_utc()
    return {'host':str(meeting.organizer_id),'code':str(meeting.id),'title':cfg.get('title','Совет решений'),'preparationCall':cfg.get('game_mode')=='business-preparation-v1','recordingAllowed':recording_allowed,'iceServers':ice_servers,'phase':phase,'started':meeting.scheduled_at.replace(tzinfo=core.timezone.utc).timestamp()*1000,
      'joinOpensAt':call_opens_at(meeting).replace(tzinfo=core.timezone.utc).timestamp()*1000,'canJoin':can_join_call(meeting,cfg,now),
      'reservedUntil':reserve_end(meeting).replace(tzinfo=core.timezone.utc).timestamp()*1000,'reservationEnded':now>=reserve_end(meeting),
      'me':{'id':str(user.id),'name':user.display_name or user.username,'role':mine.seat if mine and mine.status=='confirmed' else -1,'access':'owner' if user.id==meeting.organizer_id else 'moderator' if manager else 'participant'},
      'permissions':{'manage':manager},'allowStageRequests':cfg.get('allow_stage_requests',True),'stageRequest':cfg.get('stage_request'),
      'members':[{'id':str(m.user_id),'name':users[m.user_id].display_name or users[m.user_id].username,'role':m.seat if m.status=='confirmed' else -1,'access':'owner' if m.user_id==meeting.organizer_id else 'moderator' if m.status=='facilitator' else 'participant','roleName':core.role_packet(m).get('name','Ведущий') if m.role_key else 'Ведущий','icon':(users[m.user_id].display_name or users[m.user_id].username)[0],'bot':False,'inCall':m.user_id in presence,'muted':bool(m.muted),'cameraBlocked':bool(m.camera_blocked),'audioOn':presence.get(m.user_id,{}).get('audio',False),'videoOn':presence.get(m.user_id,{}).get('video',False),'screenOn':presence.get(m.user_id,{}).get('screen',False)} for m in members if m.status in {'confirmed','facilitator'}],
      'signals':[{'id':r.id,'from':str(r.author_id),'kind':r.kind,'payload':json.loads(r.payload)} for r in (await db.scalars(select(CouncilSignal).where(CouncilSignal.meeting_id==meeting.id,CouncilSignal.recipient_id==user.id,CouncilSignal.kind.in_(['offer','answer','ice','leave']),CouncilSignal.created_at>core.now_utc()-timedelta(minutes=2)).order_by(CouncilSignal.id.desc()).limit(500))).all()][::-1],
      'game': core.social.state(cfg, meeting.status=='finished') if cfg.get('game_mode')==core.social.MODE else None,
      'myRole': core.role_packet(mine, meeting) if cfg.get('game_mode')==core.social.MODE and mine and mine.role_key and meeting.status in {'roles','preparation','active','finished'} else None,
      'canAdvanceGame': meeting.status=='active' and mine.status=='confirmed' and cfg.get('allow_stage_requests',True),
      'outcome':core.public_social_outcome(meeting) if cfg.get('game_mode')==core.social.MODE and meeting.status=='finished' and meeting.result else None,
      'board':board,'boardVersion':cfg.get('board_version',0),'recordings':[{k:v for k,v in r.items() if k not in {'transcript','file'}} for r in recordings],'analysis':cfg.get('audio_analysis')}

async def recording_row(db, mid, rid, uid=None):
    if not re.fullmatch('[a-f0-9-]{36}',rid):raise HTTPException(404,'Запись не найдена')
    for row in await rows(db,mid,'recording'):
        data=json.loads(row.payload)
        if data['id']==rid and (uid is None or row.author_id==uid):return row,data
    raise HTTPException(404,'Запись не найдена')

@router.post('/{mid}/audio/{rid}')
async def upload(mid:int,rid:str,request:Request,user:User=Depends(get_council_user),db=Depends(get_db)):
    meeting,members,_=await core.load_meeting(db,mid,user,member_required=True)
    await locked(db,meeting)
    row,rec=await recording_row(db,mid,rid,user.id)
    if rec['status']!='recording':raise HTTPException(409,'Запись уже закрыта')
    data=bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data)>2*1024*1024:raise HTTPException(413,'Фрагмент больше 2 МБ')
    if rec['bytes']+len(data)>48*1024*1024:raise HTTPException(413,'Сегмент записи больше 48 МБ')
    directory=Path(settings.data_dir)/'council-audio'/str(mid)/rid
    directory.mkdir(parents=True,exist_ok=True)
    (directory/str(rec['chunks'])).write_bytes(data)
    rec['chunks']+=1;rec['bytes']+=len(data);row.payload=json.dumps(rec);await db.commit()
    return {'saved':rec['chunks']}

async def schedule_analysis(meeting,db):
    cfg=core.config(meeting)
    if meeting.status!='finished' or not cfg.get('audio_required') or cfg.get('audio_analysis',{}).get('status') in {'complete','error'} or meeting.id in running:return
    people=[m for m in await core.members_for(db,meeting.id) if m.status=='confirmed']
    recordings=[json.loads(r.payload) for r in await rows(db,meeting.id,'recording')]
    pending = any(r['status']=='recording' for r in recordings)
    missing = (not recordings if cfg.get('game_mode')=='business-preparation-v1' else any(not any(r['member']==str(m.user_id) and r['status'] in {'uploaded','transcribed','empty'} for r in recordings) for m in people))
    if pending or missing:
        # Allow final MediaRecorder chunks to arrive, but an absent/silent
        # participant must not prevent everybody else's report forever.
        deadline = cfg.get('audio_upload_deadline')
        if not deadline:
            cfg['audio_upload_deadline'] = core.iso(core.now_utc()+timedelta(minutes=2))
            store(meeting,cfg);await db.commit();return
        from datetime import datetime
        if core.now_utc() < datetime.fromisoformat(deadline.replace('Z','+00:00')).replace(tzinfo=None):return
        for row in await rows(db,meeting.id,'recording'):
            rec=json.loads(row.payload)
            if rec['status']=='recording':
                rec['status']='uploaded' if rec.get('bytes') else 'empty'
                rec['interrupted']=True
                row.payload=json.dumps(rec,ensure_ascii=False)
        await db.commit()
    if meeting.id in running:return
    running.add(meeting.id)
    try:
        cfg['audio_analysis']={'status':'queued'};store(meeting,cfg);await db.commit()
    except BaseException:
        running.discard(meeting.id)
        raise
    asyncio.create_task(analyze(meeting.id))

@router.api_route('/{mid}',methods=['GET'])
@router.api_route('/{mid}/{action}',methods=['POST'])
async def runtime(mid:int,request:Request,action:str='',user:User=Depends(get_council_user),db=Depends(get_db)):
    meeting,members,mine=await core.load_meeting(db,mid,user,member_required=True)
    manager=await core.can_manage(db,meeting,user)
    if not mine or mine.status not in {'confirmed','facilitator'}:raise HTTPException(403,'Необходимо участие во встрече')
    if core.now_utc()>=reserve_end(meeting) and meeting.status in {'preparation','active'}:
        meeting.status='finished'
        outcome=core.evaluated_outcome(meeting,members)
        outcome.update({'feasible':False,'summary':'Время созвона истекло. Общее соглашение не было подтверждено всеми участниками.','ended_by_timeout':True})
        messages=list((await db.scalars(select(CouncilMessage).where(CouncilMessage.meeting_id==mid).order_by(CouncilMessage.id))).all())
        names={member.user_id:(await db.get(User,member.user_id)).display_name or (await db.get(User,member.user_id)).username for member in members}
        meeting.result=json.dumps(core.build_council_report(outcome,messages,members,names,packets={member.user_id:core.role_packet(member,meeting) for member in members if member.status=='confirmed' and member.role_key},agreement=json.loads(meeting.agreement)),ensure_ascii=False)
        from app.company_council import sync_council_report_to_company_meeting
        await sync_council_report_to_company_meeting(db,meeting)
        await db.commit()
    if request.method=='GET':
        await schedule_analysis(meeting,db)
        return await view(db,meeting,members,user)
    if int(request.headers.get('content-length','0'))>100000:raise HTTPException(413,'Слишком большой запрос')
    body=await request.json()
    if action not in {'call','signal'}:await locked(db,meeting)
    cfg=core.config(meeting)
    ended=core.now_utc()>=reserve_end(meeting)
    if action in {'board','recordstart','signal'} and ended and body.get('kind')!='leave':raise HTTPException(409,'Резервирование завершено')
    if action=='gamestage':
        stage=body.get('stage')
        if type(stage) is not int or not 0<=stage<=3:raise HTTPException(422,'Неизвестный этап игры')
        await core.control_social_stage(db,meeting,members,user,stage)
        return await view(db,meeting,members,user)
    elif action=='gameadvance':
        stage=body.get('stage')
        if type(stage) is not int or not 0<=stage<=2:raise HTTPException(422,'Неизвестный этап игры')
        await core.advance_social_game(db,meeting,members,mine,stage)
        return await view(db,meeting,members,user)
    elif action=='call':
        requested=bool(body.get('active'))
        if requested and not can_join_call(meeting,cfg,core.now_utc()):
            if ended or meeting.status in {'finished','cancelled'}:
                raise HTTPException(409,'Время звонка завершилось. Вернитесь к встрече, чтобы посмотреть итог.')
            if core.now_utc()<call_opens_at(meeting):
                raise HTTPException(409,'Вход откроется за 15 минут до начала встречи.')
            raise HTTPException(409,'Звонок пока не открыт. Обновите страницу и попробуйте снова.')
        active=requested
        presence=next((r for r in await rows(db,mid,'presence') if r.author_id==user.id),None)
        if active:
            if not presence:presence=CouncilSignal(meeting_id=mid,author_id=user.id,recipient_id=user.id,kind='presence');db.add(presence)
            presence.payload=json.dumps({'audio':bool(body.get('audio')) and not mine.muted,'video':bool(body.get('video')) and not mine.camera_blocked,'screen':bool(body.get('screen')) and not mine.camera_blocked});presence.created_at=core.now_utc()
        elif presence:await db.delete(presence)
    elif action=='signal':
        target=next((m for m in members if str(m.user_id)==str(body.get('to')) and m.status in {'confirmed','facilitator'}),None)
        if not target or target.user_id==user.id or body.get('kind') not in {'offer','answer','ice','leave'}:raise HTTPException(422,'Неверный получатель или сигнал')
        db.add(CouncilSignal(meeting_id=mid,author_id=user.id,recipient_id=target.user_id,kind=body['kind'],payload=json.dumps(body.get('payload')),created_at=core.now_utc()))
    elif action=='board':
        if mine.muted:raise HTTPException(403,'Ведущий отключил ваши действия')
        objects=await rows(db,mid,'board');operation=body.get('operation')
        if operation=='clear':
            if not manager:raise HTTPException(403,'Доску очищает ведущий')
            if body.get('version')!=cfg.get('board_version',0):raise HTTPException(409,'Доска изменилась')
            for row in objects:await db.delete(row)
        elif operation=='undo':
            own=[r for r in objects if r.author_id==user.id]
            if own:await db.delete(own[-1])
        elif operation=='add':
            item=body.get('item',{});points=item.get('points',[])
            if len(objects)>=500 or item.get('tool') not in {'pen','line','rect','ellipse','text','eraser'} or not re.fullmatch('#[0-9a-fA-F]{6}',str(item.get('color'))) or not isinstance(item.get('width'),(int,float)) or not 1<=item['width']<=40 or not isinstance(points,list) or not 1<=len(points)<=1000 or any(not isinstance(p,list) or len(p)!=2 or any(type(n) not in (int,float) or not 0<=n<=1 for n in p) for p in points):raise HTTPException(422,'Недопустимый рисунок или доска заполнена')
            item={k:item[k] for k in ('tool','color','width','points')};item.update({'text':str(body['item'].get('text',''))[:200],'id':str(uuid.uuid4()),'member':str(user.id)})
            db.add(CouncilSignal(meeting_id=mid,author_id=user.id,recipient_id=user.id,kind='board',payload=json.dumps(item)))
        else:raise HTTPException(422,'Неизвестный инструмент')
        cfg['board_version']=cfg.get('board_version',0)+1;store(meeting,cfg)
    elif action=='recordstart':
        if mine.status!='confirmed' or mine.muted or not can_join_call(meeting,cfg,core.now_utc()):raise HTTPException(403,'Запись разрешена участнику во время открытого звонка')
        from app.company_council import preparation_recording_allowed
        if not await preparation_recording_allowed(db,meeting,user.id):raise HTTPException(403,'Для записи и анализа речи подтвердите согласие в карточке тестового созвона')
        mime=body.get('mime','')
        if not any(mime.startswith(x) for x in ['audio/webm','audio/ogg','audio/mp4']):raise HTTPException(422,'Неподдерживаемый формат')
        rec={'id':str(uuid.uuid4()),'member':str(user.id),'name':user.display_name or user.username,'status':'recording','mime':mime,'chunks':0,'bytes':0,'created':core.iso(core.now_utc())}
        db.add(CouncilSignal(meeting_id=mid,author_id=user.id,recipient_id=user.id,kind='recording',payload=json.dumps(rec,ensure_ascii=False)))
        cfg['audio_required']=True;store(meeting,cfg);await db.commit();return rec
    elif action=='recordfinish':
        row,rec=await recording_row(db,mid,body.get('id',''),user.id)
        rec['status']=('uploaded' if rec['bytes'] else 'empty') if rec['status']=='recording' else rec['status'];row.payload=json.dumps(rec,ensure_ascii=False)
    elif action in {'navigate','stagepolicy','stagerequest'}:
        if meeting.status in {'finished','cancelled'} or ended:raise HTTPException(409,'Встреча завершена')
        if action=='stagepolicy':
            if not manager:raise HTTPException(403,'Правило меняет ведущий')
            cfg['allow_stage_requests']=body.get('enabled') is True;cfg['stage_request']=None;cfg['social_approvals']=[]
        else:
            phases=['prepare','team','talk','agreement','vote'];current=cfg.get('call_phase','talk' if meeting.status=='active' else 'team')
            if action=='navigate':
                if not manager:raise HTTPException(403,'Этап меняет ведущий')
                target=body.get('phase')
                if target not in phases:raise HTTPException(422,'Неизвестный этап')
            else:
                if not cfg.get('allow_stage_requests',True) or mine.status!='confirmed' or user.id==meeting.organizer_id:raise HTTPException(403,'Запрос перехода запрещён')
                if current not in phases[:-1]:raise HTTPException(409,'Переход недоступен')
                target=phases[phases.index(current)+1];proposal=cfg.get('stage_request') or {'from':current,'to':target,'approvals':[]}
                proposal['approvals']=list(set(proposal['approvals']+[str(user.id)]));cfg['stage_request']=proposal
                eligible=[m for m in members if m.status=='confirmed' and m.user_id!=meeting.organizer_id]
                if not all(str(m.user_id) in proposal['approvals'] for m in eligible):store(meeting,cfg);await db.commit();return await view(db,meeting,members,user)
            if meeting.status not in {'preparation','active'}:raise HTTPException(409,'Встреча сейчас не в переговорах')
            if target in {'talk','agreement','vote'} and core.now_utc()<meeting.scheduled_at:raise HTTPException(409,'Дождитесь назначенного начала')
            if target in {'talk','agreement','vote'} and any(not m.ready or not m.role_read for m in members if m.status=='confirmed'):
                raise HTTPException(409,'Каждый участник должен прочитать роль и подтвердить готовность')
            if target=='vote' and (not json.loads(meeting.agreement).get('decision') or not meeting.agreement_version):raise HTTPException(409,'Сначала сохраните соглашение')
            cfg['call_phase']=target;cfg['stage_request']=None
            meeting.status='active' if target in {'talk','agreement','vote'} else 'preparation'
            for member in members:member.vote_version=None
        store(meeting,cfg)
    elif action=='analyze':
        if not manager:raise HTTPException(403,'Обработку запускает ведущий')
        if cfg.get('audio_analysis',{}).get('status')=='error':
            cfg.pop('audio_analysis');store(meeting,cfg);await db.commit()
        await schedule_analysis(meeting,db)
    else:raise HTTPException(404,'Неизвестное действие')
    await db.commit()
    if action=='recordfinish':await schedule_analysis(meeting,db)
    result=await view(db,meeting,members,user)
    if action=='call' and body.get('boardVersion')==result['boardVersion']:result.pop('board',None)
    return result

async def transcribe_record(rec, mid, owner_id):
    import av
    from app.voice import local_stt
    from app.speech_service import speech_context
    directory=Path(settings.data_dir)/'council-audio'/str(mid)/rec['id']
    data=b''.join((directory/str(i)).read_bytes() for i in range(rec['chunks']))
    container=av.open(io.BytesIO(data));resampler=av.AudioResampler(format='s16',layout='mono',rate=16000)
    pcm=bytearray();texts=[]
    async def transcribe_chunk(pcm_chunk, chunk_number):
        # Council processing happens after the HTTP upload has completed, so it
        # no longer inherits the request context used by ordinary room audio.
        # Set an explicit context to keep these recordings on the same
        # configured Whisper queue (local, remote, or automatic fallback).
        token = speech_context.set((owner_id, f"/api/council-runtime/{mid}/audio", f"{rec['id']}:{chunk_number}"))
        try:
            return await local_stt.transcribe(pcm_chunk)
        finally:
            speech_context.reset(token)

    chunk_number = 0
    for frame in container.decode(audio=0):
        for output in resampler.resample(frame):
            pcm.extend(output.to_ndarray().tobytes())
            while len(pcm)>=1280000:
                texts.append(await transcribe_chunk(bytes(pcm[:1280000]), chunk_number)); chunk_number += 1; del pcm[:1280000]
    for output in resampler.resample(None):pcm.extend(output.to_ndarray().tobytes())
    if len(pcm)>=9600:texts.append(await transcribe_chunk(bytes(pcm), chunk_number))
    container.close()
    return ' '.join(t for t in texts if t).strip()

async def analyze(mid):
    async with analysis_lock:
      try:
        async with SessionLocal() as db:
          meeting=await db.get(CouncilMeeting,mid);cfg=core.config(meeting)
          cfg['audio_analysis']={'status':'processing'};store(meeting,cfg);await db.commit()
          audio=await rows(db,mid,'recording')
          for row in audio:
            rec=json.loads(row.payload)
            if rec['status']=='uploaded':
                transcript=await transcribe_record(rec,mid,row.author_id)
                if transcript:
                    db.add(CouncilMessage(meeting_id=mid,author_id=row.author_id,recipient_id=None,kind='transcript',text=transcript[:30000]))
                rec['status']='transcribed' if transcript else 'empty';row.payload=json.dumps(rec,ensure_ascii=False);await db.commit()
          members=await core.members_for(db,mid);messages=list((await db.scalars(select(CouncilMessage).where(CouncilMessage.meeting_id==mid).order_by(CouncilMessage.id))).all())
          users={u.id:u for u in (await db.scalars(select(User).where(User.id.in_([m.user_id for m in members])))).all()}
          outcome=core.evaluated_outcome(meeting,members)
          previous=json.loads(meeting.result) if meeting.result else {}
          if previous.get('ended_by_organizer') or previous.get('ended_by_timeout'):
              for key in ('ended_by_organizer','ended_by_timeout','feasible','summary','consequences','role_outcomes'):
                  if key in previous:outcome[key]=previous[key]
          result=core.build_council_report(outcome,messages,members,{uid:u.display_name or u.username for uid,u in users.items()},packets={m.user_id:core.role_packet(m, meeting) for m in members if m.role_key},agreement=json.loads(meeting.agreement))
          if cfg.get('game_mode')=='business-preparation-v1':
            from app.engine.meeting_protocol import draft_from_segments, refine_summary_with_ai
            evidence=[{'id':m.id,'text':m.text} for m in messages if m.recipient_id is None and m.kind in {'message','proposal','transcript'}]
            if evidence:
              draft,_=draft_from_segments(evidence)
              result['ai_summary']=await refine_summary_with_ai(draft,evidence)
              result['summary']=result['ai_summary']
            result['discussed']=[];result['unobserved']=[]
          else:
            from app.engine.council_report import attach_theory_review
            for member in members:
              if member.status!='confirmed':continue
              own=[{'id':m.id,'text':m.text} for m in messages if m.author_id==member.user_id and m.recipient_id is None and m.kind in {'message','proposal','transcript'}]
              await attach_theory_review(result['contributions'][str(member.user_id)]['personal_report'], own,
                  core.role_packet(member, meeting), json.loads(meeting.agreement))
          coverage=[{'member':str(row.author_id),'status':json.loads(row.payload)['status']} for row in audio]
          result['audio_coverage']={'recordings':coverage,'notice':'Разбор основан только на сохранённых репликах. Отсутствие записи или распознанной речи не означает отсутствие навыка или участия в разговоре.'}
          await db.refresh(meeting);cfg=core.config(meeting);cfg['audio_analysis']={'status':'complete'};store(meeting,cfg);meeting.result=json.dumps(result,ensure_ascii=False)
          from app.company_council import sync_council_report_to_company_meeting
          await sync_council_report_to_company_meeting(db, meeting)
          await db.commit()
      except Exception as exc:
        logging.getLogger(__name__).exception("Council report generation failed")
        async with SessionLocal() as db:
          meeting=await db.get(CouncilMeeting,mid)
          if meeting:
            cfg=core.config(meeting);cfg['audio_analysis']={'status':'error','error':str(exc)[:350] if isinstance(exc,ValueError) else 'Не удалось завершить Whisper или ИИ-анализ. Проверьте настройки; записи сохранены.'};store(meeting,cfg);await db.commit()
      finally:running.discard(mid)
