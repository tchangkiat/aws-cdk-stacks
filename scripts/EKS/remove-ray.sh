#!/bin/bash

kubectl delete -f ray-cluster-gpu-config.yaml
rm ray-cluster-gpu-config.yaml

kubectl delete -f ray-worker-gpu-node-pool.yaml
rm ray-worker-gpu-node-pool.yaml

kubectl delete -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.16.2/deployments/static/nvidia-device-plugin.yml

kubectl delete -f ray-cluster-config.yaml
rm ray-cluster-config.yaml

helm uninstall kuberay-operator

helm repo remove kuberay

kubectl delete -f ray-worker-node-pool.yaml
rm ray-worker-node-pool.yaml
kubectl delete -f ray-head-node-pool.yaml
rm ray-head-node-pool.yaml