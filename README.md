# Tablero Metadata MicroStrategy

Exportación del tablero con el catálogo de objetos y la sección de modelos lógicos. Los archivos son editables y funcionan fuera de ChatGPT.

## Publicarlo en un servidor o hosting

1. Descomprimí el ZIP.
2. Subí **todo el contenido de `dist`** al directorio público de tu servidor o hosting para páginas estáticas. Los seis archivos deben quedar juntos.
3. Configurá `index.html` como documento de inicio. Si el hosting solicita un directorio de publicación, indicá `dist`; no hace falta ejecutar un comando de compilación.
4. Abrí la dirección HTTP o HTTPS que te asigne el servidor. Si lo publicás dentro de una subcarpeta, accedé con la barra final, por ejemplo `https://tu-servidor/metadata/`.

La página puede publicarse en la raíz de un dominio o en una subcarpeta. No necesita Node.js, una base de datos, FastAPI ni conexión con MicroStrategy para consultar los datos incluidos.

| Archivo para publicar | Contenido |
| --- | --- |
| `dist/index.html` | Página principal |
| `dist/style.css` | Estilos del catálogo |
| `dist/app.js` | Navegación, búsquedas y relaciones |
| `dist/logical.css` | Estilos de los modelos lógicos |
| `dist/logical.js` | Diagramas de tablas F_, hechos, métricas y atributos |
| `dist/catalog.json` | Datos consolidados que carga el tablero |

El script de actualización y esta guía quedan fuera del directorio público.

## Probarlo en tu PC

Desde una terminal ubicada en la carpeta descomprimida `tablero_metadata_microstrategy`, ejecutá:

```powershell
python -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Abrí [http://localhost:8000/](http://localhost:8000/) en el navegador. Mantené la terminal abierta mientras lo usás y detené el servidor con `Ctrl+C`.

Este comando requiere Python 3 y sirve para probarlo localmente. Para publicarlo, usá el servidor o hosting del apartado anterior. Abrir `index.html` con doble clic puede impedir que el navegador cargue el JSON; accedé mediante HTTP o HTTPS.

## Con Docker
docker compose -f deploy/docker-compose.yml down
docker compose -f deploy/docker-compose.yml build --no-cache
docker compose -f deploy/docker-compose.yml up -d
pagina queda disponible en --> http://localhost:8080

## Datos y funcionalidades incluidos

- 24 modelos y 1.474 submodelos, contabilizados por su ruta jerárquica.
- 15.735 objetos únicos: 4.877 atributos, 3.336 facts, 5.680 métricas y 1.842 filtros.
- Navegación por modelos, submodelos, tablas, objetos y relaciones; búsqueda y detalle de definiciones.
- 224 tablas F_ en la sección **Modelos lógicos**, con hechos y métricas en el centro y atributos alrededor, indicando sus tablas D_.
- Búsqueda de atributos, zoom, ajuste del diagrama y desplazamiento.

Las relaciones de métricas se derivan de las fórmulas disponibles; las referencias ambiguas se muestran por separado. Las conexiones del diagrama representan asociaciones de metadata, sin definir claves de unión ni cardinalidades SQL.

## Actualizar los datos

Guardá una nueva descarga de estos cuatro archivos, con los mismos campos que las descargas originales, en una carpeta:

- `flat_attributes.json`
- `flat_facts.json`
- `flat_metrics.json`
- `flat_filters.json`

Desde la carpeta principal del tablero ejecutá, reemplazando la ruta por la de tus archivos:

```powershell
python scripts/prepare-data.py "C:\ruta\a\results"
```

El script incluido usa solamente la biblioteca estándar de Python. Consolida los cuatro archivos y regenera `dist/catalog.json` en UTF-8, conservando las reglas de relaciones del tablero. No consulta las APIs de MicroStrategy.

Volvé a publicar `dist/catalog.json` y recargá la página con `Ctrl+F5`. Si tu hosting conserva archivos en caché, actualizá también esa caché. Los cuatro archivos `flat_*.json` no deben reemplazar directamente a `catalog.json`: primero hay que ejecutar la consolidación.

Opcionalmente, podés elegir otro archivo de salida:

```powershell
python scripts/prepare-data.py "C:\ruta\a\results" --output "C:\ruta\a\catalog.json"
```


