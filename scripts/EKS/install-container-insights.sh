#!/bin/bash

# Documentation: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Container-Insights-setup-EKS-addon.html
aws eks create-addon --cluster-name $AWS_EKS_CLUSTER --addon-name amazon-cloudwatch-observability