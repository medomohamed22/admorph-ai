import {Shell} from '@/components/shell';import {Demo} from '@/components/demo';import {notFound} from 'next/navigation';
export function generateStaticParams(){return [{id:'sample'}]}
export const instant = false;
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;if(id!=='sample')notFound();return <><Shell kind="studio"/><Demo/></>}
