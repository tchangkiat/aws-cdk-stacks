#!/bin/bash

kubectl delete -f ray-cluster-gvt-config.yaml
rm ray-cluster-gvt-config.yaml

kubectl delete -f ray-cluster-gpu-config.yaml
rm ray-cluster-gpu-config.yaml

kubectl delete -f ray-cluster-cpu-config.yaml
rm ray-cluster-cpu-config.yaml

helm uninstall kuberay-operator

helm repo remove kuberay

kubectl delete -f ray-worker-gpu-node-pool.yaml
rm ray-worker-gpu-node-pool.yaml

kubectl delete -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.16.2/deployments/static/nvidia-device-plugin.yml

kubectl delete -f ray-cpu-node-pool.yaml
rm ray-cpu-node-pool.yaml

kubectl delete -f ray-node-class.yaml
rm ray-node-class.yaml