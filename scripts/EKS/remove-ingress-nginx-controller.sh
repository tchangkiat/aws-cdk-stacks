#!/bin/bash

kubectl delete -f ingress-nginx/letsencrypt-production.yaml

kubectl delete -f ingress-nginx/letsencrypt-staging.yaml

rm -r ingress-nginx

helm uninstall cert-manager --namespace cert-manager
helm repo remove jetstack

# helm uninstall ingress-nginx
kubectl delete -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.9.5/deploy/static/provider/aws/deploy.yaml
