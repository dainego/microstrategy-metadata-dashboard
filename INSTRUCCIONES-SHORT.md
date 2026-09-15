# Estructura de despliegue 
agent/
├── Dockerfile                 # Imagen de MetrIA
├── requirements.txt
└── catalog_agent/             # Código Python del agente

deploy/
├── Dockerfile                 # Imagen del dashboard con Nginx
├── docker-compose.yml         # Ejecución local: dashboard + agente
├── nginx.conf                 # Nginx entrega el tablero y deriva /agent
├── kubernetes/                # Deployments, Services y Kustomize
└── argocd/                    # Application que le indica a Argo qué sincronizar

# 1 Crear Namespace
kubectl create namespace metadata-dashboard --dry-run=client -o yaml | kubectl apply -f -

# 2 Instalar ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd --server-side --force-conflicts -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl get pods -n argocd -w

## Para ver interfaz web
    Dejar este comando ejecutando en una terminal
    kubectl port-forward svc/argocd-server -n argocd 8081:443
    URL: https://localhost:8081

    Para ver la password:
    $encodedPassword = kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}"
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encodedPassword))

# 3 Crear Secret
$geminiKey = Read-Host "Pegá GOOGLE_API_KEY y presioná Enter" -AsSecureString
$plainKey = [System.Net.NetworkCredential]::new("", $geminiKey).Password

kubectl -n metadata-dashboard create secret generic metria-google-api `
  --from-literal=GOOGLE_API_KEY="$plainKey" `
  --dry-run=client -o yaml | kubectl apply -f -

Remove-Variable geminiKey, plainKey

## Verificacion
    $encodedKey = kubectl -n metadata-dashboard get secret metria-google-api -o jsonpath="{.data.GOOGLE_API_KEY}"

# 4 Registrar el dashboard y MetrIA en Argo CD:
kubectl apply -f deploy/argocd/microstrategy-metadata-dashboard.yaml

## Verificacion
    kubectl get applications -n argocd
    kubectl get pods -n metadata-dashboard

## Estado de la sync
    kubectl get application microstrategy-metadata-dashboard -n argocd

# 5 Prueba del dashboard
kubectl port-forward -n metadata-dashboard svc/microstrategy-metadata-dashboard 8082:80

URL: http://localhost:8082

## Verificar que MetrIA inició correctamente
kubectl logs -n metadata-dashboard deployment/catalog-agent --tail=50