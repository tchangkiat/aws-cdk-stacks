## AWS App Mesh

### Setup

1. Install AWS App Mesh Controller with `./eks-add-ons.sh -i app-mesh-controller`

2. The [Sample Application](#sample-application) is used for the following App Mesh setup. Please set it up first before proceeding.

3. Generate the necessary manifest and set up App Mesh.

```bash
curl -o setup-app-mesh.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/eks/setup-app-mesh.sh

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
curl -o remove-app-mesh.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/eks/remove-app-mesh.sh

chmod +x remove-app-mesh.sh

# Command format is ./remove-app-mesh.sh <namespace>
./remove-app-mesh.sh sample-express-api sample
```

2. Remove AWS App Mesh Controller with `./eks-add-ons.sh -r app-mesh-controller`
