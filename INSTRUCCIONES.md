# Activación de GHCR y Argo CD

1. Copiar estos archivos a las rutas equivalentes del repositorio.
2. Confirmar que `agent/Dockerfile` y `deploy/Dockerfile` construyen correctamente con Docker Compose.
3. En GitHub, habilitar **Settings > Actions > General > Workflow permissions > Read and write permissions**.
4. Hacer commit y push. El workflow publica dos imágenes en GHCR y actualiza el tag inmutable de Kustomize.
5. En GitHub, cambiar la visibilidad de ambos paquetes GHCR a **Public** para el laboratorio local.
6. Crear el secreto sin incluirlo en Git:

```powershell
kubectl create namespace metadata-dashboard
kubectl -n metadata-dashboard create secret generic metria-google-api --from-literal=GOOGLE_API_KEY='TU_CLAVE_REAL'
```

7. Registrar la aplicación GitOps:

```powershell
kubectl apply -f deploy/argocd/microstrategy-metadata-dashboard.yaml
```

8. Consultar el estado:

```powershell
kubectl get application -n argocd
kubectl get pods -n metadata-dashboard
```

9. Para abrir el dashboard localmente:

```powershell
kubectl port-forward -n metadata-dashboard svc/microstrategy-metadata-dashboard 8080:80
```

El `HTTPRoute` existente no se incluye aún: se debe parametrizar con el Gateway, namespace y hostname del entorno corporativo.
