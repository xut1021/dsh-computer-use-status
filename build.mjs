import {build} from 'esbuild';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url));
if(process.platform!=='win32'||process.arch!=='x64')throw Error('Windows x64 is required');
await build({entryPoints:[path.join(root,'ui/Hud.tsx')],outfile:path.join(root,'ui/hud.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',minify:true,legalComments:'inline'});
const client=await build({entryPoints:[path.join(root,'client.mjs')],bundle:true,write:false,format:'cjs',platform:'browser',external:['react','react-dom'],target:'es2022'});
mkdirSync(path.join(root,'lib'),{recursive:true});
writeFileSync(path.join(root,'lib/client.js'),`window.__ModuleLoader__.load({id:"dsh-computer-use-status",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${client.outputFiles[0].text}\nreturn module.exports;}});\n`);
const compiler=path.join(process.env.WINDIR||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
for(const name of ['CursorLease','EscapeGuard']){
  const result=spawnSync(compiler,['/nologo','/target:exe','/platform:x64','/reference:System.Drawing.dll','/reference:System.Windows.Forms.dll',`/out:${path.join(root,'assets',name+'.exe')}`,path.join(root,'assets',name+'.cs')],{encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw Error(`Could not compile ${name}; ensure .NET Framework 4.x is installed.\n${result.stdout||''}${result.stderr||''}`);
}
console.log('Built overlay, conversation client and Windows helpers from source.');
