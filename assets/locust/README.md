# Locust

1. Deploy Locust master pod

```bash
kubectl apply -f nodeport.yaml -f scripts-cm.yaml -f master-deployment.yaml -f service.yaml -f slave-deployment.yaml
```

2. Deploy Locust worker pods

```bash
kubectl delete -f nodeport.yaml -f scripts-cm.yaml -f master-deployment.yaml -f service.yaml -f slave-deployment.yaml
```

3. Port-forward to access Locust web UI via https://localhost:8089

```bash
kubectl port-forward service/locust-service 8089:8089
```
