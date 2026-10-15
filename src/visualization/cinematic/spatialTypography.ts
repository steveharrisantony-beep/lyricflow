import {lyricMotionFor,lyricFontFor,drawKineticLyrics,type KineticArgs} from './kineticTypography';
export const spatialLayoutFor=lyricMotionFor;
export const spatialFontFor=lyricFontFor;
export function drawSpatialTypography(args:KineticArgs){return drawKineticLyrics(args)}
