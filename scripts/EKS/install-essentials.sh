#!/bin/bash

curl -o install-container-insights.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/install-container-insights.sh

chmod +x install-container-insights.sh

./install-container-insights.sh

sleep 10s

curl -o install-load-balancer-controller.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/install-load-balancer-controller.sh

chmod +x install-load-balancer-controller.sh

./install-load-balancer-controller.sh

sleep 10s

curl -o install-ebs-csi-driver.sh https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/scripts/EKS/install-ebs-csi-driver.sh

chmod +x install-ebs-csi-driver.sh

./install-ebs-csi-driver.sh