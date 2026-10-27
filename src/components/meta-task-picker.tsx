'use client';
import {useProviderSession} from './provider-session';
import {useMessages} from './workspace';
import type {MetaTask} from '@/lib/ai/task-support';
export function MetaTaskPicker({task,value,onChange}:{task:MetaTask;value:string;onChange:(value:string)=>void}){const provider=useProviderSession(),t=useMessages().meta,models=provider.catalogs.meta?.models??[];return <div><label>{t.chooseModel} · {t.tasks[task]}<select aria-label={`${t.chooseModel} · ${t.tasks[task]}`} value={models.some(model=>model.id===value)?value:''} onChange={e=>{if(e.target.value)onChange(e.target.value);}}><option value="">{t.chooseModel}</option>{models.map(model=><option key={model.id} value={model.id}>{model.name} · {model.id}</option>)}</select></label><input aria-label={`${t.tasks[task]} · ${t.modelIdLabel}`} dir="ltr" maxLength={240} value={value} onChange={e=>onChange(e.target.value)}/></div>;}
