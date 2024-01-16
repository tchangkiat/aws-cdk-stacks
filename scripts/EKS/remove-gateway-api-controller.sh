#!/bin/bash

kubectl delete -f gatewayclass.yaml
rm gatewayclass.yaml

kubectl delete -f https://raw.githubusercontent.com/aws/aws-application-networking-k8s/main/examples/deploy-v1.0.2.yaml

eksctl delete iamserviceaccount \
--cluster=$AWS_EKS_CLUSTER \
--name="gateway-api-controller" \
--namespace=aws-application-networking-system

kubectl delete -f gateway-api-controller-namespace.yaml
rm gateway-api-controller-namespace.yaml

aws iam delete-policy --policy-arn "arn:aws:iam::$AWS_ACCOUNT_ID:policy/${AWS_EKS_CLUSTER}-GatewayApiControllerPolicy"
rm gateway-api-controller-iam-policy.json
