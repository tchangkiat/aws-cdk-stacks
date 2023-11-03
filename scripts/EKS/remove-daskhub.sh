#!/bin/bash

helm uninstall daskhub
helm repo remove dask

kubectl delete -f daskhub-spot.yaml
kubectl delete -f daskhub-on-demand.yaml

rm daskhub-spot.yaml
rm daskhub-on-demand.yaml
rm daskhub.yaml