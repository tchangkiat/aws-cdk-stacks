#!/bin/bash

helm uninstall daskhub
helm repo remove dask

kubectl delete -f daskhub-spot-node-pool.yaml
kubectl delete -f daskhub-on-demand-node-pool.yaml

rm daskhub-spot-node-pool.yaml
rm daskhub-on-demand-node-pool.yaml
rm daskhub.yaml