"""Consolida objetos sin duplicar formas/tablas y deriva relaciones trazables."""
import argparse,json,re
from pathlib import Path
from collections import defaultdict
# El directorio de entrada contiene los cuatro archivos flat_*.json del downloader.
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('source',type=Path,help='Carpeta con flat_attributes.json, flat_facts.json, flat_metrics.json y flat_filters.json')
parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'dist/catalog.json',help='Archivo de catálogo de salida (predeterminado: dist/catalog.json)')
args=parser.parse_args()
source=args.source; target=args.output
objects={}; counts={}; tables={}
common=['objectId','name','subType','description','folder','model','submodel','submodel1','submodel2','submodel3']
fields=['model','submodel','submodel1','submodel2','submodel3']
for kind,file in [('attribute','attributes'),('fact','facts'),('metric','metrics'),('filter','filters')]:
 rows=json.loads((source/f'flat_{file}.json').read_text(encoding='utf-8-sig')); counts[kind]=len(rows)
 for row in rows:
  key=kind+':'+row['objectId']
  obj=objects.setdefault(key,{'key':key,'id':row['objectId'],'type':kind,'name':row['name'],'description':row.get('description'),'locations':[],'rows':[]})
  loc={'folder':row.get('folder'),'path':[row.get(f) for f in fields]}
  if loc not in obj['locations']:obj['locations'].append(loc)
  extra={k:v for k,v in row.items() if k not in common}
  if extra not in obj['rows']:obj['rows'].append(extra)
  if kind in ('fact','attribute') and row.get('tableName'):
   tk=row['tableName'].strip().casefold()
   table=tables.setdefault(tk,{'key':'table:'+tk,'name':row['tableName'],'attribute':set(),'fact':set(),'ids':set()})
   table[kind].add(key)
   if row.get('tableObjectId'):table['ids'].add(row['tableObjectId'])
# Conserva prefijos jerárquicos: los nombres iguales bajo padres distintos son distintos.
paths=set(); models=set()
for obj in objects.values():
 for loc in obj['locations']:
  path=loc['path']
  if path[0]:models.add(path[0])
  for i in range(1,6):
   if path[i-1]:paths.add(tuple(path[:i]))
by_name=defaultdict(set); by_expr=defaultdict(set)
for obj in objects.values():
 if obj['type'] in ('fact','metric','attribute'):
  by_name[obj['name'].strip().casefold()].add(obj['key'])
 if obj['type']=='fact':
  for row in obj['rows']:
   exp=row.get('expression','').strip()
   if re.fullmatch(r'[\w]+',exp):by_expr[exp.casefold()].add(obj['key'])
links={}; stat={'inferred':0,'ambiguous':0,'metricWithoutFact':0,'filterMissing':0,'predicateMissing':0}
for obj in objects.values():
 relation={'facts':[],'metrics':[],'attributes':[],'filters':[],'ambiguous':[],'unresolved':[]}
 if obj['type']=='metric':
  expr=obj['rows'][0].get('expression') or ''
  # No se interpretan identificadores dentro de literales SQL/textuales ni parámetros <...>.
  parsed=re.sub(r'"(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'|<[^>]*>',' ',expr)
  braces=re.findall(r'\{([^{}]+)\}',parsed)
  bare_source=re.sub(r'\{[^{}]*\}',' ',parsed)
  bare=[m.group() for m in re.finditer(r'\b[\w]+\b',bare_source) if not re.match(r'\s*\(',bare_source[m.end():])]
  tokens=[(s.strip(),'nombre') for s in braces]
  tokens += [(s,'nombre o expresión') for s in bare if s.casefold() in by_name or s.casefold() in by_expr]
  for token,basis in dict.fromkeys(tokens):
   candidates=by_name.get(token.casefold(),set())-{obj['key']}
   if not candidates and basis!='nombre':candidates=by_expr.get(token.casefold(),set())
   if len(candidates)>1:
    relation['ambiguous'].append({'reference':token,'candidates':sorted(candidates)})
    stat['ambiguous']+=1
   elif candidates:
    key=next(iter(candidates)); kind=objects[key]['type']
    group={'fact':'facts','metric':'metrics','attribute':'attributes'}[kind]
    if key not in relation[group]:relation[group].append(key);stat['inferred']+=1
   else:relation['unresolved'].append(token)
  fid=obj['rows'][0].get('filterObjectId')
  if fid:
   relation['filters']=['filter:'+fid]
   if 'filter:'+fid not in objects:stat['filterMissing']+=1
  if not relation['facts']:stat['metricWithoutFact']+=1
 if obj['type']=='filter':
  for row in obj['rows']:
   if row.get('predicateObjectId') and row.get('predicateSubType') in ('attribute','metric'):
    kind=row['predicateSubType']; key=kind+':'+row['predicateObjectId']; group=kind+'s'
    if key not in relation[group]:relation[group].append(key)
    if key not in objects:stat['predicateMissing']+=1
 if obj['type'] in ('metric','filter'):links[obj['key']]=relation
for table in tables.values():
 for kind in ('fact','attribute','ids'):table[kind]=sorted(table[kind])
result={'objects':list(objects.values()),'tables':list(tables.values()),'links':links,
        'stats':{'models':len(models),'submodels':len(paths)-len(models),'objects':len(objects),'rows':counts,'relations':stat}}
# UTF-8 explícito conserva tildes y caracteres especiales también en Windows.
# Solo se escribe el archivo cuando se terminaron de leer los cuatro tipos de objeto.
target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(json.dumps({'stats':result['stats'],'tables':len(tables),'size':target.stat().st_size},ensure_ascii=False))
