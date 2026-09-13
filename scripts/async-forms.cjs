const ts=require('typescript'),fs=require('fs'),path=require('path');
function walkDir(dir){for(const f of fs.readdirSync(dir)){const p=path.join(dir,f);if(fs.statSync(p).isDirectory())walkDir(p);else if(p.endsWith('.tsx')&&!p.includes('business-provider'))convert(p);}}
function convert(file){const source=fs.readFileSync(file,'utf8'),root=ts.createSourceFile(file,source,99,true,ts.ScriptKind.TSX),edits=[],asyncStarts=new Set();
function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(root)==='commit'&&!ts.isAwaitExpression(n.parent)){
 let fn=n.parent;while(fn&&!ts.isFunctionLike(fn))fn=fn.parent;
 if(fn&&!fn.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)&&!asyncStarts.has(fn.getStart(root))){edits.push([fn.getStart(root),'async ']);asyncStarts.add(fn.getStart(root));}
 edits.push([n.getStart(root),ts.isExpressionStatement(n.parent)?'if (!(await ':'await ']);
 if(ts.isExpressionStatement(n.parent))edits.push([n.end,').ok) return']);
 }ts.forEachChild(n,visit);}visit(root);edits.sort((a,b)=>b[0]-a[0]);let next=source;for(const [pos,text] of edits)next=next.slice(0,pos)+text+next.slice(pos);if(edits.length)fs.writeFileSync(file,next);}
walkDir('components');
