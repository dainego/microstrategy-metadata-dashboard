/* El catálogo conserva un objeto por ID. Las filas detalladas se muestran al abrirlo. */
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => new Intl.NumberFormat('es-AR').format(n);
const names = {table:'Tablas',attribute:'Atributos',fact:'Facts',metric:'Métricas',filter:'Filtros'};
const singular = {table:'Tabla',attribute:'Atributo',fact:'Fact',metric:'Métrica',filter:'Filtro'};
const symbols = {table:'▦',attribute:'A',fact:'ƒ',metric:'Σ',filter:'⏷'};
const state = {scope:null,type:'table',query:'',page:1,expanded:new Set(),modelQuery:'',history:[]};
let catalog, objects, tables, nodes, roots, reverse, objectTables, sorted, lastFocus;
const PAGE_SIZE=40;
const normalize = v => String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
const icon = type => `<span class="type-icon ${type}" aria-hidden="true">${symbols[type]}</span>`;
const compare = (a,b) => a.name.localeCompare(b.name,'es',{numeric:true,sensitivity:'base'});
const pathLabel = path => path.filter(Boolean).join(' / ');
const getPath = obj => obj.locations?.[0]?.path?.filter(Boolean) || [];
const debounce = fn => {let timer;return (...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),160)}};

function initialize(data){
 catalog=data;
 objects=new Map(data.objects.map(o=>[o.key,o]));
 tables=new Map(data.tables.map(t=>[t.key,t]));
 sorted={table:[...tables.values()].sort(compare)};
 for(const type of ['attribute','fact','metric','filter']) sorted[type]=data.objects.filter(o=>o.type===type).sort(compare);
 nodes=new Map();roots=[];reverse=new Map();objectTables=new Map();
 for(const obj of data.objects){
  obj.search=normalize([obj.name,obj.id,obj.description,...obj.locations.map(l=>l.folder),...obj.rows.map(r=>r.expression||r.qualification||r.predicateName||'')].join(' '));
  for(const loc of obj.locations){
   let parent=null;
   for(let i=0;i<loc.path.length;i++){
    if(!loc.path[i])continue;
    const path=loc.path.slice(0,i+1), key=JSON.stringify(path);
    if(!nodes.has(key)){
     const node={key,path,name:loc.path[i],parent,children:[],objects:new Set()};nodes.set(key,node);
     if(parent) nodes.get(parent).children.push(key);else roots.push(key);
    }
    nodes.get(key).objects.add(obj.key);parent=key;
   }
  }
 }
 const sortKeys=(a,b)=>compare(nodes.get(a),nodes.get(b));roots.sort(sortKeys);
 for(const node of nodes.values())node.children.sort(sortKeys);
 for(const table of data.tables){
  table.search=normalize([table.name,...table.ids].join(' '));
  for(const key of [...table.attribute,...table.fact]){
   if(!objectTables.has(key))objectTables.set(key,[]);
   objectTables.get(key).push(table.key);
  }
 }
 for(const [source,rel] of Object.entries(data.links)){
  for(const group of ['facts','metrics','attributes','filters'])for(const target of rel[group]){
   if(!reverse.has(target))reverse.set(target,[]);
   reverse.get(target).push(source);
  }
 }
 $('models').textContent=fmt(data.stats.models);$('submodels').textContent=fmt(data.stats.submodels);
 $('total').textContent=`${fmt(data.stats.objects)} objetos · ${fmt(data.tables.length)} tablas`;
 renderTree();renderCatalog();registerAgentTools();
 if(typeof initializeLogical==='function')initializeLogical();
}

function treeRow(node,depth=0,search=false){
 const active=state.scope===node.key, open=state.expanded.has(node.key);
 const toggle=node.children.length&&!search ? `<button class="tree-toggle" data-expand="${esc(node.key)}" aria-label="${open?'Contraer':'Expandir'} ${esc(node.name)}" aria-expanded="${open}">${open?'⌄':'›'}</button>`:'<span class="tree-toggle"></span>';
 return `<div class="tree-row ${active?'selected':''}" style="padding-left:${depth*12}px">${toggle}<button class="tree-node" data-scope="${esc(node.key)}" ${active?'aria-current="location"':''} title="${esc(pathLabel(node.path))}"><span class="folder-icon" aria-hidden="true">▱</span><span class="tree-name">${esc(node.name)}${search&&node.path.length>1?`<span class="row-sub">${esc(pathLabel(node.path.slice(0,-1)))}</span>`:''}</span><span class="tree-num">${fmt(node.objects.size)}</span></button></div>`;
}
function renderTree(){
 if(state.modelQuery){
  const list=[...nodes.values()].filter(n=>normalize(n.name).includes(normalize(state.modelQuery))).sort(compare);
  $('tree').innerHTML=list.length?list.slice(0,120).map(n=>treeRow(n,0,true)).join('')+(list.length>120?'<p class="tree-empty">Afiná la búsqueda para ver más rutas.</p>':''):'<p class="tree-empty">No se encontraron modelos ni submodelos.</p>';
  return;
 }
 const walk=(key,depth)=>{const n=nodes.get(key);return treeRow(n,depth)+(state.expanded.has(key)?n.children.map(k=>walk(k,depth+1)).join(''):'')};
 $('tree').innerHTML=roots.map(k=>walk(k,0)).join('');
}
function setScope(key){
 if(key!==null&&!nodes.has(key))throw new Error('Ruta no encontrada.');
 state.scope=key;state.page=1;
 if(key){state.expanded.add(key);let parent=nodes.get(key).parent;while(parent){state.expanded.add(parent);parent=nodes.get(parent).parent}}
 renderTree();renderCatalog();
}
function scopeContains(key){return !state.scope||nodes.get(state.scope).objects.has(key)}
function scopedTableItems(t,type){return t[type].filter(scopeContains)}
function getScopedLists(){
 const list={};
 for(const type of ['attribute','fact','metric','filter'])list[type]=sorted[type].filter(o=>scopeContains(o.key));
 list.table=sorted.table.filter(t=>[...t.attribute,...t.fact].some(scopeContains));
 return list;
}
function tableRow(table){
 const as=scopedTableItems(table,'attribute'),fs=scopedTableItems(table,'fact');
 const modelNames=[...new Set([...as,...fs].flatMap(k=>objects.get(k).locations.map(l=>l.path[0]).filter(Boolean)))];
 return `<tr><td><div class="name-cell">${icon('table')}<div><button class="obj-name" data-open="${esc(table.key)}">${esc(table.name)}</button><span class="row-sub">${fmt(as.length+fs.length)} objetos asociados</span></div></div></td><td><div class="type-counts"><span class="count-pill"><b>${fmt(as.length)}</b> atributos</span><span class="count-pill"><b>${fmt(fs.length)}</b> facts</span></div></td><td class="hide-mobile cell-muted"><div class="cell-folder" title="${esc(modelNames.join(' · '))}">${esc(modelNames.slice(0,2).join(' · '))}${modelNames.length>2?` +${modelNames.length-2}`:''}</div></td><td><button class="row-link" data-open="${esc(table.key)}" aria-label="Abrir ${esc(table.name)}">›</button></td></tr>`;
}
function objectRow(obj){
 let label='';const rel=catalog.links[obj.key];
 if(obj.type==='attribute'||obj.type==='fact'){const count=objectTables.get(obj.key)?.length||0;label=`${fmt(count)} tabla${count!==1?'s':''}`}
 else if(obj.type==='metric')label=`${fmt(rel.facts.length)} facts${rel.ambiguous.length?' · revisar vínculos':''}`;
 else label=`${fmt(rel.attributes.filter(k=>objects.has(k)).length)} atributos`;
 return `<tr><td><div class="name-cell">${icon(obj.type)}<div><button class="obj-name" data-open="${esc(obj.key)}">${esc(obj.name)}</button><span class="row-sub">${esc(obj.description||obj.rows[0]?.expression||obj.rows[0]?.qualification||'Sin descripción')}</span></div></div></td><td class="cell-muted">${esc(label)}</td><td class="hide-mobile cell-muted"><div class="cell-folder" title="${esc(pathLabel(getPath(obj)))}">${esc(pathLabel(getPath(obj))||'Sin modelo')}</div></td><td><button class="row-link" data-open="${esc(obj.key)}" aria-label="Abrir ${esc(obj.name)}">›</button></td></tr>`;
}
function renderCatalog(){
 const lists=getScopedLists();const scope=state.scope?nodes.get(state.scope):null;
 $('scopeCount').textContent=`${fmt(scope?scope.objects.size:catalog.objects.length)} objetos en esta ubicación`;
 $('breadcrumbs').innerHTML=`<button data-scope="">Todos los modelos</button>${scope?scope.path.map((name,i)=>name?` <span aria-hidden="true">/</span> <button data-scope="${esc(JSON.stringify(scope.path.slice(0,i+1)))}">${esc(name)}</button>`:'').join(''):''}`;
 $('tabs').innerHTML=Object.keys(names).map(type=>`<button id="tab-${type}" class="tab ${state.type===type?'active':''}" role="tab" aria-controls="results" aria-selected="${state.type===type}" tabindex="${state.type===type?'0':'-1'}" data-type="${type}">${names[type]}<span>${fmt(lists[type].length)}</span></button>`).join('');
 const search=normalize(state.query);let items=lists[state.type].filter(o=>!search||o.search.includes(search));
 const pages=Math.max(1,Math.ceil(items.length/PAGE_SIZE));state.page=Math.min(state.page,pages);
 const start=(state.page-1)*PAGE_SIZE,end=Math.min(start+PAGE_SIZE,items.length);
 $('listTitle').textContent=state.type==='table'?'Tablas y objetos':names[state.type];
 const hint={table:'Seleccioná una tabla para ver sus atributos y facts.',attribute:'Abrí un atributo para conocer sus tablas y filtros.',fact:'Seguí las métricas que utilizan cada fact.',metric:'Explorá las fórmulas, facts y filtros de cada métrica.',filter:'Consultá las condiciones y los atributos de cada filtro.'};
 $('listHint').textContent=hint[state.type];
 $('objectSearch').placeholder=state.type==='table'?'Buscar nombre o ID de tabla':'Buscar nombre, ID o expresión';
 $('resultCount').textContent=`${fmt(items.length)} ${names[state.type].toLocaleLowerCase('es')}${state.query?' coincidentes':''}`;
 $('results').setAttribute('role','tabpanel');$('results').setAttribute('aria-labelledby','tab-'+state.type);
 $('results').innerHTML=items.length?`<table class="data-table"><thead><tr><th style="width:47%">${state.type==='table'?'Tabla':'Objeto'}</th><th style="width:26%">${state.type==='table'?'Contenido':'Relaciones'}</th><th class="hide-mobile" style="width:23%">${state.type==='table'?'Modelos':'Ubicación'}</th><th style="width:4%"><span class="sr-only">Abrir</span></th></tr></thead><tbody>${items.slice(start,end).map(state.type==='table'?tableRow:objectRow).join('')}</tbody></table>`:`<div class="empty">No hay ${names[state.type].toLocaleLowerCase('es')} para esta selección.${state.query?'<br><button class="text-button" data-clear-search>Limpiar búsqueda</button>':''}</div>`;
 $('pagination').innerHTML=`<span>${items.length?`${fmt(start+1)}–${fmt(end)} de ${fmt(items.length)}`:'Sin resultados'}</span><nav aria-label="Páginas de resultados"><button class="page-btn" data-page="${state.page-1}" ${state.page===1?'disabled':''} aria-label="Página anterior">‹</button><span style="padding:6px">${state.page} / ${fmt(pages)}</span><button class="page-btn" data-page="${state.page+1}" ${state.page===pages?'disabled':''} aria-label="Página siguiente">›</button></nav>`;
}

// Las relaciones conservan el tipo de evidencia: ID exacto o inferencia desde la fórmula.
function linkCard(key,note=''){
 const obj=objects.get(key)||tables.get(key);
 if(!obj)return `<div class="notice">Objeto referenciado fuera de los archivos cargados.<br><code>${esc(key.split(':').slice(1).join(':'))}</code></div>`;
 const type=obj.type||'table';
 return `<button class="relation-link" data-open="${esc(key)}">${icon(type)}<span>${esc(obj.name)}<small>${esc(note||pathLabel(getPath(obj))||singular[type])}</small></span><span class="arrow" aria-hidden="true">›</span></button>`;
}
function relationSection(title,keys,evidence='',note=''){
 const unique=[...new Set(keys)];if(!unique.length)return '';
 unique.sort((a,b)=>compare(objects.get(a)||tables.get(a)||{name:a},objects.get(b)||tables.get(b)||{name:b}));
 const tag=evidence?`<span class="tag ${evidence==='Por fórmula'?'inferred':''}">${esc(evidence)}</span>`:'';
 return `<section class="detail-section"><h3>${esc(title)} <span class="section-count">${fmt(unique.length)}</span>${tag}</h3>${note?`<p class="section-note">${esc(note)}</p>`:''}<div class="relation-list">${unique.slice(0,18).map(k=>linkCard(k)).join('')}</div>${unique.length>18?`<details class="details-more"><summary>Ver ${fmt(unique.length-18)} más</summary><div class="relation-list">${unique.slice(18).map(k=>linkCard(k)).join('')}</div></details>`:''}</section>`;
}
function incoming(key,type){return (reverse.get(key)||[]).filter(k=>objects.get(k)?.type===type)}
function dependentMetrics(key){
 const visited=new Set(),queue=[key];
 for(let i=0;i<queue.length;i++)for(const dep of incoming(queue[i],'metric'))if(!visited.has(dep)&&dep!==key){visited.add(dep);queue.push(dep)}
 return [...visited];
}
function detailHeader(){return `<div class="inspector-head"><button id="detailBack" ${state.history.length<2?'disabled':''}>‹ Volver</button><span class="secondary" style="font-size:12px">RELACIONES DEL CATÁLOGO</span><button class="close" id="detailClose" aria-label="Cerrar detalle">×</button></div>`}
function renderTable(table){
 const keys=[...table.attribute,...table.fact], metrics=[...new Set(table.fact.flatMap(dependentMetrics))];
 const models=[...new Set(keys.flatMap(k=>objects.get(k).locations.map(l=>l.path[0]).filter(Boolean)))].sort();
 return `${/^F_/i.test(table.name)?`<button class="logical-shortcut" data-logical-table="${esc(table.key)}">⌘ Ver modelo lógico</button>`:''}<div class="object-title">${icon('table')}<div><h2>${esc(table.name)}</h2><p>Tabla · ${fmt(keys.length)} objetos asociados</p></div></div><p class="description">${esc(models.join(' · '))}</p><div class="location">Las asociaciones se reúnen por nombre de tabla. Se muestran todas sus relaciones, incluso fuera del modelo seleccionado.</div>${relationSection('Atributos',table.attribute,'','Una entrada por atributo, con todas sus formas.')}${relationSection('Facts',table.fact)}${relationSection('Métricas relacionadas',metrics,'Por fórmula','Incluye métricas directas y las que dependen de otras métricas.')}${table.ids.length?`<details class="detail-section"><summary>Identificadores de tabla (${table.ids.length})</summary><div class="location">${table.ids.map(esc).join('<br>')}</div></details>`:''}`;
}
function renderObject(obj){
 const rel=catalog.links[obj.key];
 let html=`<div class="object-title">${icon(obj.type)}<div><h2>${esc(obj.name)}</h2><p>${singular[obj.type]}</p></div></div><div class="id-line"><b>ID</b><code>${esc(obj.id)}</code></div><p class="description">${esc(obj.description||'Sin descripción en el archivo de origen.')}</p><section class="detail-section"><h3>Ubicación</h3>${obj.locations.map(l=>`<div class="location">${esc(l.folder||'Sin carpeta')}${l.path[0]?`<br><button class="text-button" data-go-scope="${esc(JSON.stringify(l.path.slice(0,l.path.map(Boolean).lastIndexOf(true)+1)))}">Explorar este submodelo ›</button>`:''}</div>`).join('')}</section>`;
 if(obj.type==='attribute'||obj.type==='fact'){
  html+=relationSection('Tablas asociadas',objectTables.get(obj.key)||[]);
  const details=obj.rows.map(r=>`<div class="detail-row"><strong>${esc(r.formName?`Forma ${r.formName} · ${r.tableName||'Sin tabla'}`:r.tableName||'Sin tabla')}</strong><code>${esc(r.expression||'Sin expresión')}</code>${r.formCategory?`<span class="row-sub">Categoría ${esc(r.formCategory)} · ${esc(r.displayFormat||'Sin formato')}</span>`:''}</div>`);
  html+=`<section class="detail-section"><h3>Expresiones <span class="section-count">${fmt(details.length)}</span></h3>${details.slice(0,6).join('')}${details.length>6?`<details class="details-more"><summary>Ver las ${fmt(details.length)} definiciones</summary>${details.slice(6).join('')}</details>`:''}</section>`;
  const metrics=dependentMetrics(obj.key);
  html+=relationSection('Métricas relacionadas',metrics,'Por fórmula','Incluye relaciones directas y a través de otras métricas.');
  if(obj.type==='attribute')html+=relationSection('Filtros que utilizan este atributo',incoming(obj.key,'filter'),'Por ID');
  if(!metrics.length&&obj.type==='fact')html+='<p class="section-note">No se identificaron métricas con una referencia inequívoca a este fact.</p>';
 } else if(obj.type==='metric'){
  html+=`<section class="detail-section"><h3>Fórmula</h3><pre class="formula">${esc(obj.rows[0]?.expression||'Sin expresión')}</pre></section>`;
  html+=relationSection('Facts de la fórmula',rel.facts,'Por fórmula');
  html+=relationSection('Métricas de la fórmula',rel.metrics,'Por fórmula');
  html+=relationSection('Atributos de la fórmula',rel.attributes,'Por fórmula');
  if(!rel.facts.length)html+='<div class="location">No hay un fact directo identificado de forma inequívoca. La fórmula puede utilizar otras métricas o referencias pendientes de resolver.</div>';
  html+=relationSection('Filtros de la métrica',rel.filters,'Por ID');
  if(!rel.filters.length)html+='<section class="detail-section"><h3>Filtros de la métrica</h3><p class="section-note">Sin filtro condicional asociado.</p></section>';
  if(rel.ambiguous.length)html+=`<section class="detail-section"><h3>Referencias ambiguas <span class="section-count">${rel.ambiguous.length}</span></h3><p class="notice">Hay nombres repetidos. Estos candidatos no se consideran relaciones confirmadas.</p>${rel.ambiguous.map(a=>`<details class="details-more"><summary>${esc(a.reference)} · ${a.candidates.length} candidatos</summary><div class="relation-list">${a.candidates.map(k=>linkCard(k)).join('')}</div></details>`).join('')}</section>`;
  if(rel.unresolved.length)html+=`<section class="detail-section"><h3>Referencias sin correspondencia</h3><div class="location">${rel.unresolved.map(esc).join(' · ')}</div></section>`;
  html+=relationSection('Utilizada por otras métricas',incoming(obj.key,'metric'),'Por fórmula');
 } else if(obj.type==='filter'){
  const quals=[...new Set(obj.rows.map(r=>r.qualification).filter(Boolean))];
  html+=`<section class="detail-section"><h3>Condición del filtro</h3>${quals.map(q=>`<pre class="formula">${esc(q)}</pre>`).join('')||'<p class="section-note">Sin calificación textual.</p>'}</section>`;
  html+=relationSection('Métricas que utilizan este filtro',incoming(obj.key,'metric'),'Por ID');
  html+=relationSection('Atributos de los predicados',rel.attributes,'Por ID');
  html+=relationSection('Métricas de los predicados',rel.metrics,'Por ID');
  if(!rel.attributes.length&&!rel.metrics.length)html+='<div class="location">El archivo no contiene IDs de objeto para los predicados de este filtro. La condición completa se conserva arriba.</div>';
  const rows=obj.rows.map(r=>`<div class="detail-row"><strong>${esc(r.predicateName||r.treeType||'Predicado')}</strong><span>${esc(r.function||'Función no informada')}${r.elementDisplay?` · ${esc(r.elementDisplay)}`:''}</span>${r.elementId?`<span class="row-sub">Elemento: ${esc(r.elementId)}</span>`:''}</div>`);
  html+=`<section class="detail-section"><h3>Detalle de predicados <span class="section-count">${fmt(rows.length)}</span></h3>${rows.slice(0,8).join('')}${rows.length>8?`<details class="details-more"><summary>Ver ${rows.length-8} más</summary>${rows.slice(8).join('')}</details>`:''}</section>`;
 }
 return html;
}
function openDetail(key,push=true){
 const obj=objects.get(key)||tables.get(key);if(!obj)throw new Error('Objeto no encontrado.');
 if($('inspector').hidden)lastFocus=document.activeElement;
 if(push)state.history.push(key);
 $('inspector').innerHTML=detailHeader()+`<div class="inspector-body">${obj.type?renderObject(obj):renderTable(obj)}</div>`;
 $('inspector').hidden=false;$('backdrop').hidden=false;document.body.classList.add('dialog-open');
 $('inspector').scrollTop=0;$('detailClose').focus();
}
function closeDetail(){
 $('inspector').hidden=true;$('backdrop').hidden=true;document.body.classList.remove('dialog-open');state.history=[];lastFocus?.focus();
}
function switchType(type){if(!names[type])throw new Error('Tipo inválido.');state.type=type;state.page=1;renderCatalog()}

document.addEventListener('click',event=>{
 if(!catalog)return;
 const button=event.target.closest('button');if(!button)return;
 if(button.dataset.expand!==undefined){const key=button.dataset.expand;state.expanded.has(key)?state.expanded.delete(key):state.expanded.add(key);renderTree();return}
 if(button.dataset.scope!==undefined){setScope(button.dataset.scope||null);return}
 if(button.dataset.type){switchType(button.dataset.type);return}
 if(button.dataset.open){openDetail(button.dataset.open);return}
 if(button.dataset.page){state.page=Number(button.dataset.page);renderCatalog();$('listTitle').scrollIntoView({block:'nearest'});return}
 if(button.dataset.goScope){const path=button.dataset.goScope;closeDetail();setScope(path);return}
 if(button.hasAttribute('data-clear-search')){state.query='';$('objectSearch').value='';state.page=1;renderCatalog()}
 if(button.id==='detailClose')closeDetail();
 if(button.id==='detailBack'&&state.history.length>1){state.history.pop();openDetail(state.history.at(-1),false)}
});
$('resetScope').addEventListener('click',()=>{if(!catalog)return;state.modelQuery='';$('modelSearch').value='';setScope(null)});
$('modelSearch').addEventListener('input',debounce(e=>{if(!catalog)return;state.modelQuery=e.target.value;renderTree()}));
$('objectSearch').addEventListener('input',debounce(e=>{if(!catalog)return;state.query=e.target.value;state.page=1;renderCatalog()}));
$('backdrop').addEventListener('click',closeDetail);
document.addEventListener('keydown',e=>{
 if(!$('inspector').hidden){
  if(e.key==='Escape'){e.preventDefault();closeDetail()}
  if(e.key==='Tab'){
   const items=[...$('inspector').querySelectorAll('button:not(:disabled),a[href],input,summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);
   const first=items[0],last=items.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
 } else if(e.target.closest('[role="tablist"]')&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){
  e.preventDefault();const types=Object.keys(names),idx=types.indexOf(state.type);
  const next=e.key==='Home'?0:e.key==='End'?types.length-1:(idx+(e.key==='ArrowRight'?1:-1)+types.length)%types.length;
  switchType(types[next]);$('tab-'+types[next]).focus();
 }
});

function registerAgentTools(){
 const context=document.modelContext;if(!context?.registerTool)return;
 const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
 const tools=[{
  name:'navigate_metadata_catalog',title:'Explorar el catálogo de metadata',description:'Selecciona un tipo y una ruta de modelo; busca nombres, IDs o expresiones en el mismo catálogo visible.',
  inputSchema:{type:'object',properties:{type:{type:'string',enum:Object.keys(names)},path:{type:'array',items:{type:'string'}},query:{type:'string'}},required:['type'],additionalProperties:false},
  annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){
   if(!input||!names[input.type]||input.query!==undefined&&typeof input.query!=='string'||input.path!==undefined&&(!Array.isArray(input.path)||!input.path.every(x=>typeof x==='string')))throw new Error('Parámetros inválidos.');
   const path=input.path?.length?JSON.stringify(input.path):null;if(path&&!nodes.has(path))throw new Error('Modelo o submodelo inexistente.');
   closeDetail();if(typeof showDashboardSection==='function')showDashboardSection('catalog');state.type=input.type;state.query=input.query||'';$('objectSearch').value=state.query;setScope(path);
   const results=getScopedLists()[state.type].filter(o=>o.search.includes(normalize(state.query)));
   return {count:results.length,items:results.slice(0,12).map(o=>({key:o.key,name:o.name}))};
  }
 },{
  name:'open_metadata_object',title:'Abrir detalle y relaciones',description:'Abre un objeto por su clave de catálogo y muestra sus definiciones y relaciones.',
  inputSchema:{type:'object',properties:{key:{type:'string'}},required:['key'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){
   if(!input||typeof input.key!=='string'||!objects.has(input.key)&&!tables.has(input.key))throw new Error('Objeto inexistente.');
   openDetail(input.key);const obj=objects.get(input.key)||tables.get(input.key);
   return {key:obj.key,name:obj.name,type:obj.type||'table',relations:catalog.links[obj.key]||null};
  }
 }];
 for(const tool of tools)try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{})}catch{}
}

// API mínima para que el panel de chat pueda abrir sus resultados en este
// mismo tablero, sin acceder a las estructuras internas del catálogo.
window.openMetadataObject = key => {
 if(!catalog)return false;
 const obj=objects.get(key)||tables.get(key);
 if(!obj)return false;
 if(typeof showDashboardSection==='function')showDashboardSection('catalog');
 openDetail(key);
 return true;
};
// La ruta relativa permite publicar el tablero en la raíz o en una subcarpeta.
fetch('./catalog.json').then(r=>{if(!r.ok)throw new Error('No se pudo cargar el catálogo.');return r.json()}).then(initialize).catch(error=>{
 $('error').hidden=false;$('error').textContent='No se pudo cargar el catálogo. Volvé a cargar la página para reintentar.';
 $('total').textContent='Catálogo no disponible';$('results').innerHTML='<div class="empty">La información no está disponible.</div>';
 console.error(error);
});
