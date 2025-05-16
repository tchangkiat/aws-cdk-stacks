kubectl delete -f vllm-secret.yaml
rm vllm-secret.yaml

kubectl delete -f vllm-node-pool.yaml
rm vllm-node-pool.yaml

kubectl delete -f vllm-node-class.yaml
rm vllm-node-class.yaml