#!/bin/bash

helm uninstall grafana -n grafana

kubectl delete ns grafana

helm uninstall prometheus -n prometheus

kubectl delete ns prometheus

helm repo remove kube-state-metrics prometheus-community grafana

rm grafana.yaml