#!/bin/bash

eksctl utils associate-iam-oidc-provider --region=$AWS_REGION --cluster=$AWS_EKS_CLUSTER --approve

kubectl create namespace appmesh-system

helm repo add eks https://aws.github.io/eks-charts

kubectl apply -k "https://github.com/aws/eks-charts/stable/appmesh-controller/crds?ref=master"

eksctl create iamserviceaccount --namespace appmesh-system --name appmesh-controller --attach-policy-arn arn:aws:iam::aws:policy/AWSCloudMapFullAccess,arn:aws:iam::aws:policy/AWSAppMeshFullAccess,arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess --cluster $AWS_EKS_CLUSTER --approve

helm upgrade -i appmesh-controller eks/appmesh-controller --namespace appmesh-system --set region=$AWS_REGION --set serviceAccount.create=false --set serviceAccount.name=appmesh-controller