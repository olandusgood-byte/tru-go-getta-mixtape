import fs from 'node:fs';
import path from 'node:path';
const root=path.dirname(new URL(import.meta.url).pathname);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'stack.json'),'utf8'));
const rows=manifest.tools.map(tool=>{
  const target=path.join(root,tool.handoff||'');
  return {
    id:tool.id,
    name:tool.name,
    status:tool.status,
    handoff:tool.handoff,
    folderReady:tool.status==='connected'||fs.existsSync(target)
  };
});
console.table(rows);
const connected=rows.filter(x=>x.status==='connected').length;
const ready=rows.filter(x=>x.folderReady).length;
console.log(JSON.stringify({
  stack:manifest.name,
  total:rows.length,
  connected,
  folderReady:ready,
  desktopRequired:rows.filter(x=>x.status==='desktop_required').map(x=>x.name)
},null,2));
