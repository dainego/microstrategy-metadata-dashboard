FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY agent/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# El directorio de agentes determina el appName: catalog_agent.
COPY agent/catalog_agent /app/agents/catalog_agent

# El agente lee su propia copia de la metadata; la clave no se copia a la imagen.
COPY dist/catalog.json /app/catalog/catalog.json

EXPOSE 8000

CMD ["adk", "api_server", "--host=0.0.0.0", "--port=8000", "--session_service_uri=memory://", "--allow_origins=http://localhost:8080,http://127.0.0.1:8080", "/app/agents"]
