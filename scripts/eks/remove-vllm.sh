kubectl delete -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.18.0/deployments/static/nvidia-device-plugin.yml

kubectl delete -f vllm-secret.yaml
rm vllm-secret.yaml