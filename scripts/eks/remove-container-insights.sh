#!/bin/bash

aws eks delete-addon --cluster-name $AWS_EKS_CLUSTER --addon-name amazon-cloudwatch-observability