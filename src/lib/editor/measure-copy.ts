import type {Creative} from './schema';
export async function measureCopy(creative:Creative,headline:string,cta:string,locale?:string){
 const {default:Konva}=await import('konva');await Promise.all([document.fonts.load('48px Inter'),document.fonts.load('48px Cairo')]);
 return creative.layers.filter(layer=>layer.kind==='headline'||layer.kind==='cta').every(layer=>{const text=layer.kind==='headline'?headline:cta,node=new Konva.Text({text,width:layer.width,fontFamily:locale?(locale.startsWith('ar')?'Cairo':'Inter'):layer.fontFamily,fontStyle:layer.fontStyle??'normal',fontSize:layer.fontSize,padding:layer.kind==='cta'?15:8,lineHeight:1.2,wrap:'word'});const fits=node.height()<=layer.height&&node.textArr.map(line=>line.text).join('').replace(/\s/g,'').length>=text.replace(/\s/g,'').length;node.destroy();return fits;});
}
