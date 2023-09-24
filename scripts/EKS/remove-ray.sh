#!/bin/bash

kubectl delete -f ray-cluster-config.yaml

helm uninstall kuberay-operator

helm repo remove kuberay

rm ray-cluster-config.yaml

kubectl delete -f ray-worker-provisioner.yaml
rm ray-worker-provisioner.yaml
kubectl delete -f ray-head-provisioner.yaml
rm ray-head-provisioner.yaml