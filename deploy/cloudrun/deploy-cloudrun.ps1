# Publica las dos imágenes en Artifact Registry y despliega el servicio Cloud Run.
# Requiere: gcloud autenticado, Docker Desktop iniciado y el Secret ya creado.

$ErrorActionPreference = "Stop"

$projectId = "big-data-movistar"
$region = "southamerica-east1"
$repository = "metria"
$serviceName = "metria-dashboard"
$serviceAccountName = "metria-cloudrun"
$serviceAccountEmail = "$serviceAccountName@$projectId.iam.gserviceaccount.com"
$tag = (git rev-parse --short HEAD).Trim()
$registry = "$region-docker.pkg.dev/$projectId/$repository"
$dashboardImage = "$registry/dashboard:$tag"
$agentImage = "$registry/catalog-agent:$tag"

gcloud config set project $projectId | Out-Null

# Crear el repositorio solo si todavía no existe.
$existingRepository = gcloud artifacts repositories describe $repository --location $region --format="value(name)" 2>$null
if (-not $existingRepository) {
    gcloud artifacts repositories create $repository `
        --repository-format=docker `
        --location=$region `
        --description="Imágenes del dashboard MetrIA"
}

# Crear la identidad de ejecución solo si todavía no existe.
$existingServiceAccount = gcloud iam service-accounts describe $serviceAccountEmail --format="value(email)" 2>$null
if (-not $existingServiceAccount) {
    gcloud iam service-accounts create $serviceAccountName `
        --display-name="MetrIA Cloud Run"
}

# La identidad necesita leer la clave en Secret Manager durante el arranque.
gcloud secrets add-iam-policy-binding metria-google-api `
    --member="serviceAccount:$serviceAccountEmail" `
    --role="roles/secretmanager.secretAccessor" | Out-Null

gcloud auth configure-docker "$region-docker.pkg.dev" --quiet

docker build -f deploy/cloudrun/Dockerfile -t $dashboardImage .
docker build -f agent/Dockerfile -t $agentImage .

docker push $dashboardImage
docker push $agentImage

# Renderiza los valores del despliegue sin modificar la plantilla versionada.
$template = Get-Content deploy/cloudrun/service.template.yaml -Raw
$rendered = $template.Replace("DASHBOARD_IMAGE", $dashboardImage).Replace("AGENT_IMAGE", $agentImage).Replace("SERVICE_ACCOUNT_EMAIL", $serviceAccountEmail)
$renderedPath = "deploy/cloudrun/service.rendered.yaml"
[System.IO.File]::WriteAllText((Join-Path (Get-Location) $renderedPath), $rendered, [System.Text.UTF8Encoding]::new($false))

gcloud run services replace $renderedPath --region $region

# Expone únicamente el servicio Nginx; el agente continúa detrás del proxy.
gcloud run services add-iam-policy-binding $serviceName `
    --region $region `
    --member="allUsers" `
    --role="roles/run.invoker" | Out-Null

$serviceUrl = gcloud run services describe $serviceName --region $region --format="value(status.url)"
Write-Host "`nServicio publicado: $serviceUrl" -ForegroundColor Green
