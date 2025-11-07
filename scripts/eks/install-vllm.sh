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

kubectl apply -f vllm-secret.yaml