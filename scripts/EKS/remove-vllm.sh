kubectl delete -f llm-gvt-deployment-service.yaml
rm llm-gvt-deployment-service.yaml

kubectl delete -f llm-gvt-pvc-secret.yaml
rm llm-gvt-pvc-secret.yaml

kubectl delete -f llm-gvt-node-pool.yaml
rm llm-gvt-node-pool.yaml

kubectl delete -f llm-gvt-node-class.yaml
rm llm-gvt-node-class.yaml