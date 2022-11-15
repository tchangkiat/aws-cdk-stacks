#!/bin/bash

helm uninstall daskhub
helm repo remove dask

kubectl delete -f daskhub-spot-provisioner.yaml
kubectl delete -f daskhub-on-demand-provisioner.yaml

rm daskhub-spot-provisioner.yaml
rm daskhub-on-demand-provisioner.yaml
rm daskhub.yaml