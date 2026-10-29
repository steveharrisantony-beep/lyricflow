// A browser Codespace runs both processes; only the Vite preview port is exposed.
import {spawn} from 'node:child_process';
const python=process.env.PYTHON||'python';
const api=spawn(python,['-m','uvicorn','app:app','--app-dir','server','--host','127.0.0.1','--port','8000'],{stdio:'inherit'});
const frontend=spawn('npm',['run','dev'],{stdio:'inherit',env:{...process.env,VITE_MUSIC_RESOLVER:'/music'}});
let closing=false;
function close(code=0){if(closing)return;closing=true;api.kill('SIGTERM');frontend.kill('SIGTERM');process.exitCode=code;}
for(const process of [api,frontend]){process.on('error',error=>{console.error(error.message);close(1)});process.on('exit',code=>close(code??1))}
process.on('SIGINT',()=>close());process.on('SIGTERM',()=>close());
