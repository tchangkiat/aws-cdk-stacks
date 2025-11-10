## Model Inference with AWS Graviton

> Prerequisite 1: [Karpenter](#add-ons)
> Prerequisite 2: [AWS EBS CSI Driver](#add-ons)

### Setup

1. Create the CodeBuild project to build vLLM container image for AWS Graviton (arm64 CPU architecture) and the ECR repository to store the container image.

```bash
cdk deploy vllm
```

2. Start the CodeBuild project. The build process takes about 13 minutes to complete.

```bash
aws codebuild start-build --project-name vllm-arm64
```

3. [Generate a User Access Token](https://huggingface.co/docs/hub/en/security-tokens) from Hugging Face. Once the container image in step 2 is built, run the following script to set up the node pool, node class, PVC, and secret.

```bash
export HF_TOKEN="<Hugging Face Token>"

curl -o install-vllm.sh "https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/eks/install-vllm.sh"
chmod +x install-vllm.sh
./install-vllm.sh
```

4. Deploy a vLLM server with [meta-llama/Llama-3.2-1B-Instruct](https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct).

```bash
curl -o install-vllm-meta-llama.sh "https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/eks/install-vllm-meta-llama.sh"
chmod +x install-vllm-meta-llama.sh
./install-vllm-meta-llama.sh
```

5. Wait for the `vllm-meta-llama-server-*` Pod in the `default` namespace to be ready.

6. Open a terminal window and port forward to the `vllm-meta-llama-server` service.

```bash
kubectl port-forward service/vllm-meta-llama-server 8000:8000
```

7. Open another terminal window and run the following command to perform an inference.

```bash
curl "http://localhost:8000/v1/chat/completions" \
    -w '\n* Response time: %{time_total}s\n' \
    -H "Content-Type: application/json" \
    --data '{
        "model": "meta-llama/Llama-3.2-1B-Instruct",
        "messages": [
            {
                "role": "user",
                "content": "Explain what is Amazon EKS in 3 sentences"
            }
        ]
    }'
```

**Sample Result (partial)**

```json
{
  "model": "meta-llama/Llama-3.2-1B-Instruct",
  "choices": [
    {
      "message": {
        "content": "Amazon Elastic Kubernetes Service (EKS) is a managed Kubernetes service provided by Amazon Web Services (AWS) that allows users to create, manage, and scale Kubernetes clusters on AWS. EKS provides a fully managed experience, including cluster creation, patching, and scaling, as well as support for multiple Kubernetes versions and distributions. With EKS, users can focus on deploying and managing their applications, rather than managing the underlying Kubernetes infrastructure."
      }
    }
  ]
}
```

### Clean Up

1. Remove vLLM.

```bash
curl -o remove-vllm-meta-llama.sh "https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/eks/remove-vllm-meta-llama.sh"
chmod +x remove-vllm-meta-llama.sh
./remove-vllm-meta-llama.sh

curl -o remove-vllm.sh "https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/eks/remove-vllm.sh"
chmod +x remove-vllm.sh
./remove-vllm.sh
```

2. Remove the scripts.

```bash
rm install-vllm-meta-llama.sh
rm install-vllm.sh
rm remove-vllm-meta-llama.sh
rm remove-vllm.sh
```

3. Remove the CodeBuild project and ECR repository.

```bash
cdk destroy vllm
```
