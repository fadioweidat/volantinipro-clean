import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolveAppRoute} from '../src/app/routeResolution.js';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n');
const baseline=p=>execFileSync('git',['show',`c41b442194160c5ed2aca57ec54355affba80f54:${p}`],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n');
test('Studio AI uses the existing feasibility entry point without inventing routes',()=>{
 const entry=read('src/components/common/PlatformFeasibilityEntry.jsx');
 assert.match(entry,/Studio di Fattibilità AI/);assert.match(entry,/Scopri dove conviene distribuire/);assert.match(entry,/openFeasibility\(null, window\)/);
 assert.match(read('src/lib/feasibility/entryPoint.js'),/FEASIBILITY_PATH = '\/analisi-campagna'/);
 assert.equal(resolveAppRoute('/analisi-campagna'),'feasibility');
});
for(const file of ['src/layouts/public/Navbar.jsx','src/components/home/VolantiniProHeroMap.jsx']){
 test(`${file}: desktop and mobile AI entry are the only nav changes`,()=>{
  const source=read(file);assert.equal((source.match(/<PlatformFeasibilityEntry /g)||[]).length,2);
  const stripped=source.split('\n').filter(line=>!line.includes('import PlatformFeasibilityEntry')&&!line.includes('<PlatformFeasibilityEntry ')).join('\n').replace(/onClick=\{\(\) => setPlatformOpen\(true\)\}/g,'onClick={() => setPlatformOpen(!platformOpen)}');
  assert.equal(stripped,baseline(file),'Area Cliente, campaign CTA, menu handlers and complete homepage body remain identical');
  const entry=source.indexOf('<PlatformFeasibilityEntry ');
  assert.ok(source.indexOf('Configuratore Campagna',entry)>entry);
 });
}
test('Global routing and auth remain unchanged outside public transition scheduling',()=>{
 for(const file of ['src/app/routeResolution.js','src/pages/public/HomePage.jsx','src/components/home/homepage-hero.css'])assert.equal(read(file),baseline(file),file);
 let router=read('src/app/AppRouter.jsx');
 if(router.includes('import { commitPublicNavigation }')){
  assert.equal((router.match(/commitPublicNavigation\(page, routeToPage\(window.location.pathname\), setPage\);/g)||[]).length,2);
  router=router.replace('import { commitPublicNavigation } from "../bootstrap/publicNavigation.js";\n','')
   .replaceAll('commitPublicNavigation(page, routeToPage(window.location.pathname), setPage);','setPage(routeToPage(window.location.pathname));')
   .replace('return () => window.removeEventListener("popstate", handlePop);\n  }, [page]);','return () => window.removeEventListener("popstate", handlePop);\n  }, []);');
 }
 assert.equal(router,baseline('src/app/AppRouter.jsx'),'Only marketing navigation scheduling may change; all auth, role, configurator and route logic must remain identical');
});
