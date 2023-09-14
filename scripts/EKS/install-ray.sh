#!/bin/bash

helm repo add kuberay https://ray-project.github.io/kuberay-helm/

# Install both CRDs and KubeRay operator v0.6.0.
helm install kuberay-operator kuberay/kuberay-operator --version 0.6.0

# Install a RayCluster custom resource
helm install raycluster kuberay/ray-cluster --version 0.6.0

echo "Sleep for 80 seconds - waiting for Ray pods to start"
sleep 80

echo "Access Ray Dashboard by running this command: 'kubectl port-forward --address 0.0.0.0 svc/raycluster-kuberay-head-svc 8265:8265' and access 'http://localhost:8265' on your client machine."