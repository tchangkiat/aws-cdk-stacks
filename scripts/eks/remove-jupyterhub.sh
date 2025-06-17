#!/bin/bash

helm uninstall jupyter --namespace jupyter

kubectl delete ns jupyter

helm repo remove jupyterhub

rm jupyterhub-config.yaml

kubectl delete -f jupyterhub-node-pool.yaml
rm jupyterhub-node-pool.yaml