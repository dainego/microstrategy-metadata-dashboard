gcloud logging read `
  'resource.type="cloud_run_revision" AND resource.labels.service_name="metria-dashboard"' `
  --project=big-data-movistar `
  --limit=50 `
  --order=desc `
  --format="table(timestamp,labels.container_name,severity,textPayload)"