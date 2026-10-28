import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const banned = [/\bfetch\s*\(/, /new\s+(?:WebSocket|XMLHttpRequest)/, /navigator\.sendBeacon/, /https?:\/\/(?!www\.w3\.org\/)/, /meal-planner-(?:state|device-token|health-cache|move-cache)/, /VITE_.*(?:API|TOKEN|KEY)/];
const files=[];
function walk(dir) { for(const entry of readdirSync(dir,{withFileTypes:true})) {const p=join(dir,entry.name);if(entry.isDirectory())walk(p);else if(/\.(tsx?|css|json|html)$/.test(p))files.push(p);} }
walk('web/src');walk('shared');files.push('web/index.html');
for(const file of files) {const text=readFileSync(file,'utf8');for(const pattern of banned)if(pattern.test(text))throw new Error(`Public boundary violation in ${file}: ${pattern}`);}
console.log(`Public boundary checked: ${files.length} files; no network APIs, external URLs or operational cache keys.`);
