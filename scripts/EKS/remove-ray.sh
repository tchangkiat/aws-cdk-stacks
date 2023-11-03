#!/bin/bash

kubectl delete -f ray-cluster-config.yaml

helm uninstall kuberay-operator

helm repo remove kuberay

rm ray-cluster-config.yaml

kubectl delete -f ray-worker-node-pool.yaml
rm ray-worker-node-pool.yaml
kubectl delete -f ray-head-node-pool.yaml
rm ray-head-node-pool.yaml