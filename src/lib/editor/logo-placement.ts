import {z} from 'zod';
export const logoPositions=['top-left','top-center','top-right','middle-left','middle-center','middle-right','bottom-left','bottom-center','bottom-right'] as const;
export const logoPlacementSchema=z.object({enabled:z.boolean(),position:z.enum(logoPositions),widthPercent:z.number().min(8).max(35),marginPercent:z.number().min(2).max(15),opacity:z.number().min(0).max(1)}).strict();
export const defaultLogoPlacement={enabled:true,position:'top-right' as const,widthPercent:18,marginPercent:5,opacity:1};
export function logoBox(settings:z.infer<typeof logoPlacementSchema>,aspect=1,width=1080,height=1350){
 const value=logoPlacementSchema.parse(settings),mx=width*value.marginPercent/100,my=height*value.marginPercent/100;
 let w=width*value.widthPercent/100,h=w/Math.max(.01,aspect);const scale=Math.min(1,(width-2*mx)/w,(height-2*my)/h);w*=scale;h*=scale;
 // The editor's minimum selection frame is 24px; raster content still uses contain.
 w=Math.max(24,w);h=Math.max(24,h);
 const [row,col]=value.position.split('-');return {x:col==='left'?mx:col==='right'?width-mx-w:(width-w)/2,y:row==='top'?my:row==='bottom'?height-my-h:(height-h)/2,width:w,height:h,opacity:value.opacity,visible:value.enabled};
}
