cat <<EOF >>vllm-node-class.yaml
apiVersion: karpenter.k8s.aws/v1
kind: EC2NodeClass
metadata:
  name: vllm
spec:
  amiFamily: "AL2023"
  role: "KarpenterNodeRole-${AWS_EKS_CLUSTER}-${AWS_REGION}"
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: ${AWS_EKS_CLUSTER}
  securityGroupSelectorTerms:
    - tags:
        "aws:eks:cluster-name": ${AWS_EKS_CLUSTER}
  amiSelectorTerms:
    - alias: al2023@latest
  blockDeviceMappings:
    - deviceName: /dev/xvda
      ebs:
        volumeSize: 50Gi
        volumeType: gp3
        encrypted: true
  tags:
    Name: ${AWS_EKS_CLUSTER}/karpenter/vllm
    eks-cost-cluster: ${AWS_EKS_CLUSTER}
    eks-cost-workload: vllm
    eks-cost-team: tck
EOF

cat <<EOF >>vllm-node-pool.yaml
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: vllm
spec:
  template:
    spec:
      requirements:
        - key: "karpenter.k8s.aws/instance-category"
          operator: In
          values: ["c", "m", "r"]
        - key: "kubernetes.io/arch"
          operator: In
          values: ["arm64"]
        - key: "karpenter.sh/capacity-type"
          operator: In
          values: ["on-demand"]
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: vllm
  limits:
    cpu: 64
EOF

# vllm-pvc-secret.yaml is adapted from https://docs.vllm.ai/en/latest/deployment/k8s.html

cat <<EOF >>vllm-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: hf-token-secret
type: Opaque
data:
  token: $(echo -n "${HF_TOKEN}" | base64)
EOF

kubectl apply -f vllm-node-class.yaml
kubectl apply -f vllm-node-pool.yaml
kubectl apply -f vllm-secret.yaml