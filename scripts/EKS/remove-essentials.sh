#!/bin/bash

kubectl delete -f sample-deployment.yaml

sleep 15s

curl -o remove-load-balancer-controller.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/remove-load-balancer-controller.sh

chmod +x remove-load-balancer-controller.sh

./remove-load-balancer-controller.sh

sleep 15s

curl -o remove-container-insights.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/remove-container-insights.sh

chmod +x remove-container-insights.sh

./remove-container-insights.sh