#!/bin/bash

kubectl delete -f vpc-lattice-http-route.yaml
rm vpc-lattice-http-route.yaml

kubectl delete -f vpc-lattice-gateway.yaml
rm vpc-lattice-gateway.yaml

kubectl delete -f vpc-lattice-gateway-class.yaml
rm vpc-lattice-gateway-class.yaml

helm uninstall gateway-api-controller -n aws-application-networking-system

kubectl delete -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.3.0/standard-install.yaml

SERVICE_NETWORK_ID=$(aws vpc-lattice list-service-networks --query "items[?name=="\'${AWS_EKS_CLUSTER}-network\'"].id" | jq -r '.[]')
aws vpc-lattice list-service-network-vpc-associations --service-network-identifier $SERVICE_NETWORK_ID \
    | jq -r '.items[] | .id' \
    | xargs -I{} aws vpc-lattice delete-service-network-vpc-association --service-network-vpc-association-identifier {}

sleep 60

aws vpc-lattice delete-service-network --service-network-identifier $SERVICE_NETWORK_ID

aws eks list-pod-identity-associations --cluster-name $AWS_EKS_CLUSTER \
    | jq -r '.associations[] | select(.serviceAccount == "gateway-api-controller") | .associationId' \
    | xargs -I{} aws eks delete-pod-identity-association --association-id {} --cluster-name ${AWS_EKS_CLUSTER}

aws iam detach-role-policy --role-name "${AWS_EKS_CLUSTER}-gateway-api-controller-${AWS_REGION}" --policy-arn="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/${AWS_EKS_CLUSTER}-gateway-api-controller-${AWS_REGION}"
aws iam delete-role --role-name "${AWS_EKS_CLUSTER}-gateway-api-controller-${AWS_REGION}"

rm eks-pod-identity-trust-relationship.json

kubectl delete -f gateway-api-controller-service-account.yaml
rm gateway-api-controller-service-account.yaml

sleep 10

aws iam delete-policy --policy-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:policy/${AWS_EKS_CLUSTER}-gateway-api-controller-${AWS_REGION}"
rm gateway-api-controller-iam-policy.json

kubectl delete -f gateway-api-controller-namespace.yaml
rm gateway-api-controller-namespace.yaml

CLUSTER_SG=$(aws eks describe-cluster --name $AWS_EKS_CLUSTER --output json| jq -r '.cluster.resourcesVpcConfig.clusterSecurityGroupId')
PREFIX_LIST_ID=$(aws ec2 describe-managed-prefix-lists --query "PrefixLists[?PrefixListName=="\'com.amazonaws.$AWS_REGION.vpc-lattice\'"].PrefixListId" | jq -r '.[]')
aws ec2 revoke-security-group-ingress --group-id $CLUSTER_SG --ip-permissions "PrefixListIds=[{PrefixListId=${PREFIX_LIST_ID}}],IpProtocol=-1"
PREFIX_LIST_ID_IPV6=$(aws ec2 describe-managed-prefix-lists --query "PrefixLists[?PrefixListName=="\'com.amazonaws.$AWS_REGION.ipv6.vpc-lattice\'"].PrefixListId" | jq -r '.[]')
aws ec2 revoke-security-group-ingress --group-id $CLUSTER_SG --ip-permissions "PrefixListIds=[{PrefixListId=${PREFIX_LIST_ID_IPV6}}],IpProtocol=-1"