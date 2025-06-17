#!/bin/bash

LATTICE_CONTROLLER_VERSION=1.1.2
GATEWAY_API_VERSION=1.3.0

CLUSTER_VPC_ID=$(aws eks describe-cluster --name $AWS_EKS_CLUSTER --output json| jq -r '.cluster.resourcesVpcConfig.vpcId')

# Add rules to cluster security group
CLUSTER_SG=$(aws eks describe-cluster --name $AWS_EKS_CLUSTER --output json| jq -r '.cluster.resourcesVpcConfig.clusterSecurityGroupId')
PREFIX_LIST_ID=$(aws ec2 describe-managed-prefix-lists --query "PrefixLists[?PrefixListName=="\'com.amazonaws.$AWS_REGION.vpc-lattice\'"].PrefixListId" | jq -r '.[]')
aws ec2 authorize-security-group-ingress --group-id $CLUSTER_SG --ip-permissions "PrefixListIds=[{PrefixListId=${PREFIX_LIST_ID}}],IpProtocol=-1"
PREFIX_LIST_ID_IPV6=$(aws ec2 describe-managed-prefix-lists --query "PrefixLists[?PrefixListName=="\'com.amazonaws.$AWS_REGION.ipv6.vpc-lattice\'"].PrefixListId" | jq -r '.[]')
aws ec2 authorize-security-group-ingress --group-id $CLUSTER_SG --ip-permissions "PrefixListIds=[{PrefixListId=${PREFIX_LIST_ID_IPV6}}],IpProtocol=-1"

# Create namespace
curl -o gateway-api-controller-namespace.yaml https://raw.githubusercontent.com/aws/aws-application-networking-k8s/refs/heads/main/files/controller-installation/deploy-namesystem.yaml
kubectl apply -f gateway-api-controller-namespace.yaml

# Create IAM policy
curl -o gateway-api-controller-iam-policy.json https://raw.githubusercontent.com/aws/aws-application-networking-k8s/refs/heads/main/files/controller-installation/recommended-inline-policy.json
aws iam create-policy \
   --policy-name "${AWS_EKS_CLUSTER}-${AWS_REGION}-gateway-api-controller" \
   --policy-document file://gateway-api-controller-iam-policy.json

# Create Kubernetes service account
cat >gateway-api-controller-service-account.yaml <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
    name: gateway-api-controller
    namespace: aws-application-networking-system
EOF
kubectl apply -f gateway-api-controller-service-account.yaml

# Create IAM role
cat > eks-pod-identity-trust-relationship.json <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowEksAuthToAssumeRoleForPodIdentity",
            "Effect": "Allow",
            "Principal": {
                "Service": "pods.eks.amazonaws.com"
            },
            "Action": [
                "sts:AssumeRole",
                "sts:TagSession"
            ]
        }
    ]
}
EOF
aws iam create-role --role-name "${AWS_EKS_CLUSTER}-${AWS_REGION}-gateway-api-controller" --assume-role-policy-document file://eks-pod-identity-trust-relationship.json --description "For AWS Gateway API Controller for VPC Lattice"
aws iam attach-role-policy --role-name "${AWS_EKS_CLUSTER}-${AWS_REGION}-gateway-api-controller" --policy-arn="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/${AWS_EKS_CLUSTER}-${AWS_REGION}-gateway-api-controller"
export VPCLatticeControllerIAMRoleArn="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${AWS_EKS_CLUSTER}-${AWS_REGION}-gateway-api-controller"

# Associate IAM role to Kubernetes service account in the EKS cluster
aws eks create-pod-identity-association --cluster-name ${AWS_EKS_CLUSTER} --role-arn ${VPCLatticeControllerIAMRoleArn} --namespace aws-application-networking-system --service-account gateway-api-controller

# Create VPC Lattice service network and associate it with EKS cluster VPC
aws vpc-lattice create-service-network --name "${AWS_EKS_CLUSTER}-network"
SERVICE_NETWORK_ID=$(aws vpc-lattice list-service-networks --query "items[?name=="\'${AWS_EKS_CLUSTER}-network\'"].id" | jq -r '.[]')
aws vpc-lattice create-service-network-vpc-association --service-network-identifier $SERVICE_NETWORK_ID --vpc-identifier $CLUSTER_VPC_ID

sleep 60

# Deploy Kuberntes Gateway API CRDs
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v${GATEWAY_API_VERSION}/standard-install.yaml

# Install Gateway API Controller using Helm
aws ecr-public get-login-password --region us-east-1 | helm registry login --username AWS --password-stdin public.ecr.aws
helm install gateway-api-controller \
    oci://public.ecr.aws/aws-application-networking-k8s/aws-gateway-controller-chart \
    --version=v${LATTICE_CONTROLLER_VERSION} \
    --set=serviceAccount.create=false \
    --namespace aws-application-networking-system \
    --set=log.level=info \
    --set=awsRegion=${AWS_REGION} \
    --set=awsAccountId=${AWS_ACCOUNT_ID} \
    --set=clusterVpcId=${CLUSTER_VPC_ID} \
    --set=clusterName=${AWS_EKS_CLUSTER} \
    --set=defaultServiceNetwork=${AWS_EKS_CLUSTER}-network

# Create Gateway Class
curl -o vpc-lattice-gateway-class.yaml https://raw.githubusercontent.com/aws/aws-application-networking-k8s/refs/heads/main/files/controller-installation/gatewayclass.yaml
kubectl apply -f vpc-lattice-gateway-class.yaml

# Create Gateway
cat <<EOF >>vpc-lattice-gateway.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: ${AWS_EKS_CLUSTER}-network
  namespace: example
spec:
  gatewayClassName: amazon-vpc-lattice
  listeners:
    - name: http
      protocol: HTTP
      port: 80
EOF
kubectl apply -f vpc-lattice-gateway.yaml

# Create HTTP Routes for web-app
cat <<EOF >>vpc-lattice-http-route.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-app
  namespace: example
spec:
  parentRefs:
    - name: ${AWS_EKS_CLUSTER}-network
      sectionName: http
  rules:
    - backendRefs:
        - name: web-app-amd64
          namespace: example
          kind: Service
          port: 8000
          weight: 90
        - name: web-app-arm64
          namespace: example
          kind: Service
          port: 8000
          weight: 10
EOF
kubectl apply -f vpc-lattice-http-route.yaml