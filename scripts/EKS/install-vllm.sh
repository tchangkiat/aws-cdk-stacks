cat <<EOF >>llm-gvt-node-class.yaml
apiVersion: karpenter.k8s.aws/v1
kind: EC2NodeClass
metadata:
  name: llm-gvt
spec:
  amiFamily: "AL2023"
  role: "KarpenterNodeRole-${AWS_EKS_CLUSTER}"
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: ${AWS_EKS_CLUSTER}
  securityGroupSelectorTerms:
    - tags:
        "aws:eks:cluster-name": ${AWS_EKS_CLUSTER}
  amiSelectorTerms:
    - alias: al2023@latest
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
    Name: ${AWS_EKS_CLUSTER}/karpenter/llm-gvt
    eks-cost-cluster: ${AWS_EKS_CLUSTER}
    eks-cost-workload: llm-gvt
    eks-cost-team: tck
EOF

cat <<EOF >>llm-gvt-node-pool.yaml
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: llm-gvt
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
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: llm-gvt
  limits:
    cpu: 64
EOF

# llm-gvt-pvc-secret.yaml and llm-gvt-deployment-service.yaml are adapted from https://docs.vllm.ai/en/latest/deployment/k8s.html

cat <<EOF >>llm-gvt-pvc-secret.yaml
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

cat <<EOF >>llm-gvt-deployment-service.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vllm-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: vllm
  template:
    metadata:
      labels:
        app.kubernetes.io/name: vllm
    spec:
      containers:
      - name: vllm
        # image: public.ecr.aws/q9t5s3a7/vllm-cpu-release-repo:v0.8.1
        image: ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/vllm:arm64
        command: ["/bin/sh", "-c"]
        args: [
          "vllm serve ${LLM} --dtype=float16"
        ]
        env:
        - name: HUGGING_FACE_HUB_TOKEN
          valueFrom:
            secretKeyRef:
              name: hf-token-secret
              key: token
        ports:
          - containerPort: 8000
        volumeMounts:
          - name: llama-storage
            mountPath: /root/.cache/huggingface
        resources:
          requests:
            cpu: 4
            memory: 16Gi
      volumes:
      - name: llama-storage
        persistentVolumeClaim:
          claimName: vllm-models
      nodeSelector:
        karpenter.sh/nodepool: llm-gvt
        kubernetes.io/arch: arm64
---
apiVersion: v1
kind: Service
metadata:
  name: vllm-server
spec:
  selector:
    app.kubernetes.io/name: vllm
  ports:
  - protocol: TCP
    port: 8000
    targetPort: 8000
  type: ClusterIP
EOF

k apply -f llm-gvt-node-class.yaml
k apply -f llm-gvt-node-pool.yaml
k apply -f llm-gvt-pvc-secret.yaml
k apply -f llm-gvt-deployment-service.yaml