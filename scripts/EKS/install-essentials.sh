#!/bin/bash

curl -o install-container-insights.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/install-container-insights.sh

chmod +x install-container-insights.sh

./install-container-insights.sh

sleep 15s

curl -o install-load-balancer-controller.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/install-load-balancer-controller.sh

chmod +x install-load-balancer-controller.sh

./install-load-balancer-controller.sh

sleep 15s

curl https://raw.githubusercontent.com/tchangkiat/sample-express-api/master/eks/deployment.yaml -o sample-deployment.yaml

sed -i "s|\[URL\]|${CONTAINER_IMAGE_URL}|g" sample-deployment.yaml

kubectl apply -f sample-deployment.yaml