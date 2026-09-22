# Gestión de la Auth Key de Gemini

Se utiliza una API KEY vinculada a una SERVICE ACCOUNT que en GCP
se llama AUTHORIZATION KEY.

Cloud Run
   │
   ▼
Service Account: metria-cloudrun
   │
   ├── Secret Manager
   │       │
   │       ▼
   │   metria-google-api
   │       │
   │       ▼
   │   GOOGLE_API_KEY
   │
   ▼
catalog-agent
   │
   ▼
Gemini API

## Provisión de la Auth Key

## Cuenta de Servicio de Cloud Run
gcloud iam service-accounts create metria-cloudrun `
  --display-name="MetrIA Cloud Run"

## Creación de la Key
gcloud auth login

gcloud auth list

gcloud config set project big-data-movistar

gcloud config get-value project

gcloud beta services api-keys create `
  --display-name="MetrIA Gemini Authorization Key" `
  --api-target=service=generativelanguage.googleapis.com `
  --service-account="metria-cloudrun@big-data-movistar.iam.gserviceaccount.com"

"TU_AUTHORIZATION_KEY" | gcloud secrets versions add metria-google-api `
  --project="big-data-movistar" `
  --data-file=-

  ### Comprobación
  gcloud secrets get-iam-policy metria-google-api `
  --project="big-data-movistar"

  Debe aparecer:
  serviceAccount:metria-cloudrun@big-data-movistar.iam.gserviceaccount.com
  con:
  roles/secretmanager.secretAccessor