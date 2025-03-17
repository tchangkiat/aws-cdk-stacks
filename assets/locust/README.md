# Locust

## Installation

1. Deploy Locust master pod and worker pods

```bash
kubectl apply -f nodeport.yaml -f scripts-cm.yaml -f master-deployment.yaml -f service.yaml -f slave-deployment.yaml
```

2. Port-forward to access Locust web UI via http://localhost:8089

```bash
kubectl port-forward service/locust-service 8089:8089
```

## Clean Up

3. Remove Locust master pod and worker pods

```bash
kubectl delete -f nodeport.yaml -f scripts-cm.yaml -f master-deployment.yaml -f service.yaml -f slave-deployment.yaml
```
