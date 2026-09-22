# Tablero Metadata MicroStrategy


## Publicarlo en un servidor o hosting

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
docker compose -f deploy/docker-compose.yml down --remove-orphans
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

                        MicroStrategy
                              │
                              ▼
                    flat_*.json / metadata
                              │
                              ▼
                     prepare-data.py
                              │
                              ▼
                       catalog.json
                              │
                ┌─────────────┴─────────────┐
                │                           │
                ▼                           ▼
        Dashboard estático            catalog-agent
             Nginx                  Google ADK / Python
                │                           │
                │                           ▼
                │                       Gemini
                │
                └────── /agent/ ───────────┘

# Integración del agente ADK en el tablero

Este paquete contiene los archivos para incorporar un asistente de Google ADK
que responde sobre `catalog.json` sin exponer `GOOGLE_API_KEY` al navegador.

## Destino de los archivos

| Archivo de este paquete | Destino en el repositorio del tablero |
| --- | --- |
| `agent/` | `agent/` |
| `deploy/Dockerfile` | `deploy/Dockerfile` |
| `deploy/docker-compose.yml` | `deploy/docker-compose.yml` |
| `deploy/nginx.conf` | `deploy/nginx.conf` |
| `dist/index.html`, `dist/app.js` | `dist/index.html`, `dist/app.js` |
| `dist/agent.js`, `dist/agent.css` | `dist/agent.js`, `dist/agent.css` |
| `.env.example` | `.env.example` |

Agregá `.env` a `.gitignore` y crealo en la raíz del repositorio con:

```dotenv
GOOGLE_API_KEY=tu_clave_real
GOOGLE_GENAI_USE_VERTEXAI=FALSE
MODEL_NAME=gemini-flash-latest
```

No publiques ni compartas la clave. El servicio `catalog-agent` recibe el
valor desde Docker Compose; el JavaScript solo llama a `/agent/` en el mismo
origen del tablero.

## Arranque local

Desde la raíz del repositorio:

```powershell
Copy-Item .env.example .env
# Editá .env y pegá la clave real.
docker compose -f deploy/docker-compose.yml up --build -d
docker compose -f deploy/docker-compose.yml logs -f catalog-agent
```

Abrí `http://localhost:8080` y usá el botón **Preguntale al catálogo**.

Para comprobar que ADK descubrió el agente:

```powershell
Invoke-RestMethod http://localhost:8080/agent/list-apps
```

La salida debería incluir `catalog_agent`.

## Seguridad y alcance de esta primera versión

- La clave no queda dentro de la imagen, en Git ni en el navegador.
- El catálogo se copia en la imagen del agente durante el build. Al cambiar
  `dist/catalog.json`, ejecutá nuevamente `docker compose ... up --build -d`.
- Las sesiones son de memoria y se pierden si se reinicia `catalog-agent`.
- No hay autenticación ni límite de solicitudes. Para publicar fuera de una
  red local, agregá autenticación delante de `/agent/` y rate limiting.

## Estructura de archivos

microstrategy-metadata-dashboard/
├── agent/
│   ├── Dockerfile                 # Construye la imagen de MetrIA
│   └── catalog_agent/             # Código Python del agente
│
├── deploy/
│   ├── Dockerfile                 # Construye la imagen del dashboard Nginx
│   ├── docker-compose.yml         # Levanta dashboard + MetrIA localmente
│   ├── nginx.conf                 # Configura Nginx y el proxy hacia MetrIA
│   └── kubernetes/                # Manifiestos para despliegue corporativo
│
└── dist/                          # Archivos estáticos del dashboard