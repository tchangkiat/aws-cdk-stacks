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
          values: ["arm64"]
        - key: "karpenter.sh/capacity-type"
          operator: In
          values: ["on-demand"]
        - key: "karpenter.k8s.aws/instance-generation"
          operator: Gt
          values: ["4"]
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: jupyterhub
  disruption:
    consolidationPolicy: WhenEmpty
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
  role: "KarpenterNodeRole-${AWS_EKS_CLUSTER}-${AWS_REGION}"
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: ${AWS_EKS_CLUSTER}
  securityGroupSelectorTerms:
    - tags:
        "aws:eks:cluster-name": ${AWS_EKS_CLUSTER}
  amiSelectorTerms:
    - alias: bottlerocket@latest
  blockDeviceMappings:
    # Root device
    - deviceName: /dev/xvda
      ebs:
        volumeSize: 20Gi
        volumeType: gp3
        encrypted: true
    # Data device: Container resources such as images and logs
    - deviceName: /dev/xvdb
      ebs:
        volumeSize: 100Gi
        volumeType: gp3
        encrypted: true
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
    type: ClusterIP
  chp:
    nodeSelector:
      karpenter.sh/nodepool: jupyterhub
  traefik:
    nodeSelector:
      karpenter.sh/nodepool: jupyterhub
singleuser:
  image:
    name: jupyter/scipy-notebook
    tag: python-3.9
  cpu:
    limit: 2
    guarantee: 2
  memory:
    limit: 4G
    guarantee: 4G
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
  --version=4.1.0 \
  --values jupyterhub-config.yaml \
  --timeout=10m

echo ""
echo "JupyterHub Username: user1 / admin1"
echo "JupyterHub Password: ${JUPYTERHUB_PASSWORD}"
echo ""
echo "Note: JupyterHub may take a few minutes to be accessible."
echo ""