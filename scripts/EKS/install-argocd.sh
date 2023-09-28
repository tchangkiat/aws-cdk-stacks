#!/bin/bash

# Setup Argo CD and install Argo CD CLI
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.8.4/manifests/install.yaml
sudo curl -sSL -o /usr/local/bin/argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-arm64
sudo chmod +x /usr/local/bin/argocd

# Expose argocd-server via a load balancer
kubectl patch svc argocd-server -n argocd -p '{"spec": {"type": "LoadBalancer"}}'

echo "Wait 10 seconds for load balancer host name to be created"
sleep 10

# Get the load balancer host name
export ARGOCD_SERVER=`kubectl get svc argocd-server -n argocd -o json | jq --raw-output '.status.loadBalancer.ingress[0].hostname'`

# Get the generated password of the Argo CD API server and use 'admin' and the generated password to login.
export ARGOCD_PWD=`kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d`
argocd login $ARGOCD_SERVER --username admin --password $ARGOCD_PWD --insecure

echo ""
echo "Argo CD URL: http://${ARGOCD_SERVER}"
echo "Argo CD Username: admin"
echo "Argo CD Password: ${ARGOCD_PWD}"
echo ""

# Get the ARN of the EKS cluster and link Argo CD CLI with the cluster using the EKS cluster ARN
export EKS_CLUSTER_ARN=`kubectl config view -o jsonpath='{.current-context}'`
argocd cluster add $EKS_CLUSTER_ARN