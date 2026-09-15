# Despliegue local con GHCR, Argo CD y Kubernetes

Esta guía permite desplegar el dashboard de metadata y el agente MetrIA en un clúster Kubernetes local de Docker Desktop, usando GitHub Actions para construir las imágenes y Argo CD para sincronizar los manifiestos.

## 0. Prerrequisitos

* Docker Desktop iniciado.
* Kubernetes habilitado en Docker Desktop.
* `kubectl` instalado y configurado.
* Repositorio público: `https://github.com/dainego/microstrategy-metadata-dashboard`
* Argo CD CLI es opcional; la instalación se realiza con `kubectl`.

Verificar el contexto y estado del clúster:

```powershell
kubectl config use-context docker-desktop
kubectl get nodes
```

El nodo debe figurar con estado `Ready`.

## 1. Verificar Docker Compose localmente

Antes de publicar imágenes, verificar que ambas construyan correctamente:

```powershell
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d
```

El dashboard local queda disponible en:

```text
http://localhost:8080
```

Luego se puede detener la prueba local:

```powershell
docker compose -f deploy/docker-compose.yml down
```

## 2. Configurar GitHub Actions y GHCR

En GitHub, habilitar permisos de escritura para el workflow:

```text
Repository → Settings → Actions → General
Workflow permissions → Read and write permissions
Save
```

Confirmar que el workflow exista en esta ubicación:

```text
.github/workflows/publish-images.yml
```

Subir los cambios al repositorio:

```powershell
git status
git add .github deploy agent dist
git commit -m "Agrega despliegue GitOps con GHCR y Argo CD"
git push origin main
```

En GitHub, ingresar a la pestaña **Actions** y ejecutar o verificar el workflow:

```text
Build and publish dashboard images
```

El workflow realiza las siguientes acciones:

1. Construye la imagen Docker del dashboard.
2. Construye la imagen Docker de MetrIA.
3. Publica ambas imágenes en GitHub Container Registry.
4. Asigna un tag inmutable basado en el identificador del commit.
5. Actualiza `deploy/kubernetes/kustomization.yaml` con esas versiones.
6. Hace un commit automático para que Argo CD detecte la nueva versión.

Las imágenes publicadas son:

```text
ghcr.io/dainego/microstrategy-metadata-dashboard-dashboard
ghcr.io/dainego/microstrategy-metadata-dashboard-agent
```

Luego de la primera ejecución, ingresar a GitHub → perfil → **Packages** y configurar ambos paquetes como **Public** para permitir que el Kubernetes local descargue las imágenes sin credenciales adicionales.

## 3. Crear el namespace de la aplicación

```powershell
kubectl create namespace metadata-dashboard --dry-run=client -o yaml | kubectl apply -f -
```

## 4. Instalar Argo CD

Crear el namespace de Argo CD:

```powershell
kubectl create namespace argocd
```

Instalar Argo CD:

```powershell
kubectl apply -n argocd --server-side --force-conflicts -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

Esperar hasta que sus componentes estén iniciados:

```powershell
kubectl get pods -n argocd -w
```

Cuando todos los pods estén `Running`, finalizar la espera con `Ctrl + C`.

### Acceder a la interfaz web de Argo CD

Mantener este comando ejecutándose en una terminal:

```powershell
kubectl port-forward svc/argocd-server -n argocd 8081:443
```

Abrir:

```text
https://localhost:8081
```

Usuario inicial:

```text
admin
```

Obtener la contraseña inicial:

```powershell
$encodedPassword = kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}"
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encodedPassword))
```

## 5. Crear el Secret de Gemini

La clave no debe incluirse en archivos YAML, imágenes Docker, commits ni archivos `.env` subidos a Git.

Ejecutar el siguiente bloque. Al aparecer el prompt, pegar la clave real de Gemini y presionar `Enter`; la clave no se mostrará en pantalla:

```powershell
$geminiKey = Read-Host "Pegá GOOGLE_API_KEY y presioná Enter" -AsSecureString
$plainKey = [System.Net.NetworkCredential]::new("", $geminiKey).Password

if ($plainKey.Length -eq 0) {
    throw "La clave quedó vacía. Volvé a ejecutar el bloque e ingresala en el prompt."
}

kubectl -n metadata-dashboard create secret generic metria-google-api `
  --from-literal=GOOGLE_API_KEY="$plainKey" `
  --dry-run=client -o yaml | kubectl apply -f -

Remove-Variable geminiKey, plainKey
```

Verificar que el Secret exista sin mostrar su contenido:

```powershell
kubectl describe secret metria-google-api -n metadata-dashboard
```

La salida debe indicar que `GOOGLE_API_KEY` tiene una cantidad de bytes mayor que cero.

## 6. Registrar el dashboard y MetrIA en Argo CD

Crear la aplicación GitOps:

```powershell
kubectl apply -f deploy/argocd/microstrategy-metadata-dashboard.yaml
```

Argo CD leerá el repositorio GitHub, la rama `main` y la carpeta:

```text
deploy/kubernetes/
```

Luego sincronizará:

* El Deployment y Service del dashboard.
* El Deployment y Service de MetrIA.
* La configuración de variables de entorno del agente.
* La referencia al Secret `metria-google-api`.

## 7. Verificar el despliegue

Consultar el estado de la aplicación:

```powershell
kubectl get applications -n argocd
kubectl get application microstrategy-metadata-dashboard -n argocd
```

Consultar los pods:

```powershell
kubectl get pods -n metadata-dashboard
```

Se espera ver pods similares a:

```text
microstrategy-metadata-dashboard-...
catalog-agent-...
```

Ambos deben quedar en estado `Running`.

En caso de error:

```powershell
kubectl describe application microstrategy-metadata-dashboard -n argocd
kubectl get events -n metadata-dashboard --sort-by=.metadata.creationTimestamp
kubectl logs -n metadata-dashboard deployment/catalog-agent --tail=50
```

## 8. Probar el dashboard desplegado en Kubernetes

Mantener este comando ejecutándose en una terminal:

```powershell
kubectl port-forward -n metadata-dashboard svc/microstrategy-metadata-dashboard 8082:80
```

Abrir:

```text
http://localhost:8082
```

El puerto `8082` evita conflictos con el dashboard iniciado mediante Docker Compose en el puerto `8080`.

## 9. Flujo de actualización continua

El flujo completo queda así:

```text
Cambio en dist/, agent/ o Dockerfile
  → Push a main
  → GitHub Actions construye imágenes y las publica en GHCR
  → GitHub Actions actualiza el tag inmutable en Kustomize
  → Argo CD detecta el commit
  → Kubernetes actualiza dashboard y MetrIA
```

No es necesario ejecutar manualmente `kubectl apply` en cada actualización del código; Argo CD realiza la sincronización automáticamente.

## Consideraciones

* El archivo `HTTPRoute` no se utiliza en la prueba local porque requiere un Gateway API y un hostname reales. Para acceder localmente se utiliza `kubectl port-forward`.
* Si se apaga la PC, no es necesario detener el clúster manualmente. Docker Desktop y Kubernetes se reanudarán al volver a iniciar Windows.
* Luego de reiniciar la PC, será necesario volver a ejecutar el comando `kubectl port-forward` para acceder al dashboard.
* Si se usa **Reset Kubernetes Cluster** en Docker Desktop, se eliminan Argo CD, namespaces, Secrets y recursos locales; el código GitHub y las imágenes GHCR permanecen disponibles.
