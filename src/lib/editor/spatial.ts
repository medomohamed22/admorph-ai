import {z} from 'zod';
import type {EditableLayer} from './schema';
export const spatialSchema=z.enum(['top_copy_center_product','rtl_right_copy_left_product','ltr_left_copy_right_product','bottom_banner_center_stage']);
export type SpatialPreset=z.infer<typeof spatialSchema>;
export function spatialInstruction(value?:string){return ({top_copy_center_product:'Keep the top 30% calm and empty for copy. Product stage centered below.',rtl_right_copy_left_product:'Keep the right half calm for Arabic copy; product stage in the left center.',ltr_left_copy_right_product:'Keep the left half calm for English copy; product stage in the right center.',bottom_banner_center_stage:'Keep a calm bottom banner for copy; product stage centered above.'} as Record<string,string>)[value??'top_copy_center_product']??'Leave calm negative space for separate text layers.';}
export function spatialLayers(layers:EditableLayer[],preset:string){return layers.map(layer=>{
 if(preset==='top_copy_center_product'&&layer.kind==='headline')return {...layer,x:75,y:205,width:930,height:265,fontSize:76};
 if(preset==='top_copy_center_product'&&layer.kind==='product')return {...layer,x:220,y:510,width:640,height:590};
 if(preset==='rtl_right_copy_left_product'&&layer.kind==='headline')return {...layer,x:570,y:250,width:430,height:700,fontSize:64};
 if(preset==='rtl_right_copy_left_product'&&layer.kind==='product')return {...layer,x:50,y:350,width:470,height:720};
 if(preset==='ltr_left_copy_right_product'&&layer.kind==='headline')return {...layer,x:60,y:250,width:450,height:700,fontSize:64};
 if(preset==='ltr_left_copy_right_product'&&layer.kind==='product')return {...layer,x:550,y:350,width:480,height:720};
 if(preset==='bottom_banner_center_stage'&&layer.kind==='headline')return {...layer,x:75,y:890,width:930,height:210,fontSize:64};
 if(preset==='bottom_banner_center_stage'&&layer.kind==='product')return {...layer,x:160,y:190,width:760,height:650};
 return layer;});}
