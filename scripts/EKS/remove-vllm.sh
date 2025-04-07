kubectl delete -f vllm-pvc-secret.yaml
rm vllm-pvc-secret.yaml

kubectl delete -f vllm-node-pool.yaml
rm vllm-node-pool.yaml

kubectl delete -f vllm-node-class.yaml
rm vllm-node-class.yaml