# AWS CDK Stacks

This repository contains stacks for various solutions in AWS. These stacks are used for Proof-of-Concept (POC) and demonstration.

## ❗ Warning ❗

- **Review and change the configurations before using it for production**: the current configuration should not be used for production without further review and adaptation.

- **Be mindful of the costs incurred**: while this solution is developed to be cost-effective, please be mindful of the costs incurred.

# Table of Content

- [Initial Setup](#initial-setup)
- [Multi-Architecture Pipeline](#multi-architecture-pipeline)
- [Elastic Container Service (ECS)](#elastic-container-service-ecs)
  - [ECS Cluster Setup](#ecs-cluster-setup)
  - [CICD Pipeline for ECS Cluster](#cicd-pipeline-for-ecs-cluster)
- [Elastic Kubernetes Service (EKS)](#elastic-kubernetes-service-eks)
  - [EKS Cluster](#eks-cluster)
  - [Add-Ons](#add-ons)
  - [Sample Application](#sample-application)
  - [Metrics Server and Horizontal Pod Autoscaler (HPA)](#metrics-server-and-horizontal-pod-autoscaler-hpa)
  - [Argo CD](#argo-cd)
  - [AWS App Mesh](#aws-app-mesh)
  - [Amazon VPC Lattice](#amazon-vpc-lattice)
  - [Distributed ML with Ray](#distributed-ml-with-ray)
  - [Model Inference with AWS Graviton](#model-inference-with-aws-graviton)
- [API Gateway and Lambda](#api-gateway-and-lambda)
- [Egress VPC](#egress-vpc)
- [Application Load Balancer (ALB) Rule Restriction](#application-load-balancer-alb-rule-restriction)

# Initial Setup

1. Install npm packages with `npm install`.

2. Configure AWS CLI in order to bootstrap your AWS account for the CDK.

```bash
aws configure set aws_access_key_id {{ACCESS_KEY_ID}}
aws configure set aws_secret_access_key {{SECRET_ACCESS_KEY}}
aws configure set region {{REGION, e.g. ap-southeast-1}}
aws configure set output json
```

3. Bootstrap AWS account for CDK with `cdk bootstrap`.

4. Create an EC2 Key Pair named "EC2DefaultKeyPair" (leave other settings as default).

5. Rename 'sample.env' to '.env' and fill up all the values.

6. Create a connection in [Developer Tools](https://console.aws.amazon.com/codesuite/settings/connections) (ensure that you are creating in your ideal region). Copy the ARN of the connection to your `.env` file. This is required for solutions like Multi-Architecture Pipeline.

# Multi-Architecture Pipeline

```bash
cdk deploy multi-arch-pipeline
```

The pipeline will create Docker images for amd64 and arm64 architectures and store them in an Elastic Container Registry (ECR) repository. A Docker manifest will also be created and uploaded to the registry so that the Docker images for the respective architectures can be retrieved automatically with the 'latest' tag.

# Elastic Container Service (ECS)

> Prerequisite: [Multi-Architecture Pipeline](#multi-architecture-pipeline)

## ECS Cluster

```bash
cdk deploy ecs
```

Creates a new ECS cluster. The ECS cluster has an ECS service that uses Fargate for compute resources. An Application Load Balancer (ALB) will be created to expose the ECS service. The cluster also has an EC2 Auto-Scaling Group (ASG) as the capacity provider that scales on 70% CPU utilization. A CloudWatch dashboard will be created to visualize the CPU utilization of both services.

## ECS Cluster with CICD Pipeline

```bash
cdk deploy ecs-cicd
```

Creates a new CodePipeline, ECR repository, and S3 bucket to build and deploy a container image to the ECS cluster.

# Elastic Kubernetes Service (EKS)

> Prerequisite: [Multi-Architecture Pipeline](#multi-architecture-pipeline)

## EKS Cluster

### 1. Provision an EKS cluster with one of these commands:

```bash
# Deploy a cluster
cdk deploy eks

# Deploy a cluster with Cluster Autoscaler installed
cdk deploy eks-ca
```

These resources will be created:

- A VPC with public and private subnets and a NAT gateway
- An EKS cluster with 1 managed node group (or 2 if Cluster Autoscaler is installed)
- A bastion host to manage the EKS cluster
- The necessary IAM roles and policies

### 2. Access the bastion host

Access the bastion host with 'ec2-user' using SSH or EC2 Instance Connect.

> ❗ The commands listed in the sections under EKS should be executed in the bastion host. Some environment variables (e.g. AWS_REGION, AWS_ACCOUNT_ID, AWS_EKS_CLUSTER) are already populated in the bastion host.

### 3. Configure the AWS CLI and execute a script to setup the bastion host:

```bash
aws configure set aws_access_key_id {{ACCESS_KEY_ID}}
aws configure set aws_secret_access_key {{SECRET_ACCESS_KEY}}

./setup-bastion-host.sh
```

Region is set by 'setup-bastion-host.sh' automatically in the bastion host.

### 4. Test the connectivity to the EKS cluster with any `kubectl` commands.

```bash
kubectl get svc
```

## Add-Ons

1. Download the bash script to install / remove add-ons.

```bash
curl -o eks-add-ons.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/eks-add-ons.sh
chmod +x eks-add-ons.sh
```

2. Install add-ons with `-i` argument or remove add-ons with `-r` argument. Both ID and alias of the add-ons can be used.

Example #1: Install Karpenter

```bash
./eks-add-ons.sh -i karpenter
# OR
./eks-add-ons.sh -i 1
```

Example #2: Install multiple add-ons

```bash
./eks-add-ons.sh -i "karpenter load-balancer-controller"
# OR
./eks-add-ons.sh -i "1 2"
```

Example #3: Remove multiple add-ons

```bash
./eks-add-ons.sh -r "karpenter load-balancer-controller"
# OR
./eks-add-ons.sh -r "1 2"
```

### Supported Add-Ons (alias in brackets)

1. Karpenter ("karpenter")
2. AWS Load Balancer Controller ("load-balancer-controller")
3. AWS EBS CSI Driver ("ebs-csi-driver")
4. Amazon CloudWatch Container Insights ("container-insights")
5. Prometheus and Grafana ("prometheus-grafana")

   - Prerequisite: AWS EBS CSI Driver

6. Ingress NGINX Controller ("ingress-nginx-controller")

   - Also installs cert-manager

7. AWS App Mesh Controller ("app-mesh-controller")
8. AWS Gateway API Controller ("gateway-api-controller")
9. Amazon EMR on EKS ("emr-on-eks")
10. JupyterHub ("jupyterhub")

    - Prerequisites: Karpenter, AWS Load Balancer Controller, and AWS EBS CSI Driver

11. Ray ("ray")

    - Prerequisites: Karpenter

12. Argo CD ("argocd")

    - Prerequisites: Karpenter, AWS Load Balancer Controller

13. Open Policy Agent Gatekeeper ("opa-gatekeeper")

    - Includes a constraint template and constraint

## Sample Application

> Prerequisite 1: Deploy the Multi-Architecture Pipeline. To use your own container image from a registry, replace \<URL\> and execute `export CONTAINER_IMAGE_URL=<URL>`.

> Prerequisite 2: Install AWS Load Balancer Controller.

### Setup

1. Deploy the application.

```bash
curl https://raw.githubusercontent.com/tchangkiat/sample-express-api/master/eks/deployment.yaml -o sample-deployment.yaml

sed -i "s|\[URL\]|${CONTAINER_IMAGE_URL}|g" sample-deployment.yaml

kubectl apply -f sample-deployment.yaml
```

### Clean Up

1. Remove the application.

```bash
kubectl delete -f sample-deployment.yaml
```

## Metrics Server and Horizontal Pod Autoscaler (HPA)

### Setup

1. Deploy the Metrics Server:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

2. The above deployment may take minutes to complete. Check the status with this command:

```bash
kubectl get apiservice v1beta1.metrics.k8s.io -o json | jq '.status'
```

3. Assuming that the sample application was deployed, execute the following command to configure HPA for the deployment:

```bash
kubectl autoscale deployment sample-express-api -n sample \
    --cpu-percent=50 \
    --min=1 \
    --max=10
```

4. Check the details of HPA.

```bash
kubectl get hpa -n sample
```

### Clean Up

1. Remove the HPA and Metrics Server.

```bash
kubectl delete hpa sample-express-api -n sample

kubectl delete -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

## Argo CD

### Setup

1. Install pre-requisites if they are not installed yet.

```bash
./eks-add-ons.sh -i "karpenter load-balancer-controller"
```

2. Setup Argo CD and install Argo CD CLI.

```bash
./eks-add-ons.sh -i argocd
```

3. Create an application in Argo CD and link it to the repository. Nginx is used as an example below.

```bash
export EKS_CLUSTER_ARN=`kubectl config view -o jsonpath='{.current-context}'`
export ARGOCD_CLUSTER_URL=`argocd cluster list | grep $EKS_CLUSTER_ARN | awk '{print $1}'`
kubectl create namespace nginx
argocd app create nginx --repo https://github.com/tchangkiat/aws-cdk-stacks.git --path assets/argocd --dest-server $ARGOCD_CLUSTER_URL --dest-namespace nginx
```

4. Sync the application in Argo CD to deploy Nginx.

```bash
argocd app sync nginx
```

5. Get the load balancer's CNAME to access Nginx.

```bash
kubectl get svc -n nginx | awk '{print $4}'
```

### Clean Up

1. Remove Nginx application from Argo CD

```bash
argocd app delete nginx -y
kubectl delete ns nginx
```

2. Remove Argo CD.

```bash
./eks-add-ons.sh -r argocd
```

3. Remove pre-requisites.

```bash
./eks-add-ons.sh -r "karpenter load-balancer-controller"
```

## AWS App Mesh

### Setup

1. Install AWS App Mesh Controller with `./eks-add-ons.sh -i app-mesh-controller`

2. The [Sample Application](#sample-application) is used for the following App Mesh setup. Please set it up first before proceeding.

3. Generate the necessary manifest and set up App Mesh.

```bash
curl -o setup-app-mesh.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/setup-app-mesh.sh

chmod +x setup-app-mesh.sh

# Command format is ./setup-app-mesh.sh <application name> <namespace> <container port>
./setup-app-mesh.sh sample-express-api sample 8000
```

4. After App Mesh resources are set up, execute `kubectl rollout restart deployment sample-express-api -n sample` to restart the deployment. Verify if the Envoy proxy container is injected into each Pod of the deployment with `kubectl describe pod <Pod Name> -n sample`.

5. Execute `kubectl rollout restart deployment sample-express-api-gateway -n sample` to re-create the Virtual Gateway Pod. This resolves the "readiness probe failed" error (i.e. status is "Running" but "Ready" is "0/1").

### [Optional] AWS X-Ray Integration

> ❗ Modify your source code to use the AWS X-Ray SDK. This was already done for the [Sample Application](#sample-application).

1. Update App Mesh Controller to enable X-Ray so that the X-Ray Daemon container will be injected into the Pods automatically

```bash
helm upgrade -i appmesh-controller eks/appmesh-controller --namespace appmesh-system --set region=$AWS_REGION --set serviceAccount.create=false --set serviceAccount.name=appmesh-controller \
    --set tolerations[0].key=CriticalAddonsOnly \
    --set tolerations[0].operator=Exists \
    --set tolerations[0].effect=NoSchedule \
    --set nodeSelector."kubernetes\\.io/arch"=arm64 \
    --set image.repository=public.ecr.aws/appmesh/appmesh-controller \
    --set image.tag=v1.12.7-linux_arm64 \
    --set tracing.enabled=true \
    --set tracing.provider=x-ray
```

2. Execute `kubectl rollout restart deployment sample-express-api -n sample` to restart the deployment. Verify if the X-Ray Daemon container is injected into each Pod of the deployment with `kubectl describe pod <Pod Name> -n sample`.

3. Execute `kubectl rollout restart deployment sample-express-api-gateway -n sample` to re-create the Virtual Gateway Pod. The "Ready" value of the Pod should be "2/2" because the x-ray-daemon container is injected in the Pod.

### Clean Up

1. Remove App Mesh setup of the sample application.

```bash
curl -o remove-app-mesh.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/remove-app-mesh.sh

chmod +x remove-app-mesh.sh

# Command format is ./remove-app-mesh.sh <namespace>
./remove-app-mesh.sh sample-express-api sample
```

2. Remove AWS App Mesh Controller with `./eks-add-ons.sh -r app-mesh-controller`

## Amazon VPC Lattice

> Prerequisite 1: Deploy the Multi-Architecture Pipeline. To use your own container image from a registry, replace \<URL\> and execute `export CONTAINER_IMAGE_URL=<URL>`.

> Prerequisite 2: Install [AWS Load Balancer Controller](#add-ons).

> Prerequisite 3: Install [Sample Application](#sample-application).

### Setup

1. Install AWS Gateway API Controller with `./eks-add-ons.sh -i gateway-api-controller`

2. Set up Gateway for Sample Application.

```bash
curl -o vpc-lattice-gateway.yaml https://raw.githubusercontent.com/tchangkiat/sample-express-api/master/eks/vpc-lattice/vpc-lattice-gateway.yaml

kubectl apply -f vpc-lattice-gateway.yaml
```

3. Set up HttpRoute for Sample Application.

```bash
curl -o vpc-lattice-httproute.yaml https://raw.githubusercontent.com/tchangkiat/sample-express-api/master/eks/vpc-lattice/vpc-lattice-httproute.yaml

kubectl apply -f vpc-lattice-httproute.yaml
```

### Clean Up

1. Remove HttpRoute for Sample Application.

```bash
kubectl delete -f vpc-lattice-httproute.yaml
```

2. Remove Gateway for Sample Application.

```bash
kubectl delete -f vpc-lattice-gateway.yaml
```

3. Remove AWS Gateway API Controller with `./eks-add-ons.sh -r gateway-api-controller`

## Distributed ML with Ray

### Setup

1. Install the pre-requisites if they are not installed yet.

```bash
./eks-add-ons.sh -i "karpenter load-balancer-controller ebs-csi-driver"
```

2. Install JupyterHub and Ray

```bash
./eks-add-ons.sh -i "jupyterhub ray"
```

3. Once all the Pods are 'running', run the following command in the terminal on your client machine. Access JupyterHub using `http://localhost:8080` and Ray Dashboard using `http://localhost:8265`. JupyterHub may take a few minutes to initialize after installing. During this time, you will notice a blank page and a loading animation in your browser when you access the URL.

```bash
kubectl port-forward --namespace=jupyter service/proxy-public 8080:http & \
kubectl port-forward --address 0.0.0.0 service/raycluster-head-svc 8265:8265 &
```

4. Use the username and password found in the terminal (example below) to log in to JupyterHub.

```bash
JupyterHub Username: user1 / admin1
JupyterHub Password: <generated password>
```

5. Once you accessed JupyterHub, you can upload and use the example notebook from `/assets/ray/pytorch-ray-example.ipynb`.

### Clean Up

1. Remove JupyterHub and Ray.

```bash
./eks-add-ons.sh -r "jupyterhub ray"
```

2. Remove pre-requisites.

```bash
./eks-add-ons.sh -r "karpenter load-balancer-controller ebs-csi-driver"
```

## Model Inference with AWS Graviton

> Prerequisite 1: [Karpenter](#add-ons)
> Prerequisite 2: [AWS EBS CSI Driver](#add-ons)

### Setup

1. Create the CodeBuild project to build vLLM container image for AWS Graviton (arm64 CPU architecture) and the ECR repository to store the container image.

```bash
cdk deploy vllm
```

2. Start the CodeBuild project. The build process takes about 6 minutes to complete.

```bash
aws codebuild start-build --project-name vllm-arm64
```

3. [Generate a User Access Token](https://huggingface.co/docs/hub/en/security-tokens) from Hugging Face. Once the container image is built, run a script to deploy vLLM and a preferred LLM from Hugging Face (i.e. [meta-llama/Llama-3.2-1B-Instruct](https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct)).

```bash
export HF_TOKEN="<Hugging Face Token>"
export LLM = "meta-llama/Llama-3.2-1B-Instruct"

curl -o install-vllm.sh "https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/install-vllm.sh"
chmod +x install-vllm.sh
./install-vllm.sh
```

4. Wait for the `vllm-server-*` Pod in the `default` namespace to be ready.

5. Open a terminal window and port forward to the `vllm-server` service.

```bash
kubectl port-forward service/vllm-server 8000:8000
```

6. Open another terminal window and run the following command to perform an inference.

```bash
curl -X POST "http://localhost:8000/v1/chat/completions" \
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
curl -o remove-vllm.sh "https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/remove-vllm.sh"
chmod +x remove-vllm.sh
./remove-vllm.sh
```

2. Remove the scripts.

```bash
rm install-vllm.sh
rm remove-vllm.sh
```

3. Remove the CodeBuild project and ECR repository.

```bash
cdk destroy vllm
```

# API Gateway and Lambda

```bash
sh assets/api-gateway/lambda-zip.sh

cdk deploy api-gateway
```

Deploy a REST API in API Gateway with Lambda Integration and Authorizer.

## Testing the API resources

```bash
# Replace '<...>' with the respective values

# Get a JWT token
curl https://<API ID>.execute-api.ap-southeast-1.amazonaws.com/v1/auth

# Verify
curl -H "Authorization: <JWT token retrieved from the previous command>" https://<API ID>.execute-api.ap-southeast-1.amazonaws.com/v1
```

# Egress VPC

![Egress VPC Architecture](./diagrams/egress-vpc.jpg)

```bash
cdk deploy egress-vpc
```

Deploy an egress VPC with Transit Gateway. VPN-related resources are deployed for the VPN connection between the Transit Gateway and the simulated customer's on-prem environment.

## Establish VPN connection from the Transit Gateway to a simulated customer on-prem environment

1. Follow section 4 and 5 in the following article to deploy an EC2 instance with strongSwan to establish a Site-to-Site VPN -> [Simulating Site-to-Site VPN Customer Gateways Using strongSwan](https://aws.amazon.com/blogs/networking-and-content-delivery/simulating-site-to-site-vpn-customer-gateways-strongswan/).<br/><br/> Below are the values to fill up some of the parameters of the CloudFormation template used in the article above (for the other parameters, follow the instructions in the section 5 of the article):

   - Stack Name: `egress-vpc-vpn`

   - Name of secret in AWS Secrets Manager for VPN Tunnel 1 Pre-Shared Key: `egress-vpc-psk1`
   - Name of secret in AWS Secrets Manager for VPN Tunnel 2 Pre-Shared Key: `egress-vpc-psk2`
   - VPC ID: select `egress-vpc-customer-vpc`
   - VPC CIDR Block: `30.0.0.0/16`
   - Subnet ID for VPN Gateway: select `egress-vpc-customer-vpc/PublicSubnet1`
   - Elastic IP Address Allocation ID: can be found in the output of the CDK stack. The value should start with `eipalloc-`

> ❗ Wait until the VPN Gateway (EC2 Instance) is created and verify that both IPSec tunnels are 'UP' (Site-to-Site VPN Connections > egress-vpc-vpn > Tunnel details), before proceeding to step 4 and 5. This will take a few minutes.

2. Add a route to `20.0.0.0/16` in the route table (Target: Instance > infra-vpngw-test) of `egress-vpc-customer-vpc/PrivateSubnet1` in order to route requests from instances in `egress-vpc-customer-vpc/PrivateSubnet1` to instances in `egress-vpc-vpc-1/PrivateSubnet1`.

3. Create a Transit Gateway Association and Propagation in the Transit Gateway Route Table for the VPN Transit Gateway attachment. Once you completed this step successfully, you should see a route `30.0.0.0/16` propagated in the Transit Gateway Route Table. Note: this step cannot be automated because there is no way to retrieve the VPN Transit Gateway attachment and then create an association and propagation programmatically.

> ❗ The connection between `egress-vpc-vpc-1` and `egress-vpc-customer-vpc` will be established in a few minutes after completing step 3.

## Testing the network connectivity

1. Connect to `egress-vpc-demo-instance` and `egress-vpc-demo-instance-2` using Session Manager. If you encounter the error `Unable to start command: failed to start pty since RunAs user ssm-user does not exist`, ensure that the `Run As` configuration in Session Manager > Preferences is `ec2-user`.

2. Use `ifconfig` in the instances to retrieve the private IP addresses

3. Ping each other using the private IP addresses - e.g. `ping 30.0.1.30` in `egress-vpc-demo-instance`. You should receive similar results as shown below:

- `egress-vpc-demo-instance`: 64 bytes from 30.0.1.30: icmp_seq=1 ttl=253 time=2.49 ms
- `egress-vpc-demo-instance-2`: 64 bytes from 20.0.0.20: icmp_seq=1 ttl=252 time=3.52 ms

4. Ping a domain (e.g. amazon.com) in one of these instances. You should observe similar results as shown above.

## Clean Up

1. Delete `egress-vpc-vpn` and `egress-vpc` CloudFormation stacks.

# Application Load Balancer (ALB) Rule Restriction

![Application Load Balancer (ALB) Rule Restriction Architecture](./diagrams/alb-rule-restriction.jpg)

## Setup

```bash
cdk deploy alb-rule-restriction
```

## Testing the ALB rules

1. Connect to Bastion Host and run the following command. You should receive a response from Nginx.

```bash
curl <ALB DNS Name>:80
```

2. Run the following command. You should receive a response from the ALB: "Denied by ALB".

```bash
curl <ALB DNS Name>:8080
```

## Clean Up

```bash
cdk destroy alb-rule-restriction
```
