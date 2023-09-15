#!/bin/bash

helm uninstall jupyter --namespace jupyter

kubectl delete ns jupyter

helm repo remove jupyterhub

rm jupyterhub-config.yaml

kubectl delete -f jupyterhub-on-demand.yaml
rm jupyterhub-on-demand.yaml