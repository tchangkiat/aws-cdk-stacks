#!/bin/bash

PREFIX_LIST_ID=$(aws ec2 describe-managed-prefix-lists --query "PrefixLists[?PrefixListName=="\'com.amazonaws.$AWS_REGION.vpc-lattice\'"].PrefixListId" | jq -r '.[]')
MANAGED_PREFIX=$(aws ec2 get-managed-prefix-list-entries --prefix-list-id $PREFIX_LIST_ID --output json  | jq -r '.Entries[0].Cidr')
CLUSTER_SG=$(aws eks describe-cluster --name $AWS_EKS_CLUSTER --output json| jq -r '.cluster.resourcesVpcConfig.clusterSecurityGroupId')
aws ec2 authorize-security-group-ingress --group-id $CLUSTER_SG --cidr $MANAGED_PREFIX --protocol -1

curl -o gateway-api-controller-iam-policy.json https://raw.githubusercontent.com/aws/aws-application-networking-k8s/main/examples/recommended-inline-policy.json

aws iam create-policy \
   --policy-name "${AWS_EKS_CLUSTER}-GatewayApiControllerPolicy" \
   --policy-document file://gateway-api-controller-iam-policy.json

curl -o gateway-api-controller-namespace.yaml https://raw.githubusercontent.com/aws/aws-application-networking-k8s/main/examples/deploy-namesystem.yaml

kubectl apply -f gateway-api-controller-namespace.yaml

eksctl utils associate-iam-oidc-provider --region=$AWS_REGION --cluster=$AWS_EKS_CLUSTER --approve

eksctl create iamserviceaccount \
   --cluster=$AWS_EKS_CLUSTER \
   --namespace=aws-application-networking-system \
   --name="gateway-api-controller" \
   --attach-policy-arn="arn:aws:iam::$AWS_ACCOUNT_ID:policy/${AWS_EKS_CLUSTER}-GatewayApiControllerPolicy" \
   --override-existing-serviceaccounts \
   --region $AWS_REGION \
   --approve

aws ecr-public get-login-password --region us-east-1 | helm registry login --username AWS --password-stdin public.ecr.aws

kubectl apply -f https://raw.githubusercontent.com/aws/aws-application-networking-k8s/main/examples/deploy-v1.0.2.yaml

curl -o gatewayclass.yaml https://raw.githubusercontent.com/aws/aws-application-networking-k8s/main/examples/gatewayclass.yaml

kubectl apply -f gatewayclass.yaml
