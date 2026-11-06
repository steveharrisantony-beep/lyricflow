import {readdir,stat,appendFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const dist=fileURLToPath(new URL('../dist/',import.meta.url));
const files=[];
async function walk(dir){
 for(const item of await readdir(dir,{withFileTypes:true})){
  const location=path.join(dir,item.name);
  if(item.isDirectory())await walk(location);
  else if(item.isFile()){
   const info=await stat(location);
   files.push({path:path.relative(dist,location).replaceAll('\\','/'),bytes:info.size});
  }
 }
}
await walk(dist);
const category=file=>{
 const ext=path.extname(file.path).toLowerCase();
 if(['.woff','.woff2','.ttf','.otf'].includes(ext))return 'Bundled fonts';
 if(['.js','.mjs','.cjs'].includes(ext))return 'JavaScript / local backend';
 if(['.png','.jpg','.jpeg','.webp','.gif','.svg'].includes(ext))return 'Images';
 if(ext==='.css')return 'Styles';
 return 'Other assets';
};
const groups={};for(const file of files){const k=category(file);groups[k]=(groups[k]||0)+file.bytes;}
const mb=n=>(n/(1024*1024)).toFixed(2)+' MiB';
const total=files.reduce((n,f)=>n+f.bytes,0);
const lines=[
 '### LyricFlow packaged web/backend asset sizes',
 'Before Android native code and Node.js runtime libraries are added:',
 ...Object.entries(groups).sort((a,b)=>b[1]-a[1]).map(([name,size])=>'- '+name+': '+mb(size)),
 '- **Total: '+mb(total)+'**',
 '- Largest files:',
 ...[...files].sort((a,b)=>b.bytes-a.bytes).slice(0,8).map(f=>'  - '+f.path+': '+mb(f.bytes))
];
console.log(lines.join('\n'));
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
const unintended=files.filter(f=>f.path.startsWith('assets/aistudio/')||f.path.includes('/Screenshot_2026'));
if(unintended.length)throw new Error('Development screenshots were accidentally included in the production bundle: '+unintended.map(f=>f.path).join(', '));
