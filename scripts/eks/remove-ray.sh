#!/bin/bash

kubectl delete -f ray-cluster-gvt-config.yaml
rm ray-cluster-gvt-config.yaml

kubectl delete -f ray-cluster-gpu-config.yaml
rm ray-cluster-gpu-config.yaml

kubectl delete -f ray-cluster-x86-config.yaml
rm ray-cluster-x86-config.yaml

helm uninstall kuberay-operator

helm repo remove kuberay