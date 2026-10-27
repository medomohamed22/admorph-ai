import {Shell} from '@/components/shell';import {Demo} from '@/components/demo';import {notFound} from 'next/navigation';
import { Suspense } from 'react';
import { StudioLoader } from '@/components/studio-loader';
export function generateStaticParams(){return [{id:'sample'}]}
export const instant = false;
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;if(id==='sample')return <><Shell kind="studio"/><Demo/></>;if(!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id))notFound();return <Suspense><StudioLoader campaignId={id}/></Suspense>}
