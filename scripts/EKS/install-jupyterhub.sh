#!/bin/bash

cat <<EOF >>jupyterhub-node-pool.yaml
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: jupyterhub
spec:
  template:
    spec:
      requirements:
        - key: "karpenter.k8s.aws/instance-category"
          operator: NotIn
          values: ["t"]
        - key: "kubernetes.io/arch"
          operator: In
          values: ["amd64"]
        - key: "karpenter.sh/capacity-type"
          operator: In
          values: ["on-demand"]
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: jupyterhub
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 30s
  limits:
    cpu: 16
---
apiVersion: karpenter.k8s.aws/v1
kind: EC2NodeClass
metadata:
  name: jupyterhub
spec:
  amiFamily: "Bottlerocket"
  role: "KarpenterNodeRole-${AWS_EKS_CLUSTER}"
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: ${AWS_EKS_CLUSTER}
  securityGroupSelectorTerms:
    - tags:
        "aws:eks:cluster-name": ${AWS_EKS_CLUSTER}
  amiSelectorTerms:
    - alias: bottlerocket@latest
  tags:
    Name: ${AWS_EKS_CLUSTER}/karpenter/jupyterhub
    eks-cost-cluster: ${AWS_EKS_CLUSTER}
    eks-cost-workload: jupyterhub
    eks-cost-team: tck
EOF

kubectl apply -f jupyterhub-node-pool.yaml

helm repo add jupyterhub https://hub.jupyter.org/helm-chart/
helm repo update

export JUPYTERHUB_PASSWORD=`openssl rand -base64 8`

cat <<EOF >>jupyterhub-config.yaml
hub:
  config:
    Authenticator:
      admin_users:
        - admin1
      allowed_users:
        - user1
    DummyAuthenticator:
      password: ${JUPYTERHUB_PASSWORD}
    JupyterHub:
      authenticator_class: dummy
  nodeSelector:
    karpenter.sh/nodepool: jupyterhub
proxy:
  service:
    annotations:
      service.beta.kubernetes.io/aws-load-balancer-nlb-target-type: ip
      service.beta.kubernetes.io/aws-load-balancer-scheme: internet-facing
      service.beta.kubernetes.io/aws-load-balancer-type: external
      service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled: 'true'
      service.beta.kubernetes.io/aws-load-balancer-ip-address-type: ipv4
  chp:
    nodeSelector:
      karpenter.sh/nodepool: jupyterhub
  traefik:
      nodeSelector:
        karpenter.sh/nodepool: jupyterhub
singleuser:
  image:
    name: jupyter/scipy-notebook
    tag: python-3.8.13
  cpu:
    limit: 2
    guarantee: 1
  memory:
    limit: 4G
    guarantee: 2G
  nodeSelector:
    karpenter.sh/nodepool: jupyterhub
scheduling:
    userScheduler:
      nodeSelector:
        karpenter.sh/nodepool: jupyterhub
prePuller:
    hook:
      nodeSelector:
        karpenter.sh/nodepool: jupyterhub
EOF

helm upgrade --cleanup-on-fail \
  --install jupyter jupyterhub/jupyterhub \
  --namespace jupyter \
  --create-namespace \
  --version=3.0.3 \
  --values jupyterhub-config.yaml

echo "Wait 10 seconds for load balancer host name to be created"
sleep 10

echo ""
echo "JupyterHub URL: http://"`kubectl get svc -n jupyter | grep 'amazonaws.com' | awk {'print $4'}`
echo "JupyterHub Username: user1 / admin1"
echo "JupyterHub Password: ${JUPYTERHUB_PASSWORD}"
echo ""
echo "Note: JupyterHub may take a few minutes to be accessible."
echo ""