/* Vista gráfica: las tablas F_ se relacionan con sus propios objetos por tableName.
   Las tablas D_ de cada atributo provienen de todas sus definiciones disponibles. */
const logicalState={ready:false,section:'catalog',model:'',query:'',selected:null,attributeQuery:'',measureQuery:'',zoom:1,width:1320,height:800,centerY:400};
let logicalTables=[],logicalModels=new Map(),logicalCache=new Map();

function buildLogicalModel(tableKey){
 if(logicalCache.has(tableKey))return logicalCache.get(tableKey);
 const table=tables.get(tableKey);
 if(!table||!/^F_/i.test(table.name))throw new Error('La selección debe ser una tabla F_.');
 const facts=table.fact.map(k=>objects.get(k)).sort(compare);
 const attributes=table.attribute.map(k=>{
  const attribute=objects.get(k);
  const dimensionTables=(objectTables.get(k)||[]).map(t=>tables.get(t)).filter(t=>/^D_/i.test(t.name)).sort(compare);
  return {attribute,dimensionTables,search:normalize([attribute.name,attribute.id,...dimensionTables.map(t=>t.name)].join(' '))};
 }).sort((a,b)=>compare(a.attribute,b.attribute));
 const direct=new Set(table.fact.flatMap(k=>incoming(k,'metric')));
 const metricKeys=[...new Set(table.fact.flatMap(dependentMetrics))],metricSet=new Set(metricKeys);
 const metrics=metricKeys.map(k=>({object:objects.get(k),direct:direct.has(k)})).sort((a,b)=>compare(a.object,b.object));
 const factKeys=new Set(table.fact),possible=[];
 for(const [key,rel] of Object.entries(catalog.links)){
  if(!key.startsWith('metric:')||metricSet.has(key))continue;
  const refs=rel.ambiguous.filter(a=>a.candidates.some(k=>factKeys.has(k)));
  if(refs.length)possible.push({object:objects.get(key),references:refs.map(a=>a.reference)});
 }
 possible.sort((a,b)=>compare(a.object,b.object));
 const model={table,facts,attributes,metrics,possible};logicalCache.set(tableKey,model);return model;
}

function initializeLogical(){
 if(logicalState.ready)return;logicalState.ready=true;
 logicalTables=sorted.table.filter(t=>/^F_/i.test(t.name));
 for(const table of logicalTables){
  const models=new Set([...table.fact,...table.attribute].flatMap(k=>objects.get(k).locations.map(l=>l.path[0]).filter(Boolean)));
  logicalModels.set(table.key,models);
 }
 $('logicalModel').innerHTML='<option value="">Todos los modelos</option>'+roots.map(k=>`<option value="${esc(nodes.get(k).name)}">${esc(nodes.get(k).name)}</option>`).join('');
 $('logicalTotal').textContent=fmt(logicalTables.length);
 // Una estrella de tamaño moderado facilita la primera exploración.
 logicalState.selected=(logicalTables.find(t=>t.attribute.length>=5&&t.attribute.length<=10&&t.fact.length>=2&&t.fact.length<=6)||logicalTables[0])?.key||null;
 refreshLogicalSelector(false);
 if(window.location?.hash==='#modelos-logicos')showDashboardSection('logical');
}
function visibleLogicalTables(){
 return logicalTables.filter(t=>(!logicalState.model||logicalModels.get(t.key).has(logicalState.model))&&normalize(t.name).includes(normalize(logicalState.query)));
}
function refreshLogicalSelector(render=true){
 const available=visibleLogicalTables();
 if(!available.some(t=>t.key===logicalState.selected))logicalState.selected=available[0]?.key||null;
 $('logicalTable').innerHTML=available.length?available.map(t=>`<option value="${esc(t.key)}" ${t.key===logicalState.selected?'selected':''}>${esc(t.name)}</option>`).join(''):'<option value="">Sin tablas para esta selección</option>';
 $('logicalTable').disabled=!available.length;
 $('logicalAvailable').textContent=`${fmt(available.length)} de ${fmt(logicalTables.length)} tablas F_`;
 if(render){logicalState.attributeQuery='';logicalState.measureQuery='';$('logicalAttributeSearch').value='';renderLogicalDiagram(true)}
}
function showDashboardSection(section){
 if(!logicalState.ready)return;
 logicalState.section=section;
 $('catalogView').hidden=section!=='catalog';$('logicalView').hidden=section!=='logical';
 $('sectionCatalog').setAttribute('aria-pressed',String(section==='catalog'));
 $('sectionLogical').setAttribute('aria-pressed',String(section==='logical'));
 if(section==='logical')renderLogicalDiagram(true);
}
function selectLogicalTable(key){
 if(!tables.has(key)||!/^F_/i.test(tables.get(key).name))throw new Error('Tabla de hechos inexistente.');
 logicalState.selected=key;logicalState.attributeQuery='';logicalState.measureQuery='';$('logicalAttributeSearch').value='';
 renderLogicalDiagram(true);
}
function logicalObjectButton(obj,extra=''){
 return `<button class="logical-object" data-open="${esc(obj.key)}" title="${esc(obj.name)}">${icon(obj.type)}<span>${esc(obj.name)}${extra?`<small>${esc(extra)}</small>`:''}</span><span aria-hidden="true">›</span></button>`;
}
function logicalFactRows(model){
 const query=normalize(logicalState.measureQuery);
 const facts=model.facts.filter(o=>normalize(o.name+' '+o.id+' '+o.rows.map(r=>r.expression).join(' ')).includes(query));
 const metrics=model.metrics.filter(m=>normalize(m.object.name+' '+m.object.id+' '+m.object.rows[0]?.expression).includes(query));
 const factHTML=facts.map(f=>{
  const expressions=[...new Set(f.rows.filter(r=>normalize(r.tableName)===normalize(model.table.name)).map(r=>r.expression).filter(Boolean))];
  return logicalObjectButton(f,expressions.join(' · '));
 }).join('');
 const metricHTML=metrics.map(m=>logicalObjectButton(m.object,m.direct?'Por fórmula · directa':'Por fórmula · a través de otra métrica')).join('');
 return {facts:factHTML||`<p class="logical-no-data">${model.facts.length?'Sin hechos coincidentes.':'Sin hechos definidos en el archivo para esta tabla.'}</p>`,metrics:metricHTML||`<p class="logical-no-data">${model.metrics.length?'Sin métricas coincidentes.':'No se identificaron métricas inequívocas para los hechos de esta tabla.'}</p>`};
}
function logicalCenter(model,x,y){
 const rows=logicalFactRows(model);
 return `<section class="logical-fact-node" style="left:${x}px;top:${y}px" aria-label="Tabla de hechos ${esc(model.table.name)}"><header class="logical-fact-head"><span class="logical-node-type">TABLA DE HECHOS</span><button class="logical-fact-name" data-open="${esc(model.table.key)}">${esc(model.table.name)} <span aria-hidden="true">↗</span></button><span>${fmt(model.facts.length)} hechos · ${fmt(model.metrics.length)} métricas</span></header><label class="logical-measure-search"><input id="logicalMeasureSearch" value="${esc(logicalState.measureQuery)}" type="search" placeholder="Buscar hecho o métrica" aria-label="Buscar hechos o métricas de la tabla central"></label><section class="logical-measure-section"><h3>Hechos <span>${fmt(model.facts.length)}</span></h3><div id="logicalFactRows" class="logical-measure-list" tabindex="0" aria-label="Todos los hechos">${rows.facts}</div></section><section class="logical-measure-section logical-metrics-section"><h3>Métricas <span>${fmt(model.metrics.length)}</span></h3><div id="logicalMetricRows" class="logical-measure-list" tabindex="0" aria-label="Todas las métricas identificadas">${rows.metrics}</div></section>${model.possible.length?`<button class="logical-ambiguous" data-logical-possible="${esc(model.table.key)}">${fmt(model.possible.length)} métricas con referencias ambiguas · revisar ›</button>`:'<div class="logical-fact-footer">Incluye métricas directas e indirectas identificadas.</div>'}</section>`;
}
function logicalAttributeNode(item,x,y,index){
 const {attribute,dimensionTables}=item;
 return `<section class="logical-attribute-node" style="left:${x}px;top:${y}px" data-logical-node="${index}" aria-label="Atributo ${esc(attribute.name)}"><header><span class="logical-attr-symbol">A</span><button data-open="${esc(attribute.key)}" title="${esc(attribute.name)}">${esc(attribute.name)}</button></header><p>TABLAS D_ REFERENCIADAS</p><div class="logical-dim-tables" tabindex="0" aria-label="Tablas D_ de ${esc(attribute.name)}">${dimensionTables.length?dimensionTables.map(t=>`<button data-open="${esc(t.key)}" title="${esc(t.name)}">${esc(t.name)} <span aria-hidden="true">↗</span></button>`).join(''):'<span class="logical-no-dimension">Sin tabla D_ identificada</span>'}</div></section>`;
}
function renderLogicalDiagram(reset=false){
 if(!logicalState.selected){
  $('logicalSummary').innerHTML='';$('logicalShown').textContent='';$('logicalSizer').style.width='100%';$('logicalSizer').style.height='200px';
  $('logicalCanvas').style.transform='none';$('logicalCanvas').style.width='100%';$('logicalCanvas').style.height='200px';$('logicalCanvas').innerHTML='<div class="empty">No hay tablas F_ para esta selección.</div>';return;
 }
 const model=buildLogicalModel(logicalState.selected),visible=model.attributes.filter(a=>a.search.includes(normalize(logicalState.attributeQuery)));
 const rows=Math.ceil(visible.length/2),width=1320,height=Math.max(840,rows*180+80),centerX=440,centerY=(height-720)/2;
 logicalState.width=width;logicalState.height=height;logicalState.centerY=height/2;
 $('logicalSummary').innerHTML=`<div><strong>${esc(model.table.name)}</strong><span>${esc([...logicalModels.get(model.table.key)].sort().join(' · '))}</span></div><div class="logical-stat-chips"><span><b>${fmt(model.facts.length)}</b> hechos</span><span><b>${fmt(model.metrics.length)}</b> métricas</span><span><b>${fmt(model.attributes.length)}</b> atributos</span><span><b>${fmt(new Set(model.attributes.flatMap(a=>a.dimensionTables.map(t=>t.key))).size)}</b> tablas D_</span></div>`;
 $('logicalShown').textContent=visible.length===model.attributes.length?`${fmt(visible.length)} atributos`:`${fmt(visible.length)} de ${fmt(model.attributes.length)} atributos`;
 let nodesHTML='',edges='';
 for(let i=0;i<visible.length;i++){
  const left=i%2===0,laneIndex=Math.floor(i/2),laneCount=left?Math.ceil(visible.length/2):Math.floor(visible.length/2);
  const y=(height-laneCount*180)/2+laneIndex*180+10,x=left?36:1004;
  const fromX=left?centerX:centerX+440,toX=left?x+280:x;
  const fromY=height/2+(laneCount===1?0:(laneIndex/(laneCount-1)-.5)*580),toY=y+76;
  const bend1=left?fromX-58:fromX+58,bend2=left?toX+58:toX-58;
  edges+=`<path id="logical-edge-${i}" class="logical-edge" d="M ${fromX} ${fromY} C ${bend1} ${fromY}, ${bend2} ${toY}, ${toX} ${toY}"/><circle cx="${toX}" cy="${toY}" r="3" class="logical-end"/>`;
  nodesHTML+=logicalAttributeNode(visible[i],x,y,i);
 }
 const noAttrs=!visible.length?`<div class="logical-empty-attributes" style="top:${height/2-70}px">${model.attributes.length?'No hay atributos coincidentes.':'No hay atributos asociados a esta tabla en los archivos.'}${logicalState.attributeQuery?'<br><button class="text-button" data-clear-logical-attributes>Ver todos los atributos</button>':''}</div>`:'';
 $('logicalCanvas').innerHTML=`<svg class="logical-edges" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">${edges}</svg>${nodesHTML}${logicalCenter(model,centerX,centerY)}${noAttrs}`;
 $('logicalCanvas').style.width=width+'px';$('logicalCanvas').style.height=height+'px';
 if(reset)logicalState.zoom=1;
 applyLogicalZoom(reset?'center':'preserve');
}
function applyLogicalZoom(mode='preserve'){
 const viewport=$('logicalViewport'),s=logicalState;
 const previous=Number(viewport.dataset.zoom||1),cx=(viewport.scrollLeft+viewport.clientWidth/2)/previous,cy=(viewport.scrollTop+viewport.clientHeight/2)/previous;
 $('logicalSizer').style.width=s.width*s.zoom+'px';$('logicalSizer').style.height=s.height*s.zoom+'px';
 $('logicalCanvas').style.transform=`scale(${s.zoom})`;viewport.dataset.zoom=String(s.zoom);$('logicalZoom').textContent=Math.round(s.zoom*100)+'%';
 const move=()=>{viewport.scrollLeft=Math.max(0,(mode==='center'?s.width/2:cx)*s.zoom-viewport.clientWidth/2);viewport.scrollTop=Math.max(0,(mode==='center'?s.centerY:cy)*s.zoom-viewport.clientHeight/2)};
 if(typeof requestAnimationFrame==='function')requestAnimationFrame(move);else move();
}
function showPossibleMetrics(key){
 const model=buildLogicalModel(key);openDetail(key);
 $('inspector').innerHTML=detailHeader()+`<div class="inspector-body"><h2>Métricas con referencias ambiguas</h2><p class="description">${esc(model.table.name)}</p><p class="notice">Los nombres de facts no son únicos. Estas ${fmt(model.possible.length)} métricas son candidatas y no se contabilizan como relaciones identificadas del modelo.</p><div class="relation-list">${model.possible.map(m=>linkCard(m.object.key,m.references.join(' · '))).join('')}</div></div>`;
 $('detailClose').focus();
}

document.addEventListener('click',event=>{
 if(!logicalState.ready)return;const button=event.target.closest('button');if(!button)return;
 if(button.dataset.section)showDashboardSection(button.dataset.section);
 if(button.dataset.logicalTable){
  closeDetail();logicalState.model='';logicalState.query='';$('logicalModel').value='';$('logicalTableSearch').value='';logicalState.selected=button.dataset.logicalTable;refreshLogicalSelector(false);showDashboardSection('logical');$('logicalTitle').scrollIntoView({block:'start'});
 }
 if(button.dataset.logicalPossible)showPossibleMetrics(button.dataset.logicalPossible);
 if(button.hasAttribute('data-clear-logical-attributes')){logicalState.attributeQuery='';$('logicalAttributeSearch').value='';renderLogicalDiagram(true)}
 if(button.dataset.zoom&&logicalState.selected){
  const action=button.dataset.zoom;
  if(action==='fit')logicalState.zoom=Math.max(.02,Math.min(1,$('logicalViewport').clientWidth/logicalState.width, $('logicalViewport').clientHeight/logicalState.height));
  if(action==='in')logicalState.zoom=Math.min(1.6,logicalState.zoom*1.25);
  if(action==='out')logicalState.zoom=Math.max(.02,logicalState.zoom/1.25);
  if(action==='center'){logicalState.zoom=1;applyLogicalZoom('center')}else applyLogicalZoom(action==='fit'?'center':'preserve');
 }
});
$('logicalModel').addEventListener('change',event=>{if(!logicalState.ready)return;logicalState.model=event.target.value;refreshLogicalSelector()});
$('logicalTable').addEventListener('change',event=>{if(event.target.value)selectLogicalTable(event.target.value)});
$('logicalTableSearch').addEventListener('input',debounce(event=>{if(!logicalState.ready)return;logicalState.query=event.target.value;refreshLogicalSelector()}));
$('logicalAttributeSearch').addEventListener('input',debounce(event=>{if(!logicalState.ready)return;logicalState.attributeQuery=event.target.value;renderLogicalDiagram(true)}));
document.addEventListener('input',debounce(event=>{
 if(event.target.id!=='logicalMeasureSearch'||!logicalState.selected)return;
 logicalState.measureQuery=event.target.value;const rows=logicalFactRows(buildLogicalModel(logicalState.selected));$('logicalFactRows').innerHTML=rows.facts;$('logicalMetricRows').innerHTML=rows.metrics;
}));
// Desplazamiento sobre el fondo; las tarjetas mantienen sus scrolls y enlaces propios.
let logicalDrag=null;
$('logicalViewport').addEventListener('pointerdown',event=>{
 if(event.button!==0||event.target.closest('button,input,select,.logical-fact-node,.logical-attribute-node'))return;
 logicalDrag={x:event.clientX,y:event.clientY,left:$('logicalViewport').scrollLeft,top:$('logicalViewport').scrollTop,pointer:event.pointerId};
 $('logicalViewport').setPointerCapture(event.pointerId);$('logicalViewport').classList.add('dragging');
});
$('logicalViewport').addEventListener('pointermove',event=>{
 if(!logicalDrag)return;
 $('logicalViewport').scrollLeft=logicalDrag.left-event.clientX+logicalDrag.x;$('logicalViewport').scrollTop=logicalDrag.top-event.clientY+logicalDrag.y;
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('logicalViewport').addEventListener(type,()=>{logicalDrag=null;$('logicalViewport').classList.remove('dragging')});
$('logicalCanvas').addEventListener('pointerover',event=>{const node=event.target.closest('[data-logical-node]');if(node)$('logical-edge-'+node.dataset.logicalNode)?.classList.add('highlight')});
$('logicalCanvas').addEventListener('pointerout',event=>{const node=event.target.closest('[data-logical-node]');if(node)$('logical-edge-'+node.dataset.logicalNode)?.classList.remove('highlight')});
if(typeof catalog!=='undefined'&&catalog)initializeLogical();
