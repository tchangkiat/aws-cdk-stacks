#!/bin/bash

if [ ! -d ./appmesh ]; then
  mkdir -p ./appmesh;
fi

# Parameters
# $1: application name
# $2: namespace
# $3: container port
# $4: port

cat <<EOF >>appmesh/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: $2
  labels:
    mesh: $2-mesh
    gateway: $1-gateway
    appmesh.k8s.aws/sidecarInjectorWebhook: enabled
EOF

cat <<EOF >>appmesh/mesh.yaml
apiVersion: appmesh.k8s.aws/v1beta2
kind: Mesh
metadata:
    name: $2-mesh
spec:
    egressFilter:
        type: ALLOW_ALL
    namespaceSelector:
        matchLabels:
            mesh: $2-mesh
EOF

cat <<EOF >>appmesh/virtual-node.yaml
apiVersion: appmesh.k8s.aws/v1beta2
kind: VirtualNode
metadata:
  name: $1-virtual-node
  namespace: $2
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: $1
  listeners:
    - portMapping:
        port: $3
        protocol: http
  serviceDiscovery:
    dns:
      hostname: $1.$2.svc.cluster.local
EOF

cat <<EOF >>appmesh/virtual-router.yaml
apiVersion: appmesh.k8s.aws/v1beta2
kind: VirtualRouter
metadata:
  namespace: $2
  name: $1-virtual-router
spec:
  listeners:
    - portMapping:
        port: $4
        protocol: http
  routes:
    - name: $1-virtual-node-route
      httpRoute:
        match:
          prefix: /
        action:
          weightedTargets:
            - virtualNodeRef:
                name: $1-virtual-node
              weight: 1
EOF

cat <<EOF >>appmesh/virtual-service.yaml
apiVersion: appmesh.k8s.aws/v1beta2
kind: VirtualService
metadata:
  name: $1-virtual-service
  namespace: $2
spec:
  awsName: $1.$2.svc.cluster.local
  provider:
    virtualRouter:
      virtualRouterRef:
        name: $1-virtual-router
EOF

cat <<EOF >>appmesh/virtual-gateway.yaml
apiVersion: appmesh.k8s.aws/v1beta2
kind: VirtualGateway
metadata:
  name: $1-virtual-gateway
  namespace: $2
spec:
  namespaceSelector:
    matchLabels:
      gateway: $1-gateway
  podSelector:
    matchLabels:
      app.kubernetes.io/name: $1-gateway
  listeners:
    - portMapping:
        port: 8088
        protocol: http
  logging:
    accessLog:
      file:
        path: /dev/stdout
---
apiVersion: appmesh.k8s.aws/v1beta2
kind: GatewayRoute
metadata:
  name: $1-gateway-route
  namespace: $2
spec:
  httpRoute:
    match:
      prefix: "/"
    action:
      target:
        virtualService:
          virtualServiceRef:
            name: $1-virtual-service
---
apiVersion: v1
kind: Service
metadata:
  name: $1-gateway
  namespace: $2
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
spec:
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 8088
      name: http
  selector:
    app.kubernetes.io/name: $1-gateway
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: $1-gateway
  namespace: $2
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: $1-gateway
  template:
    metadata:
      labels:
        app.kubernetes.io/name: $1-gateway
    spec:
      serviceAccountName: $1
      securityContext:
        fsGroup: 65534
      containers:
        - name: envoy
          image: public.ecr.aws/appmesh/aws-appmesh-envoy:v1.22.0.0-prod
          ports:
            - containerPort: 8088
EOF

cat <<EOF >>appmesh/proxy-iam-policy.json
{
  "AWSTemplateFormatVersion": "2010-09-09",
  "Description": "Enable proxy authorization for App Mesh injector to add the sidecar containers to any pod deployed with a label specified",
  "Resources": {
    "AppMeshProxyAuthPolicy": {
      "Type": "AWS::IAM::ManagedPolicy",
      "Properties": {
        "ManagedPolicyName": "AppMeshProxyAuth-$AWS_EKS_CLUSTER-$2-mesh",
        "Description": "Enable proxy authorization for App Mesh injector to add the sidecar containers to any pod deployed with a label specified",
        "Path": "/",
        "PolicyDocument": {
          "Version": "2012-10-17",
          "Statement": [
            {
              "Effect": "Allow",
              "Action": ["appmesh:StreamAggregatedResources"],
              "Resource": "*"
            }
          ]
        }
      }
    }
  },
  "Outputs": {
    "AppMeshProxyAuthPolicyArn": {
      "Value": { "Ref": "AppMeshProxyAuthPolicy" }
    }
  }
}
EOF

kubectl apply -f "appmesh/namespace.yaml"

kubectl apply -f "appmesh/mesh.yaml"

kubectl apply -f "appmesh/virtual-node.yaml"

kubectl apply -f "appmesh/virtual-router.yaml"

kubectl apply -f "appmesh/virtual-service.yaml"

kubectl apply -f "appmesh/virtual-gateway.yaml"

aws cloudformation create-stack --stack-name AppMeshProxyAuthPolicy-$AWS_EKS_CLUSTER-$2-mesh --template-body file://appmesh/proxy-iam-policy.json --capabilities CAPABILITY_NAMED_IAM

eksctl create iamserviceaccount --cluster $AWS_EKS_CLUSTER --namespace $2 --name $1 --attach-policy-arn arn:aws:iam::$AWS_ACCOUNT_ID:policy/AppMeshProxyAuth-$AWS_EKS_CLUSTER-$2-mesh --attach-policy-arn arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess --override-existing-serviceaccounts --approve