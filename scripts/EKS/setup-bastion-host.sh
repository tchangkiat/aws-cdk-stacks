#!/bin/bash

aws configure set region $AWS_REGION
aws configure set output json

aws eks update-kubeconfig --name $AWS_EKS_CLUSTER --region $AWS_REGION --role-arn $AWS_EKS_CLUSTER_MASTER_ROLE

# Add ARN of the caller identity (AWS CLI) to configmap/aws-auth so that there will not be any error executing commands like `eksctl create iamserviceaccount`

export AWS_IAM_USER_ARN=`aws sts get-caller-identity --query Arn --output text`

export AWS_AUTH_MAP_USERS="mapUsers: '[{\"userarn\":\"$AWS_IAM_USER_ARN\",\"username\":\"admin\",\"groups\":[\"system:masters\"]}]'"

kubectl get -n kube-system configmap/aws-auth -o yaml > aws-auth.yml

sed "s|mapUsers: '\[\]'|$AWS_AUTH_MAP_USERS|g" aws-auth.yml > aws-auth-patched.yml

kubectl apply -f aws-auth-patched.yml

rm aws-auth.yml
rm aws-auth-patched.yml

eksctl create iamidentitymapping --cluster $AWS_EKS_CLUSTER --region=$AWS_REGION --arn arn:aws:iam::$AWS_ACCOUNT_ID:role/admin --group system:masters --username admin
