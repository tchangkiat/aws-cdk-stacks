# vllm-meta-llama.yaml is adapted from https://docs.vllm.ai/en/latest/deployment/k8s.html

cat <<EOF >>vllm-meta-llama.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vllm-meta-llama-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: vllm-meta-llama
  template:
    metadata:
      labels:
        app.kubernetes.io/name: vllm-meta-llama
    spec:
      containers:
      - name: vllm-meta-llama
        image: ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/vllm:arm64
        command: ["/bin/sh", "-c"]
        args: [
          "vllm serve meta-llama/Llama-3.2-1B-Instruct --dtype=float16"
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
            cpu: 6
            memory: 24Gi
      volumes:
      - name: llama-storage
        persistentVolumeClaim:
          claimName: vllm-models
      nodeSelector:
        karpenter.sh/nodepool: vllm
        kubernetes.io/arch: arm64
---
apiVersion: v1
kind: Service
metadata:
  name: vllm-meta-llama-server
spec:
  selector:
    app.kubernetes.io/name: vllm-meta-llama
  ports:
  - protocol: TCP
    port: 8000
    targetPort: 8000
  type: ClusterIP
EOF

kubectl apply -f vllm-meta-llama.yaml