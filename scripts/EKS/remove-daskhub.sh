#!/bin/bash

helm uninstall daskhub
helm repo remove dask

kubectl delete -f spot-provisioner-daskhub.yaml
kubectl delete -f on-demand-provisioner-daskhub.yaml

rm spot-provisioner-daskhub.yaml
rm on-demand-provisioner-daskhub.yaml
rm daskhub.yaml