import type {SpectrumSceneId} from './procedural/SpectrumThemes';
import type {Mood,ScenePlan} from '../../lyrics/sceneDirector';
import type {LyricCue} from '../../lyrics/lyricTimeline';

export type VoxelWallCategory =
 | 'flow'
 | 'contours'
 | 'sculptures'
 | 'space'
 | 'nature'
 | 'architecture'
 | 'journeys'
 | 'spectrum';

/**
 * 28 distinct VoxelWall 2D music-reactive themes across 8 categories.
 * Duplicate color-swap clones have been consolidated into multi-palette options on each unique theme.
 */
export type SceneId =
 // Flow
 | 'holographic-tide'
 | 'ribbon-dance'
 // Contours
 | 'cobalt-contours'
 | 'contour-flow'
 // Sculptures
 | 'crystal-resonance'
 | 'tidal-bloom'
 | 'paper-cut'
 // Space (4 unique designs)
 | 'celestial-orbit'
 | 'orbital-halo'
 | 'infinite-tunnel'
 | 'star-map'
 // Nature
 | 'aurora-field'
 | 'glow-lagoon'
 | 'pixel-garden'
 // Architecture
 | 'neon-metal-matrix'
 | 'bauhaus-beat'
 | 'halftone-club'
 // Journeys (3 unique designs)
 | 'chromatic-drive'
 | 'origami-flight'
 | 'color-riot'
 | 'fluid-ink'
 | 'spectral-terrain'
 | 'resonance-plate'
 | 'mycelium-network'
 | SpectrumSceneId;

export type Layout='hero'|'editorial'|'left'|'stack'|'poster'|'scattered';
export type Transition='flash'|'wipe'|'dissolve'|'glitch'|'ripple'|'ink'|'zoom';
export type FontPack='impact'|'street'|'editorial'|'tech'|'grunge'|'rounded'|'mono'|'literary'
 | 'monument'|'noir'|'glass'|'collage'|'pixel'|'handwritten'|'retro'|'cyber'|'industrial'|'ultra'
 | 'couture'|'vogue'|'engraved'|'techno'|'manuscript'|'typewriter'|'retrograde';
export type CameraPath='push'|'drift'|'side'|'orbit'|'pullback';

export interface ThemePalette {
 id:string;
 name:string;
 background:string;
 foreground:string;
 accent:string;
 /** Surface colours for multicolour geometry; lyric ink stays in foreground. */
 colors?:readonly string[];
}

export interface Template {
 id:SceneId;
 label:string;
 family:VoxelWallCategory;
 moods:readonly Mood[];
 genres:readonly string[];
 background:string;
 foreground:string;
 accent:string;
 palettes:readonly ThemePalette[];
 font:FontPack;
 layout:Layout;
 transition:Transition;
 camera:CameraPath;
 baseEnergy:number;
}

export const VOXELWALL_CATEGORIES:readonly {id:VoxelWallCategory;label:string;description:string}[]=[
 {id:'flow',label:'Flow',description:'Harmonic tides, Lissajous silk looms, and flowing ink'},
 {id:'contours',label:'Contours',description:'Organic elevation isolines, pulsar ridges, and spectral terrain'},
 {id:'sculptures',label:'Sculptures',description:'Crystal prisms, acoustic blooms, paper dioramas, and standing-wave plates'},
 {id:'space',label:'Space',description:'Celestial astrolabes, solar corona halos, warp corridors, and star maps'},
 {id:'nature',label:'Nature',description:'Auroras, ocean swells, flowering gardens, and luminous mycelium'},
 {id:'architecture',label:'Architecture',description:'Frequency-driven matrices, Bauhaus plates, and halftones'},
 {id:'spectrum',label:'Spectrum',description:'LED peaks, radial frequency bars, spectral history, and mirrored envelopes'},
 {id:'journeys',label:'Journeys',description:'Retro-synth horizons, origami flocks, and constructivist hex sculptures'}
] as const;

export const TEMPLATES:readonly Template[]=[
 // ==================== FLOW ====================
 {
  id:'holographic-tide',
  label:'Holographic Tide',
  family:'flow',
  moods:['water','cosmic','celebration'],
  genres:['electronic','pop','synth','ambient'],
  background:'#071326',
  foreground:'#eefaff',
  accent:'#5ef2e4',
  palettes:[
   {id:'cyan-tide',name:'Cyan Tide',background:'#071326',foreground:'#eefaff',accent:'#5ef2e4'},
   {id:'liquid-filigree',name:'Liquid Filigree',background:'#121024',foreground:'#fcf6ea',accent:'#f5c26b'},
   {id:'crimson-current',name:'Crimson Current',background:'#1d0710',foreground:'#fff2f4',accent:'#ff5c77'},
   {id:'silk-waves',name:'Silk Rose',background:'#f4dfe7',foreground:'#241530',accent:'#87216b'},
   {id:'emerald-drift',name:'Emerald Drift',background:'#061b17',foreground:'#ebfff9',accent:'#52f2b8'}
  ],
  font:'glass',
  layout:'hero',
  transition:'ripple',
  camera:'drift',
  baseEnergy:.68
 },
 {
  id:'ribbon-dance',
  label:'Ribbon Dance',
  family:'flow',
  moods:['celebration','abstract','cosmic'],
  genres:['electronic','pop','dance'],
  background:'#11122c',
  foreground:'#f2f1ff',
  accent:'#9c93ff',
  palettes:[
   {id:'violet-ribbon',name:'Violet Ribbon',background:'#11122c',foreground:'#f2f1ff',accent:'#9c93ff'},
   {id:'coral-loom',name:'Coral Loom',background:'#220c14',foreground:'#fff2f5',accent:'#ff758f'},
   {id:'aqua-pendulum',name:'Aqua Pendulum',background:'#071e22',foreground:'#ecfffc',accent:'#56ebd6'},
   {id:'ivory-silk',name:'Ivory Silk',background:'#f2ece1',foreground:'#1b2030',accent:'#294fa3'}
  ],
  font:'rounded',
  layout:'hero',
  transition:'ripple',
  camera:'drift',
  baseEnergy:.64
 },

 // ==================== CONTOURS ====================
 {
  id:'cobalt-contours',
  label:'Cobalt Contours',
  family:'contours',
  moods:['water','solitude','abstract'],
  genres:['ambient','lofi','electronic','indie'],
  background:'#061933',
  foreground:'#e8f4ff',
  accent:'#63b8ff',
  palettes:[
   {id:'cobalt-deep',name:'Cobalt Deep',background:'#061933',foreground:'#e8f4ff',accent:'#63b8ff'},
   {id:'molten-lava',name:'Molten Contours',background:'#210b04',foreground:'#fff3e8',accent:'#ff8533'},
   {id:'layered-emerald',name:'Layered Emerald',background:'#141e19',foreground:'#eef7f0',accent:'#75d99c'},
   {id:'rose-isoline',name:'Rose Isoline',background:'#210916',foreground:'#fff0f7',accent:'#ff75b5'}
  ],
  font:'tech',
  layout:'editorial',
  transition:'ripple',
  camera:'side',
  baseEnergy:.46
 },
 {
  id:'contour-flow',
  label:'Contour Flow',
  family:'contours',
  moods:['abstract','nature','memory'],
  genres:['electronic','pop','indie'],
  background:'#eef0e8',
  foreground:'#15302f',
  accent:'#25695d',
  palettes:[
   {id:'alpine-sage',name:'Alpine Sage',background:'#eef0e8',foreground:'#15302f',accent:'#25695d'},
   {id:'pulsar-ridge',name:'Pulsar Ridge',background:'#080e1c',foreground:'#eef6ff',accent:'#5ecfff'},
   {id:'crimson-horizon',name:'Crimson Horizon',background:'#1d0811',foreground:'#fff0f4',accent:'#ff6388'},
   {id:'desert-terrace',name:'Desert Terrace',background:'#1c1306',foreground:'#fff7e8',accent:'#f5b841'}
  ],
  font:'literary',
  layout:'hero',
  transition:'dissolve',
  camera:'drift',
  baseEnergy:.50
 },

 // ==================== SCULPTURES (3 UNIQUE DESIGNS) ====================
 {
  id:'crystal-resonance',
  label:'Crystal Resonance',
  family:'sculptures',
  moods:['cosmic','celebration','abstract'],
  genres:['electronic','synth','pop','cinematic'],
  background:'#0b1629',
  foreground:'#f0f9ff',
  accent:'#7ce8ff',
  palettes:[
   {id:'glacier-prism',name:'Glacier Prism',background:'#0b1629',foreground:'#f0f9ff',accent:'#7ce8ff'},
   {id:'amethyst-shard',name:'Amethyst Shard',background:'#170c26',foreground:'#f8f0ff',accent:'#d48aff'},
   {id:'ruby-facet',name:'Ruby Facet',background:'#210811',foreground:'#fff0f4',accent:'#ff6382'},
   {id:'topaz-gleam',name:'Topaz Gleam',background:'#1c1406',foreground:'#fff8eb',accent:'#ffc14d'}
  ],
  font:'ultra',
  layout:'hero',
  transition:'zoom',
  camera:'orbit',
  baseEnergy:.76
 },
 {
  id:'tidal-bloom',
  label:'Tidal Bloom',
  family:'sculptures',
  moods:['water','nature','warm'],
  genres:['indie','pop','ambient','chill'],
  background:'#082228',
  foreground:'#ebfffb',
  accent:'#52e3c2',
  palettes:[
   {id:'lagoon-teal',name:'Lagoon Teal',background:'#082228',foreground:'#ebfffb',accent:'#52e3c2'},
   {id:'pearl-resonance',name:'Pearl Nacre',background:'#f5efe6',foreground:'#241f26',accent:'#823f61'},
   {id:'sakura-bloom',name:'Sakura Bloom',background:'#210c18',foreground:'#fff2f8',accent:'#ff7eb6'},
   {id:'indigo-lotus',name:'Indigo Lotus',background:'#0b122c',foreground:'#f0f5ff',accent:'#7faaff'}
  ],
  font:'handwritten',
  layout:'scattered',
  transition:'ripple',
  camera:'orbit',
  baseEnergy:.58
 },
 {
  id:'paper-cut',
  label:'Paper Cut',
  family:'sculptures',
  moods:['abstract','celebration','memory'],
  genres:['electronic','pop','indie'],
  background:'#f1eadc',
  foreground:'#1e2130',
  accent:'#b54324',
  palettes:[
   {id:'terracotta-sand',name:'Terracotta Sand',background:'#f1eadc',foreground:'#1e2130',accent:'#b54324'},
   {id:'nordic-fjord',name:'Nordic Fjord',background:'#0d1b2a',foreground:'#eef6ff',accent:'#64b5f6'},
   {id:'matcha-diorama',name:'Matcha Diorama',background:'#13221a',foreground:'#f0faef',accent:'#81e69b'},
   {id:'plum-atelier',name:'Plum Atelier',background:'#1f1024',foreground:'#fbf0ff',accent:'#ef7ad6'}
  ],
  font:'collage',
  layout:'hero',
  transition:'wipe',
  camera:'drift',
  baseEnergy:.55
 },

 // ==================== SPACE (4 UNIQUE DESIGNS) ====================
 {
  id:'celestial-orbit',
  label:'Celestial Orbit',
  family:'space',
  moods:['cosmic','memory','solitude'],
  genres:['cinematic','synth','ambient','orchestral'],
  background:'#06091c',
  foreground:'#f2f4ff',
  accent:'#8cb4ff',
  palettes:[
   {id:'starlight-sapphire',name:'Starlight Sapphire',background:'#06091c',foreground:'#f2f4ff',accent:'#8cb4ff'},
   {id:'orbital-score',name:'Orbital Teal',background:'#080d24',foreground:'#eff7ff',accent:'#64d6de'},
   {id:'golden-orrery',name:'Golden Orrery',background:'#171106',foreground:'#fff8eb',accent:'#f7be4f'},
   {id:'nebula-rose',name:'Nebula Rose',background:'#1b091c',foreground:'#fff0fc',accent:'#ff7ad9'}
  ],
  font:'techno',
  layout:'hero',
  transition:'zoom',
  camera:'orbit',
  baseEnergy:.66
 },
 {
  id:'orbital-halo',
  label:'Orbital Halo',
  family:'space',
  moods:['cosmic','fire','celebration'],
  genres:['electronic','cinematic','anthem','rock'],
  background:'#13091f',
  foreground:'#fbf2ff',
  accent:'#ff7ae0',
  palettes:[
   {id:'magenta-eclipse',name:'Magenta Eclipse',background:'#13091f',foreground:'#fbf2ff',accent:'#ff7ae0'},
   {id:'solar-corona',name:'Solar Corona',background:'#1c1005',foreground:'#fff6e8',accent:'#ffa03b'},
   {id:'pulsar-cyan',name:'Pulsar Cyan',background:'#061624',foreground:'#ecfbff',accent:'#4ee8ff'},
   {id:'crimson-nova',name:'Crimson Nova',background:'#20070e',foreground:'#fff0f3',accent:'#ff5c7a'}
  ],
  font:'impact',
  layout:'hero',
  transition:'flash',
  camera:'push',
  baseEnergy:.84
 },
 {
  id:'infinite-tunnel',
  label:'Infinite Tunnel',
  family:'space',
  moods:['cosmic','celebration','fire'],
  genres:['techno','edm','electronic','trance'],
  background:'#050d1a',
  foreground:'#ecfbff',
  accent:'#47e6ff',
  palettes:[
   {id:'hyperdrive-cyan',name:'Hyperdrive Cyan',background:'#050d1a',foreground:'#ecfbff',accent:'#47e6ff'},
   {id:'synth-magenta',name:'Synth Magenta',background:'#180721',foreground:'#fdf0ff',accent:'#ff66e5'},
   {id:'matrix-emerald',name:'Matrix Emerald',background:'#051910',foreground:'#ebfff3',accent:'#4df298'},
   {id:'amber-warp',name:'Amber Warp',background:'#1c1104',foreground:'#fff7ea',accent:'#ffb340'}
  ],
  font:'street',
  layout:'stack',
  transition:'zoom',
  camera:'push',
  baseEnergy:.90
 },
 {
  id:'star-map',
  label:'Star Map',
  family:'space',
  moods:['cosmic','solitude','memory'],
  genres:['electronic','pop','indie','ambient'],
  background:'#091821',
  foreground:'#eff8df',
  accent:'#9edab4',
  palettes:[
   {id:'mint-astrolabe',name:'Mint Astrolabe',background:'#091821',foreground:'#eff8df',accent:'#9edab4'},
   {id:'deep-cosmos',name:'Deep Cosmos',background:'#080b1f',foreground:'#f0f4ff',accent:'#82aaff'},
   {id:'amber-zenith',name:'Amber Zenith',background:'#1a1308',foreground:'#fff8ec',accent:'#f5c156'},
   {id:'rose-chart',name:'Rose Chart',background:'#1d0b18',foreground:'#fff2f9',accent:'#ff85c0'}
  ],
  font:'mono',
  layout:'hero',
  transition:'dissolve',
  camera:'drift',
  baseEnergy:.44
 },

 // ==================== NATURE (3 UNIQUE DESIGNS) ====================
 {
  id:'aurora-field',
  label:'Aurora Field',
  family:'nature',
  moods:['nature','cosmic','warm'],
  genres:['ambient','folk','cinematic','ballad'],
  background:'#071c1f',
  foreground:'#edfff9',
  accent:'#6bf2b8',
  palettes:[
   {id:'borealis-emerald',name:'Borealis Emerald',background:'#071c1f',foreground:'#edfff9',accent:'#6bf2b8'},
   {id:'polar-violet',name:'Polar Violet',background:'#130b24',foreground:'#f7f0ff',accent:'#c48aff'},
   {id:'solar-storm',name:'Solar Storm',background:'#1f0a12',foreground:'#fff0f5',accent:'#ff6b8b'},
   {id:'arctic-cyan',name:'Arctic Cyan',background:'#061829',foreground:'#eef9ff',accent:'#5cd6ff'}
  ],
  font:'typewriter',
  layout:'editorial',
  transition:'dissolve',
  camera:'drift',
  baseEnergy:.40
 },
 {
  id:'glow-lagoon',
  label:'Glow Lagoon',
  family:'nature',
  moods:['water','nature','warm'],
  genres:['chill','tropical','indie','pop'],
  background:'#062624',
  foreground:'#eafff8',
  accent:'#4df0c8',
  palettes:[
   {id:'lagoon-turquoise',name:'Lagoon Turquoise',background:'#062624',foreground:'#eafff8',accent:'#4df0c8'},
   {id:'silver-current',name:'Silver Current',background:'#071f2e',foreground:'#ebf8ff',accent:'#7ad7f0'},
   {id:'coral-reef',name:'Coral Reef',background:'#1f0d16',foreground:'#fff2f6',accent:'#ff7597'},
   {id:'abyssal-gold',name:'Abyssal Gold',background:'#171407',foreground:'#fff9eb',accent:'#f5c84c'}
  ],
  font:'rounded',
  layout:'left',
  transition:'ripple',
  camera:'side',
  baseEnergy:.54
 },
 {
  id:'pixel-garden',
  label:'Pixel Garden',
  family:'nature',
  moods:['nature','celebration','memory'],
  genres:['electronic','pop','indie','chiptune'],
  background:'#102b29',
  foreground:'#e7ffc5',
  accent:'#9ed36f',
  palettes:[
   {id:'botanical-mint',name:'Botanical Mint',background:'#102b29',foreground:'#e7ffc5',accent:'#9ed36f'},
   {id:'cherry-blossom',name:'Cherry Blossom',background:'#210e1b',foreground:'#fff2fa',accent:'#ff85bd'},
   {id:'golden-harvest',name:'Golden Harvest',background:'#1e1607',foreground:'#fff8e8',accent:'#f7be45'},
   {id:'neon-terrarium',name:'Neon Terrarium',background:'#081b26',foreground:'#ebfbff',accent:'#4ee8d4'}
  ],
  font:'pixel',
  layout:'hero',
  transition:'wipe',
  camera:'drift',
  baseEnergy:.60
 },

 // ==================== ARCHITECTURE ====================
 {
  id:'neon-metal-matrix',
  label:'Neon Metal Matrix',
  family:'architecture',
  moods:['cosmic','celebration','abstract'],
  genres:['techno','edm','cyberpunk','synth'],
  background:'#0b1017',
  foreground:'#ecf6ff',
  accent:'#45f0df',
  palettes:[
   {id:'cyber-teal',name:'Cyber Teal',background:'#0b1017',foreground:'#ecf6ff',accent:'#45f0df'},
   {id:'laser-crimson',name:'Laser Crimson',background:'#1c0910',foreground:'#fff0f4',accent:'#ff5c7c'},
   {id:'gold-bullion',name:'Gold Bullion',background:'#191306',foreground:'#fff8ea',accent:'#f7c148'},
   {id:'cobalt-matrix',name:'Cobalt Matrix',background:'#081226',foreground:'#eef5ff',accent:'#6ea8ff'}
  ],
  font:'cyber',
  layout:'stack',
  transition:'glitch',
  camera:'side',
  baseEnergy:.85
 },
 {
  id:'bauhaus-beat',
  label:'Bauhaus Beat',
  family:'architecture',
  moods:['abstract','celebration','warm'],
  genres:['electronic','pop','indie','funk'],
  background:'#f3ebd4',
  foreground:'#202526',
  accent:'#b8381e',
  palettes:[
   {id:'weimar-classic',name:'Weimar Classic',background:'#f3ebd4',foreground:'#202526',accent:'#b8381e'},
   {id:'midnight-construct',name:'Midnight Construct',background:'#0d1322',foreground:'#f2f6ff',accent:'#ff7052'},
   {id:'blueprint-studio',name:'Blueprint Studio',background:'#091e36',foreground:'#eef7ff',accent:'#ffd15c'},
   {id:'ivory-emerald',name:'Ivory Emerald',background:'#edf2eb',foreground:'#16261f',accent:'#1b6e4e'}
  ],
  font:'impact',
  layout:'hero',
  transition:'wipe',
  camera:'drift',
  baseEnergy:.65
 },
 {
  id:'halftone-club',
  label:'Halftone Club',
  family:'architecture',
  moods:['celebration','fire','abstract'],
  genres:['electronic','pop','dance','hip-hop'],
  background:'#23102d',
  foreground:'#fff1dc',
  accent:'#ed80b2',
  palettes:[
   {id:'velvet-magenta',name:'Velvet Magenta',background:'#23102d',foreground:'#fff1dc',accent:'#ed80b2'},
   {id:'acid-lime',name:'Acid Lime',background:'#0f1f11',foreground:'#f2ffe8',accent:'#9df558'},
   {id:'electric-cyan',name:'Electric Cyan',background:'#081a28',foreground:'#ebfbff',accent:'#4fe3ff'},
   {id:'solar-halftone',name:'Solar Halftone',background:'#211206',foreground:'#fff6e8',accent:'#ff9c42'}
  ],
  font:'grunge',
  layout:'hero',
  transition:'ink',
  camera:'drift',
  baseEnergy:.70
 },

 // ==================== JOURNEYS (3 UNIQUE DESIGNS) ====================
 {
  id:'chromatic-drive',
  label:'Chromatic Drive',
  family:'journeys',
  moods:['celebration','fire','cosmic'],
  genres:['synth','pop','electronic','rock'],
  background:'#160826',
  foreground:'#fff2fa',
  accent:'#ff6ec7',
  palettes:[
   {id:'outrun-magenta',name:'Outrun Magenta',background:'#160826',foreground:'#fff2fa',accent:'#ff6ec7'},
   {id:'white-velocity',name:'White Velocity',background:'#eef2f7',foreground:'#151b26',accent:'#1f5eff'},
   {id:'cyber-horizon',name:'Cyber Horizon',background:'#061524',foreground:'#ecfbff',accent:'#48e8ff'},
   {id:'sunset-cruiser',name:'Sunset Cruiser',background:'#210c08',foreground:'#fff4ec',accent:'#ff8c42'}
  ],
  font:'retro',
  layout:'hero',
  transition:'zoom',
  camera:'push',
  baseEnergy:.83
 },
 {
  id:'origami-flight',
  label:'Origami Flight',
  family:'journeys',
  moods:['warm','nature','memory'],
  genres:['indie','acoustic','pop','cinematic'],
  background:'#f2ede2',
  foreground:'#232634',
  accent:'#c4492d',
  palettes:[
   {id:'paper-crane',name:'Paper Crane',background:'#f2ede2',foreground:'#232634',accent:'#c4492d'},
   {id:'starlight-flock',name:'Starlight Flock',background:'#0b1426',foreground:'#f0f6ff',accent:'#72c8ff'},
   {id:'jade-wind',name:'Jade Wind',background:'#0b211b',foreground:'#edfff9',accent:'#5ce6b5'},
   {id:'golden-dusk',name:'Golden Dusk',background:'#1f1409',foreground:'#fff7eb',accent:'#f7b74a'}
  ],
  font:'editorial',
  layout:'scattered',
  transition:'wipe',
  camera:'side',
  baseEnergy:.52
 },
 {
  id:'color-riot',
  label:'Color Riot',
  family:'journeys',
  moods:['celebration','warm','abstract'],
  genres:['pop','funk','dance'],
  background:'#fff1e8',
  foreground:'#352d46',
  accent:'#e5a99b',
  palettes:[
   {id:'peach-sorbet',name:'Peach Sorbet',background:'#fff1e8',foreground:'#352d46',accent:'#e5a99b',colors:['#f2b9b0','#c6dce5','#d7c9e8','#f5dfb2']},
   {id:'lavender-milk',name:'Lavender Milk',background:'#f1ecfa',foreground:'#352e4b',accent:'#bca9df',colors:['#cbbce8','#f1c9d8','#c5e1dd','#f5e3bd']},
   {id:'pistachio-cloud',name:'Pistachio Cloud',background:'#eff6e8',foreground:'#293c3a',accent:'#a7c7ad',colors:['#bbd8b9','#f0cfb8','#c2dcea','#ded0e9']},
   {id:'powder-sky',name:'Powder Sky',background:'#eaf3fc',foreground:'#2c3850',accent:'#a8c8e7',colors:['#b7d4ec','#f0c8cc','#d4c5e8','#eee1b5']},
   {id:'rosewater',name:'Rosewater',background:'#fceef2',foreground:'#46313c',accent:'#dfaabe',colors:['#edbfd0','#c6dcda','#d4cae8','#f5d7bc']},
   {id:'buttercream',name:'Buttercream',background:'#fcf7e5',foreground:'#3b3740',accent:'#dfc891',colors:['#efdda9','#c5ded7','#e8c4cf','#c7d6ec']}
  ],
  font:'ultra',
  layout:'scattered',
  transition:'wipe',
  camera:'side',
  baseEnergy:0.81
 },
 // Additional spectrum-driven environments
 {
  id:'fluid-ink',
  label:'Fluid Ink',
  family:'flow',
  moods:['water','abstract','warm'],
  genres:['ambient','electronic','soul'],
  background:'#0b1425',
  foreground:'#eff7ff',
  accent:'#80d7dd',
  palettes:[
   {id:'midnight-ink',name:'Midnight Ink',background:'#0b1425',foreground:'#eff7ff',accent:'#80d7dd'},
   {id:'plum-ink',name:'Plum Ink',background:'#211429',foreground:'#fff2fc',accent:'#df9ac9'},
   {id:'jade-ink',name:'Jade Ink',background:'#0d2524',foreground:'#ebfff7',accent:'#8ad8ba'},
   {id:'porcelain-ink',name:'Porcelain Ink',background:'#f1eee9',foreground:'#292d42',accent:'#9babc9'}
  ],
  font:'glass',
  layout:'hero',
  transition:'ripple',
  camera:'drift',
  baseEnergy:0.56
 },
 {
  id:'spectral-terrain',
  label:'Spectral Terrain',
  family:'contours',
  moods:['cosmic','abstract','nature'],
  genres:['electronic','cinematic','rock'],
  background:'#081827',
  foreground:'#edf9ff',
  accent:'#74d3ef',
  palettes:[
   {id:'glacial-terrain',name:'Glacial Terrain',background:'#081827',foreground:'#edf9ff',accent:'#74d3ef'},
   {id:'violet-terrain',name:'Violet Terrain',background:'#19122b',foreground:'#f6efff',accent:'#c2a1ed'},
   {id:'copper-terrain',name:'Copper Terrain',background:'#21150e',foreground:'#fff4e9',accent:'#e5af7b'},
   {id:'moss-terrain',name:'Moss Terrain',background:'#10231e',foreground:'#eefff3',accent:'#91d4a8'}
  ],
  font:'tech',
  layout:'left',
  transition:'dissolve',
  camera:'push',
  baseEnergy:0.72
 },
 {
  id:'resonance-plate',
  label:'Resonance Plate',
  family:'sculptures',
  moods:['abstract','cosmic','solitude'],
  genres:['classical','ambient','electronic'],
  background:'#171923',
  foreground:'#fff5e4',
  accent:'#ecd19b',
  palettes:[
   {id:'golden-nodes',name:'Golden Nodes',background:'#171923',foreground:'#fff5e4',accent:'#ecd19b'},
   {id:'ice-nodes',name:'Ice Nodes',background:'#0c2030',foreground:'#edfaff',accent:'#8edeea'},
   {id:'rose-nodes',name:'Rose Nodes',background:'#261425',foreground:'#fff1fa',accent:'#e7a2c9'},
   {id:'sage-nodes',name:'Sage Nodes',background:'#12251f',foreground:'#f2fff5',accent:'#b6d9a2'}
  ],
  font:'engraved',
  layout:'hero',
  transition:'dissolve',
  camera:'orbit',
  baseEnergy:0.6
 },
 {
  id:'mycelium-network',
  label:'Mycelium Network',
  family:'nature',
  moods:['nature','memory','cosmic'],
  genres:['ambient','indie','acoustic'],
  background:'#0b201b',
  foreground:'#f0fff1',
  accent:'#a0e0ba',
  palettes:[
   {id:'forest-light',name:'Forest Light',background:'#0b201b',foreground:'#f0fff1',accent:'#a0e0ba'},
   {id:'deep-spore',name:'Deep Spore',background:'#121d30',foreground:'#eef7ff',accent:'#9dbfe8'},
   {id:'amber-spore',name:'Amber Spore',background:'#251b10',foreground:'#fff6e8',accent:'#e6c18a'},
   {id:'orchid-spore',name:'Orchid Spore',background:'#22162c',foreground:'#fff2fd',accent:'#d8afe9'}
  ],
  font:'literary',
  layout:'hero',
  transition:'ink',
  camera:'drift',
  baseEnergy:0.5
 },
 // Spectrum analyzer family
 {
  id:'spectrum-prism',
  label:'Spectrum Prism',
  family:'spectrum',
  moods:['abstract','celebration','cosmic'],
  genres:['electronic','pop','rock','hip-hop'],
  background:'#09111f',
  foreground:'#eaf6ff',
  accent:'#65d6f2',
  palettes:[
   {id:'studio-prism',name:'Studio Prism',background:'#09111f',foreground:'#eaf6ff',accent:'#65d6f2'},
   {id:'amber-console',name:'Amber Console',background:'#1b150c',foreground:'#fff4d9',accent:'#edbb69'},
   {id:'rose-console',name:'Rose Console',background:'#211222',foreground:'#fff0fc',accent:'#ea9dd2'},
   {id:'mint-console',name:'Mint Console',background:'#0c221f',foreground:'#ecfff4',accent:'#8bddbc'}
  ],
  font:'industrial',
  layout:'poster',
  transition:'wipe',
  camera:'push',
  baseEnergy:0.78
 },
 {
  id:'radial-spectrum',
  label:'Radial Spectrum',
  family:'spectrum',
  moods:['abstract','celebration','cosmic'],
  genres:['electronic','pop','rock','hip-hop'],
  background:'#0b1628',
  foreground:'#f0f6ff',
  accent:'#96b9f5',
  palettes:[
   {id:'polar-spectrum',name:'Polar Spectrum',background:'#0b1628',foreground:'#f0f6ff',accent:'#96b9f5'},
   {id:'solar-spectrum',name:'Solar Spectrum',background:'#24180d',foreground:'#fff5e2',accent:'#edbc73'},
   {id:'orchid-spectrum',name:'Orchid Spectrum',background:'#23132b',foreground:'#fff1ff',accent:'#dba5ef'},
   {id:'jade-spectrum',name:'Jade Spectrum',background:'#0b2825',foreground:'#ebfff7',accent:'#8ce2c5'}
  ],
  font:'tech',
  layout:'hero',
  transition:'ripple',
  camera:'orbit',
  baseEnergy:0.76
 },
 {
  id:'spectrum-waterfall',
  label:'Spectrum Waterfall',
  family:'spectrum',
  moods:['abstract','celebration','cosmic'],
  genres:['electronic','pop','rock','hip-hop'],
  background:'#080f20',
  foreground:'#fcf7e7',
  accent:'#75b8ed',
  palettes:[
   {id:'deep-scan',name:'Deep Scan',background:'#080f20',foreground:'#fcf7e7',accent:'#75b8ed'},
   {id:'thermal-scan',name:'Thermal Scan',background:'#20101e',foreground:'#fff7dd',accent:'#e596a4'},
   {id:'forest-scan',name:'Forest Scan',background:'#091c19',foreground:'#f4ffe1',accent:'#79cfa8'},
   {id:'lilac-scan',name:'Lilac Scan',background:'#18132d',foreground:'#fff2fc',accent:'#b9a3ec'}
  ],
  font:'mono',
  layout:'left',
  transition:'dissolve',
  camera:'drift',
  baseEnergy:0.58
 },
 {
  id:'spectrum-ribbons',
  label:'Spectrum Ribbons',
  family:'spectrum',
  moods:['abstract','celebration','cosmic'],
  genres:['electronic','pop','rock','hip-hop'],
  background:'#0a202b',
  foreground:'#eafaff',
  accent:'#76d8df',
  palettes:[
   {id:'aqua-ribbon',name:'Aqua Ribbon',background:'#0a202b',foreground:'#eafaff',accent:'#76d8df'},
   {id:'coral-ribbon',name:'Coral Ribbon',background:'#27151c',foreground:'#fff2ed',accent:'#e7a1a2'},
   {id:'periwinkle-ribbon',name:'Periwinkle Ribbon',background:'#151a30',foreground:'#f2f3ff',accent:'#a8b1f1'},
   {id:'pistachio-ribbon',name:'Pistachio Ribbon',background:'#19251a',foreground:'#f6ffeb',accent:'#b3d497'}
  ],
  font:'glass',
  layout:'hero',
  transition:'ripple',
  camera:'drift',
  baseEnergy:0.64
 },
] as const;

export const byId=Object.fromEntries(TEMPLATES.map(t=>[t.id,t])) as Record<SceneId,Template>;

export function resolveThemePalette(id:SceneId,paletteId?:string):ThemePalette {
 const template=byId[id]||TEMPLATES[0];
 if(paletteId){
  const found=template.palettes.find(p=>p.id===paletteId);
  if(found)return found;
 }
 return template.palettes[0]||{
  id:'default',
  name:'Default',
  background:template.background,
  foreground:template.foreground,
  accent:template.accent
 };
}

export interface DirectedScene {
 id:SceneId;start:number;end:number;layout:Layout;camera:CameraPath;
 font:FontPack;transition:Transition;variation:number;section:number;reason:string;
 paletteId?:string;
}

const LAYOUTS:Layout[]=['hero','editorial','left','stack','poster','scattered'];
const CAMERAS:CameraPath[]=['push','drift','side','orbit','pullback'];

function stableHash(input:string):number {
 let h=2166136261;
 for(let i=0;i<input.length;i++)h=Math.imul(h^input.charCodeAt(i),16777619);
 return h>>>0;
}

function randomThemePicker(pool:readonly Template[],songKey:string){
 let remaining:Template[]=[],previous:SceneId|undefined;
 return (slot:number)=>{
  if(!remaining.length)remaining=[...pool];
  let index=stableHash(`${songKey}:theme:${slot}`)%remaining.length;
  if(remaining.length>1&&remaining[index].id===previous)index=(index+1)%remaining.length;
  const chosen=remaining.splice(index,1)[0];previous=chosen.id;return chosen;
 };
}

/** Snap any internal scene boundary that lands inside an active lyric line to the completion of that line (cue.end). */
function snapBoundaryToLineEnd(t:number,cues:readonly LyricCue[]):number {
 let snapped=t;
 for(let i=0;i<cues.length;i++){
  const c=cues[i];
  if(c.time+0.02<snapped&&snapped<c.end-0.02){
   snapped=c.end;
  }
 }
 return snapped;
}

/** Pure song-level scheduler. Scene choices are randomized across all enabled themes, stable when seeking, and boundaries never cut mid-line. */
export function buildCinematicSchedule(
 plans:readonly ScenePlan[],
 cues:readonly LyricCue[],
 _genre='',
 songKey='',
 enabledScenes?:readonly SceneId[],
 themeDurationLines?:number
):DirectedScene[]{
 if(!cues.length)return [];
 const result:DirectedScene[]=[];
 const allowedSet=enabledScenes&&enabledScenes.length>0?new Set(enabledScenes):null;
 const pool=allowedSet?TEMPLATES.filter(t=>allowedSet.has(t.id)):TEMPLATES;
 const activeTemplates=pool.length>0?pool:TEMPLATES;
 const chooseTheme=randomThemePicker(activeTemplates,songKey);
 const source=plans.length?plans:[{
  start:cues[0].time,end:cues[cues.length-1].end,mood:'abstract',font:'grotesk',
  motion:'drift',camera:'dolly',confidence:.2,palette:0,reason:'fallback',energy:.35
 } as ScenePlan];

 // When themeDurationLines is specified, step by exact groups of N lyric lines (never cutting mid-line or mid-duet).
 if(typeof themeDurationLines==='number'&&themeDurationLines>=1){
  const linesPerScene=Math.max(1,Math.min(32,Math.round(themeDurationLines)));
  let idx=0;
  let part=0;
  let currentStart=Math.min(0,source[0].start,cues[0].time);
  while(idx<cues.length){
   let nextIdx=Math.min(cues.length,idx+linesPerScene);
   // Never split a simultaneous duet pair across a theme boundary
   while(nextIdx<cues.length&&cues[nextIdx-1].duetGroupKey&&cues[nextIdx].duetGroupKey===cues[nextIdx-1].duetGroupKey){
    nextIdx++;
   }
   const lastCue=cues[nextIdx-1];
   const rawFinish=nextIdx<cues.length?Math.max(lastCue.end,cues[nextIdx].time):Math.max(lastCue.end,source[source.length-1].end);
   const finish=nextIdx<cues.length?snapBoundaryToLineEnd(rawFinish,cues):rawFinish;
   if(finish>currentStart+0.05){
    const activePlan=source.find(s=>currentStart>=s.start&&currentStart<s.end)||source[0];
    const seed=stableHash(songKey+':lines:'+part+':'+idx);
    const chosen=chooseTheme(result.length);
    const variation=seed%5;
    const layout=LAYOUTS[(LAYOUTS.indexOf(chosen.layout)+variation)%LAYOUTS.length];
    const camera=CAMERAS[(CAMERAS.indexOf(chosen.camera)+(seed%3))%CAMERAS.length];
    const paletteObj=chosen.palettes[seed%chosen.palettes.length];
    result.push({
     id:chosen.id,
     start:currentStart,
     end:finish,
     layout,
     camera,
     font:chosen.font,
     transition:chosen.transition,
     variation,
     section:part,
     reason:activePlan.reason,
     paletteId:paletteObj?.id
    });
    currentStart=finish;
    part++;
   }
   idx=nextIdx;
  }
  return result;
 }

 let runningStart=source[0].start;
 for(let i=0;i<source.length;i++){
  const section=source[i];
  const rawSectionStart=i===0?section.start:Math.max(runningStart,snapBoundaryToLineEnd(section.start,cues));
  const rawSectionEnd=Math.max(rawSectionStart+.4,i===source.length-1?section.end:snapBoundaryToLineEnd(section.end,cues));
  const duration=rawSectionEnd-rawSectionStart;
  const n=Math.max(1,Math.ceil(duration/14));
  let partStart=rawSectionStart;
  for(let part=0;part<n;part++){
   const rawFinish=part===n-1?rawSectionEnd:rawSectionStart+duration*(part+1)/n;
   const finish=part===n-1?rawSectionEnd:Math.min(rawSectionEnd,Math.max(partStart+0.2,snapBoundaryToLineEnd(rawFinish,cues)));
   if(finish<=partStart+0.05)continue;
   const seed=stableHash(songKey+':'+i+':'+part);
   const chosen=chooseTheme(result.length);
   const variation=seed%5;
   const layout=LAYOUTS[(LAYOUTS.indexOf(chosen.layout)+variation)%LAYOUTS.length];
   const camera=CAMERAS[(CAMERAS.indexOf(chosen.camera)+(seed%3))%CAMERAS.length];
   const paletteObj=chosen.palettes[seed%chosen.palettes.length];
   result.push({id:chosen.id,start:partStart,end:finish,layout,camera,font:chosen.font,
    transition:chosen.transition,variation,section:i,reason:section.reason,paletteId:paletteObj?.id});
   partStart=finish;
  }
  runningStart=rawSectionEnd;
 }
 return result;
}

export function sceneAt(list:readonly DirectedScene[],time:number):DirectedScene|null {
 if(!list.length)return null;
 let lo=0,hi=list.length-1;
 if(time<list[0].start)return null;
 while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(list[mid].start<=time)lo=mid;else hi=mid-1;}
 return time<list[lo].end?list[lo]:null;
}

export const AUDIO_ONLY_SCENES:readonly SceneId[]=TEMPLATES.map(t=>t.id);

