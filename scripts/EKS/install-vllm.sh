cat <<EOF >>vllm-node-class.yaml
apiVersion: karpenter.k8s.aws/v1
kind: EC2NodeClass
metadata:
  name: vllm
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
  blockDeviceMappings:
    # Root device
    - deviceName: /dev/xvda
      ebs:
        volumeSize: 50Gi
        volumeType: gp3
        encrypted: true
    # Data device: Container resources such as images and logs
    - deviceName: /dev/xvdb
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
        - key: "karpenter.k8s.aws/instance-generation"
          operator: Gt
          values: ["5"]
        - key: "kubernetes.io/arch"
          operator: In
          values: ["amd64", "arm64"]
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

cat <<EOF >>vllm-pvc-secret.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: vllm-models
spec:
  accessModes:
    - ReadWriteOnce
  volumeMode: Filesystem
  resources:
    requests:
      storage: 50Gi
---
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
kubectl apply -f vllm-pvc-secret.yaml