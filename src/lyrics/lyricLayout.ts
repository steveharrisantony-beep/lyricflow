import type {LyricPlacementMode} from '../visualization/cinematic/kineticTypography';

/** Percentages of the lyric canvas, independent of font size and render quality. */
export interface LyricLayoutSettings {
 horizontalPadding:number;
 verticalPadding:number;
 maxWidth:number;
 maxHeight:number;
}

export const DEFAULT_LYRIC_LAYOUT:Readonly<LyricLayoutSettings>={
 horizontalPadding:2,verticalPadding:2,maxWidth:76,maxHeight:40
};

export function normalizeLyricLayout(raw?:Partial<LyricLayoutSettings>|null):LyricLayoutSettings{
 const value=(key:keyof LyricLayoutSettings,min:number,max:number)=>{
  const n=raw?.[key];
  return typeof n==='number'&&Number.isFinite(n)?Math.max(min,Math.min(max,n)):DEFAULT_LYRIC_LAYOUT[key];
 };
 return {horizontalPadding:value('horizontalPadding',0,25),verticalPadding:value('verticalPadding',0,25),
  maxWidth:value('maxWidth',20,100),maxHeight:value('maxHeight',10,100)};
}

/** Anchor the constrained box to the selected edge; each row shares that alignment. */
export function resolveLyricBox(w:number,h:number,placement:Exclude<LyricPlacementMode,'auto'>,
 settings?:Partial<LyricLayoutSettings>,cueIndex=0,duetSide?:'left'|'right'){
 const layout=normalizeLyricLayout(settings);
 const padX=w*layout.horizontalPadding/100,padY=h*layout.verticalPadding/100;
 const left=duetSide==='right'?Math.max(padX,w*.515):padX;
 const right=duetSide==='left'?Math.min(w-padX,w*.485):w-padX;
 const width=Math.min(right-left,w*layout.maxWidth/100);
 const height=Math.min(h-2*padY,h*layout.maxHeight/100);
 const side=duetSide??(placement==='alternating'?(cueIndex%2===0?'left':'right'):placement);
 const align=side.includes('left')?'left':side.includes('right')?'right':'center';
 const vertical=placement.startsWith('bottom-')?'bottom':placement.startsWith('top-')?'top':'center';
 const x=align==='left'?left:align==='right'?right-width:(left+right-width)/2;
 const y=vertical==='bottom'?h-padY-height:vertical==='top'?padY:(h-height)/2;
 return {x,y,width,height,align,vertical} as const;
}
