#!/bin/bash

# Legacy Method
#ClusterName=$AWS_EKS_CLUSTER
#RegionName=$AWS_REGION
#FluentBitHttpPort='2020'
#FluentBitReadFromHead='Off'
#[[ ${FluentBitReadFromHead} = 'On' ]] && FluentBitReadFromTail='Off'|| FluentBitReadFromTail='On'
#[[ -z ${FluentBitHttpPort} ]] && FluentBitHttpServer='Off' || FluentBitHttpServer='On'
#curl https://raw.githubusercontent.com/tchangkiat/aws-cdk-stacks/main/assets/container-insights.yaml | sed 's/{{cluster_name}}/'${ClusterName}'/;s/{{region_name}}/'${RegionName}'/;s/{{http_server_toggle}}/"'${FluentBitHttpServer}'"/;s/{{http_server_port}}/"'${FluentBitHttpPort}'"/;s/{{read_from_head}}/"'${FluentBitReadFromHead}'"/;s/{{read_from_tail}}/"'${FluentBitReadFromTail}'"/' | kubectl apply -f - 

# Documentation: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Container-Insights-setup-EKS-addon.html
aws eks create-addon --cluster-name $AWS_EKS_CLUSTER --addon-name amazon-cloudwatch-observability