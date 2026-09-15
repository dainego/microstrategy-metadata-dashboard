# Despliegue público en Cloud Run

Este directorio no reemplaza `deploy/kubernetes/` ni `deploy/argocd/`. Es una
alternativa de despliegue público y de bajo mantenimiento.

## Arquitectura

Cloud Run expone únicamente el contenedor Nginx por HTTPS. El contenedor
`catalog-agent` se ejecuta en el mismo servicio y recibe las solicitudes por
`localhost:8000`; no tiene URL pública independiente.

## Preparación única

1. Ejecutar con el proyecto `big-data-movistar` seleccionado:

```powershell
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com
```

2. Crear el Secret desde la consola de Google Cloud:

```text
Security > Secret Manager > Create secret
Name: metria-google-api
Secret value: la clave real de Gemini
Replication: Automatic
```

La clave no se agrega a Git, Docker ni a los archivos YAML.

## Desplegar

Desde la raíz del repositorio:

```powershell
.\deploy\cloudrun\deploy-cloudrun.ps1
```

El script construye las dos imágenes, las publica en Artifact Registry y crea
una revisión del servicio `metria-dashboard` en Cloud Run. Al final muestra la
URL HTTPS pública.

## Costos y límites iniciales

- El servicio tiene `maxScale: 1` y cero instancias mínimas.
- Con poco tráfico escala a cero cuando no se utiliza.
- La consulta a Gemini tiene consumo separado del cómputo de Cloud Run.
- Configurar un presupuesto y alertas en Google Cloud Billing antes de difundir
  la URL.

## Archivos temporales

`service.rendered.yaml` se genera durante el despliegue y no debe versionarse.
