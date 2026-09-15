# Autenticar a GCP
gcloud --version
gcloud auth login
gcloud projects list

# Seleccionar Proyecto
gcloud config set project big-data-movistar
gcloud config get-value project

# Verificar Proyecto
$projectId = "big-data-movistar"
$region = "southamerica-east1"

gcloud config set project $projectId
gcloud config set run/region $region

gcloud billing projects describe $projectId

# Habilitar Servicios
gcloud services enable `
  run.googleapis.com `
  artifactregistry.googleapis.com `
  secretmanager.googleapis.com `
  cloudbuild.googleapis.com

  gcloud config list

  # Crear Secret en GCP
  Google Cloud Console
    → Security
    → Secret Manager
    → Create secret

    Name: metria-google-api
    Secret value: tu GOOGLE_API_KEY real
    Replication: Automatic

# Agregar fila a .gitignore
deploy/cloudrun/service.rendered.yaml

# Push del codigo
git add deploy/cloudrun .gitignore
git commit -m "Agrega despliegue público en Cloud Run"
git push origin cloud-run

# Creamos los recursos iniciales manualmente una sola vez.
## Repo
gcloud artifacts repositories create metria `
  --repository-format=docker `
  --location=southamerica-east1 `
  --description="Imagenes del dashboard MetrIA"

## Cuenta de Servicio de Cloud Run
gcloud iam service-accounts create metria-cloudrun `
  --display-name="MetrIA Cloud Run"

# Permitir que Cloud Build publique imágenes en Artifact Registry
$projectNumber = gcloud projects describe big-data-movistar --format="value(projectNumber)"

gcloud projects add-iam-policy-binding big-data-movistar `
  --member="serviceAccount:$projectNumber@cloudbuild.gserviceaccount.com" `
  --role="roles/artifactregistry.writer"

# Deploy
.\deploy\cloudrun\deploy-cloudrun.ps1
  * Cloud Build construye ambas imágenes
  * Artifact Registry las almacena
  * Despliega un único servicio público de Cloud Run.
  * Muestra la URL pública HTTPS al terminar.